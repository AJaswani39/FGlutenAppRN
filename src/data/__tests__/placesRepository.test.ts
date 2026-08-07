import { clearNearbySessionCache, fetchNearbyRestaurants } from '../placesRepository';

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
});
