import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { FavoriteStatus, MenuScanProgress, Restaurant, RestaurantUiState, AiChatMessage } from '../types/restaurant';
import { fetchNearbyRestaurants } from '../data/placesRepository';
import { distanceBetween } from '../util/geoUtils';
import { PersistenceService } from '../services/persistenceService';

import { MenuAnalysisResult } from '../services/menuSafety';
import {
  filterAndSortRestaurants,
  isSameRestaurantIdentity,
} from '../util/restaurantUtils';
import { useFilters } from './FiltersContext';
import { useSettings } from './SettingsContext';
import { logger } from '../util/logger';
import { ScanOrchestrator, ScanOrchestratorConfig } from '../services/scanOrchestrator';
import {
  EmptyResultsReason,
  getCachedResultsMessage,
  getEmptyResultsMessage,
  getMapsApiKey,
  getScanProgressForRestaurants,
} from './restaurantState';
import { useRestaurantFavorites } from './useRestaurantFavorites';

interface EmitFilteredStateOptions {
  emptyReason?: EmptyResultsReason;
  message?: string | null;
  status?: RestaurantUiState['status'];
}

interface RestaurantContextValue {
  uiState: RestaurantUiState;
  savedRestaurants: Restaurant[];
  loadNearbyRestaurants: (overrideCoords?: { latitude: number; longitude: number }) => Promise<void>;
  setFavoriteStatus: (restaurant: Restaurant, status: FavoriteStatus) => void;
  requestMenuRescan: (restaurant: Restaurant) => void;
  retryFailedScans: () => void;
  updateAiSession: (
    restaurant: Restaurant,
    session: { analysis?: MenuAnalysisResult | null; chat?: AiChatMessage[]; deepAnalysis?: string | null }
  ) => void;
}

const RestaurantContext = createContext<RestaurantContextValue | null>(null);
export { getEmptyResultsMessage };

