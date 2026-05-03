import { Restaurant } from '../../types/restaurant';
import { getGfConfidenceLevel } from '../restaurantUtils';

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
});
