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
import { MenuScanCacheEntry, PersistenceService, getMenuScanCacheEntry } from '../services/persistenceService';

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
  MENU_SCAN_TTL_MS,
  getAiProxyBaseUrl,
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
  const menuScanCache = useRef<Record<string, MenuScanCacheEntry>>({});
  const filtersRef = useRef(filters);
  const isMounted = useRef(true);
  const loadRequestId = useRef(0);
  const {
    savedRestaurants,
    favoriteKey,
    applyFavorites,
    syncSavedRestaurants,
    loadFavorites,
    setFavoriteMapStatus,
    updateSavedRestaurant,
  } = useRestaurantFavorites(rawRestaurants);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
      loadRequestId.current += 1;
    };
  }, []);

  const isActiveLoadRequest = useCallback((requestId: number) => {
    return isMounted.current && loadRequestId.current === requestId;
  }, []);

  // ── Persistence ──────────────────────────────────────────────
  // persistCache must be declared before updateRestaurant, which depends on it.

  const persistTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (persistTimeout.current) {
        clearTimeout(persistTimeout.current);
        persistTimeout.current = null;
      }
    };
  }, []);

  // ── Restaurant mutation ───────────────────────────────────────

  const updateRestaurant = useCallback(
    (target: Restaurant, updater: (restaurant: Restaurant) => Restaurant) => {
      let updated = false;
      let worthPersisting = false;
      let shouldPersistScanCache = false;
      let scanCacheRestaurant: Restaurant | null = null;

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
            nextRestaurant.aiChatHistory !== restaurant.aiChatHistory ||
            nextRestaurant.aiDeepAnalysis !== restaurant.aiDeepAnalysis;

          if (statusChangedToTerminal || favoriteChanged || aiChanged) {
            worthPersisting = true;
          }

          if (statusChangedToTerminal || aiChanged) {
            shouldPersistScanCache = true;
            scanCacheRestaurant = nextRestaurant;
          }
        }

        return nextRestaurant;
      });

      // Keep the persistent favorites database perfectly synced
      updateSavedRestaurant(target, updater);

      if (worthPersisting) {
        persistCache();
      }

      if (shouldPersistScanCache && scanCacheRestaurant) {
        const entry = getMenuScanCacheEntry(scanCacheRestaurant);
        if (entry) {
          menuScanCache.current[entry.placeId] = entry;
        }

        void PersistenceService.saveMenuScanCacheEntry(scanCacheRestaurant, MENU_SCAN_TTL_MS).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn(`Failed to save menu scan cache entry: ${message}`);
        });
      }

      return updated;
    },
    [persistCache, updateSavedRestaurant]
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

  const mergeCachedScanData = useCallback((freshRestaurants: Restaurant[]) => {
    const cachedByKey = new Map<string, Restaurant>();

    for (const cachedRestaurant of rawRestaurants.current) {
      const key = favoriteKey(cachedRestaurant);
      if (key) {
        cachedByKey.set(key, cachedRestaurant);
      }
    }

    return freshRestaurants.map((freshRestaurant) => {
      const key = favoriteKey(freshRestaurant);
      const cachedRestaurant = key ? cachedByKey.get(key) : null;
      const cachedScan = freshRestaurant.placeId ? menuScanCache.current[freshRestaurant.placeId] : null;
      if (!cachedRestaurant && !cachedScan) return freshRestaurant;

      const scanSource = cachedRestaurant ?? cachedScan;
      if (!scanSource) return freshRestaurant;

      return {
        ...freshRestaurant,
        menuUrl: cachedRestaurant?.menuUrl ?? freshRestaurant.menuUrl,
        rawMenuText: scanSource.rawMenuText,
        gfMenu: [...scanSource.gfMenu],
        menuScanStatus:
          scanSource.menuScanStatus === 'FETCHING'
            ? 'NOT_STARTED'
            : scanSource.menuScanStatus,
        menuScanTimestamp:
          scanSource.menuScanStatus === 'FETCHING'
            ? 0
            : scanSource.menuScanTimestamp,
        aiAnalysisResult: scanSource.aiAnalysisResult,
        aiChatHistory: scanSource.aiChatHistory,
        aiDeepAnalysis: scanSource.aiDeepAnalysis,
      };
    });
  }, [favoriteKey]);

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
      htmlProxyBaseUrl: getAiProxyBaseUrl(),
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

  const loadCachedIfAvailable = useCallback(async (shouldContinue: () => boolean = () => isMounted.current) => {
    if (cacheAttempted.current) return;

    cacheAttempted.current = true;
    await loadFavorites();
    if (!shouldContinue()) return;

    const cached = await PersistenceService.loadCache();
    if (!shouldContinue()) return;

    menuScanCache.current = await PersistenceService.loadMenuScanCache(MENU_SCAN_TTL_MS);
    if (!shouldContinue()) return;

    if (!cached?.restaurants?.length) return;

    // Sanitize cache: reset any restaurants that were stuck in 'FETCHING' state
    const sanitized = cached.restaurants.map((r) =>
      r.menuScanStatus === 'FETCHING' ? { ...r, menuScanStatus: 'NOT_STARTED' as const } : r
    );

    rawRestaurants.current = applyFavorites(sanitized);
    userLat.current = cached.lat;
    userLng.current = cached.lng;

    if (!shouldContinue()) return;
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

    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;

    try {
      const netInfo = await NetInfo.fetch();
      if (!isActiveLoadRequest(requestId)) return;

      const isOnline =
        netInfo.isConnected === true && netInfo.isInternetReachable !== false;

      if (!isOnline) {
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
      await loadCachedIfAvailable(() => isActiveLoadRequest(requestId));
      if (!isActiveLoadRequest(requestId)) return;

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

      let latitude: number;
      let longitude: number;

      if (overrideCoords) {
        latitude = overrideCoords.latitude;
        longitude = overrideCoords.longitude;
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!isActiveLoadRequest(requestId)) return;

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
        if (!isActiveLoadRequest(requestId)) return;

        const lastTimestamp = lastKnown?.timestamp ?? 0;
        const isRecent = lastKnown && (Date.now() - lastTimestamp) < 60000;

        if (isRecent && lastKnown) {
          latitude = lastKnown.coords.latitude;
          longitude = lastKnown.coords.longitude;
        } else {
          let locationTimeout: ReturnType<typeof setTimeout> | null = null;
          const location = await Promise.race([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }),
            new Promise<Location.LocationObject>((_, reject) => {
              locationTimeout = setTimeout(() => reject(new Error('Location request timed out')), 10000);
            }),
          ]).finally(() => {
            if (locationTimeout) {
              clearTimeout(locationTimeout);
            }
          });
          if (!isActiveLoadRequest(requestId)) return;

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
      if (!isActiveLoadRequest(requestId)) return;

      const restaurantsWithDistance = applyFavorites(mergeCachedScanData(restaurants)).map((restaurant) => ({
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

      if (!isActiveLoadRequest(requestId)) return;

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
  }, [applyFavorites, emitFilteredState, getScanProgress, isActiveLoadRequest, kickOffMenuScans, loadCachedIfAvailable, mergeCachedScanData, persistCache]);

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
