import { Restaurant } from '../../types/restaurant';
import { getCuisineRiskHints } from '../cuisineRiskHints';

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

describe('cuisineRiskHints', () => {
  it('always includes default shared-fryer and hidden-gluten hints', () => {
    const hints = getCuisineRiskHints(restaurant());

    expect(hints.map((hint) => hint.id)).toEqual(expect.arrayContaining(['shared-fryer', 'hidden-sauces']));
  });

  it('adds Italian risk hints from restaurant name', () => {
    const hints = getCuisineRiskHints(restaurant({ name: 'Bella Pizza Trattoria' }));

    expect(hints.map((hint) => hint.id)).toEqual(
      expect.arrayContaining(['italian-flour-stations', 'italian-pasta-water'])
    );
  });

  it('adds Asian risk hints from scanned menu text', () => {
    const hints = getCuisineRiskHints(
      restaurant({
        rawMenuText: 'Sushi rolls, teriyaki bowls, ramen, and tempura vegetables',
      })
    );

    expect(hints.map((hint) => hint.id)).toEqual(
      expect.arrayContaining(['asian-soy-sauce', 'asian-tempura-noodles'])
    );
  });

  it('adds Indian risk hints from GF menu evidence', () => {
    const hints = getCuisineRiskHints(
      restaurant({
        gfMenu: ['Gluten-free curry with rice', 'Masala vegetables'],
      })
    );

    expect(hints.map((hint) => hint.id)).toEqual(
      expect.arrayContaining(['indian-breads', 'indian-thickeners'])
    );
  });
});
