import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Location from 'expo-location';
import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';
import { Restaurant, RestaurantUiState } from '../../types/restaurant';
import { useRestaurantLoader } from '../useRestaurantLoader';
import { fetchNearbyRestaurants } from '../../data/placesRepository';
import { getMapsApiKey } from '../restaurantState';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
  requestForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({
  NetInfoStateType: {
    unknown: 'unknown',
    none: 'none',
    cellular: 'cellular',
    wifi: 'wifi',
    bluetooth: 'bluetooth',
    ethernet: 'ethernet',
    wimax: 'wimax',
    vpn: 'vpn',
    other: 'other',
  },
  fetch: jest.fn(),
}));
jest.mock('../../data/placesRepository', () => ({
  fetchNearbyRestaurants: jest.fn(),
}));
jest.mock('../restaurantState', () => ({
  getMapsApiKey: jest.fn(() => 'maps-key'),
}));

const locationMock = Location as typeof Location & {
  requestForegroundPermissionsAsync: jest.MockedFunction<typeof Location.requestForegroundPermissionsAsync>;
  getLastKnownPositionAsync: jest.MockedFunction<typeof Location.getLastKnownPositionAsync>;
  getCurrentPositionAsync: jest.MockedFunction<typeof Location.getCurrentPositionAsync>;
};
const netInfoMock = NetInfo as typeof NetInfo & {
  fetch: jest.MockedFunction<typeof NetInfo.fetch>;
};
const fetchNearbyMock = fetchNearbyRestaurants as jest.MockedFunction<typeof fetchNearbyRestaurants>;
const mapsApiKeyMock = getMapsApiKey as jest.MockedFunction<typeof getMapsApiKey>;

function mockWifiState(options: { isConnected?: boolean; isInternetReachable?: boolean } = {}): NetInfoState {
  const { isConnected = true, isInternetReachable = true } = options;
  return {
    type: NetInfoStateType.wifi,
    isConnected,
    isInternetReachable,
    details: {
      isConnectionExpensive: false,
      ssid: null,
      bssid: null,
      strength: null,
      ipAddress: null,
      subnet: null,
      frequency: null,
      linkSpeed: null,
      rxLinkSpeed: null,
      txLinkSpeed: null,
    },
  };
}

function mockDisconnectedState(): NetInfoState {
  return {
    type: NetInfoStateType.none,
    isConnected: false,
    isInternetReachable: false,
    details: null,
  };
}

function mockLocationObject(latitude: number, longitude: number, timestamp = Date.now()): Location.LocationObject {
  return {
    coords: {
      latitude,
      longitude,
      altitude: 0,
      accuracy: 10,
      altitudeAccuracy: 0,
      heading: 0,
      speed: 0,
    },
    timestamp,
  };
}

function mockPermissionResponse(granted: boolean, canAskAgain = true): Location.LocationPermissionResponse {
  return {
    status: granted ? Location.PermissionStatus.GRANTED : Location.PermissionStatus.DENIED,
    granted,
    canAskAgain,
    expires: 'never',
  };
}

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

function createUiState(overrides: Partial<RestaurantUiState> = {}): RestaurantUiState {
  return {
    status: 'idle',
    restaurants: [],
    message: null,
    userLatitude: null,
    userLongitude: null,
    scanProgress: null,
    ...overrides,
  };
}

interface LoaderOptions {
  initialRestaurants?: Restaurant[];
  status?: RestaurantUiState['status'];
}

