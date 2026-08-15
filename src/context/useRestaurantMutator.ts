import { useCallback, MutableRefObject } from 'react';
import { Restaurant } from '../types/restaurant';
import { isSameRestaurantIdentity } from '../util/restaurantUtils';

const TERMINAL_SCAN_STATUSES = ['SUCCESS', 'NO_MENU_CONTENT', 'FAILED', 'NO_WEBSITE', 'JS_ONLY'];

interface UseRestaurantMutatorDeps {
  rawRestaurants: MutableRefObject<Restaurant[]>;
  updateSavedRestaurant: (restaurant: Restaurant, updater: (r: Restaurant) => Restaurant) => void;
  persistCache: () => void;
  persistMenuScan: (restaurant: Restaurant) => void;
}

/**
 * Updates a matching restaurant in the live cache, mirroring the change into the
 * persistent favorites DB and triggering selective disk persistence only when a
 * terminal scan status, favorite, or AI field actually changed.
 *
 * Extracted from `RestaurantProvider` so the provider no longer owns this
 * diffing/persistence logic inline.
 */
export function useRestaurantMutator({
  rawRestaurants,
  updateSavedRestaurant,
  persistCache,
  persistMenuScan,
}: UseRestaurantMutatorDeps) {
  return useCallback(
    (target: Restaurant, updater: (restaurant: Restaurant) => Restaurant) => {
      let updated = false;
      let worthPersisting = false;
      let shouldPersistScanCache = false;
      let scanCacheRestaurant: Restaurant | null = null;

      rawRestaurants.current = rawRestaurants.current.map((restaurant) => {
        if (!isSameRestaurantIdentity(restaurant, target)) {
          return restaurant;
        }

        const nextRestaurant = updater(restaurant);
        if (nextRestaurant !== restaurant) {
          updated = true;

          const statusChangedToTerminal =
            nextRestaurant.menuScanStatus !== restaurant.menuScanStatus &&
            TERMINAL_SCAN_STATUSES.includes(nextRestaurant.menuScanStatus);

          const favoriteChanged = nextRestaurant.favoriteStatus !== restaurant.favoriteStatus;
          const aiChanged =
            nextRestaurant.aiAnalysisResult !== restaurant.aiAnalysisResult ||
            nextRestaurant.aiChatHistory !== restaurant.aiChatHistory ||
            nextRestaurant.aiDeepAnalysis !== restaurant.aiDeepAnalysis;

          if (statusChangedToTerminal || favoriteChanged || aiChanged) {
            worthPersisting = true;
          }

          if (statusChangedToTerminal || aiChanged) {
            shouldPersistScanCache = true;
            scanCacheRestaurant = nextRestaurant;
          }
        }

        return nextRestaurant;
      });

      updateSavedRestaurant(target, updater);

      if (worthPersisting) {
        persistCache();
      }

      if (shouldPersistScanCache && scanCacheRestaurant) {
        persistMenuScan(scanCacheRestaurant);
      }

      return updated;
    },
    [persistCache, persistMenuScan, updateSavedRestaurant]
  );
}
