import { useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { fetchNearbyRestaurants } from '../data/placesRepository';
import { distanceBetween } from '../util/geoUtils';
import { Restaurant, RestaurantUiState } from '../types/restaurant';
import { logger } from '../util/logger';
import { getMapsApiKey } from './restaurantState';

type Coordinates = { latitude: number; longitude: number };

interface Options {
  rawRestaurants: React.MutableRefObject<Restaurant[]>;
  userLat: React.MutableRefObject<number | null>;
  userLng: React.MutableRefObject<number | null>;
  filtersRef: React.MutableRefObject<{ maxDistanceMeters: number }>;
  uiStateRef: React.MutableRefObject<RestaurantUiState>;
  isMounted: React.MutableRefObject<boolean>;
  setUiState: React.Dispatch<React.SetStateAction<RestaurantUiState>>;
  getScanProgress: () => RestaurantUiState['scanProgress'];
  emitFilteredState: (options?: { emptyReason?: 'filters' | 'nearby'; message?: string | null; status?: RestaurantUiState['status'] }) => void;
  mergeCachedScanData: (restaurants: Restaurant[]) => Restaurant[];
  applyFavorites: (restaurants: Restaurant[]) => Restaurant[];
  flushQueue: () => void;
  loadCachedIfAvailable: (shouldContinue: () => boolean) => Promise<void>;
  persistCache: () => void;
  startScans: (restaurants: Restaurant[]) => void;
}

export function useRestaurantLoader({
  rawRestaurants,
  userLat,
  userLng,
  filtersRef,
  uiStateRef,
  isMounted,
  setUiState,
  getScanProgress,
  emitFilteredState,
  mergeCachedScanData,
  applyFavorites,
  flushQueue,
  loadCachedIfAvailable,
  persistCache,
  startScans,
}: Options) {
  const requestIdRef = useRef(0);

  const isActiveRequest = useCallback((requestId: number) => (
    isMounted.current && requestIdRef.current === requestId
  ), [isMounted]);

  const showCachedFallbackOrError = useCallback((options: {
    message: string;
    emptyReason?: 'filters' | 'nearby';
    status?: RestaurantUiState['status'];
    userLatitude?: number | null;
    userLongitude?: number | null;
  }) => {
    const {
      message,
      emptyReason = 'filters',
      status = 'error',
      userLatitude = null,
      userLongitude = null,
    } = options;

    if (rawRestaurants.current.length > 0) {
      emitFilteredState({ emptyReason, message });
      return;
    }

    setUiState({
      status,
      restaurants: [],
      message,
      userLatitude,
      userLongitude,
      scanProgress: getScanProgress(),
    });
  }, [emitFilteredState, getScanProgress, rawRestaurants, setUiState]);

  const loadNearbyRestaurants = useCallback(async (overrideCoords?: Coordinates) => {
    if (uiStateRef.current.status === 'loading') return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      let netInfo;
      try {
        netInfo = await NetInfo.fetch();
      } catch (error: unknown) {
        if (!isActiveRequest(requestId)) return;
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Could not determine network status: ${message}`);
        showCachedFallbackOrError({
          message: 'Could not check the internet connection. Showing cached results.',
          emptyReason: 'filters',
          status: 'error',
        });
        return;
      }

      if (!isActiveRequest(requestId)) return;
      const isOnline = netInfo.isConnected === true && netInfo.isInternetReachable !== false;
      if (!isOnline) {
        showCachedFallbackOrError({
          message: 'No internet connection. Showing last cached results.',
          emptyReason: 'filters',
          status: 'error',
        });
        return;
      }

      flushQueue();
      const mapsApiKey = getMapsApiKey();
      await loadCachedIfAvailable(() => isActiveRequest(requestId));
      if (!isActiveRequest(requestId)) return;

      if (!mapsApiKey) {
        showCachedFallbackOrError({
          message: 'Showing cached results — Maps API key is missing. Live refresh is unavailable.',
          emptyReason: 'filters',
          status: 'error',
          userLatitude: null,
          userLongitude: null,
        });
        return;
      }

      const isManualSearch = !!overrideCoords;
      if (rawRestaurants.current.length > 0) {
        emitFilteredState({ emptyReason: 'filters', message: isManualSearch ? 'Searching this area…' : 'Refreshing nearby restaurants…', status: 'loading' });
      } else {
        setUiState({ status: 'loading', restaurants: [], message: isManualSearch ? 'Searching this area…' : 'Finding restaurants near you…', userLatitude: overrideCoords?.latitude ?? userLat.current, userLongitude: overrideCoords?.longitude ?? userLng.current, scanProgress: getScanProgress() });
      }

      let latitude: number;
      let longitude: number;
      if (overrideCoords) {
        ({ latitude, longitude } = overrideCoords);
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!isActiveRequest(requestId)) return;
        if (status !== 'granted') {
          showCachedFallbackOrError({
            message: 'Showing cached results — location permission is needed to refresh nearby restaurants.',
            emptyReason: 'filters',
            status: 'permission_required',
          });
          return;
        }

        const lastKnown = await Location.getLastKnownPositionAsync();
        if (!isActiveRequest(requestId)) return;
        const isRecent = !!lastKnown && (Date.now() - (lastKnown.timestamp ?? 0)) < 60000;
        if (isRecent && lastKnown) {
          latitude = lastKnown.coords.latitude;
          longitude = lastKnown.coords.longitude;
        } else {
          let locationTimeout: ReturnType<typeof setTimeout> | null = null;
          const location = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<Location.LocationObject>((_, reject) => {
              locationTimeout = setTimeout(() => reject(new Error('Location request timed out')), 10000);
            }),
          ]).finally(() => {
            if (locationTimeout) clearTimeout(locationTimeout);
          });
          if (!isActiveRequest(requestId)) return;
          latitude = location.coords.latitude;
          longitude = location.coords.longitude;
        }
      }

      const searchRadiusMeters = filtersRef.current.maxDistanceMeters > 0 ? filtersRef.current.maxDistanceMeters : undefined;
      const restaurants = await fetchNearbyRestaurants(latitude, longitude, mapsApiKey, searchRadiusMeters);
      if (!isActiveRequest(requestId)) return;

      const restaurantsWithDistance = applyFavorites(mergeCachedScanData(restaurants)).map((restaurant) => ({
        ...restaurant,
        distanceMeters: distanceBetween(latitude, longitude, restaurant.latitude, restaurant.longitude),
      }));
      rawRestaurants.current = restaurantsWithDistance;
      userLat.current = latitude;
      userLng.current = longitude;
      emitFilteredState({ emptyReason: 'nearby' });
      persistCache();
      startScans(restaurantsWithDistance);
    } catch (error: unknown) {
      if (!isActiveRequest(requestId)) return;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const message = `Could not load restaurants: ${errorMessage}`;
      if (/permission|denied|allowed/i.test(errorMessage)) {
        setUiState({
          status: 'permission_required',
          restaurants: rawRestaurants.current.length > 0 ? uiStateRef.current.restaurants : [],
          message: 'Location permission or services are required to refresh results.',
          userLatitude: userLat.current,
          userLongitude: userLng.current,
          scanProgress: getScanProgress(),
        });
      } else {
        showCachedFallbackOrError({
          message: `Showing cached results — ${message}`,
          emptyReason: 'filters',
          status: 'error',
        });
      }
    }
  }, [applyFavorites, emitFilteredState, filtersRef, flushQueue, getScanProgress, isActiveRequest, loadCachedIfAvailable, mergeCachedScanData, persistCache, rawRestaurants, setUiState, showCachedFallbackOrError, startScans, uiStateRef, userLat, userLng]);

  return { loadNearbyRestaurants, invalidateLoads: () => { requestIdRef.current += 1; } };
}
