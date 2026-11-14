import { FavoriteMap, FavoriteStatus, MenuScanProgress, Restaurant, RestaurantFilters, RestaurantUiState } from '../types/restaurant';
import { filterAndSortRestaurants, getRestaurantIdentityKey } from './restaurantUtils';
import { getRestaurantSafetyScore } from '../services/menuSafety';

export type EmptyResultsReason = 'filters' | 'nearby';
/**
 * Determines the reason for an empty restaurant collection based on the number of restaurants available.
 * If there are no restaurants, the reason is 'nearby'; otherwise, it is 'filters'.
 * @param restaurantCount The number of restaurants in the collection.
 * @returns A string indicating the reason for the empty results: 'filters' or 'nearby'.
 */
export function getCollectionReason(restaurantCount: number): EmptyResultsReason {
  return restaurantCount === 0 ? 'nearby' : 'filters';
}
/**
 * Returns a user-friendly message for empty restaurant results based on the reason for the empty state.
 * @param reason The reason for the empty results, either 'filters' or 'nearby'.
 * @returns A string message to display to the user.
 */
export function getEmptyResultsMessage(reason: EmptyResultsReason): string {
  if (reason === 'filters') {
    return 'No restaurants match your current filters.';
  }

  return 'No nearby restaurants found. Try expanding your distance or refreshing your search.';
}
/**
 * Resolves the UI state for a collection of restaurants based on filters, scan progress, and other parameters.
 * This function filters and sorts the restaurants, determines the appropriate status and message, and returns a structured UI state object.
 * @param restaurants The array of restaurants to process.
 * @param filters The filtering criteria applied to the restaurants.
 * @param strictCeliac A boolean indicating whether strict celiac filtering is enabled.
 * @param currentStatus The current status of the restaurant UI state (e.g., 'loading', 'success').
 * @param emptyReason Optional reason for an empty result set, either 'filters' or 'nearby'.
 * @param message Optional custom message to display in the UI.
 * @param status Optional override for the status of the UI state.
 * @param userLatitude The user's current latitude, or null if unavailable.
 * @param userLongitude The user's current longitude, or null if unavailable.
 * @param scanProgress The current progress of menu scanning, if applicable.
 * @returns A RestaurantUiState object containing the resolved status, filtered restaurants, message, and other relevant information for the UI.
 */
export function resolveFilteredRestaurantUiState({
  restaurants,
  filters,
  strictCeliac,
  currentStatus,
  emptyReason,
  message,
  status,
  userLatitude,
  userLongitude,
  scanProgress,
}: {
  restaurants: Restaurant[];
  filters: RestaurantFilters;
  strictCeliac: boolean;
  currentStatus: RestaurantUiState['status'];
  emptyReason?: EmptyResultsReason;
  message?: string | null;
  status?: RestaurantUiState['status'];
  userLatitude: number | null;
  userLongitude: number | null;
  scanProgress: RestaurantUiState['scanProgress'];
}): RestaurantUiState {
  const filtered = filterAndSortRestaurants(restaurants, filters, strictCeliac, {
    getSafetyScore: (restaurant) => getRestaurantSafetyScore(restaurant, { strictCeliac }).score,
  });
  const resolvedReason = emptyReason ?? getCollectionReason(restaurants.length);
  const resolvedStatus = status ?? (currentStatus === 'loading' ? 'loading' : 'success');

  return {
    status: resolvedStatus,
    restaurants: filtered,
    message:
      filtered.length === 0
        ? message ?? getEmptyResultsMessage(resolvedReason)
        : message ?? null,
    userLatitude,
    userLongitude,
    scanProgress,
  };
}
/**
 * Applies the user's favorite status to a collection of restaurants based on a provided favorite map.
 * This function updates each restaurant's favoriteStatus property according to the mapping in favoriteMap.
 * If a restaurant does not have a corresponding entry in favoriteMap, its favoriteStatus remains unchanged.
 * @param restaurants The array of restaurants to update with favorite statuses.
 * @param favoriteMap A mapping of restaurant identity keys to their corresponding favorite statuses.
 * @returns A new array of restaurants with updated favorite statuses.
 */
export function applyFavoritesToRestaurants(
  restaurants: Restaurant[],
  favoriteMap: FavoriteMap
): Restaurant[] {
  return restaurants.map((restaurant) => {
    const key = getRestaurantIdentityKey(restaurant);
    if (!key) return restaurant;

    const favoriteStatus = favoriteMap[key];
    if (!favoriteStatus) return restaurant;

    return { ...restaurant, favoriteStatus };
  });
}

/**
 * Filters and sorts a collection of restaurants based on the provided filters, strict celiac mode, and optional safety score function.
 * The filtering criteria include open status, minimum rating, maximum distance, GF evidence, and search query matching.
 * The sorting can be based on distance, safety score, or name.
 * @param restaurants The array of restaurants to filter and sort.
 * @param filters The filtering and sorting criteria to apply.
 * @param strictCeliac A boolean indicating whether to enforce strict celiac filtering.
 * @param options Optional parameters, including a custom function to get the safety score for each restaurant.
 * @returns A new array of restaurants that match the filters and are sorted according to the specified criteria.
 */
export function getSavedRestaurants(restaurants: Restaurant[]): Restaurant[] {
  const statusOrder: Record<NonNullable<FavoriteStatus>, number> = {
    safe: 0,
    try: 1,
    avoid: 2,
  };

  return restaurants
    .filter((restaurant) => restaurant.favoriteStatus)
    .sort((left, right) => {
      const leftStatus = left.favoriteStatus!;
      const rightStatus = right.favoriteStatus!;
      const statusDelta = statusOrder[leftStatus] - statusOrder[rightStatus];
      return statusDelta !== 0 ? statusDelta : left.name.localeCompare(right.name);
    });
}
/**
 * Merges live and historical restaurant data, applying user favorites to ensure that favorite restaurants are preserved even if they are not present in the live data.
 * This function combines the two datasets, filters out duplicates based on restaurant identity, and returns a unified list of restaurants with updated favorite statuses.
 * @param liveRestaurants The array of currently available restaurants.
 * @param historicalRestaurants The array of previously saved or historical restaurants.
 * @param favoriteMap A mapping of restaurant identity keys to their corresponding favorite statuses.
 * @returns A new array of restaurants that includes both live and historical data, with favorites applied and duplicates removed.
 */
export function mergeSavedRestaurants({
  liveRestaurants,
  historicalRestaurants,
  favoriteMap,
}: {
  liveRestaurants: Restaurant[];
  historicalRestaurants: Restaurant[];
  favoriteMap: FavoriteMap;
}): Restaurant[] {
  const liveMap = new Map<string, Restaurant>();

  for (const restaurant of liveRestaurants) {
    const key = getRestaurantIdentityKey(restaurant);
    if (key) {
      liveMap.set(key, restaurant);
    }
  }

  const historicalToAdd = historicalRestaurants.filter((restaurant) => {
    const key = getRestaurantIdentityKey(restaurant);
    return key !== null && !liveMap.has(key) && !!favoriteMap[key];
  });

  const merged = [...liveRestaurants, ...historicalToAdd];
  return getSavedRestaurants(applyFavoritesToRestaurants(merged, favoriteMap));
}