import { Restaurant } from '../../types/restaurant';
import { canUseBrowserMenuFallback, scanRestaurantMenu } from '../menuScanner';

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
        headers: { get: () => 'text/html' },
        text: async () => '<a href="/menu">Menu</a><p>Welcome</p>',
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html' },
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

  it('allows browser fallback only for user-actionable interactive menu states', () => {
    expect(
      canUseBrowserMenuFallback(
        restaurant({ menuScanStatus: 'JS_ONLY', menuUrl: 'https://order.example/menu' })
      )
    ).toBe(true);
    expect(
      canUseBrowserMenuFallback(
        restaurant({ menuScanStatus: 'NO_MENU_CONTENT', menuUrl: 'https://restaurant.example/menu' })
      )
    ).toBe(true);
    expect(
      canUseBrowserMenuFallback(
        restaurant({ menuScanStatus: 'FAILED', menuUrl: 'https://restaurant.example/menu' })
      )
    ).toBe(false);
    expect(
      canUseBrowserMenuFallback(
        restaurant({ menuScanStatus: 'JS_ONLY', menuUrl: 'http://order.example/menu' })
      )
    ).toBe(false);
  });

  it('tries https before falling back to http restaurant websites', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ websiteUri: 'http://example.com' }),
      })
      .mockRejectedValueOnce(new Error('https unavailable'))
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () => '<h1>Menu</h1><p>Gluten-free noodles</p>',
      });

    await expect(
      scanRestaurantMenu({ restaurant: restaurant(), mapsApiKey: 'key', scanStartedAt: 789 })
    ).resolves.toMatchObject({
      menuUrl: 'http://example.com/',
      gfMenu: ['Gluten-free noodles'],
      menuScanStatus: 'SUCCESS',
      menuScanTimestamp: 789,
    });

    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('https://example.com/');
    expect((global.fetch as jest.Mock).mock.calls[2][0]).toBe('http://example.com/');
  });

  it('does not mark a heading-only page as a successful menu scan', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ websiteUri: 'https://example.com' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () => '<h1>Menu</h1>',
      });

    await expect(
      scanRestaurantMenu({ restaurant: restaurant(), mapsApiKey: 'key', scanStartedAt: 900 }),
    ).resolves.toMatchObject({
      rawMenuText: null,
      menuScanStatus: 'NO_MENU_CONTENT',
    });
  });

  it('does not treat generic prose mentioning a menu as menu content', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ websiteUri: 'https://example.com' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () => '<p>Ask about our menu for private events and catering.</p>',
      });

    await expect(
      scanRestaurantMenu({ restaurant: restaurant(), mapsApiKey: 'key', scanStartedAt: 901 }),
    ).resolves.toMatchObject({
      rawMenuText: null,
      menuScanStatus: 'NO_MENU_CONTENT',
    });
  });

  it('rejects malformed website URLs before attempting an HTML fetch', async () => {
    const result = await scanRestaurantMenu({
      restaurant: restaurant({ menuUrl: 'javascript:alert(1)' }),
      mapsApiKey: 'key',
      scanStartedAt: 902,
    });

    expect(result).toMatchObject({
      menuUrl: null,
      rawMenuText: null,
      menuScanStatus: 'FAILED',
      menuScanTimestamp: 902,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
