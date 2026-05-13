import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as Location from 'expo-location';
import { FavoriteStatus, MenuScanProgress, Restaurant, RestaurantUiState } from '../types/restaurant';
import { fetchNearbyRestaurants } from '../data/placesRepository';
import { distanceBetween } from '../util/geoUtils';
import { PersistenceService } from '../services/persistenceService';

import {
  filterAndSortRestaurants,
  isSameRestaurantIdentity,
} from '../util/restaurantUtils';
import { useFilters } from './FiltersContext';
import { useSettings } from './SettingsContext';
import { logger } from '../util/logger';
import { ScanOrchestrator } from '../services/scanOrchestrator';
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
  loadNearbyRestaurants: () => Promise<void>;
  setFavoriteStatus: (restaurant: Restaurant, status: FavoriteStatus) => void;
  requestMenuRescan: (restaurant: Restaurant) => void;
  retryFailedScans: () => void;
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

  const updateRestaurant = useCallback(
    (target: Restaurant, updater: (restaurant: Restaurant) => Restaurant) => {
      let updated = false;

      rawRestaurants.current = rawRestaurants.current.map((restaurant) => {
        if (!isSameRestaurantIdentity(restaurant, target)) {
          return restaurant;
        }

        const nextRestaurant = updater(restaurant);
        if (nextRestaurant !== restaurant) {
          updated = true;
        }

        return nextRestaurant;
      });

      return updated;
    },
    []
  );

  const getScanProgress = useCallback((): MenuScanProgress | null => {
    return getScanProgressForRestaurants(rawRestaurants.current, orchestrator.getBatchKeys());
  }, [orchestrator]);

  const emitFilteredState = useCallback(
    (options: EmitFilteredStateOptions = {}) => {
      const raw = rawRestaurants.current;
      const filtered = filterAndSortRestaurants(raw, filtersRef.current, strictCeliac);
      const status = options.status ?? 'success';
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

  const persistTimeout = useRef<NodeJS.Timeout | null>(null);

  const persistCache = useCallback(() => {
    // Debounce persistence to avoid hammering the disk during batch scans
    if (persistTimeout.current) {
      clearTimeout(persistTimeout.current);
    }

    persistTimeout.current = setTimeout(async () => {
      try {
        await PersistenceService.saveCache({
          restaurants: rawRestaurants.current,
          lat: userLat.current,
          lng: userLng.current,
          timestamp: Date.now(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to save restaurant cache: ${message}`);
      } finally {
        persistTimeout.current = null;
      }
    }, 2000);
  }, []);

  const orchestrator = useMemo(() => {
    return new ScanOrchestrator({
      mapsApiKey: getMapsApiKey(),
      onRestaurantUpdate: updateRestaurant,
      onNotifyUI: () => emitFilteredState(),
      onPersist: persistCache,
      getIdentityKey: favoriteKey,
    });
  }, [emitFilteredState, favoriteKey, persistCache, updateRestaurant]);

  const kickOffMenuScans = useCallback(
    (restaurants: Restaurant[]) => {
      void orchestrator.scanBatch(restaurants);
    },
    [orchestrator]
  );

  const loadCachedIfAvailable = useCallback(async () => {
    if (cacheAttempted.current) return;

    cacheAttempted.current = true;
    await loadFavorites();
    const cached = await PersistenceService.loadCache();

    if (!cached?.restaurants?.length) return;

    rawRestaurants.current = applyFavorites(cached.restaurants);
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

  const loadNearbyRestaurants = useCallback(async () => {
    // Prevent redundant fetches if one is already in progress
    if (uiStateRef.current.status === 'loading') return;

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

    if (rawRestaurants.current.length > 0) {
      emitFilteredState({
        emptyReason: 'filters',
        message: 'Refreshing nearby restaurants…',
        status: 'loading',
      });
    } else {
      setUiState({
        status: 'loading',
        restaurants: [],
        message: 'Finding restaurants near you…',
        userLatitude: userLat.current,
        userLongitude: userLng.current,
        scanProgress: getScanProgress(),
      });
    }

    try {
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

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = location.coords;

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
      await persistCache();
      kickOffMenuScans(restaurantsWithDistance);
    } catch (error: unknown) {
      const message = `Could not load restaurants: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`;

      if (rawRestaurants.current.length > 0) {
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
      void orchestrator.requestRescan(restaurant);
    },
    [orchestrator]
  );

  const retryFailedScans = useCallback(() => {
    void orchestrator.retryFailed(rawRestaurants.current);
  }, [orchestrator]);

  const contextValue = useMemo(
    () => ({
      uiState,
      savedRestaurants,
      loadNearbyRestaurants,
      setFavoriteStatus,
      requestMenuRescan,
      retryFailedScans,
    }),
    [uiState, savedRestaurants, loadNearbyRestaurants, setFavoriteStatus, requestMenuRescan, retryFailedScans]
  );

  return (
    <RestaurantContext.Provider value={contextValue}>
      {children}
    </RestaurantContext.Provider>
  );
}
