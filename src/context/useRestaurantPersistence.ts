import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import {
  MenuScanCacheEntry,
  PersistenceService,
  getMenuScanCacheEntry,
} from '../services/persistenceService';
import { Restaurant } from '../types/restaurant';
import { MENU_SCAN_TTL_MS } from './restaurantState';
import { logger } from '../util/logger';

interface Options {
  // The current list of restaurants in memory. This is used to persist the restaurant data to storage.
  rawRestaurants: React.RefObject<Restaurant[]>;
  userLat: React.RefObject<number | null>;
  userLng: React.RefObject<number | null>;
}

export function useRestaurantPersistence({ rawRestaurants, userLat, userLng }: Options) {
  const menuScanCache = useRef<Record<string, MenuScanCacheEntry>>({});
  const persistTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuScanWriteQueue = useRef<Promise<void>>(Promise.resolve());

  const flushPersistence = useCallback(async () => {
    // If there's a pending persistence timeout, clear it so we don't flush twice.
    if (persistTimeout.current) {
      clearTimeout(persistTimeout.current);
      persistTimeout.current = null;
    }

    try {
      // We need to save the current state of the restaurant collection and user location to persistent storage.
      await PersistenceService.saveCache({
        restaurants: rawRestaurants.current,
        lat: userLat.current,
        lng: userLng.current,
        timestamp: Date.now(),
      });
    } catch (error: unknown) {
      // If we fail to flush the persistence, log the error but don't crash the app. 
      // This is a non-critical operation.
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to flush persistence: ${message}`);
    }
  }, [rawRestaurants, userLat, userLng]);

  const persistCache = useCallback(() => {
    // If there's already a pending persistence timeout, clear it so we can reset the timer.
    if (persistTimeout.current) {
      clearTimeout(persistTimeout.current);
    }

    persistTimeout.current = setTimeout(() => {
      // we use void here because we don't want to await the flushPersistence call,      
      // we just want to fire and forget. If it fails, it will log the error.  
      void flushPersistence();
    }, 2000);
  }, [flushPersistence]);

  const persistMenuScan = useCallback((restaurant: Restaurant) => {
    const entry = getMenuScanCacheEntry(restaurant);
    if (!entry) return;

    // Update the session cache immediately, then serialize the persistent
    // read/merge/write operations so concurrent scans cannot overwrite one
    // another with stale snapshots of AsyncStorage.
    menuScanCache.current[entry.placeId] = entry;
    menuScanWriteQueue.current = menuScanWriteQueue.current
      .catch(() => undefined)
      .then(async () => {
        // Load the current cache from persistent storage, update it with the new entry, and save it back.
        const cache = await PersistenceService.loadMenuScanCache(MENU_SCAN_TTL_MS);
        cache[entry.placeId] = entry;
        await PersistenceService.saveMenuScanCache(cache, MENU_SCAN_TTL_MS);
      })
      .catch((error: unknown) => {
        // If we fail to persist the menu scan cache, log the error but don't crash the app.
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to save menu scan cache entry: ${message}`);
      });
  }, []);

  useEffect(() => {
    // We want to flush the persistence when the app goes into the background or becomes inactive.
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'inactive' || nextAppState === 'background') {
        void flushPersistence();
      }
    });

    return () => subscription.remove();
  }, [flushPersistence]);

  useEffect(() => {
    return () => {
      // If the component unmounts, we want to clear any pending persistence timeout to avoid memory leaks.
      if (persistTimeout.current) {
        clearTimeout(persistTimeout.current);
        persistTimeout.current = null;
      }
    };
  }, []);

  return { menuScanCache, persistCache, flushPersistence, persistMenuScan };
}
