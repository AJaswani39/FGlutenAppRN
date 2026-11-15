import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { act, render, RenderResult } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { FiltersProvider, useFilters } from '../FiltersContext';
import { RestaurantProvider, useRestaurants } from '../RestaurantContext';
import { SettingsProvider, useSettings } from '../SettingsContext';
import { clearNearbySessionCache } from '../../data/placesRepository';
import * as menuScanner from '../../services/menuScanner';
import { Restaurant } from '../../types/restaurant';

jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      MAPS_API_KEY: 'test-key',
      ANDROID_MAPS_API_KEY: 'android-test-key',
      IOS_MAPS_API_KEY: 'ios-test-key',
    },
  },
}));
jest.mock('../../services/menuScanner', () => ({
  scanRestaurantMenu: jest.fn(),
  scanRestaurantMenuWithBrowser: jest.fn(),
  canUseBrowserMenuFallback: jest.fn(() => true),
}));

type HarnessApi = {
  restaurants: ReturnType<typeof useRestaurants>;
  filters: ReturnType<typeof useFilters>;
  settings: ReturnType<typeof useSettings>;
};

const storage = AsyncStorage as typeof AsyncStorage & { __reset: () => void };
const asyncStorageMock = AsyncStorage as typeof AsyncStorage & {
  getItem: jest.MockedFunction<typeof AsyncStorage.getItem>;
  setItem: jest.MockedFunction<typeof AsyncStorage.setItem>;
};
const locationMock = Location as typeof Location & {
  requestForegroundPermissionsAsync: jest.MockedFunction<typeof Location.requestForegroundPermissionsAsync>;
  getLastKnownPositionAsync: jest.MockedFunction<typeof Location.getLastKnownPositionAsync>;
  getCurrentPositionAsync: jest.MockedFunction<typeof Location.getCurrentPositionAsync>;
};
const netInfoMock = NetInfo as typeof NetInfo & {
  fetch: jest.MockedFunction<typeof NetInfo.fetch>;
};
const menuScannerMock = menuScanner as typeof menuScanner & {
  scanRestaurantMenu: jest.MockedFunction<typeof menuScanner.scanRestaurantMenu>;
  scanRestaurantMenuWithBrowser: jest.MockedFunction<typeof menuScanner.scanRestaurantMenuWithBrowser>;
};
const constantsMock = Constants as typeof Constants & {
  expoConfig?: { extra?: { MAPS_API_KEY?: string; ANDROID_MAPS_API_KEY?: string; IOS_MAPS_API_KEY?: string } };
};
type FetchMock = jest.MockedFunction<(...args: Parameters<typeof fetch>) => Promise<any>>;
const fetchMock = () => global.fetch as unknown as FetchMock;

interface NearbyPlaceFixture {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  rating?: number;
  openNow?: boolean;
}

function nearbyPlace({
  id,
  name,
  latitude,
  longitude,
  address,
  rating,
  openNow,
}: NearbyPlaceFixture) {
  return {
    id,
    displayName: { text: name },
    ...(address === undefined ? {} : { formattedAddress: address }),
    location: { latitude, longitude },
    ...(rating === undefined ? {} : { rating }),
    ...(openNow === undefined ? {} : { currentOpeningHours: { openNow } }),
  };
}

function placesResponse(places: unknown[] = []) {
  return {
    ok: true,
    json: async () => ({ places }),
  };
}

function mockNearbyPlacesResponse(places: unknown[] = []) {
  fetchMock().mockResolvedValue(placesResponse(places));
}

function cachedRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    placeId: 'cached-place',
    name: 'Cached Cafe',
    address: '456 State St',
    latitude: 40.712,
    longitude: -74.001,
    rating: 4.2,
    openNow: true,
    hasGFMenu: false,
    gfMenu: [],
    distanceMeters: 200,
    menuUrl: null,
    rawMenuText: null,
    menuScanStatus: 'SUCCESS',
    menuScanTimestamp: Date.now(),
    favoriteStatus: null,
    ...overrides,
  };
}

async function seedRestaurantCache(restaurants: Restaurant[], timestamp = 555) {
  await AsyncStorage.setItem(
    'restaurant_cache',
    JSON.stringify({
      restaurants,
      lat: 40.7128,
      lng: -74.006,
      timestamp,
    })
  );
}

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

