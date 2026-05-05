import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act } from 'react-test-renderer';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { FiltersProvider, useFilters } from '../FiltersContext';
import { RestaurantProvider, useRestaurants } from '../RestaurantContext';
import { SettingsProvider, useSettings } from '../SettingsContext';

jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      MAPS_API_KEY: 'test-key',
    },
  },
}));

type HarnessApi = {
  restaurants: ReturnType<typeof useRestaurants>;
  filters: ReturnType<typeof useFilters>;
  settings: ReturnType<typeof useSettings>;
};

const storage = AsyncStorage as typeof AsyncStorage & { __reset: () => void };
const locationMock = Location as jest.Mocked<typeof Location>;
const constantsMock = Constants as typeof Constants & {
  expoConfig?: { extra?: { MAPS_API_KEY?: string } };
};

function Probe({ capture }: { capture: (api: HarnessApi) => void }) {
  capture({
    restaurants: useRestaurants(),
    filters: useFilters(),
    settings: useSettings(),
  });

  return null;
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderHarness() {
  let latestApi: HarnessApi | null = null;
  let renderer!: TestRenderer.ReactTestRenderer;

  await act(async () => {
    renderer = TestRenderer.create(
      <SettingsProvider>
        <FiltersProvider>
          <RestaurantProvider>
            <Probe capture={(api) => {
              latestApi = api;
            }} />
          </RestaurantProvider>
        </FiltersProvider>
      </SettingsProvider>
    );
  });

  await flushAsync();

  return {
    renderer,
    getApi: () => {
      if (!latestApi) {
        throw new Error('Harness API not ready');
      }

      return latestApi;
    },
  };
}

describe('RestaurantContext', () => {
  beforeEach(() => {
    storage.__reset();
    jest.clearAllMocks();
    constantsMock.expoConfig = { extra: { MAPS_API_KEY: 'test-key' } } as any;
    locationMock.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    locationMock.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 40.7128, longitude: -74.006 },
    } as any);
    global.fetch = jest.fn();
  });

  it('returns an error when the maps api key is missing', async () => {
    constantsMock.expoConfig = { extra: { MAPS_API_KEY: '' } } as any;
    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.status).toBe('error');
    expect(getApi().restaurants.uiState.message).toContain('MAPS_API_KEY');
  });

  it('returns the permission-required state when location access is denied', async () => {
    locationMock.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.status).toBe('permission_required');
    expect(getApi().restaurants.uiState.restaurants).toHaveLength(0);
  });

  it('recovers when the location permission request fails', async () => {
    locationMock.requestForegroundPermissionsAsync.mockRejectedValue(new Error('Permission API failed'));
    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.status).toBe('error');
    expect(getApi().restaurants.uiState.message).toContain('Permission API failed');
  });

  it('treats empty nearby results as a success empty state', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ places: [] }),
    });

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.status).toBe('success');
    expect(getApi().restaurants.uiState.restaurants).toHaveLength(0);
    expect(getApi().restaurants.uiState.message).toContain('No nearby restaurants found');
  });

  it('skips malformed places and keeps valid restaurants', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [
          { displayName: { text: 'Missing ID' }, location: { latitude: 40.7, longitude: -74 } },
          { id: 'bad-coords', displayName: { text: 'Missing coords' } },
          {
            id: 'valid-place',
            displayName: { text: 'GF Corner' },
            formattedAddress: '123 Main',
            location: { latitude: 40.713, longitude: -74.002 },
            rating: 4.6,
            currentOpeningHours: { openNow: true },
          },
        ],
      }),
    });

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.restaurants).toHaveLength(1);
    expect(getApi().restaurants.uiState.restaurants[0].placeId).toBe('valid-place');
  });

  it('keeps cached restaurants visible when a refresh fails', async () => {
    await AsyncStorage.setItem(
      'restaurant_cache',
      JSON.stringify({
        restaurants: [
          {
            placeId: 'cached-place',
            name: 'Cached Cafe',
            address: '456 State St',
            latitude: 40.712,
            longitude: -74.001,
            rating: 4.2,
            openNow: true,
            hasGFMenu: true,
            gfMenu: ['GF toast'],
            distanceMeters: 200,
            menuUrl: null,
            rawMenuText: null,
            menuScanStatus: 'SUCCESS',
            menuScanTimestamp: Date.now(),
            favoriteStatus: null,
          },
        ],
        lat: 40.7128,
        lng: -74.006,
        timestamp: 555,
      })
    );

    locationMock.getCurrentPositionAsync.mockRejectedValue(new Error('GPS unavailable'));

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.restaurants).toHaveLength(1);
    expect(getApi().restaurants.uiState.restaurants[0].name).toBe('Cached Cafe');
    expect(getApi().restaurants.uiState.message).toContain('Showing cached results');
  });

  it('applies strict celiac filtering to weak heuristic-only matches', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [
          {
            id: 'gf-name-only',
            displayName: { text: 'GF Bakery' },
            formattedAddress: '789 Broadway',
            location: { latitude: 40.714, longitude: -74.005 },
            rating: 3.2,
            currentOpeningHours: { openNow: true },
          },
        ],
      }),
    });

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.restaurants).toHaveLength(1);

    act(() => {
      getApi().settings.setStrictCeliac(true);
    });
    await flushAsync();

    expect(getApi().restaurants.uiState.status).toBe('success');
    expect(getApi().restaurants.uiState.restaurants).toHaveLength(0);
    expect(getApi().restaurants.uiState.message).toContain('current filters');
  });

  it('persists favorites and reapplies them on the next refresh', async () => {
    const nearbyPayload = {
      places: [
        {
          id: 'favorite-place',
          displayName: { text: 'Favorite Diner' },
          formattedAddress: '321 River Rd',
          location: { latitude: 40.715, longitude: -74.004 },
          rating: 4.7,
          currentOpeningHours: { openNow: true },
        },
      ],
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => nearbyPayload,
    });

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    const [restaurant] = getApi().restaurants.uiState.restaurants;
    act(() => {
      getApi().restaurants.setFavoriteStatus(restaurant, 'safe');
    });
    await flushAsync();

    expect(await AsyncStorage.getItem('restaurant_favorites')).toContain('"pid:favorite-place":"safe"');

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.restaurants[0].favoriteStatus).toBe('safe');
  });

  it('hydrates saved restaurants from cached results on startup', async () => {
    await AsyncStorage.setItem(
      'restaurant_favorites',
      JSON.stringify({
        'pid:cached-safe-place': 'safe',
      })
    );
    await AsyncStorage.setItem(
      'restaurant_cache',
      JSON.stringify({
        restaurants: [
          {
            placeId: 'cached-safe-place',
            name: 'Cached Safe Cafe',
            address: '99 Memory Ln',
            latitude: 40.712,
            longitude: -74.001,
            rating: 4.9,
            openNow: true,
            hasGFMenu: true,
            gfMenu: ['GF pancakes'],
            distanceMeters: 300,
            menuUrl: null,
            rawMenuText: null,
            menuScanStatus: 'SUCCESS',
            menuScanTimestamp: Date.now(),
            favoriteStatus: null,
          },
        ],
        lat: 40.7128,
        lng: -74.006,
        timestamp: 555,
      })
    );

    const { getApi } = await renderHarness();

    expect(getApi().restaurants.savedRestaurants).toHaveLength(1);
    expect(getApi().restaurants.savedRestaurants[0]).toMatchObject({
      placeId: 'cached-safe-place',
      favoriteStatus: 'safe',
    });
  });

  it('uses the distance filter as the nearby search radius', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ places: [] }),
    });

    const { getApi } = await renderHarness();

    act(() => {
      getApi().filters.setFilters({ maxDistanceMeters: 12000 });
    });
    await flushAsync();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    const nearbyCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
      String(url).includes('searchNearby')
    );
    expect(nearbyCall).toBeDefined();
    expect(JSON.parse(nearbyCall[1].body).locationRestriction.circle.radius).toBe(12000);
  });

  it('keeps saved restaurants independent from active filters', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [
          {
            id: 'safe-place',
            displayName: { text: 'Safe Bistro' },
            formattedAddress: '12 Green St',
            location: { latitude: 40.715, longitude: -74.004 },
            rating: 4.8,
            currentOpeningHours: { openNow: true },
          },
          {
            id: 'avoid-place',
            displayName: { text: 'Avoid Grill' },
            formattedAddress: '34 Wheat Ave',
            location: { latitude: 40.716, longitude: -74.003 },
            rating: 3.5,
            currentOpeningHours: { openNow: false },
          },
        ],
      }),
    });

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    const [safePlace, avoidPlace] = getApi().restaurants.uiState.restaurants;
    act(() => {
      getApi().restaurants.setFavoriteStatus(safePlace, 'safe');
      getApi().restaurants.setFavoriteStatus(avoidPlace, 'avoid');
    });
    await flushAsync();

    act(() => {
      getApi().filters.setFilters({ searchQuery: 'not in saved names' });
    });
    await flushAsync();

    expect(getApi().restaurants.uiState.restaurants).toHaveLength(0);
    expect(getApi().restaurants.savedRestaurants.map((restaurant) => restaurant.placeId)).toEqual([
      'safe-place',
      'avoid-place',
    ]);
  });

  it('removes restaurants from saved results when favorite status is cleared', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [
          {
            id: 'try-place',
            displayName: { text: 'Try Cafe' },
            formattedAddress: '56 Rice Rd',
            location: { latitude: 40.715, longitude: -74.004 },
            rating: 4.1,
            currentOpeningHours: { openNow: true },
          },
        ],
      }),
    });

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    const [restaurant] = getApi().restaurants.uiState.restaurants;
    act(() => {
      getApi().restaurants.setFavoriteStatus(restaurant, 'try');
    });
    await flushAsync();

    expect(getApi().restaurants.savedRestaurants).toHaveLength(1);

    act(() => {
      getApi().restaurants.setFavoriteStatus(restaurant, null);
    });
    await flushAsync();

    expect(getApi().restaurants.savedRestaurants).toHaveLength(0);
  });

  it('reports menu scan progress for the current scan batch', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('searchNearby')) {
        return {
          ok: true,
          json: async () => ({
            places: Array.from({ length: 7 }).map((_, index) => ({
              id: `scan-place-${index}`,
              displayName: { text: `Scan Cafe ${index}` },
              formattedAddress: `${index} Main St`,
              location: { latitude: 40.715 + index * 0.001, longitude: -74.004 },
              rating: 4.1,
              currentOpeningHours: { openNow: true },
            })),
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({}),
      };
    });

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });
    await flushAsync();

    expect(getApi().restaurants.uiState.scanProgress).toEqual({
      completed: 5,
      total: 5,
      active: false,
    });
  });
});
