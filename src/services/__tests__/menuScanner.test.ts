import { Restaurant } from '../../types/restaurant';
import { scanRestaurantMenu } from '../menuScanner';

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

describe('menuScanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('returns null without a place id or maps key', async () => {
    await expect(
      scanRestaurantMenu({ restaurant: restaurant({ placeId: '' }), mapsApiKey: 'key', scanStartedAt: 123 })
    ).resolves.toBeNull();
    await expect(
      scanRestaurantMenu({ restaurant: restaurant(), mapsApiKey: '', scanStartedAt: 123 })
    ).resolves.toBeNull();
  });

  it('reports no website when place details has no website uri', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await expect(
      scanRestaurantMenu({ restaurant: restaurant(), mapsApiKey: 'key', scanStartedAt: 123 })
    ).resolves.toMatchObject({
      menuUrl: null,
      gfMenu: [],
      rawMenuText: null,
      menuScanStatus: 'NO_WEBSITE',
      menuScanTimestamp: 123,
    });
  });

  it('follows a menu link and extracts gluten-free evidence', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ websiteUri: 'https://example.com' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<a href="/menu">Menu</a><p>Welcome</p>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<h1>Menu</h1><p>Gluten-free pasta</p><p>Celiac friendly tacos</p>',
      });

    await expect(
      scanRestaurantMenu({ restaurant: restaurant(), mapsApiKey: 'key', scanStartedAt: 456 })
    ).resolves.toMatchObject({
      menuUrl: 'https://example.com/menu',
      gfMenu: ['Gluten-free pasta', 'Celiac friendly tacos'],
      menuScanStatus: 'SUCCESS',
      menuScanTimestamp: 456,
    });
  });
});