async function renderHarness() {
  let latestApi: HarnessApi | null = null;
  let renderer!: RenderResult;

  await act(async () => {
    renderer = await render(
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
    clearNearbySessionCache();
    jest.clearAllMocks();
    constantsMock.expoConfig = {
      extra: {
        MAPS_API_KEY: 'test-key',
        ANDROID_MAPS_API_KEY: 'android-test-key',
        IOS_MAPS_API_KEY: 'ios-test-key',
      },
    } as any;
    locationMock.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    locationMock.getLastKnownPositionAsync.mockResolvedValue(null as any);
    locationMock.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 40.7128, longitude: -74.006 },
    } as any);
    netInfoMock.fetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    } as any);
    menuScannerMock.scanRestaurantMenu.mockImplementation(async ({ restaurant, scanStartedAt }) => ({
      menuUrl: restaurant.menuUrl,
      gfMenu: [],
      rawMenuText: 'Menu text',
      menuScanStatus: 'SUCCESS',
      menuScanTimestamp: scanStartedAt,
    }));
    menuScannerMock.scanRestaurantMenuWithBrowser.mockImplementation(async ({ restaurant, scanStartedAt }) => ({
      menuUrl: restaurant.menuUrl,
      gfMenu: [],
      rawMenuText: 'Rendered menu text',
      menuScanStatus: 'SUCCESS',
      menuScanTimestamp: scanStartedAt,
    }));
    global.fetch = jest.fn<typeof fetch>();
  });

  it('recovers when the location permission request fails', async () => {
    locationMock.requestForegroundPermissionsAsync.mockRejectedValue(new Error('Permission API failed'));
    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.status).toBe('permission_required');
    expect(getApi().restaurants.uiState.message).toContain('Location permission or services');
  });

  it('allows nearby loading when internet reachability is unknown', async () => {
    netInfoMock.fetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: null,
      type: 'wifi',
    } as any);
    mockNearbyPlacesResponse();

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.status).toBe('success');
    expect(global.fetch).toHaveBeenCalled();
    expect(locationMock.requestForegroundPermissionsAsync).toHaveBeenCalled();
  });

  it('treats empty nearby results as a success empty state', async () => {
    mockNearbyPlacesResponse();

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.status).toBe('success');
    expect(getApi().restaurants.uiState.restaurants).toHaveLength(0);
    expect(getApi().restaurants.uiState.message).toContain('No nearby restaurants found');
  });

  it('skips malformed places and keeps valid restaurants', async () => {
    mockNearbyPlacesResponse([
      { displayName: { text: 'Missing ID' }, location: { latitude: 40.7, longitude: -74 } },
      { id: 'bad-coords', displayName: { text: 'Missing coords' } },
      nearbyPlace({
        id: 'valid-place',
        name: 'GF Corner',
        address: '123 Main',
        latitude: 40.713,
        longitude: -74.002,
        rating: 4.6,
        openNow: true,
      }),
    ]);

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.restaurants).toHaveLength(1);
    expect(getApi().restaurants.uiState.restaurants[0].placeId).toBe('valid-place');
  });

  it('keeps cached restaurants visible when a refresh fails', async () => {
    await seedRestaurantCache([
      cachedRestaurant({ hasGFMenu: true, gfMenu: ['GF toast'] }),
    ]);

    locationMock.getCurrentPositionAsync.mockRejectedValue(new Error('GPS unavailable'));

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.restaurants).toHaveLength(1);
    expect(getApi().restaurants.uiState.restaurants[0].name).toBe('Cached Cafe');
    expect(getApi().restaurants.uiState.message).toContain('Showing cached results');
  });

  it('preserves cached scan data when a live refresh returns the same place', async () => {
    await seedRestaurantCache([
      cachedRestaurant({
        gfMenu: ['GF toast'],
        menuUrl: 'https://cached.example/menu',
        rawMenuText: 'Gluten-free toast available',
      }),
    ]);
    mockNearbyPlacesResponse([
      nearbyPlace({
        id: 'cached-place',
        name: 'Cached Cafe Updated',
        address: '456 State St',
        latitude: 40.713,
        longitude: -74.002,
        rating: 4.8,
        openNow: false,
      }),
    ]);

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.restaurants[0]).toMatchObject({
      placeId: 'cached-place',
      name: 'Cached Cafe Updated',
      rating: 4.8,
      openNow: false,
      menuUrl: 'https://cached.example/menu',
      rawMenuText: 'Gluten-free toast available',
      gfMenu: ['GF toast'],
      menuScanStatus: 'SUCCESS',
    });
  });

  it('prefers the dedicated scan cache over the lightweight restaurant cache', async () => {
    const timestamp = Date.now();
    await seedRestaurantCache([
      cachedRestaurant({
        gfMenu: ['Old GF toast'],
        menuUrl: 'https://cached.example/menu',
        menuScanTimestamp: timestamp,
      }),
    ], timestamp);
    await AsyncStorage.setItem(
      'restaurant_menu_scan_cache',
      JSON.stringify({
        'cached-place': {
          placeId: 'cached-place',
          gfMenu: ['Gluten-free toast'],
          rawMenuText: 'Gluten-free toast available',
          menuScanStatus: 'SUCCESS',
          menuScanTimestamp: timestamp,
        },
      })
    );
    mockNearbyPlacesResponse([
      nearbyPlace({
        id: 'cached-place',
        name: 'Cached Cafe',
        address: '456 State St',
        latitude: 40.713,
        longitude: -74.002,
      }),
    ]);

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.restaurants[0]).toMatchObject({
      menuUrl: 'https://cached.example/menu',
      rawMenuText: 'Gluten-free toast available',
      gfMenu: ['Gluten-free toast'],
      menuScanStatus: 'SUCCESS',
    });
  });

  it('does not preserve stale fetching scan state after a live refresh', async () => {
    await seedRestaurantCache([
      cachedRestaurant({
        placeId: 'stale-fetching-place',
        name: 'Stale Scan Cafe',
        address: '111 Loop St',
        menuUrl: 'https://stale.example/menu',
        menuScanStatus: 'FETCHING',
      }),
    ]);
    mockNearbyPlacesResponse([
      nearbyPlace({
        id: 'stale-fetching-place',
        name: 'Stale Scan Cafe',
        address: '111 Loop St',
        latitude: 40.713,
        longitude: -74.002,
        rating: 4.3,
        openNow: true,
      }),
    ]);

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.restaurants[0]).toMatchObject({
      placeId: 'stale-fetching-place',
      menuUrl: 'https://stale.example/menu',
    });
    expect(getApi().restaurants.uiState.restaurants[0].menuScanStatus).not.toBe('FETCHING');
  });

  it('applies strict celiac filtering to weak heuristic-only matches', async () => {
    mockNearbyPlacesResponse([
      nearbyPlace({
        id: 'gf-name-only',
        name: 'GF Bakery',
        address: '789 Broadway',
        latitude: 40.714,
        longitude: -74.005,
        rating: 3.2,
        openNow: true,
      }),
    ]);

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.restaurants).toHaveLength(1);

    await act(() => {
      getApi().settings.setStrictCeliac(true);
    });
    await flushAsync();

    expect(getApi().restaurants.uiState.status).toBe('success');
    expect(getApi().restaurants.uiState.restaurants).toHaveLength(0);
    expect(getApi().restaurants.uiState.message).toContain('current filters');
  });

  it('persists favorites and reapplies them on the next refresh', async () => {
    mockNearbyPlacesResponse([
      nearbyPlace({
        id: 'favorite-place',
        name: 'Favorite Diner',
        address: '321 River Rd',
        latitude: 40.715,
        longitude: -74.004,
        rating: 4.7,
        openNow: true,
      }),
    ]);

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    const [restaurant] = getApi().restaurants.uiState.restaurants;
    await act(() => {
      getApi().restaurants.setFavoriteStatus(restaurant, 'safe');
    });
    await flushAsync();

    expect(await AsyncStorage.getItem('restaurant_favorites')).toContain('"pid:favorite-place":"safe"');

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.restaurants[0].favoriteStatus).toBe('safe');
  });

  it('writes the saved restaurants database only once when adding a favorite', async () => {
    const { getApi } = await renderHarness();
    asyncStorageMock.setItem.mockClear();

    await act(() => {
      getApi().restaurants.setFavoriteStatus({
        placeId: 'favorite-place',
        name: 'Favorite Diner',
        address: '321 River Rd',
        latitude: 40.715,
        longitude: -74.004,
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
      }, 'safe');
    });

    const savedDbWrites = asyncStorageMock.setItem.mock.calls.filter(
      ([key]) => key === 'restaurant_saved_db'
    );
    expect(savedDbWrites).toHaveLength(1);
  });

  it('hydrates saved restaurants from cached results on startup', async () => {
    await AsyncStorage.setItem(
      'restaurant_favorites',
      JSON.stringify({
        'pid:cached-safe-place': 'safe',
      })
    );
    await seedRestaurantCache([
      cachedRestaurant({
        placeId: 'cached-safe-place',
        name: 'Cached Safe Cafe',
        address: '99 Memory Ln',
        rating: 4.9,
        hasGFMenu: true,
        gfMenu: ['GF pancakes'],
        distanceMeters: 300,
      }),
    ]);

    const { getApi } = await renderHarness();

    expect(getApi().restaurants.savedRestaurants).toHaveLength(1);
    expect(getApi().restaurants.savedRestaurants[0]).toMatchObject({
      placeId: 'cached-safe-place',
      favoriteStatus: 'safe',
    });
  });

  it('keeps default settings when startup setting storage rejects', async () => {
    asyncStorageMock.getItem.mockRejectedValueOnce(new Error('settings unavailable'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { getApi } = await renderHarness();

    expect(getApi().settings.useMiles).toBe(false);
    expect(getApi().settings.strictCeliac).toBe(false);

    errorSpy.mockRestore();
  });

  it('does not overwrite a filter changed while saved filters are still loading', async () => {
    const savedFilters = createDeferred<string | null>();
    asyncStorageMock.getItem.mockImplementation(async (key: string) => {
      if (key === 'restaurant_filters') return savedFilters.promise;
      return null;
    });

    const { getApi } = await renderHarness();

    await act(() => {
      getApi().filters.setFilters({ gfOnly: true });
    });
    await act(async () => {
      savedFilters.resolve(JSON.stringify({ gfOnly: false }));
      await savedFilters.promise;
    });
    await flushAsync();

    expect(getApi().filters.filters.gfOnly).toBe(true);
  });

  it('does not overwrite a setting changed while its saved value is still loading', async () => {
    const savedSetting = createDeferred<string | null>();
    asyncStorageMock.getItem.mockImplementation(async (key: string) => {
      if (key === 'fg_settings:strict_celiac') return savedSetting.promise;
      return null;
    });

    const { getApi } = await renderHarness();

    await act(() => {
      getApi().settings.setStrictCeliac(true);
    });
    await act(async () => {
      savedSetting.resolve('false');
      await savedSetting.promise;
    });
    await flushAsync();

    expect(getApi().settings.strictCeliac).toBe(true);
  });

  it('keeps loaded restaurants visible when cache persistence rejects', async () => {
    mockNearbyPlacesResponse([
      nearbyPlace({
        id: 'cache-save-place',
        name: 'Cache Save Cafe',
        address: '10 Stable St',
        latitude: 40.715,
        longitude: -74.004,
        rating: 4.6,
        openNow: true,
      }),
    ]);
    asyncStorageMock.setItem.mockImplementation(async (key: string, value: string) => {
      if (key === 'restaurant_cache') {
        throw new Error('cache full');
      }
      void value;
      return undefined;
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    expect(getApi().restaurants.uiState.status).toBe('success');
    expect(getApi().restaurants.uiState.restaurants).toHaveLength(1);

    await flushAsync();
    errorSpy.mockRestore();
  });

  it('uses the distance filter as the nearby search radius', async () => {
    mockNearbyPlacesResponse();

    const { getApi } = await renderHarness();

    await act(() => {
      getApi().filters.setFilters({ maxDistanceMeters: 12000 });
    });
    await flushAsync();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    const nearbyCall = fetchMock().mock.calls.find(([url]) =>
      String(url).includes('searchNearby')
    );
    if (!nearbyCall) {
      throw new Error('Expected a nearby search request');
    }
    expect(JSON.parse(String(nearbyCall[1]?.body)).locationRestriction.circle.radius).toBe(12000);
  });

  it('keeps saved restaurants independent from active filters', async () => {
    mockNearbyPlacesResponse([
      nearbyPlace({
        id: 'safe-place',
        name: 'Safe Bistro',
        address: '12 Green St',
        latitude: 40.715,
        longitude: -74.004,
        rating: 4.8,
        openNow: true,
      }),
      nearbyPlace({
        id: 'avoid-place',
        name: 'Avoid Grill',
        address: '34 Wheat Ave',
        latitude: 40.716,
        longitude: -74.003,
        rating: 3.5,
        openNow: false,
      }),
    ]);

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    const [safePlace, avoidPlace] = getApi().restaurants.uiState.restaurants;
    await act(() => {
      getApi().restaurants.setFavoriteStatus(safePlace, 'safe');
      getApi().restaurants.setFavoriteStatus(avoidPlace, 'avoid');
    });
    await flushAsync();

    await act(() => {
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
    mockNearbyPlacesResponse([
      nearbyPlace({
        id: 'try-place',
        name: 'Try Cafe',
        address: '56 Rice Rd',
        latitude: 40.715,
        longitude: -74.004,
        rating: 4.1,
        openNow: true,
      }),
    ]);

    const { getApi } = await renderHarness();

    await act(async () => {
      await getApi().restaurants.loadNearbyRestaurants();
    });

    const [restaurant] = getApi().restaurants.uiState.restaurants;
    await act(() => {
      getApi().restaurants.setFavoriteStatus(restaurant, 'try');
    });
    await flushAsync();

    expect(getApi().restaurants.savedRestaurants).toHaveLength(1);

    await act(() => {
      getApi().restaurants.setFavoriteStatus(restaurant, null);
    });
    await flushAsync();

    expect(getApi().restaurants.savedRestaurants).toHaveLength(0);
  });

  it('clears menu scan progress after the current scan batch completes', async () => {
    fetchMock().mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes('searchNearby')) {
        return placesResponse(
          Array.from({ length: 7 }, (_, index) => nearbyPlace({
            id: `scan-place-${index}`,
            name: `Scan Cafe ${index}`,
            address: `${index} Main St`,
            latitude: 40.715 + index * 0.001,
            longitude: -74.004,
            rating: 4.1,
            openNow: true,
          }))
        );
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
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });

    expect(getApi().restaurants.uiState.scanProgress).toBeNull();
  });

  it('keeps the existing scan total when a manual rescan starts during an active batch', async () => {
    const deferredScan = createDeferred<Awaited<ReturnType<typeof menuScanner.scanRestaurantMenu>>>();
    menuScannerMock.scanRestaurantMenu.mockImplementation(() => deferredScan.promise);

    fetchMock().mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes('searchNearby')) {
        return placesResponse(
          Array.from({ length: 3 }, (_, index) => nearbyPlace({
            id: `rescan-place-${index}`,
            name: `Rescan Cafe ${index}`,
            address: `${index} Main St`,
            latitude: 40.715 + index * 0.001,
            longitude: -74.004,
            rating: 4.1,
            openNow: true,
          }))
        );
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

    expect(getApi().restaurants.uiState.scanProgress?.total).toBe(3);

    const [restaurant] = getApi().restaurants.uiState.restaurants;
    await act(() => {
      getApi().restaurants.requestMenuRescan(restaurant);
    });

    expect(getApi().restaurants.uiState.scanProgress?.total).toBe(3);

    deferredScan.resolve({
      menuUrl: restaurant.menuUrl,
      gfMenu: [],
      rawMenuText: 'Menu text',
      menuScanStatus: 'SUCCESS',
      menuScanTimestamp: Date.now(),
    });

    await flushAsync();
  });

  it('tracks interactive menu renders in scan progress while they are active', async () => {
    const deferredRender = createDeferred<Awaited<ReturnType<typeof menuScanner.scanRestaurantMenuWithBrowser>>>();
    menuScannerMock.scanRestaurantMenuWithBrowser.mockImplementation(() => deferredRender.promise);

    fetchMock().mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url).includes('searchNearby')) {
        return placesResponse([
          nearbyPlace({
            id: 'interactive-place-1',
            name: 'Interactive Cafe',
            address: '1 Main St',
            latitude: 40.715,
            longitude: -74.004,
            rating: 4.1,
            openNow: true,
          }),
        ]);
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

    const [restaurant] = getApi().restaurants.uiState.restaurants;
    await act(() => {
      getApi().restaurants.requestInteractiveMenuRender({
        ...restaurant,
        menuUrl: 'https://example.com/menu',
        menuScanStatus: 'NO_MENU_CONTENT',
      });
    });

    expect(getApi().restaurants.uiState.scanProgress?.total).toBe(1);
    expect(getApi().restaurants.uiState.scanProgress?.active).toBe(true);

    deferredRender.resolve({
      menuUrl: 'https://example.com/menu',
      gfMenu: [],
      rawMenuText: 'Rendered menu text',
      menuScanStatus: 'SUCCESS',
      menuScanTimestamp: Date.now(),
    });

    await flushAsync();
  });
});
