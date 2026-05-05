import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { FavoriteStatus, MenuScanProgress, Restaurant, RestaurantUiState } from '../types/restaurant';
import {
  distanceBetween,
  extractGfEvidence,
  extractRawMenuText,
  fetchHtml,
  fetchNearbyRestaurants,
  fetchWebsiteForPlace,
  findMenuLink,
} from '../data/placesRepository';
import { SettingsManager } from '../util/SettingsManager';
import {
  filterAndSortRestaurants,
  getRestaurantIdentityKey,
  isSameRestaurantIdentity,
} from '../util/restaurantUtils';
import { useFilters } from './FiltersContext';
import { useSettings } from './SettingsContext';
import { logger } from '../util/logger';

const MENU_SCAN_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_SCANS_PER_BATCH = 5;

interface ExpoConfigExtra {
  MAPS_API_KEY?: string;
}

function getMapsApiKey(): string {
  return (Constants.expoConfig?.extra as ExpoConfigExtra)?.MAPS_API_KEY ?? '';
}

type EmptyResultsReason = 'filters' | 'nearby';

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
}

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

export function getEmptyResultsMessage(reason: EmptyResultsReason): string {
  if (reason === 'filters') {
    return 'No restaurants match your current filters.';
  }

  return 'No nearby restaurants found. Try expanding your distance or refreshing your search.';
}

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
  const [savedRestaurants, setSavedRestaurants] = useState<Restaurant[]>([]);

  const rawRestaurants = useRef<Restaurant[]>([]);
  const userLat = useRef<number | null>(null);
  const userLng = useRef<number | null>(null);
  const favoriteMap = useRef<Record<string, string>>({});
  const scanBatchKeys = useRef<string[]>([]);
  const cacheAttempted = useRef(false);
  const filtersRef = useRef(filters);

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

  const favoriteKey = useCallback((restaurant: Restaurant): string | null => {
    return getRestaurantIdentityKey(restaurant);
  }, []);

  const applyFavorites = useCallback(
    (restaurants: Restaurant[]) => {
      return restaurants.map((restaurant) => {
        const key = favoriteKey(restaurant);
        if (!key) return restaurant;

        const favoriteStatus = favoriteMap.current[key] as FavoriteStatus | undefined;
        if (!favoriteStatus) return restaurant;

        return { ...restaurant, favoriteStatus };
      });
    },
    [favoriteKey]
  );

  const syncSavedRestaurants = useCallback(() => {
    const statusOrder: Record<NonNullable<FavoriteStatus>, number> = {
      safe: 0,
      try: 1,
      avoid: 2,
    };

    setSavedRestaurants(
      rawRestaurants.current
        .filter((restaurant) => restaurant.favoriteStatus)
        .sort((left, right) => {
          const leftStatus = left.favoriteStatus ?? 'try';
          const rightStatus = right.favoriteStatus ?? 'try';
          const statusDelta = statusOrder[leftStatus] - statusOrder[rightStatus];
          return statusDelta !== 0 ? statusDelta : left.name.localeCompare(right.name);
        })
    );
  }, []);

  const getScanProgress = useCallback((): MenuScanProgress | null => {
    const keys = scanBatchKeys.current;
    if (keys.length === 0) return null;

    let completed = 0;
    let fetching = 0;
    for (const key of keys) {
      const restaurant = rawRestaurants.current.find((item) => favoriteKey(item) === key);
      if (!restaurant) continue;
      if (restaurant.menuScanStatus === 'FETCHING') {
        fetching += 1;
      } else if (restaurant.menuScanStatus !== 'NOT_STARTED') {
        completed += 1;
      }
    }

    return {
      completed,
      total: keys.length,
      active: fetching > 0 || completed < keys.length,
    };
  }, [favoriteKey]);

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
    if (rawRestaurants.current.length === 0 && uiState.status === 'idle') {
      return;
    }

    emitFilteredState({
      emptyReason: rawRestaurants.current.length === 0 ? 'nearby' : 'filters',
      message: uiState.message,
      status: uiState.status,
    });
  }, [emitFilteredState, filters, strictCeliac]);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const favorites = await SettingsManager.loadFavorites();
      if (!isMounted) return;

      favoriteMap.current = favorites;
      if (rawRestaurants.current.length > 0) {
        rawRestaurants.current = applyFavorites(rawRestaurants.current);
        emitFilteredState({
          emptyReason: rawRestaurants.current.length === 0 ? 'nearby' : 'filters',
          message: uiState.message,
          status: uiState.status,
        });
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [applyFavorites, emitFilteredState]);

  const persistCache = useCallback(async () => {
    await SettingsManager.saveCache({
      restaurants: rawRestaurants.current,
      lat: userLat.current,
      lng: userLng.current,
      timestamp: Date.now(),
    });
  }, []);

  const scanMenu = useCallback(
    async (restaurant: Restaurant) => {
      const mapsApiKey = getMapsApiKey();
      if (!mapsApiKey || !restaurant.placeId) return;

      const scanStartedAt = Date.now();
      const started = updateRestaurant(restaurant, (current) => ({
        ...current,
        menuScanStatus: 'FETCHING',
        menuScanTimestamp: scanStartedAt,
      }));

      if (!started) return;
      emitFilteredState({
        emptyReason: rawRestaurants.current.length === 0 ? 'nearby' : 'filters',
        message: uiState.message,
        status: uiState.status,
      });

      const website = await fetchWebsiteForPlace(restaurant.placeId, mapsApiKey);
      if (!website) {
        const applied = updateRestaurant(restaurant, (current) => {
          if (
            current.menuScanStatus !== 'FETCHING' ||
            current.menuScanTimestamp !== scanStartedAt
          ) {
            return current;
          }

          return {
            ...current,
            menuUrl: null,
            menuScanStatus: 'NO_WEBSITE',
            menuScanTimestamp: scanStartedAt,
          };
        });

        if (applied) {
          emitFilteredState();
          await persistCache();
        }
        return;
      }

      let menuUrl = website;
      let html = await fetchHtml(website);
      if (html) {
        const menuLink = findMenuLink(html, website);
        if (menuLink && menuLink !== website) {
          menuUrl = menuLink;
          const menuHtml = await fetchHtml(menuLink);
          if (menuHtml) {
            html = menuHtml;
          }
        }
      }

      const gfMenu = html ? extractGfEvidence(html) : [];
      const rawMenuText = html ? extractRawMenuText(html) : null;
      const applied = updateRestaurant(restaurant, (current) => {
        if (
          current.menuScanStatus !== 'FETCHING' ||
          current.menuScanTimestamp !== scanStartedAt
        ) {
          return current;
        }

        return {
          ...current,
          menuUrl,
          gfMenu,
          rawMenuText,
          menuScanStatus: html ? 'SUCCESS' : 'FAILED',
          menuScanTimestamp: scanStartedAt,
        };
      });

      if (applied) {
        emitFilteredState();
        await persistCache();
      }
    },
    [emitFilteredState, persistCache, uiState.message, uiState.status, updateRestaurant]
  );

  const kickOffMenuScans = useCallback(
    (restaurants: Restaurant[]) => {
      const now = Date.now();
      const targets: Restaurant[] = [];

      for (const restaurant of restaurants) {
        if (!restaurant.placeId || restaurant.menuScanStatus === 'FETCHING') continue;

        const age =
          restaurant.menuScanTimestamp > 0 ? now - restaurant.menuScanTimestamp : Infinity;
        if (age < MENU_SCAN_TTL_MS && restaurant.menuScanStatus !== 'NOT_STARTED') continue;
        if (targets.length >= MAX_SCANS_PER_BATCH) break;

        targets.push(restaurant);
      }

      scanBatchKeys.current = targets
        .map((restaurant) => favoriteKey(restaurant))
        .filter((key): key is string => Boolean(key));

      if (targets.length > 0) {
        emitFilteredState({
          emptyReason: rawRestaurants.current.length === 0 ? 'nearby' : 'filters',
          message: uiState.message,
          status: uiState.status,
        });
      }

      for (const restaurant of targets) {
        void scanMenu(restaurant);
      }
    },
    [emitFilteredState, favoriteKey, scanMenu, uiState.message, uiState.status]
  );

  const loadCachedIfAvailable = useCallback(async () => {
    if (cacheAttempted.current) return;

    cacheAttempted.current = true;
    favoriteMap.current = await SettingsManager.loadFavorites();
    const cached = await SettingsManager.loadCache();
    if (!cached?.restaurants?.length) return;

    rawRestaurants.current = applyFavorites(cached.restaurants);
    userLat.current = cached.lat;
    userLng.current = cached.lng;

    let message = 'Showing cached results';
    if (cached.timestamp > 0) {
      message += ` (${new Date(cached.timestamp).toLocaleString()})`;
    }

    emitFilteredState({
      emptyReason: 'filters',
      message,
    });
    kickOffMenuScans(rawRestaurants.current);
  }, [applyFavorites, emitFilteredState, kickOffMenuScans]);

  useEffect(() => {
    void loadCachedIfAvailable();
  }, [loadCachedIfAvailable]);

  const loadNearbyRestaurants = useCallback(async () => {
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

    try {
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
      const key = favoriteKey(restaurant);
      if (!key) return;

      if (!status) {
        delete favoriteMap.current[key];
      } else {
        favoriteMap.current[key] = status;
      }

      updateRestaurant(restaurant, (current) => ({
        ...current,
        favoriteStatus: status,
      }));

      void SettingsManager.saveFavorites(favoriteMap.current).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to save favorite status: ${message}`);
      });
      emitFilteredState({
        emptyReason: rawRestaurants.current.length === 0 ? 'nearby' : 'filters',
        message: uiState.message,
        status: uiState.status,
      });
    },
    [emitFilteredState, favoriteKey, uiState.message, uiState.status, updateRestaurant]
  );

  const requestMenuRescan = useCallback(
    (restaurant: Restaurant) => {
      if (!restaurant.placeId || !getMapsApiKey()) return;

      const scanRequestedAt = Date.now();
      const key = favoriteKey(restaurant);
      if (key) {
        scanBatchKeys.current = [key];
      }

      const updated = updateRestaurant(restaurant, (current) => ({
        ...current,
        gfMenu: [],
        menuScanStatus: 'FETCHING',
        menuScanTimestamp: scanRequestedAt,
      }));

      if (!updated) return;

      emitFilteredState({
        emptyReason: rawRestaurants.current.length === 0 ? 'nearby' : 'filters',
        message: uiState.message,
        status: uiState.status,
      });
      void scanMenu(restaurant);
    },
    [emitFilteredState, favoriteKey, scanMenu, uiState.message, uiState.status, updateRestaurant]
  );

  return (
    <RestaurantContext.Provider
      value={{
        uiState,
        savedRestaurants,
        loadNearbyRestaurants,
        setFavoriteStatus,
        requestMenuRescan,
      }}
    >
      {children}
    </RestaurantContext.Provider>
  );
}
