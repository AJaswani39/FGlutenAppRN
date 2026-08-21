import {
  MENU_SCAN_TTL_MS,
  getMenuScanTargets,
  mergeSavedRestaurants,
  applyFavoritesToRestaurants,
  getSavedRestaurants,
} from '../restaurantState';
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

  it('prefers live favorites and keeps historical favorites sorted by status', () => {
    const liveRestaurant = restaurant({
      placeId: 'live-1',
      name: 'Live Place',
      favoriteStatus: 'try',
    });
    const historicalRestaurant = restaurant({
      placeId: 'historical-1',
      name: 'Historical Place',
      favoriteStatus: 'safe',
    });
    const sameIdentityHistorical = restaurant({
      placeId: 'live-1',
      name: 'Live Place',
      favoriteStatus: 'safe',
    });

    const favoriteMap = {
      'pid:live-1': 'try',
      'pid:historical-1': 'safe',
    };

    const merged = mergeSavedRestaurants({
      liveRestaurants: [liveRestaurant],
      historicalRestaurants: [historicalRestaurant, sameIdentityHistorical],
      favoriteMap,
    });

    expect(merged.map((entry) => entry.placeId)).toEqual(['historical-1', 'live-1']);
    expect(merged[0].favoriteStatus).toBe('safe');
    expect(merged[1].favoriteStatus).toBe('try');

    const withStatusApplied = applyFavoritesToRestaurants(
      [
        restaurant({ placeId: 'sample-1', name: 'Sample 1' }),
        restaurant({ placeId: 'sample-2', name: 'Sample 2' }),
      ],
      {
        'pid:sample-1': 'safe',
        'pid:sample-2': 'avoid',
      }
    );

    expect(getSavedRestaurants(withStatusApplied).map((entry) => entry.placeId)).toEqual([
      'sample-1',
      'sample-2',
    ]);
  });
});
