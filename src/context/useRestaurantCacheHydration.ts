import { useCallback, useEffect, useRef } from 'react';
import { PersistenceService } from '../services/persistenceService';
import { Restaurant } from '../types/restaurant';
import { MENU_SCAN_TTL_MS, getCachedResultsMessage, prepareCachedRestaurants } from './restaurantState';

interface Options {
  // The current list of restaurants in memory. This is used to persist the restaurant data to storage.
  rawRestaurants: React.RefObject<Restaurant[]>;
  userLat: React.RefObject<number | null>;
  userLng: React.RefObject<number | null>;
  applyFavorites: (restaurants: Restaurant[]) => Restaurant[];
  loadFavorites: () => Promise<unknown>;
  setMenuScanCache: (cache: Awaited<ReturnType<typeof PersistenceService.loadMenuScanCache>>) => void;
  emitCachedState: (message: string) => void;
  startScans: (restaurants: Restaurant[]) => void;
  isMounted: () => boolean;
}

export function useRestaurantCacheHydration({
  // The current list of restaurants in memory. This is used to persist the restaurant data to storage.
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
    // If we've already attempted to load the cache, don't do it again. 
    // This prevents multiple components from trying to hydrate the cache at the same time.
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

    const sanitized = prepareCachedRestaurants(cached.restaurants);
    rawRestaurants.current = applyFavorites(sanitized);
    userLat.current = cached.lat;
    userLng.current = cached.lng;

    if (!shouldContinue()) return;
    emitCachedState(getCachedResultsMessage(cached.timestamp));
    startScans(rawRestaurants.current);
  }, [applyFavorites, emitCachedState, isMounted, loadFavorites, rawRestaurants, setMenuScanCache, startScans, userLat, userLng]);

  useEffect(() => {
    // If the component unmounts, we want to clear any pending persistence timeout to avoid memory leaks.
    void loadCachedIfAvailable();
  }, [loadCachedIfAvailable]);

  return { loadCachedIfAvailable };
}
