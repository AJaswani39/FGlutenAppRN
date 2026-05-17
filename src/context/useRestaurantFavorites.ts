import { MutableRefObject, useCallback, useMemo, useRef, useState } from 'react';
import { FavoriteStatus, Restaurant } from '../types/restaurant';
import { PersistenceService } from '../services/persistenceService';

import { getRestaurantIdentityKey } from '../util/restaurantUtils';
import { logger } from '../util/logger';
import { applyFavoritesToRestaurants, getSavedRestaurants } from './restaurantState';

export function useRestaurantFavorites(rawRestaurants: MutableRefObject<Restaurant[]>) {
  const favoriteMap = useRef<Record<string, string>>({});
  const savedDb = useRef<Restaurant[]>([]);
  const [savedRestaurants, setSavedRestaurants] = useState<Restaurant[]>([]);

  const favoriteKey = useCallback((restaurant: Restaurant): string | null => {
    return getRestaurantIdentityKey(restaurant);
  }, []);

  const applyFavorites = useCallback((restaurants: Restaurant[]) => {
    return applyFavoritesToRestaurants(restaurants, favoriteMap.current);
  }, []);

  const syncSavedRestaurants = useCallback(() => {
    // 1. Get the currently tracked favorites from the live nearby cache
    const liveFavorites = getSavedRestaurants(rawRestaurants.current);
    
    // 2. Merge with historical DB (prefer live data as it has updated distance/scans)
    const liveMap = new Map(liveFavorites.map(r => [favoriteKey(r)!, r]));
    
    const historicalToAdd = savedDb.current.filter(r => {
      const key = favoriteKey(r);
      return key && !liveMap.has(key) && favoriteMap.current[key];
    });

    const merged = [...liveFavorites, ...historicalToAdd];
    
    // Re-apply favorites status just in case
    const synced = getSavedRestaurants(applyFavoritesToRestaurants(merged, favoriteMap.current));
    setSavedRestaurants(synced);
  }, [rawRestaurants, favoriteKey]);

  const loadFavorites = useCallback(async () => {
    const [favorites, historicalDb] = await Promise.all([
      PersistenceService.loadFavorites(),
      PersistenceService.loadSavedRestaurantsDb()
    ]);

    favoriteMap.current = favorites;
    savedDb.current = historicalDb;
    return favorites;
  }, []);

  const setFavoriteMapStatus = useCallback(
    (restaurant: Restaurant, status: FavoriteStatus): boolean => {
      const key = favoriteKey(restaurant);
      if (!key) return false;

      if (!status) {
        delete favoriteMap.current[key];
        savedDb.current = savedDb.current.filter(r => favoriteKey(r) !== key);
      } else {
        favoriteMap.current[key] = status;
        const existingIdx = savedDb.current.findIndex(r => favoriteKey(r) === key);
        if (existingIdx >= 0) {
          savedDb.current[existingIdx] = { ...restaurant, favoriteStatus: status };
        } else {
          savedDb.current.push({ ...restaurant, favoriteStatus: status });
        }
      }

      void PersistenceService.saveFavorites(favoriteMap.current).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to save favorite status: ${message}`);
      });
      
      void PersistenceService.saveSavedRestaurantsDb(savedDb.current).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to save historical DB: ${message}`);
      });

      return true;
    },
    [favoriteKey]
  );

  return useMemo(
    () => ({
      savedRestaurants,
      favoriteKey,
      applyFavorites,
      syncSavedRestaurants,
      loadFavorites,
      setFavoriteMapStatus,
    }),
    [
      savedRestaurants,
      favoriteKey,
      applyFavorites,
      syncSavedRestaurants,
      loadFavorites,
      setFavoriteMapStatus,
    ]
  );
}

