import { MutableRefObject, useCallback, useRef, useState } from 'react';
import { FavoriteStatus, Restaurant } from '../types/restaurant';
import { SettingsManager } from '../util/SettingsManager';
import { getRestaurantIdentityKey } from '../util/restaurantUtils';
import { logger } from '../util/logger';
import { applyFavoritesToRestaurants, getSavedRestaurants } from './restaurantState';

export function useRestaurantFavorites(rawRestaurants: MutableRefObject<Restaurant[]>) {
  const favoriteMap = useRef<Record<string, string>>({});
  const [savedRestaurants, setSavedRestaurants] = useState<Restaurant[]>([]);

  const favoriteKey = useCallback((restaurant: Restaurant): string | null => {
    return getRestaurantIdentityKey(restaurant);
  }, []);

  const applyFavorites = useCallback((restaurants: Restaurant[]) => {
    return applyFavoritesToRestaurants(restaurants, favoriteMap.current);
  }, []);

  const syncSavedRestaurants = useCallback(() => {
    setSavedRestaurants(getSavedRestaurants(rawRestaurants.current));
  }, [rawRestaurants]);

  const loadFavorites = useCallback(async () => {
    const favorites = await SettingsManager.loadFavorites();
    favoriteMap.current = favorites;
    return favorites;
  }, []);

  const setFavoriteMapStatus = useCallback(
    (restaurant: Restaurant, status: FavoriteStatus): boolean => {
      const key = favoriteKey(restaurant);
      if (!key) return false;

      if (!status) {
        delete favoriteMap.current[key];
      } else {
        favoriteMap.current[key] = status;
      }

      void SettingsManager.saveFavorites(favoriteMap.current).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to save favorite status: ${message}`);
      });

      return true;
    },
    [favoriteKey]
  );

  return {
    savedRestaurants,
    favoriteKey,
    applyFavorites,
    syncSavedRestaurants,
    loadFavorites,
    setFavoriteMapStatus,
  };
}