function renderLoader(options: LoaderOptions = {}) {
  const { initialRestaurants = [], status = 'idle' } = options;
  const rawRestaurants = { current: initialRestaurants };
  const userLat = { current: null as number | null };
  const userLng = { current: null as number | null };
  const filtersRef = { current: { maxDistanceMeters: 0 } };
  const uiState = createUiState({ status, restaurants: initialRestaurants });
  const uiStateRef = { current: uiState };
  const isMounted = { current: true };
  const setUiState = jest.fn((update: React.SetStateAction<RestaurantUiState>) => {
    uiStateRef.current =
      typeof update === 'function' ? update(uiStateRef.current) : update;
  });
  const emitFilteredState = jest.fn();
  const mergeCachedScanData = jest.fn((restaurants: Restaurant[]) => restaurants);
  const applyFavorites = jest.fn((restaurants: Restaurant[]) => restaurants);
  const flushQueue = jest.fn();
  const loadCachedIfAvailable = jest.fn(async () => {});
  const persistCache = jest.fn();
  const startScans = jest.fn();
  const getScanProgress = jest.fn(() => null);

  let api!: { loadNearbyRestaurants: ReturnType<typeof useRestaurantLoader>['loadNearbyRestaurants'] };
  function Probe() {
    api = useRestaurantLoader({
      rawRestaurants,
      userLat,
      userLng,
      filtersRef,
      uiStateRef,
      isMounted,
      setUiState,
      getScanProgress,
      emitFilteredState,
      mergeCachedScanData,
      applyFavorites,
      flushQueue,
      loadCachedIfAvailable,
      persistCache,
      startScans,
    });
    return null;
  }

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });

  return {
    loadNearby: (...args: Parameters<typeof api.loadNearbyRestaurants>) => api.loadNearbyRestaurants(...args),
    getLastUiState: (): RestaurantUiState => {
      expect(setUiState).toHaveBeenCalled();
      return uiStateRef.current;
    },
    rawRestaurants,
    userLat,
    userLng,
    filtersRef,
    uiStateRef,
    isMounted,
    setUiState,
    emitFilteredState,
    applyFavorites,
    flushQueue,
    loadCachedIfAvailable,
    persistCache,
    startScans,
    unmount: () => act(() => renderer.unmount()),
  };
}

