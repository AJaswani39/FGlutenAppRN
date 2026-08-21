import { MutableRefObject, useCallback, useMemo, useRef, useState } from 'react';
import { FavoriteStatus, Restaurant } from '../types/restaurant';
import { PersistenceService } from '../services/persistenceService';

import { getRestaurantIdentityKey } from '../util/restaurantUtils';
import { logger } from '../util/logger';
import { applyFavoritesToRestaurants, getSavedRestaurants, mergeSavedRestaurants } from './restaurantState';

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
    const liveFavorites = getSavedRestaurants(rawRestaurants.current);
    const synced = mergeSavedRestaurants({
      liveRestaurants: liveFavorites,
      historicalRestaurants: savedDb.current,
      favoriteMap: favoriteMap.current,
    });

    setSavedRestaurants(synced);
  }, [rawRestaurants]);

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

  const updateSavedRestaurant = useCallback(
    (restaurant: Restaurant, updater: (r: Restaurant) => Restaurant) => {
      const key = favoriteKey(restaurant);
      if (!key) return;

      const existingIdx = savedDb.current.findIndex(r => favoriteKey(r) === key);
      if (existingIdx >= 0) {
        const next = updater(savedDb.current[existingIdx]);
        if (next !== savedDb.current[existingIdx]) {
          savedDb.current[existingIdx] = next;
          void PersistenceService.saveSavedRestaurantsDb(savedDb.current).catch((error: unknown) => {
            logger.error(`Failed to save updated saved DB: ${error instanceof Error ? error.message : String(error)}`);
          });
          syncSavedRestaurants();
        }
      }
    },
    [favoriteKey, syncSavedRestaurants]
  );

  return useMemo(
    () => ({
      savedRestaurants,
      favoriteKey,
      applyFavorites,
      syncSavedRestaurants,
      loadFavorites,
      setFavoriteMapStatus,
      updateSavedRestaurant,
    }),
    [
      savedRestaurants,
      favoriteKey,
      applyFavorites,
      syncSavedRestaurants,
      loadFavorites,
      setFavoriteMapStatus,
      updateSavedRestaurant,
    ]
  );
}

