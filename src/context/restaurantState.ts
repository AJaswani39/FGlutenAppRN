import Constants from 'expo-constants';
import { FavoriteStatus, MenuScanProgress, Restaurant } from '../types/restaurant';
import { getRestaurantIdentityKey } from '../util/restaurantUtils';

export const MENU_SCAN_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const MAX_SCANS_PER_BATCH = 5;
export const CONCURRENT_SCAN_LIMIT = 2;

export type EmptyResultsReason = 'filters' | 'nearby';

interface ExpoConfigExtra {
  MAPS_API_KEY?: string;
}

export function getMapsApiKey(): string {
  return (Constants.expoConfig?.extra as ExpoConfigExtra)?.MAPS_API_KEY ?? '';
}

export function getEmptyResultsMessage(reason: EmptyResultsReason): string {
  if (reason === 'filters') {
    return 'No restaurants match your current filters.';
  }

  return 'No nearby restaurants found. Try expanding your distance or refreshing your search.';
}

export function applyFavoritesToRestaurants(
  restaurants: Restaurant[],
  favoriteMap: Record<string, string>
): Restaurant[] {
  return restaurants.map((restaurant) => {
    const key = getRestaurantIdentityKey(restaurant);
    if (!key) return restaurant;

    const favoriteStatus = favoriteMap[key] as FavoriteStatus | undefined;
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

export function getScanProgressForRestaurants(
  restaurants: Restaurant[],
  scanBatchKeys: string[]
): MenuScanProgress | null {
  if (scanBatchKeys.length === 0) return null;

  // Create a lookup map for O(1) access
  const restaurantMap = new Map<string, Restaurant>();
  for (const r of restaurants) {
    const key = getRestaurantIdentityKey(r);
    if (key) restaurantMap.set(key, r);
  }

  let completed = 0;
  let fetching = 0;
  let failed = 0;

  for (const key of scanBatchKeys) {
    const restaurant = restaurantMap.get(key);
    if (!restaurant) continue;
    
    if (restaurant.menuScanStatus === 'FETCHING') {
      fetching += 1;
    } else if (restaurant.menuScanStatus === 'FAILED') {
      failed += 1;
    } else if (restaurant.menuScanStatus !== 'NOT_STARTED') {
      // SUCCESS, NO_WEBSITE, JS_ONLY all count as completed
      completed += 1;
    }
  }

  return {
    completed,
    total: scanBatchKeys.length,
    failed,
    active: fetching > 0 || (completed + failed) < scanBatchKeys.length,
  };
}

export function getMenuScanTargets(restaurants: Restaurant[], now = Date.now()): Restaurant[] {
  const targets: Restaurant[] = [];

  for (const restaurant of restaurants) {
    if (!restaurant.placeId || restaurant.menuScanStatus === 'FETCHING') continue;

    const age =
      restaurant.menuScanTimestamp > 0 ? now - restaurant.menuScanTimestamp : Infinity;
    if (age < MENU_SCAN_TTL_MS && restaurant.menuScanStatus !== 'NOT_STARTED') continue;
    if (targets.length >= MAX_SCANS_PER_BATCH) break;

    targets.push(restaurant);
  }

  return targets;
}

export function getCachedResultsMessage(timestamp: number): string {
  let message = 'Showing cached results';
  if (timestamp > 0) {
    message += ` (${new Date(timestamp).toLocaleString()})`;
  }

  return message;
}
