import { useCallback, useEffect, useRef } from 'react';
import { PersistenceService } from '../services/persistenceService';
import { Restaurant } from '../types/restaurant';
import { MENU_SCAN_TTL_MS, getCachedResultsMessage } from './restaurantState';

interface Options {
  rawRestaurants: React.MutableRefObject<Restaurant[]>;
  userLat: React.MutableRefObject<number | null>;
  userLng: React.MutableRefObject<number | null>;
  applyFavorites: (restaurants: Restaurant[]) => Restaurant[];
  loadFavorites: () => Promise<unknown>;
  setMenuScanCache: (cache: Awaited<ReturnType<typeof PersistenceService.loadMenuScanCache>>) => void;
  emitCachedState: (message: string) => void;
  startScans: (restaurants: Restaurant[]) => void;
  isMounted: () => boolean;
}

export function useRestaurantCacheHydration({
  rawRestaurants,
  userLat,
  userLng,
  applyFavorites,
  loadFavorites,
  setMenuScanCache,
  emitCachedState,
  startScans,
  isMounted,
}: Options) {
  const attempted = useRef(false);

  const loadCachedIfAvailable = useCallback(async (shouldContinue: () => boolean = isMounted) => {
    if (attempted.current) return;

    attempted.current = true;
    await loadFavorites();
    if (!shouldContinue()) return;

    const cached = await PersistenceService.loadCache();
    if (!shouldContinue()) return;

    const scanCache = await PersistenceService.loadMenuScanCache(MENU_SCAN_TTL_MS);
    setMenuScanCache(scanCache);
    if (!shouldContinue()) return;

    if (!cached?.restaurants?.length) return;

    const sanitized = cached.restaurants.map((restaurant) => (
      restaurant.menuScanStatus === 'FETCHING'
        ? { ...restaurant, menuScanStatus: 'NOT_STARTED' as const }
        : restaurant
    ));

    rawRestaurants.current = applyFavorites(sanitized);
    userLat.current = cached.lat;
    userLng.current = cached.lng;

    if (!shouldContinue()) return;
    emitCachedState(getCachedResultsMessage(cached.timestamp));
    startScans(rawRestaurants.current);
  }, [applyFavorites, emitCachedState, isMounted, loadFavorites, rawRestaurants, setMenuScanCache, startScans, userLat, userLng]);

  useEffect(() => {
    void loadCachedIfAvailable();
  }, [loadCachedIfAvailable]);

  return { loadCachedIfAvailable };
}
