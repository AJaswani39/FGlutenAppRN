import { Restaurant } from '../types/restaurant';
import { getRestaurantIdentityKey } from './restaurantUtils';
import { MenuScanProgress } from '../types/restaurant';
/**
 * Prepares a collection of restaurants for caching by resetting the menu scan status of any restaurant currently marked as 'FETCHING' to 'NOT_STARTED'.
 * This ensures that restaurants in the process of being scanned are not incorrectly marked as still fetching when retrieved from cache.
 * @param restaurants The array of restaurants to prepare for caching.
 * @returns A new array of restaurants with updated menu scan statuses.
 */
export function prepareCachedRestaurants(restaurants: Restaurant[]): Restaurant[] {
  return restaurants.map((restaurant) => (
    restaurant.menuScanStatus === 'FETCHING'
      ? { ...restaurant, menuScanStatus: 'NOT_STARTED' as const }
      : restaurant
  ));
}
/**
 * Calculates the progress of menu scans for a given set of restaurants based on their scan statuses and a list of scan batch keys.
 * It counts the number of completed, failed, and currently fetching scans, and determines if there are any active scans in progress.
 * @param restaurants The array of restaurants to evaluate for scan progress.
 * @param scanBatchKeys An array of restaurant identity keys representing the batch of restaurants being scanned.
 * @returns A MenuScanProgress object containing the counts of completed, failed, and active scans, or null if there are no scan batch keys provided.
 */
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
/**
 * Generates a user-friendly message indicating that the displayed restaurant results are from cached data, including the timestamp of when the data was cached.
 * If the provided timestamp is greater than zero, it formats the timestamp into a local date and time string for display.
 * @param timestamp The timestamp (in milliseconds) of when the restaurant data was cached.
 * @returns A string message indicating that the results are cached, with the formatted timestamp if applicable.
 */
export function getCachedResultsMessage(timestamp: number): string {
  let message = 'Showing cached results';
  if (timestamp > 0) {
    message += ` (${new Date(timestamp).toLocaleString()})`;
  }

  return message;
}