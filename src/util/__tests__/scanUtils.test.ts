import { Restaurant } from '../../types/restaurant';
import { MENU_SCAN_TTL_MS, MAX_SCANS_PER_BATCH } from '../../constants/scan';
import { getMenuScanTargets } from '../scanUtils';

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    placeId: 'place',
    name: 'Cafe',
    address: '123 Main',
    latitude: 1,
    longitude: 2,
    rating: null,
    openNow: null,
    hasGFMenu: false,
    gfMenu: [],
    distanceMeters: 0,
    menuUrl: null,
    rawMenuText: null,
    menuScanStatus: 'NOT_STARTED',
    menuScanTimestamp: 0,
    favoriteStatus: null,
    ...overrides,
  };
}

const NOW = 1_000_000_000_000;

describe('scanUtils', () => {
  describe('getMenuScanTargets', () => {
    it('includes restaurants that have never been scanned', () => {
      const targets = getMenuScanTargets(
        [restaurant({ placeId: 'a' }), restaurant({ placeId: 'b', menuScanTimestamp: NOW - 500 })],
        NOW
      );

      expect(targets.map((r) => r.placeId)).toEqual(['a', 'b']);
    });

    it('skips restaurants without a place id', () => {
      const targets = getMenuScanTargets([restaurant({ placeId: '' })], NOW);

      expect(targets).toEqual([]);
    });

    it('skips restaurants that are currently fetching', () => {
      const targets = getMenuScanTargets(
        [restaurant({ placeId: 'a', menuScanStatus: 'FETCHING' })],
        NOW
      );

      expect(targets).toEqual([]);
    });

    it('skips recently completed scans that are still within the TTL', () => {
      const targets = getMenuScanTargets(
        [
          restaurant({ placeId: 'success', menuScanStatus: 'SUCCESS', menuScanTimestamp: NOW - MENU_SCAN_TTL_MS + 1000 }),
          restaurant({ placeId: 'no-menu', menuScanStatus: 'NO_MENU_CONTENT', menuScanTimestamp: NOW - 1000 }),
          restaurant({ placeId: 'js-only', menuScanStatus: 'JS_ONLY', menuScanTimestamp: NOW - 1000 }),
          restaurant({ placeId: 'no-website', menuScanStatus: 'NO_WEBSITE', menuScanTimestamp: NOW - 1000 }),
        ],
        NOW
      );

      expect(targets).toEqual([]);
    });

    it('holds failed scans back until the TTL backoff expires', () => {
      const targets = getMenuScanTargets(
        [restaurant({ placeId: 'failed', menuScanStatus: 'FAILED', menuScanTimestamp: NOW - 1000 })],
        NOW
      );

      expect(targets).toEqual([]);
    });

    it('retries failed scans that were never actually timestamped', () => {
      const targets = getMenuScanTargets(
        [restaurant({ placeId: 'failed', menuScanStatus: 'FAILED', menuScanTimestamp: 0 })],
        NOW
      );

      expect(targets.map((r) => r.placeId)).toEqual(['failed']);
    });

    it('includes completed scans that have exceeded the TTL', () => {
      const staleTimestamp = NOW - MENU_SCAN_TTL_MS - 1;
      const targets = getMenuScanTargets(
        [restaurant({ placeId: 'stale', menuScanStatus: 'SUCCESS', menuScanTimestamp: staleTimestamp })],
        NOW
      );

      expect(targets.map((r) => r.placeId)).toEqual(['stale']);
    });

    it('treats a scan scanned exactly at the TTL boundary as expired', () => {
      const boundaryTimestamp = NOW - MENU_SCAN_TTL_MS;
      const targets = getMenuScanTargets(
        [restaurant({ placeId: 'boundary', menuScanStatus: 'SUCCESS', menuScanTimestamp: boundaryTimestamp })],
        NOW
      );

      expect(targets.map((r) => r.placeId)).toEqual(['boundary']);
    });

    it('caps a single batch at MAX_SCANS_PER_BATCH and preserves input order', () => {
      const restaurants = Array.from({ length: MAX_SCANS_PER_BATCH + 3 }, (_, index) =>
        restaurant({ placeId: `place-${index}` })
      );

      const targets = getMenuScanTargets(restaurants, NOW);

      expect(targets).toHaveLength(MAX_SCANS_PER_BATCH);
      expect(targets.map((r) => r.placeId)).toEqual([
        'place-0',
        'place-1',
        'place-2',
        'place-3',
        'place-4',
      ]);
    });

    it('fills batch capacity left by stale scans', () => {
      const restaurants = [
        restaurant({ placeId: 'stale', menuScanStatus: 'SUCCESS', menuScanTimestamp: NOW - MENU_SCAN_TTL_MS - 1 }),
        restaurant({ placeId: 'fresh', menuScanStatus: 'SUCCESS', menuScanTimestamp: NOW - 1000 }),
        restaurant({ placeId: 'not-started' }),
      ];

      const targets = getMenuScanTargets(restaurants, NOW);

      expect(targets.map((r) => r.placeId)).toEqual(['stale', 'not-started']);
    });

    it('defaults to the current time when now is not provided', () => {
      const fresh = restaurant({ menuScanStatus: 'SUCCESS', menuScanTimestamp: Date.now() - 1000 });

      expect(getMenuScanTargets([fresh])).toEqual([]);
    });
  });
});
