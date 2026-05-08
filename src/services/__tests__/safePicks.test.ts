import { Restaurant } from '../../types/restaurant';
import { getSafeRestaurantPicks } from '../safePicks';

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

describe('safePicks', () => {
  it('ranks safe, open, nearby restaurants first', () => {
    const picks = getSafeRestaurantPicks([
      restaurant({
        placeId: 'far',
        name: 'Far GF Cafe',
        gfMenu: ['Gluten-free pasta'],
        rawMenuText: 'Gluten-free pasta',
        distanceMeters: 9000,
        openNow: true,
        rating: 4.7,
      }),
      restaurant({
        placeId: 'near',
        name: 'Near GF Cafe',
        gfMenu: ['Gluten-free tacos', 'Gluten-free salad'],
        rawMenuText: 'Gluten-free tacos\nGluten-free salad',
        distanceMeters: 500,
        openNow: true,
        rating: 4.5,
      }),
    ]);

    expect(picks[0].restaurant.placeId).toBe('near');
    expect(picks[0].highlights).toEqual(expect.arrayContaining(['Open now', '4.5 stars']));
  });

  it('excludes restaurants marked avoid', () => {
    const picks = getSafeRestaurantPicks([
      restaurant({
        placeId: 'avoid',
        name: 'Avoid Cafe',
        gfMenu: ['Gluten-free bowl'],
        rawMenuText: 'Gluten-free bowl',
        favoriteStatus: 'avoid',
        openNow: true,
      }),
    ]);

    expect(picks).toHaveLength(0);
  });

  it('keeps user-marked safe restaurants even with limited menu evidence', () => {
    const picks = getSafeRestaurantPicks([
      restaurant({
        placeId: 'safe',
        name: 'Known Safe Cafe',
        favoriteStatus: 'safe',
        menuScanStatus: 'NO_WEBSITE',
      }),
    ]);

    expect(picks[0].restaurant.placeId).toBe('safe');
    expect(picks[0].highlights).toContain('Marked safe');
  });

  it('honors the requested limit', () => {
    const picks = getSafeRestaurantPicks(
      Array.from({ length: 5 }, (_, index) =>
        restaurant({
          placeId: `place-${index}`,
          name: `Cafe ${index}`,
          gfMenu: ['Gluten-free salad'],
          rawMenuText: 'Gluten-free salad',
          distanceMeters: index * 100,
        })
      ),
      { limit: 2 }
    );

    expect(picks).toHaveLength(2);
  });
});
