import { Restaurant } from '../types/restaurant';
import { getRestaurantIdentityKey } from './restaurantUtils';
import { MenuScanProgress } from '../types/restaurant';

export function prepareCachedRestaurants(restaurants: Restaurant[]): Restaurant[] {
  return restaurants.map((restaurant) => (
    restaurant.menuScanStatus === 'FETCHING'
      ? { ...restaurant, menuScanStatus: 'NOT_STARTED' as const }
      : restaurant
  ));
}

export function getScanProgressForRestaurants(
  restaurants: Restaurant[],
  scanBatchKeys: string[]
): MenuScanProgress | null {
  if (scanBatchKeys.length === 0) return null;

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

export function getCachedResultsMessage(timestamp: number): string {
  let message = 'Showing cached results';
  if (timestamp > 0) {
    message += ` (${new Date(timestamp).toLocaleString()})`;
  }

  return message;
}