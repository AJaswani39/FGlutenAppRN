import { Restaurant } from '../../types/restaurant';
import {
  getGfConfidenceLevel,
  getRestaurantIdentityKey,
  getRestaurantListKey,
  isSameRestaurantIdentity,
} from '../restaurantUtils';

function restaurant(overrides: Partial<Restaurant>): Restaurant {
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

describe('restaurantUtils', () => {
  it('classifies gluten-free confidence from menu evidence and scan status', () => {
    expect(getGfConfidenceLevel(restaurant({ gfMenu: ['Gluten-free pasta'] }))).toBe('confirmed');
    expect(getGfConfidenceLevel(restaurant({ hasGFMenu: true }))).toBe('name_match');
    expect(getGfConfidenceLevel(restaurant({ menuScanStatus: 'SUCCESS' }))).toBe('no_evidence');
    expect(getGfConfidenceLevel(restaurant({ menuScanStatus: 'FAILED' }))).toBe('unavailable');
    expect(getGfConfidenceLevel(restaurant({ menuScanStatus: 'NO_WEBSITE' }))).toBe('unavailable');
    expect(getGfConfidenceLevel(restaurant({ menuScanStatus: 'FETCHING' }))).toBe('pending');
  });

  it('builds stable restaurant identity and list keys', () => {
    expect(getRestaurantIdentityKey(restaurant({ placeId: ' abc ' }))).toBe('pid:abc');
    expect(getRestaurantIdentityKey(restaurant({ placeId: '', name: ' Cafe ', address: ' 123 Main ' }))).toBe(
      'na:Cafe|123 Main'
    );
    expect(getRestaurantListKey(restaurant({ placeId: '', name: '', address: '' }), 4)).toBe('restaurant:4');
  });

  it('matches restaurants by fallback identity when place ids are unavailable', () => {
    const left = restaurant({ placeId: '', name: 'Rice House', address: '7 Main' });
    const right = restaurant({ placeId: '', name: 'Rice House', address: '7 Main', rating: 4.8 });
    const different = restaurant({ placeId: '', name: 'Rice House', address: '8 Main' });

    expect(isSameRestaurantIdentity(left, right)).toBe(true);
    expect(isSameRestaurantIdentity(left, different)).toBe(false);
  });
});
