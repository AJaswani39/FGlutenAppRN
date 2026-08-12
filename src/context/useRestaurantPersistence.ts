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
  rawRestaurants: React.MutableRefObject<Restaurant[]>;
  userLat: React.MutableRefObject<number | null>;
  userLng: React.MutableRefObject<number | null>;
}

export function useRestaurantPersistence({ rawRestaurants, userLat, userLng }: Options) {
  const menuScanCache = useRef<Record<string, MenuScanCacheEntry>>({});
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
  }, [rawRestaurants, userLat, userLng]);

  const persistCache = useCallback(() => {
    if (persistTimeout.current) {
      clearTimeout(persistTimeout.current);
    }

    persistTimeout.current = setTimeout(() => {
      void flushPersistence();
    }, 2000);
  }, [flushPersistence]);

  const persistMenuScan = useCallback((restaurant: Restaurant) => {
    const entry = getMenuScanCacheEntry(restaurant);
    if (entry) {
      menuScanCache.current[entry.placeId] = entry;
    }

    void PersistenceService.saveMenuScanCacheEntry(restaurant, MENU_SCAN_TTL_MS).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to save menu scan cache entry: ${message}`);
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'inactive' || nextAppState === 'background') {
        void flushPersistence();
      }
    });

    return () => subscription.remove();
  }, [flushPersistence]);

  useEffect(() => {
    return () => {
      if (persistTimeout.current) {
        clearTimeout(persistTimeout.current);
        persistTimeout.current = null;
      }
    };
  }, []);

  return { menuScanCache, persistCache, flushPersistence, persistMenuScan };
}