export function useRestaurants(): RestaurantContextValue {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error('useRestaurants must be inside RestaurantProvider');
  }

  return context;
}

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const { strictCeliac } = useSettings();
  const { filters } = useFilters();

  const [uiState, setUiState] = useState<RestaurantUiState>({
    status: 'idle',
    restaurants: [],
    message: null,
    userLatitude: null,
    userLongitude: null,
    scanProgress: null,
  });

  const uiStateRef = useRef(uiState);
  useEffect(() => {
    uiStateRef.current = uiState;
  }, [uiState]);

  const rawRestaurants = useRef<Restaurant[]>([]);
  const userLat = useRef<number | null>(null);
  const userLng = useRef<number | null>(null);
  const cacheAttempted = useRef(false);
  const filtersRef = useRef(filters);
  const {
    savedRestaurants,
    favoriteKey,
    applyFavorites,
    syncSavedRestaurants,
    loadFavorites,
    setFavoriteMapStatus,
  } = useRestaurantFavorites(rawRestaurants);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // ── Persistence ──────────────────────────────────────────────
  // persistCache must be declared before updateRestaurant, which depends on it.

  const persistTimeout = useRef<NodeJS.Timeout | null>(null);

  const flushPersistence = useCallback(async () => {
    if (persistTimeout.current) {
      clearTimeout(persistTimeout.current);
      persistTimeout.current = null;
    }
    try {
      await PersistenceService.saveCache({
        restaurants: rawRestaurants.current,
        lat: userLat.current,
        lng: userLng.current,
        timestamp: Date.now(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to flush persistence: ${message}`);
    }
  }, []);

  const persistCache = useCallback(() => {
    // Debounce persistence to avoid hammering the disk during batch scans
    if (persistTimeout.current) {
      clearTimeout(persistTimeout.current);
    }

    persistTimeout.current = setTimeout(flushPersistence, 2000);
  }, [flushPersistence]);

  // ── Restaurant mutation ───────────────────────────────────────

  const updateRestaurant = useCallback(
    (target: Restaurant, updater: (restaurant: Restaurant) => Restaurant) => {
      let updated = false;
      let worthPersisting = false;

      rawRestaurants.current = rawRestaurants.current.map((restaurant) => {
        if (!isSameRestaurantIdentity(restaurant, target)) {
          return restaurant;
        }

        const nextRestaurant = updater(restaurant);
        if (nextRestaurant !== restaurant) {
          updated = true;

          // Determine if this change is worth a disk save (terminal states or data changes)
          const statusChangedToTerminal =
            nextRestaurant.menuScanStatus !== restaurant.menuScanStatus &&
            ['SUCCESS', 'FAILED', 'NO_WEBSITE', 'JS_ONLY'].includes(nextRestaurant.menuScanStatus);

          const favoriteChanged = nextRestaurant.favoriteStatus !== restaurant.favoriteStatus;
          const aiChanged =
            nextRestaurant.aiAnalysisResult !== restaurant.aiAnalysisResult ||
            nextRestaurant.aiChatHistory !== restaurant.aiChatHistory;

          if (statusChangedToTerminal || favoriteChanged || aiChanged) {
            worthPersisting = true;
          }
        }

        return nextRestaurant;
      });

      if (worthPersisting) {
        persistCache();
      }

      return updated;
    },
    [persistCache]
  );

  const getScanProgress = useCallback((): MenuScanProgress | null => {
    return getScanProgressForRestaurants(rawRestaurants.current, orchestrator.current?.getBatchKeys() ?? []);
  }, []);

  const emitFilteredState = useCallback(
    (options: EmitFilteredStateOptions = {}) => {
      const raw = rawRestaurants.current;
      const filtered = filterAndSortRestaurants(raw, filtersRef.current, strictCeliac);
      
      // Preserve 'loading' status if background tasks trigger a notification
      // unless we are explicitly trying to set a new status.
      const currentStatus = uiStateRef.current.status;
      const status = options.status ?? (currentStatus === 'loading' ? 'loading' : 'success');
      
      const emptyReason = options.emptyReason ?? (raw.length === 0 ? 'nearby' : 'filters');

      syncSavedRestaurants();
      setUiState({
        status,
        restaurants: filtered,
        message:
          filtered.length === 0
            ? options.message ?? getEmptyResultsMessage(emptyReason)
            : options.message ?? null,
        userLatitude: userLat.current,
        userLongitude: userLng.current,
        scanProgress: getScanProgress(),
      });
    },
    [getScanProgress, strictCeliac, syncSavedRestaurants]
  );

  useEffect(() => {
    if (rawRestaurants.current.length === 0 && uiStateRef.current.status === 'idle') {
      return;
    }

    emitFilteredState({
      emptyReason: rawRestaurants.current.length === 0 ? 'nearby' : 'filters',
      message: uiStateRef.current.message,
      status: uiStateRef.current.status,
    });
  }, [emitFilteredState, filters, strictCeliac]);

  // Flush on app close/background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'inactive' || nextAppState === 'background') {
        void flushPersistence();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [flushPersistence]);

  const orchestrator = useRef<ScanOrchestrator | null>(null);

  // Initialize and sync orchestrator config
  useEffect(() => {
    const config: ScanOrchestratorConfig = {
      mapsApiKey: getMapsApiKey(),
      onRestaurantUpdate: updateRestaurant,
      onNotifyUI: () => emitFilteredState(),
      getIdentityKey: favoriteKey,
    };

    if (!orchestrator.current) {
      orchestrator.current = new ScanOrchestrator(config);
    } else {
      orchestrator.current.setConfig(config);
    }
  }, [emitFilteredState, favoriteKey, persistCache, updateRestaurant]);

  useEffect(() => {
    return () => {
      orchestrator.current?.destroy();
    };
  }, []);

  const kickOffMenuScans = useCallback(
    (restaurants: Restaurant[]) => {
      void orchestrator.current?.scanBatch(restaurants);
    },
    []
  );

  const loadCachedIfAvailable = useCallback(async () => {
    if (cacheAttempted.current) return;

    cacheAttempted.current = true;
    await loadFavorites();
    const cached = await PersistenceService.loadCache();

    if (!cached?.restaurants?.length) return;

    // Sanitize cache: reset any restaurants that were stuck in 'FETCHING' state
    const sanitized = cached.restaurants.map((r) =>
      r.menuScanStatus === 'FETCHING' ? { ...r, menuScanStatus: 'NOT_STARTED' as const } : r
    );

    rawRestaurants.current = applyFavorites(sanitized);
    userLat.current = cached.lat;
    userLng.current = cached.lng;

    emitFilteredState({
      emptyReason: 'filters',
      message: getCachedResultsMessage(cached.timestamp),
    });
    kickOffMenuScans(rawRestaurants.current);
  }, [applyFavorites, emitFilteredState, kickOffMenuScans, loadFavorites]);

  useEffect(() => {
    void loadCachedIfAvailable();
  }, [loadCachedIfAvailable]);

  const loadNearbyRestaurants = useCallback(async (overrideCoords?: { latitude: number; longitude: number }) => {
    // Prevent redundant fetches if one is already in progress
    if (uiStateRef.current.status === 'loading') return;

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      if (rawRestaurants.current.length > 0) {
        emitFilteredState({
          message: 'No internet connection. Showing last cached results.',
        });
      } else {
        setUiState({
          status: 'error',
          restaurants: [],
          message: 'No internet connection. Please check your network and try again.',
          userLatitude: null,
          userLongitude: null,
          scanProgress: null,
        });
      }
      return;
    }

    // Flush any pending scans from the previous search area
    orchestrator.current?.flushQueue();

    const mapsApiKey = getMapsApiKey();
    await loadCachedIfAvailable();

    if (!mapsApiKey) {
      if (rawRestaurants.current.length > 0) {
        emitFilteredState({
          emptyReason: 'filters',
          message: 'Showing cached results — Maps API key is missing. Live refresh is unavailable.',
        });
      } else {
        setUiState({
          status: 'error',
          restaurants: [],
          message: 'Maps API key is missing. Please configure MAPS_API_KEY.',
          userLatitude: null,
          userLongitude: null,
          scanProgress: getScanProgress(),
        });
      }
      return;
    }

    const isManualSearch = !!overrideCoords;

    if (rawRestaurants.current.length > 0) {
      emitFilteredState({
        emptyReason: 'filters',
        message: isManualSearch ? 'Searching this area…' : 'Refreshing nearby restaurants…',
        status: 'loading',
      });
    } else {
      setUiState({
        status: 'loading',
        restaurants: [],
        message: isManualSearch ? 'Searching this area…' : 'Finding restaurants near you…',
        userLatitude: overrideCoords?.latitude ?? userLat.current,
        userLongitude: overrideCoords?.longitude ?? userLng.current,
        scanProgress: getScanProgress(),
      });
    }

    try {
      let latitude: number;
      let longitude: number;

      if (overrideCoords) {
        latitude = overrideCoords.latitude;
        longitude = overrideCoords.longitude;
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (rawRestaurants.current.length > 0) {
            emitFilteredState({
              emptyReason: 'filters',
              message:
                'Showing cached results — location permission is needed to refresh nearby restaurants.',
            });
          } else {
            setUiState({
              status: 'permission_required',
              restaurants: [],
              message: 'Location permission is needed to find nearby restaurants.',
              userLatitude: null,
              userLongitude: null,
              scanProgress: getScanProgress(),
            });
          }
          return;
        }

        // Optimization: Try to get the last known position first (fast) before powering up the GPS
        const lastKnown = await Location.getLastKnownPositionAsync();
        const lastTimestamp = lastKnown?.timestamp ?? 0;
        const isRecent = lastKnown && (Date.now() - lastTimestamp) < 60000;

        if (isRecent && lastKnown) {
          latitude = lastKnown.coords.latitude;
          longitude = lastKnown.coords.longitude;
        } else {
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          latitude = location.coords.latitude;
          longitude = location.coords.longitude;
        }
      }

      const searchRadiusMeters =
        filtersRef.current.maxDistanceMeters > 0 ? filtersRef.current.maxDistanceMeters : undefined;
      
      const restaurants = await fetchNearbyRestaurants(
        latitude,
        longitude,
        mapsApiKey,
        searchRadiusMeters
      );
      const restaurantsWithDistance = applyFavorites(restaurants).map((restaurant) => ({
        ...restaurant,
        distanceMeters: distanceBetween(latitude, longitude, restaurant.latitude, restaurant.longitude),
      }));

      rawRestaurants.current = restaurantsWithDistance;
      userLat.current = latitude;
      userLng.current = longitude;

      emitFilteredState({
        emptyReason: 'nearby',
      });
      // persistCache schedules a debounced write — it returns void, not a Promise
      persistCache();
      kickOffMenuScans(restaurantsWithDistance);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isPermissionError = /permission|denied|allowed/i.test(errorMessage);
      
      const message = `Could not load restaurants: ${errorMessage}`;

      if (isPermissionError) {
        setUiState({
          status: 'permission_required',
          restaurants: rawRestaurants.current.length > 0 ? uiState.restaurants : [],
          message: 'Location permission or services are required to refresh results.',
          userLatitude: userLat.current,
          userLongitude: userLng.current,
          scanProgress: getScanProgress(),
        });
      } else if (rawRestaurants.current.length > 0) {
        emitFilteredState({
          emptyReason: 'filters',
          message: `Showing cached results — ${message}`,
        });
      } else {
        setUiState({
          status: 'error',
          restaurants: [],
          message,
          userLatitude: null,
          userLongitude: null,
          scanProgress: getScanProgress(),
        });
      }
    }
  }, [applyFavorites, emitFilteredState, getScanProgress, kickOffMenuScans, loadCachedIfAvailable, persistCache]);

  const setFavoriteStatus = useCallback(
    (restaurant: Restaurant, status: FavoriteStatus) => {
      if (!setFavoriteMapStatus(restaurant, status)) return;

      updateRestaurant(restaurant, (current) => ({
        ...current,
        favoriteStatus: status,
      }));

      emitFilteredState({
        emptyReason: rawRestaurants.current.length === 0 ? 'nearby' : 'filters',
        message: uiStateRef.current.message,
        status: uiStateRef.current.status,
      });
    },
    [emitFilteredState, setFavoriteMapStatus, updateRestaurant]
  );
  const requestMenuRescan = useCallback(
    (restaurant: Restaurant) => {
      void orchestrator.current?.requestRescan(restaurant);
    },
    []
  );

  const retryFailedScans = useCallback(() => {
    void orchestrator.current?.retryFailed(rawRestaurants.current);
  }, []);

  const updateAiSession = useCallback(
    (restaurant: Restaurant, session: { analysis?: MenuAnalysisResult | null; chat?: AiChatMessage[]; deepAnalysis?: string | null }) => {
      updateRestaurant(restaurant, (current) => ({
        ...current,
        aiAnalysisResult: session.analysis !== undefined ? session.analysis : current.aiAnalysisResult,
        aiChatHistory: session.chat !== undefined ? session.chat : current.aiChatHistory,
        aiDeepAnalysis: session.deepAnalysis !== undefined ? session.deepAnalysis : current.aiDeepAnalysis,
      }));
    },
    [updateRestaurant]
  );

  const contextValue = useMemo(
    () => ({
      uiState,
      savedRestaurants,
      loadNearbyRestaurants,
      setFavoriteStatus,
      requestMenuRescan,
      retryFailedScans,
      updateAiSession,
    }),
    [uiState, savedRestaurants, loadNearbyRestaurants, setFavoriteStatus, requestMenuRescan, retryFailedScans, updateAiSession]
  );

  return (
    <RestaurantContext.Provider value={contextValue}>
      {children}
    </RestaurantContext.Provider>
  );
}
