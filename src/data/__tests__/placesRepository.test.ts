import { clearNearbySessionCache, fetchHtml, fetchNearbyRestaurants } from '../placesRepository';

describe('placesRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearNearbySessionCache();
    global.fetch = jest.fn();
  });

  it('reuses nearby search results from the in-memory session cache', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [
          {
            id: 'cached-place',
            displayName: { text: 'Cached Cafe' },
            formattedAddress: '123 Main',
            location: { latitude: 40.7128, longitude: -74.006 },
          },
        ],
      }),
    });

    const first = await fetchNearbyRestaurants(40.71281, -74.00601, 'maps-key', 5000);
    first[0].gfMenu.push('caller mutation');

    const second = await fetchNearbyRestaurants(40.71282, -74.00602, 'maps-key', 5000);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      placeId: 'cached-place',
      name: 'Cached Cafe',
      gfMenu: [],
    });
  });

  it('uses the HTML proxy when configured and skips direct website fetch', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html: '<h1>Menu</h1><p>Gluten-free dosa</p>' }),
    });

    await expect(fetchHtml('http://restaurant.example/menu', 'https://proxy.example')).resolves.toBe(
      '<h1>Menu</h1><p>Gluten-free dosa</p>'
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://proxy.example/fetch-menu-html');
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      url: 'http://restaurant.example/menu',
    });
  });

  it('falls back to direct fetch when the HTML proxy returns an error', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: 'HTML fetch failed because the HTTPS certificate has expired.' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () => '<p>Gluten-free idli</p>',
      });

    await expect(fetchHtml('https://restaurant.example/menu', 'https://proxy.example/')).resolves.toBe(
      '<p>Gluten-free idli</p>'
    );

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://proxy.example/fetch-menu-html');
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('https://restaurant.example/menu');
  });

  it('falls back to direct fetch when the HTML proxy response has no HTML', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ html: '   ' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () => '<p>Celiac friendly tacos</p>',
      });

    await expect(fetchHtml('https://restaurant.example/menu', 'https://proxy.example')).resolves.toBe(
      '<p>Celiac friendly tacos</p>'
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps direct fetch behavior when no HTML proxy is configured', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () => '<p>Gluten-free pizza</p>',
    });

    await expect(fetchHtml('https://restaurant.example/menu')).resolves.toBe('<p>Gluten-free pizza</p>');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://restaurant.example/menu');
  });
});
