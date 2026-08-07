import { MENU_SCAN_TTL_MS, getMenuScanTargets } from '../restaurantState';
import { Restaurant } from '../../types/restaurant';

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    placeId: 'place-1',
    name: 'Test Restaurant',
    address: '',
    latitude: 1,
    longitude: 2,
    rating: null,
    openNow: null,
    hasGFMenu: false,
    gfMenu: [],
    distanceMeters: 0,
    menuUrl: null,
    rawMenuText: null,
    menuScanStatus: 'SUCCESS',
    menuScanTimestamp: 0,
    favoriteStatus: null,
    ...overrides,
  };
}

describe('restaurantState', () => {
  it('keeps completed menu scans fresh for fourteen days', () => {
    expect(MENU_SCAN_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('skips recently completed menu scans but includes expired scans', () => {
    const now = Date.now();

    const targets = getMenuScanTargets(
      [
        restaurant({
          placeId: 'fresh',
          menuScanTimestamp: now - MENU_SCAN_TTL_MS + 1000,
        }),
        restaurant({
          placeId: 'expired',
          menuScanTimestamp: now - MENU_SCAN_TTL_MS - 1000,
        }),
      ],
      now
    );

    expect(targets.map((target) => target.placeId)).toEqual(['expired']);
  });
});
