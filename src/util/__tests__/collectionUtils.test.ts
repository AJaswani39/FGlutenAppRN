import { Restaurant, RestaurantFilters, RestaurantUiState } from '../../types/restaurant';
import {
  applyFavoritesToRestaurants,
  getCollectionReason,
  getEmptyResultsMessage,
  getSavedRestaurants,
  mergeSavedRestaurants,
  resolveFilteredRestaurantUiState,
} from '../collectionUtils';

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

function filters(overrides: Partial<RestaurantFilters> = {}): RestaurantFilters {
  return {
    gfOnly: false,
    gfEvidenceOnly: false,
    openNowOnly: false,
    sortMode: 'name',
    maxDistanceMeters: 0,
    minRating: 0,
    searchQuery: '',
    ...overrides,
  };
}

describe('collectionUtils', () => {
  describe('getCollectionReason / getEmptyResultsMessage', () => {
    it('reports nearby when the search returned nothing and filters otherwise', () => {
      expect(getCollectionReason(0)).toBe('nearby');
      expect(getCollectionReason(4)).toBe('filters');
    });

    it('returns a distinct empty-state message per reason', () => {
      expect(getEmptyResultsMessage('filters')).toBe('No restaurants match your current filters.');
      expect(getEmptyResultsMessage('nearby')).toBe(
        'No nearby restaurants found. Try expanding your distance or refreshing your search.'
      );
    });
  });

  describe('resolveFilteredRestaurantUiState', () => {
    it('returns filtered and sorted restaurants', () => {
      const restaurants = [
        restaurant({ placeId: 'a', name: 'Zeta Pizza' }),
        restaurant({ placeId: 'b', name: 'Alpha Diner' }),
        restaurant({ placeId: 'c', name: 'Mid Burgers' }),
      ];

      const state = resolveFilteredRestaurantUiState({
        restaurants,
        filters: filters({ searchQuery: 'pizza' }),
        strictCeliac: false,
        currentStatus: 'success',
        userLatitude: 40,
        userLongitude: -74,
        scanProgress: null,
      });

      expect(state.restaurants.map((r) => r.name)).toEqual(['Zeta Pizza']);
      expect(state.message).toBeNull();
    });

    it('keeps loading status while a search is in flight', () => {
      const state = resolveFilteredRestaurantUiState({
        restaurants: [],
        filters: filters(),
        strictCeliac: false,
        currentStatus: 'loading',
        userLatitude: null,
        userLongitude: null,
        scanProgress: null,
      });

      expect(state.status).toBe('loading');
    });

    it('lets an explicit status override the derived one', () => {
      const state = resolveFilteredRestaurantUiState({
        restaurants: [restaurant()],
        filters: filters(),
        strictCeliac: false,
        currentStatus: 'loading',
        status: 'success',
        userLatitude: null,
        userLongitude: null,
        scanProgress: null,
      });

      expect(state.status).toBe('success');
    });

    it('falls back to the empty-results message derived from restaurant count', () => {
      const nearbyEmpty = resolveFilteredRestaurantUiState({
        restaurants: [],
        filters: filters(),
        strictCeliac: false,
        currentStatus: 'success',
        userLatitude: null,
        userLongitude: null,
        scanProgress: null,
      });
      expect(nearbyEmpty.message).toBe(getEmptyResultsMessage('nearby'));

      const filteredEmpty = resolveFilteredRestaurantUiState({
        restaurants: [restaurant()],
        filters: filters({ searchQuery: 'nothing-matches' }),
        strictCeliac: false,
        currentStatus: 'success',
        userLatitude: null,
        userLongitude: null,
        scanProgress: null,
      });
      expect(filteredEmpty.message).toBe(getEmptyResultsMessage('filters'));
    });

    it('prefers an explicit emptyReason over the count-derived one', () => {
      const state = resolveFilteredRestaurantUiState({
        restaurants: [restaurant()],
        filters: filters({ searchQuery: 'nothing-matches' }),
        strictCeliac: false,
        currentStatus: 'success',
        emptyReason: 'nearby',
        userLatitude: null,
        userLongitude: null,
        scanProgress: null,
      });

      expect(state.message).toBe(getEmptyResultsMessage('nearby'));
    });

    it('lets a provided message override the default', () => {
      const emptyState = resolveFilteredRestaurantUiState({
        restaurants: [],
        filters: filters(),
        strictCeliac: false,
        currentStatus: 'success',
        message: 'Custom empty message',
        userLatitude: null,
        userLongitude: null,
        scanProgress: null,
      });
      expect(emptyState.message).toBe('Custom empty message');

      const filledState = resolveFilteredRestaurantUiState({
        restaurants: [restaurant()],
        filters: filters(),
        strictCeliac: false,
        currentStatus: 'success',
        message: 'Custom filled message',
        userLatitude: null,
        userLongitude: null,
        scanProgress: null,
      });
      expect(filledState.message).toBe('Custom filled message');
    });

    it('requires scanned GF evidence in strict celiac mode', () => {
      const nameMatch = restaurant({ placeId: 'a', name: 'GF Pizza', hasGFMenu: true });
      const scanned = restaurant({ placeId: 'b', name: 'Scanned Pizza', gfMenu: ['GF crust'] });

      const state = resolveFilteredRestaurantUiState({
        restaurants: [nameMatch, scanned],
        filters: filters(),
        strictCeliac: true,
        currentStatus: 'success',
        userLatitude: null,
        userLongitude: null,
        scanProgress: null,
      });

      expect(state.restaurants.map((r) => r.placeId)).toEqual(['b']);
    });

    it('passes location and scan progress through untouched', () => {
      const scanProgress = { completed: 1, total: 2, failed: 0, active: true };

      const state = resolveFilteredRestaurantUiState({
        restaurants: [restaurant()],
        filters: filters(),
        strictCeliac: false,
        currentStatus: 'success',
        userLatitude: 12.5,
        userLongitude: -33.25,
        scanProgress,
      });

      expect(state.userLatitude).toBe(12.5);
      expect(state.userLongitude).toBe(-33.25);
      expect(state.scanProgress).toBe(scanProgress);
    });
  });

  describe('applyFavoritesToRestaurants', () => {
    it('applies favorite status by identity key', () => {
      const restaurants = [restaurant({ placeId: 'a' }), restaurant({ placeId: 'b' })];

      const applied = applyFavoritesToRestaurants(restaurants, { 'pid:a': 'safe' });

      expect(applied[0].favoriteStatus).toBe('safe');
      expect(applied[1].favoriteStatus).toBeNull();
    });

    it('leaves restaurants without an identity key untouched', () => {
      const noKey = restaurant({ placeId: '', name: '', address: '' });

      const applied = applyFavoritesToRestaurants([noKey], { 'pid:a': 'safe' });

      expect(applied[0]).toBe(noKey);
    });
  });

  describe('getSavedRestaurants', () => {
    it('keeps only favorited restaurants', () => {
      const restaurants = [
        restaurant({ placeId: 'a', favoriteStatus: 'safe' }),
        restaurant({ placeId: 'b', favoriteStatus: null }),
      ];

      expect(getSavedRestaurants(restaurants).map((r) => r.placeId)).toEqual(['a']);
    });

    it('sorts by safe before try before avoid, then alphabetically', () => {
      const restaurants = [
        restaurant({ placeId: 'a', name: 'Zeta', favoriteStatus: 'safe' }),
        restaurant({ placeId: 'b', name: 'Bravo', favoriteStatus: 'avoid' }),
        restaurant({ placeId: 'c', name: 'Yankee', favoriteStatus: 'try' }),
        restaurant({ placeId: 'd', name: 'Alpha', favoriteStatus: 'avoid' }),
      ];

      expect(getSavedRestaurants(restaurants).map((r) => r.placeId)).toEqual(['a', 'c', 'd', 'b']);
    });
  });

  describe('mergeSavedRestaurants', () => {
    it('keeps the live version when a restaurant appears in both lists', () => {
      const live = restaurant({ placeId: 'a', rating: 4.9 });
      const stale = restaurant({ placeId: 'a', rating: 2.1 });

      const merged = mergeSavedRestaurants({
        liveRestaurants: [live],
        historicalRestaurants: [stale],
        favoriteMap: { 'pid:a': 'safe' },
      });

      expect(merged).toHaveLength(1);
      expect(merged[0].rating).toBe(4.9);
      expect(merged[0].favoriteStatus).toBe('safe');
    });

    it('adds historical favorites that are not part of the live results', () => {
      const historical = restaurant({ placeId: 'old', name: 'Old Favorite' });

      const merged = mergeSavedRestaurants({
        liveRestaurants: [],
        historicalRestaurants: [historical],
        favoriteMap: { 'pid:old': 'try' },
      });

      expect(merged.map((r) => r.placeId)).toEqual(['old']);
      expect(merged[0].favoriteStatus).toBe('try');
    });

    it('drops historical restaurants that are no longer favorites', () => {
      const dropped = restaurant({ placeId: 'old' });

      const merged = mergeSavedRestaurants({
        liveRestaurants: [],
        historicalRestaurants: [dropped],
        favoriteMap: {},
      });

      expect(merged).toEqual([]);
    });

    it('drops live restaurants that are not favorites', () => {
      const unfavorited = restaurant({ placeId: 'a' });

      const merged = mergeSavedRestaurants({
        liveRestaurants: [unfavorited],
        historicalRestaurants: [],
        favoriteMap: {},
      });

      expect(merged).toEqual([]);
    });

    it('returns results in saved order', () => {
      const avoid = restaurant({ placeId: 'a', name: 'Avoid Place', favoriteStatus: 'avoid' });
      const safe = restaurant({ placeId: 'b', name: 'Safe Place', favoriteStatus: 'safe' });

      const merged = mergeSavedRestaurants({
        liveRestaurants: [avoid, safe],
        historicalRestaurants: [],
        favoriteMap: { 'pid:a': 'avoid', 'pid:b': 'safe' },
      });

      expect(merged.map((r) => r.placeId)).toEqual(['b', 'a']);
    });
  });
});
