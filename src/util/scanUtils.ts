import { Restaurant } from '../types/restaurant';
import { MENU_SCAN_TTL_MS, MAX_SCANS_PER_BATCH } from '../constants/scan';

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