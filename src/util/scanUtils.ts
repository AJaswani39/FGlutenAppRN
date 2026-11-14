import { Restaurant } from '../types/restaurant';
import { MENU_SCAN_TTL_MS, MAX_SCANS_PER_BATCH } from '../constants/scan';

/**
 * Returns a list of restaurants that are eligible for menu scanning based on their scan status and the time since their last scan.
 * Restaurants that are currently being scanned or have been scanned recently (within MENU_SCAN_TTL_MS) are excluded.
 * The list is limited to a maximum of MAX_SCANS_PER_BATCH restaurants.
 * @param restaurants The array of restaurants to evaluate for scanning eligibility.
 * @param now Optional current timestamp (in milliseconds) to compare against the restaurant's last scan timestamp. Defaults to Date.now().
 * @returns An array of restaurants that are eligible for menu scanning.
 */
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