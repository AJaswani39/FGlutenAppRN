import { FavoriteMap, FavoriteStatus, MenuScanProgress, Restaurant, RestaurantFilters, RestaurantUiState } from '../types/restaurant';
import { filterAndSortRestaurants, getRestaurantIdentityKey } from './restaurantUtils';
import { getRestaurantSafetyScore } from '../services/menuSafety';

export type EmptyResultsReason = 'filters' | 'nearby';

export function getCollectionReason(restaurantCount: number): EmptyResultsReason {
  return restaurantCount === 0 ? 'nearby' : 'filters';
}

export function getEmptyResultsMessage(reason: EmptyResultsReason): string {
  if (reason === 'filters') {
    return 'No restaurants match your current filters.';
  }

  return 'No nearby restaurants found. Try expanding your distance or refreshing your search.';
}

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