describe('useRestaurantLoader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    netInfoMock.fetch.mockResolvedValue(mockWifiState());
    locationMock.requestForegroundPermissionsAsync.mockResolvedValue(mockPermissionResponse(true));
    locationMock.getLastKnownPositionAsync.mockResolvedValue(null);
    locationMock.getCurrentPositionAsync.mockResolvedValue(mockLocationObject(12.5, -33.25));
    mapsApiKeyMock.mockReturnValue('maps-key');
    fetchNearbyMock.mockResolvedValue([
      restaurant({ placeId: 'a', latitude: 12.5, longitude: -33.25 }),
      restaurant({ placeId: 'b', latitude: 12.6, longitude: -33.2 }),
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ignores a new load while a load is already in flight', async () => {
    const loader = renderLoader();
    let releaseFetch!: (value: Restaurant[]) => void;
    fetchNearbyMock.mockImplementation(
      () => new Promise<Restaurant[]>((resolve) => {
        releaseFetch = resolve;
      })
    );

    let firstLoad!: Promise<void>;
    await act(async () => {
      firstLoad = loader.loadNearby();
    });
    expect(fetchNearbyMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await loader.loadNearby();
    });
    expect(fetchNearbyMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseFetch([]);
      await firstLoad;
    });
  });

  it('loads nearby restaurants and wires up derived state', async () => {
    const loader = renderLoader();

    await act(async () => {
      await loader.loadNearby();
    });

    expect(loader.flushQueue).toHaveBeenCalled();
    expect(loader.loadCachedIfAvailable).toHaveBeenCalled();
    expect(fetchNearbyMock).toHaveBeenCalledWith(
      12.5,
      -33.25,
      'maps-key',
      undefined,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(loader.applyFavorites).toHaveBeenCalled();
    expect(loader.rawRestaurants.current).toHaveLength(2);
    expect(loader.rawRestaurants.current[0].distanceMeters).toBeGreaterThanOrEqual(0);
    expect(loader.userLat.current).toBe(12.5);
    expect(loader.userLng.current).toBe(-33.25);
    expect(loader.emitFilteredState).toHaveBeenCalledWith({ emptyReason: 'nearby' });
    expect(loader.persistCache).toHaveBeenCalled();
    expect(loader.startScans).toHaveBeenCalledWith(loader.rawRestaurants.current);
  });

  it('uses the filters distance as the search radius when set', async () => {
    const loader = renderLoader();
    loader.filtersRef.current = { maxDistanceMeters: 2500 };

    await act(async () => {
      await loader.loadNearby();
    });

    expect(fetchNearbyMock).toHaveBeenCalledWith(
      12.5,
      -33.25,
      'maps-key',
      2500,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('passes forceRefresh through to the repository', async () => {
    const loader = renderLoader();

    await act(async () => {
      await loader.loadNearby(undefined, { forceRefresh: true });
    });

    expect(fetchNearbyMock).toHaveBeenCalledWith(
      12.5,
      -33.25,
      'maps-key',
      undefined,
      expect.objectContaining({ forceRefresh: true })
    );
  });

  it('shows a refreshing message while cached results are visible', async () => {
    const cached = [restaurant({ placeId: 'cached' })];
    const loader = renderLoader({ initialRestaurants: cached });

    await act(async () => {
      await loader.loadNearby();
    });

    expect(loader.emitFilteredState).toHaveBeenCalledWith({
      emptyReason: 'filters',
      message: 'Refreshing nearby restaurants…',
      status: 'loading',
    });
  });

  it('shows a first-load message when nothing is cached', async () => {
    const loader = renderLoader();

    await act(async () => {
      await loader.loadNearby();
    });

    const loadingCall = loader.setUiState.mock.calls
      .map(([update]) => (typeof update === 'function' ? update(loader.uiStateRef.current) : update))
      .find((state) => state.status === 'loading');
    expect(loadingCall?.message).toBe('Finding restaurants near you…');
  });

  it('supports manual searches at explicit coordinates without location calls', async () => {
    const loader = renderLoader();

    await act(async () => {
      await loader.loadNearby({ latitude: 40.7, longitude: -74 });
    });

    expect(locationMock.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(fetchNearbyMock).toHaveBeenCalledWith(
      40.7,
      -74,
      'maps-key',
      undefined,
      expect.anything()
    );

    const loadingCall = loader.setUiState.mock.calls
      .map(([update]) => (typeof update === 'function' ? update(loader.uiStateRef.current) : update))
      .find((state) => state.status === 'loading');
    expect(loadingCall?.message).toBe('Searching this area…');
  });

  it('reuses a recent last-known position instead of requesting a fresh fix', async () => {
    locationMock.getLastKnownPositionAsync.mockResolvedValue(mockLocationObject(1.5, 2.5));
    const loader = renderLoader();

    await act(async () => {
      await loader.loadNearby();
    });

    expect(locationMock.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(fetchNearbyMock).toHaveBeenCalledWith(1.5, 2.5, 'maps-key', undefined, expect.anything());
  });

  it('reports an offline state and skips the repository call', async () => {
    netInfoMock.fetch.mockResolvedValue(mockDisconnectedState());
    const loader = renderLoader();

    await act(async () => {
      await loader.loadNearby();
    });

    expect(fetchNearbyMock).not.toHaveBeenCalled();
    const state = loader.getLastUiState();
    expect(state.status).toBe('error');
    expect(state.message).toBe('No internet connection. Showing last cached results.');
  });

  it('treats an unreachable network as offline', async () => {
    netInfoMock.fetch.mockResolvedValue(mockWifiState({ isConnected: true, isInternetReachable: false }));
    const loader = renderLoader();

    await act(async () => {
      await loader.loadNearby();
    });

    expect(fetchNearbyMock).not.toHaveBeenCalled();
    const state = loader.getLastUiState();
    expect(state.status).toBe('error');
  });

  it('surfaces a network check failure with and without cached results', async () => {
    netInfoMock.fetch.mockRejectedValue(new Error('netinfo exploded'));
    const withoutCache = renderLoader();
    await act(async () => {
      await withoutCache.loadNearby();
    });
    const state = withoutCache.getLastUiState();
    expect(state.message).toBe('Could not check the internet connection. Please try again.');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not determine network status')
    );

    const withCache = renderLoader({ initialRestaurants: [restaurant()] });
    await act(async () => {
      await withCache.loadNearby();
    });
    expect(withCache.emitFilteredState).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Could not check the internet connection. Showing cached results.' })
    );
  });

  it('surfaces a missing Maps API key differently depending on cached data', async () => {
    mapsApiKeyMock.mockReturnValue('');
    const withoutCache = renderLoader();
    await act(async () => {
      await withoutCache.loadNearby();
    });
    const state = withoutCache.getLastUiState();
    expect(state.message).toBe('Maps API key is missing. Live refresh is unavailable.');
    expect(fetchNearbyMock).not.toHaveBeenCalled();

    const withCache = renderLoader({ initialRestaurants: [restaurant()] });
    await act(async () => {
      await withCache.loadNearby();
    });
    expect(withCache.emitFilteredState).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Showing cached results — Maps API key is missing. Live refresh is unavailable.' })
    );
  });

  it('maps denied location permission to a permission_required state', async () => {
    locationMock.requestForegroundPermissionsAsync.mockResolvedValue(mockPermissionResponse(false, false));
    const loader = renderLoader();

    await act(async () => {
      await loader.loadNearby();
    });

    const state = loader.getLastUiState();
    expect(state.status).toBe('permission_required');
    expect(state.message).toContain('location permission is needed');
  });

  it('maps fetch failures mentioning permission to a permission_required state', async () => {
    fetchNearbyMock.mockRejectedValue(new Error('Location permission denied by user'));
    const loader = renderLoader({ initialRestaurants: [restaurant()] });

    await act(async () => {
      await loader.loadNearby();
    });

    const state = loader.getLastUiState();
    expect(state.status).toBe('permission_required');
    expect(state.message).toBe('Location permission or services are required to refresh results.');
  });

  it('falls back to cached results for generic fetch failures', async () => {
    fetchNearbyMock.mockRejectedValue(new Error('boom'));
    const loader = renderLoader({ initialRestaurants: [restaurant()] });

    await act(async () => {
      await loader.loadNearby();
    });

    expect(loader.emitFilteredState).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Showing cached results — Could not load restaurants: boom' })
    );
  });

  it('discards results when the component unmounts mid-flight', async () => {
    const loader = renderLoader();
    let releaseFetch!: (value: Restaurant[]) => void;
    fetchNearbyMock.mockImplementation(
      () => new Promise<Restaurant[]>((resolve) => {
        releaseFetch = resolve;
      })
    );

    let pending!: Promise<void>;
    await act(async () => {
      pending = loader.loadNearby();
    });

    loader.unmount();

    await act(async () => {
      releaseFetch([restaurant({ placeId: 'late' })]);
      await pending;
    });

    expect(loader.startScans).not.toHaveBeenCalled();
    expect(loader.rawRestaurants.current).toEqual([]);
  });

  it('swallows abort rejections from the in-flight request', async () => {
    const loader = renderLoader();
    fetchNearbyMock.mockImplementation((_lat, _lng, _key, _radius, options) => {
      return new Promise<Restaurant[]>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () =>
          reject(new Error('The operation was aborted'))
        );
      });
    });

    let pending!: Promise<void>;
    await act(async () => {
      pending = loader.loadNearby();
    });

    loader.unmount();
    await act(async () => {
      await pending;
    });

    const errorCalls = (console.error as jest.Mock).mock.calls;
    expect(errorCalls).toHaveLength(0);
  });
});
