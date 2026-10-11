import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Restaurant } from '../../types/restaurant';
import { useRestaurantCacheHydration } from '../useRestaurantCacheHydration';
import { PersistenceService } from '../../services/persistenceService';

jest.mock('../../services/persistenceService', () => {
  const actual = jest.requireActual('../../services/persistenceService') as Record<string, unknown>;
  return {
    ...actual,
    PersistenceService: {
      loadCache: jest.fn(),
      loadMenuScanCache: jest.fn(),
    },
  };
});

const persistenceMock = PersistenceService as unknown as {
  loadCache: jest.MockedFunction<typeof PersistenceService.loadCache>;
  loadMenuScanCache: jest.MockedFunction<typeof PersistenceService.loadMenuScanCache>;
};

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

function renderHydration(loadFavoritesImpl?: () => Promise<unknown>) {
  const rawRestaurants = { current: [] as Restaurant[] };
  const userLat = { current: null as number | null };
  const userLng = { current: null as number | null };
  const applyFavorites = jest.fn((restaurants: Restaurant[]) => restaurants);
  const loadFavorites = jest.fn(loadFavoritesImpl ?? (async () => ({})));
  const setMenuScanCache = jest.fn();
  const emitCachedState = jest.fn();
  const startScans = jest.fn();
  const mounted = { current: true };

  let api!: ReturnType<typeof useRestaurantCacheHydration>;
  function Probe() {
    api = useRestaurantCacheHydration({
      rawRestaurants,
      userLat,
      userLng,
      applyFavorites,
      loadFavorites,
      setMenuScanCache,
      emitCachedState,
      startScans,
      isMounted: () => mounted.current,
    });
    return null;
  }

  act(() => {
    TestRenderer.create(<Probe />);
  });

  return {
    get api() {
      return api;
    },
    rawRestaurants,
    userLat,
    userLng,
    applyFavorites,
    loadFavorites,
    setMenuScanCache,
    emitCachedState,
    startScans,
    isMounted: mounted,
  };
}

describe('useRestaurantCacheHydration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    persistenceMock.loadCache.mockResolvedValue(null);
    persistenceMock.loadMenuScanCache.mockResolvedValue({});
  });

  it('hydrates cached restaurants, coords, and message on mount', async () => {
    const cached = restaurant({ placeId: 'a', menuScanStatus: 'SUCCESS', menuScanTimestamp: 1000 });
    persistenceMock.loadCache.mockResolvedValue({
      restaurants: [cached],
      lat: 41,
      lng: -73,
      timestamp: 1700000000000,
    });
    const harness = renderHydration();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(harness.loadFavorites).toHaveBeenCalled();
    expect(harness.setMenuScanCache).toHaveBeenCalledWith({});
    expect(harness.applyFavorites).toHaveBeenCalledWith([cached]);
    expect(harness.rawRestaurants.current).toEqual([cached]);
    expect(harness.userLat.current).toBe(41);
    expect(harness.userLng.current).toBe(-73);
    expect(harness.emitCachedState).toHaveBeenCalledWith(expect.stringContaining('Showing cached results'));
    expect(harness.startScans).toHaveBeenCalledWith([cached]);
  });

  it('resets interrupted FETCHING scans when restoring the cache', async () => {
    const fetching = restaurant({ placeId: 'a', menuScanStatus: 'FETCHING' });
    persistenceMock.loadCache.mockResolvedValue({
      restaurants: [fetching],
      lat: 1,
      lng: 2,
      timestamp: 1700000000000,
    });
    const harness = renderHydration();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(harness.rawRestaurants.current[0].menuScanStatus).toBe('NOT_STARTED');
  });

  it('does not emit an empty cached state when nothing is stored', async () => {
    const harness = renderHydration();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(harness.setMenuScanCache).toHaveBeenCalled();
    expect(harness.emitCachedState).not.toHaveBeenCalled();
    expect(harness.startScans).not.toHaveBeenCalled();
    expect(harness.rawRestaurants.current).toEqual([]);
  });

  it('treats an empty restaurant list as no cache', async () => {
    persistenceMock.loadCache.mockResolvedValue({ restaurants: [], lat: null, lng: null, timestamp: 0 });
    const harness = renderHydration();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(harness.emitCachedState).not.toHaveBeenCalled();
    expect(harness.startScans).not.toHaveBeenCalled();
  });

  it('only attempts hydration once', async () => {
    const harness = renderHydration();

    await harness.api.loadCachedIfAvailable();
    await harness.api.loadCachedIfAvailable();

    expect(persistenceMock.loadCache).toHaveBeenCalledTimes(1);
  });

  it('stops hydrating once the component is unmounted', async () => {
    const cached = restaurant({ placeId: 'a', menuScanStatus: 'SUCCESS', menuScanTimestamp: 1000 });
    persistenceMock.loadCache.mockResolvedValue({
      restaurants: [cached],
      lat: 1,
      lng: 2,
      timestamp: 1700000000000,
    });
    const harness = renderHydration();
    harness.isMounted.current = false;

    await act(async () => {
      await harness.api.loadCachedIfAvailable();
    });

    expect(harness.loadFavorites).toHaveBeenCalled();
    expect(harness.emitCachedState).not.toHaveBeenCalled();
    expect(harness.startScans).not.toHaveBeenCalled();
    expect(harness.rawRestaurants.current).toEqual([]);
  });

  it('stops before touching storage when unmounted while favorites load', async () => {
    let releaseFavorites!: () => void;
    const harness = renderHydration(
      () =>
        new Promise((resolve) => {
          releaseFavorites = () => resolve({});
        })
    );

    // The mount effect is now parked awaiting loadFavorites.
    harness.isMounted.current = false;
    await act(async () => {
      releaseFavorites();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(persistenceMock.loadCache).not.toHaveBeenCalled();
    expect(harness.setMenuScanCache).not.toHaveBeenCalled();
    expect(harness.emitCachedState).not.toHaveBeenCalled();
  });
});
