import { Restaurant } from '../../types/restaurant';
import {
  getCachedResultsMessage,
  getScanProgressForRestaurants,
  prepareCachedRestaurants,
} from '../cacheUtils';

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

describe('cacheUtils', () => {
  describe('prepareCachedRestaurants', () => {
    it('resets interrupted FETCHING scans to NOT_STARTED when restoring cache', () => {
      const fetching = restaurant({ placeId: 'a', menuScanStatus: 'FETCHING' });
      const notStarted = restaurant({ placeId: 'b', menuScanStatus: 'NOT_STARTED' });
      const success = restaurant({ placeId: 'c', menuScanStatus: 'SUCCESS' });

      const prepared = prepareCachedRestaurants([fetching, notStarted, success]);

      expect(prepared.map((r) => r.menuScanStatus)).toEqual(['NOT_STARTED', 'NOT_STARTED', 'SUCCESS']);
    });

    it('keeps other menu scan fields intact while resetting status', () => {
      const fetching = restaurant({
        placeId: 'a',
        menuScanStatus: 'FETCHING',
        menuScanTimestamp: 1234,
        gfMenu: ['Gluten-free bun'],
      });

      const [prepared] = prepareCachedRestaurants([fetching]);

      expect(prepared.menuScanStatus).toBe('NOT_STARTED');
      expect(prepared.menuScanTimestamp).toBe(1234);
      expect(prepared.gfMenu).toEqual(['Gluten-free bun']);
    });

    it('returns the same object references for restaurants that are not fetching', () => {
      const notStarted = restaurant({ placeId: 'a' });
      const failed = restaurant({ placeId: 'b', menuScanStatus: 'FAILED' });

      const prepared = prepareCachedRestaurants([notStarted, failed]);

      expect(prepared[0]).toBe(notStarted);
      expect(prepared[1]).toBe(failed);
    });
  });

  describe('getScanProgressForRestaurants', () => {
    it('returns null when no batch is active', () => {
      expect(getScanProgressForRestaurants([restaurant({ placeId: 'a' })], [])).toBeNull();
    });

    it('reports completed progress once every restaurant reaches a terminal state', () => {
      const restaurants = [
        restaurant({ placeId: 'a', menuScanStatus: 'SUCCESS' }),
        restaurant({ placeId: 'b', menuScanStatus: 'NO_MENU_CONTENT' }),
        restaurant({ placeId: 'c', menuScanStatus: 'FAILED' }),
      ];

      const progress = getScanProgressForRestaurants(restaurants, ['pid:a', 'pid:b', 'pid:c']);

      expect(progress).toEqual({ completed: 2, failed: 1, total: 3, active: false });
    });

    it('reports the batch as active while any scan is still fetching', () => {
      const restaurants = [
        restaurant({ placeId: 'a', menuScanStatus: 'SUCCESS' }),
        restaurant({ placeId: 'b', menuScanStatus: 'FETCHING' }),
        restaurant({ placeId: 'c', menuScanStatus: 'NOT_STARTED' }),
      ];

      const progress = getScanProgressForRestaurants(restaurants, ['pid:a', 'pid:b', 'pid:c']);

      expect(progress).toEqual({ completed: 1, failed: 0, total: 3, active: true });
    });

    it('reports the batch as active while scans have not started', () => {
      const restaurants = [
        restaurant({ placeId: 'a', menuScanStatus: 'NOT_STARTED' }),
        restaurant({ placeId: 'b', menuScanStatus: 'NOT_STARTED' }),
      ];

      const progress = getScanProgressForRestaurants(restaurants, ['pid:a', 'pid:b']);

      expect(progress).toEqual({ completed: 0, failed: 0, total: 2, active: true });
    });

    it('ignores batch keys with no matching restaurant but keeps them in the total', () => {
      const restaurants = [restaurant({ placeId: 'a', menuScanStatus: 'SUCCESS' })];

      const progress = getScanProgressForRestaurants(restaurants, ['pid:a', 'pid:missing']);

      expect(progress).toEqual({ completed: 1, failed: 0, total: 2, active: true });
    });

    it('matches restaurants by name/address fallback identity when place ids are absent', () => {
      const restaurants = [
        restaurant({ placeId: '', name: 'Rice House', address: '7 Main', menuScanStatus: 'SUCCESS' }),
      ];

      const progress = getScanProgressForRestaurants(restaurants, ['na:Rice House|7 Main']);

      expect(progress).toEqual({ completed: 1, failed: 0, total: 1, active: false });
    });
  });

  describe('getCachedResultsMessage', () => {
    it('returns the base message when there is no cached timestamp', () => {
      expect(getCachedResultsMessage(0)).toBe('Showing cached results');
    });

    it('includes the formatted timestamp when one is available', () => {
      const message = getCachedResultsMessage(Date.UTC(2026, 0, 15, 12, 0, 0));

      expect(message.startsWith('Showing cached results (')).toBe(true);
      expect(message).toContain('2026');
    });
  });
});
