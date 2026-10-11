import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MenuScanCacheEntry } from '../../services/persistenceService';
import { Restaurant } from '../../types/restaurant';
import { useRestaurantPersistence } from '../useRestaurantPersistence';
import { PersistenceService } from '../../services/persistenceService';

const appStateHandlers: Array<(state: string) => void> = [];
const appStateRemove = jest.fn();
let appStateListenerSpy: ReturnType<typeof jest.spyOn>;

jest.mock('../../services/persistenceService', () => {
  const actual = jest.requireActual('../../services/persistenceService') as Record<string, unknown>;
  return {
    ...actual,
    PersistenceService: {
      saveCache: jest.fn(),
      loadMenuScanCache: jest.fn(),
      saveMenuScanCache: jest.fn(),
    },
  };
});

const persistenceMock = PersistenceService as unknown as {
  saveCache: jest.MockedFunction<typeof PersistenceService.saveCache>;
  loadMenuScanCache: jest.MockedFunction<typeof PersistenceService.loadMenuScanCache>;
  saveMenuScanCache: jest.MockedFunction<typeof PersistenceService.saveMenuScanCache>;
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

function renderPersistence(initial: Restaurant[] = []) {
  const rawRestaurants = { current: initial };
  const userLat = { current: 10 };
  const userLng = { current: 20 };

  let api!: ReturnType<typeof useRestaurantPersistence>;
  function Probe() {
    api = useRestaurantPersistence({ rawRestaurants, userLat, userLng });
    return null;
  }

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });

  return {
    get api() {
      return api;
    },
    rawRestaurants,
    userLat,
    userLng,
    unmount: () => act(() => renderer.unmount()),
  };
}

describe('useRestaurantPersistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appStateHandlers.length = 0;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const listen = (_type: string, handler: (state: string) => void) => {
      appStateHandlers.push(handler);
      return { remove: appStateRemove };
    };
    appStateListenerSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(listen as never);
    persistenceMock.saveCache.mockResolvedValue(undefined);
    persistenceMock.loadMenuScanCache.mockResolvedValue({});
    persistenceMock.saveMenuScanCache.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('debounces cache writes by two seconds', async () => {
    jest.useFakeTimers();
    const harness = renderPersistence([restaurant({ placeId: 'a' })]);

    act(() => {
      harness.api.persistCache();
    });
    expect(persistenceMock.saveCache).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1999);
    });
    expect(persistenceMock.saveCache).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(persistenceMock.saveCache).toHaveBeenCalledTimes(1);
  });

  it('collapses repeated persistCache calls into a single write', async () => {
    jest.useFakeTimers();
    const harness = renderPersistence([restaurant({ placeId: 'a' })]);

    act(() => {
      harness.api.persistCache();
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    act(() => {
      harness.api.persistCache();
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(persistenceMock.saveCache).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately with the current refs and cancels the pending debounce', async () => {
    jest.useFakeTimers();
    const cached = restaurant({ placeId: 'a' });
    const harness = renderPersistence([cached]);

    act(() => {
      harness.api.persistCache();
      harness.api.flushPersistence();
    });

    expect(persistenceMock.saveCache).toHaveBeenCalledTimes(1);
    expect(persistenceMock.saveCache).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurants: [cached],
        lat: 10,
        lng: 20,
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(persistenceMock.saveCache).toHaveBeenCalledTimes(1);
  });

  it('flushes the cache when the app goes to the background', async () => {
    const harness = renderPersistence([restaurant({ placeId: 'a' })]);
    expect(appStateHandlers).toHaveLength(1);

    await act(async () => {
      appStateHandlers[0]('background');
    });

    expect(persistenceMock.saveCache).toHaveBeenCalledTimes(1);

    await act(async () => {
      appStateHandlers[0]('active');
    });
    expect(persistenceMock.saveCache).toHaveBeenCalledTimes(1);
  });

  it('flushes the cache when the app becomes inactive', async () => {
    const harness = renderPersistence([restaurant({ placeId: 'a' })]);

    await act(async () => {
      appStateHandlers[0]('inactive');
    });

    expect(persistenceMock.saveCache).toHaveBeenCalledTimes(1);
  });

  it('removes the app state listener on unmount', () => {
    const harness = renderPersistence();

    expect(appStateListenerSpy).toHaveBeenCalledTimes(1);
    expect(appStateRemove).not.toHaveBeenCalled();

    harness.unmount();

    expect(appStateRemove).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending debounced write on unmount', async () => {
    jest.useFakeTimers();
    const harness = renderPersistence([restaurant({ placeId: 'a' })]);

    act(() => {
      harness.api.persistCache();
    });
    harness.unmount();

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(persistenceMock.saveCache).not.toHaveBeenCalled();
  });

  it('updates the in-memory scan cache immediately on persistMenuScan', () => {
    const scanned = restaurant({
      placeId: 'a',
      menuScanStatus: 'SUCCESS',
      menuScanTimestamp: 1000,
      gfMenu: ['GF bun'],
    });
    const harness = renderPersistence();

    act(() => {
      harness.api.persistMenuScan(scanned);
    });

    expect(harness.api.menuScanCache.current['a']).toMatchObject({
      placeId: 'a',
      gfMenu: ['GF bun'],
      menuScanStatus: 'SUCCESS',
      menuScanTimestamp: 1000,
    });
  });

  it('serializes concurrent scan writes through a read-merge-write queue', async () => {
    const first = restaurant({ placeId: 'a', menuScanStatus: 'SUCCESS', menuScanTimestamp: 1000 });
    const second = restaurant({ placeId: 'b', menuScanStatus: 'NO_MENU_CONTENT', menuScanTimestamp: 2000 });
    persistenceMock.loadMenuScanCache
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        a: {
          placeId: 'a',
          gfMenu: [],
          rawMenuText: null,
          menuScanStatus: 'SUCCESS',
          menuScanTimestamp: 1000,
        },
      });
    const harness = renderPersistence();

    act(() => {
      harness.api.persistMenuScan(first);
      harness.api.persistMenuScan(second);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(persistenceMock.loadMenuScanCache).toHaveBeenCalledTimes(2);
    expect(persistenceMock.saveMenuScanCache).toHaveBeenCalledTimes(2);

    const [firstSave] = persistenceMock.saveMenuScanCache.mock.calls[0];
    const [secondSave] = persistenceMock.saveMenuScanCache.mock.calls[1];
    expect(Object.keys(firstSave)).toEqual(['a']);
    expect(Object.keys(secondSave).sort()).toEqual(['a', 'b']);
  });

  it('ignores restaurants without a persistable scan entry', async () => {
    const harness = renderPersistence();

    act(() => {
      harness.api.persistMenuScan(restaurant({ placeId: 'a', menuScanStatus: 'NOT_STARTED' }));
    });
    act(() => {
      harness.api.persistMenuScan(restaurant({ placeId: 'b', menuScanStatus: 'FETCHING', menuScanTimestamp: 50 }));
    });
    act(() => {
      harness.api.persistMenuScan(restaurant({ placeId: 'c', menuScanStatus: 'SUCCESS', menuScanTimestamp: 0 }));
    });

    expect(harness.api.menuScanCache.current).toEqual({});
    expect(persistenceMock.loadMenuScanCache).not.toHaveBeenCalled();
  });

  it('logs cache write failures without throwing', async () => {
    persistenceMock.saveCache.mockRejectedValue(new Error('quota'));
    const harness = renderPersistence([restaurant({ placeId: 'a' })]);

    await act(async () => {
      await harness.api.flushPersistence();
    });

    expect(console.error).toHaveBeenCalledWith('Failed to flush persistence: quota');
  });

  it('logs scan cache failures and keeps the write queue alive', async () => {
    const failing = restaurant({ placeId: 'a', menuScanStatus: 'SUCCESS', menuScanTimestamp: 1000 });
    const passing = restaurant({ placeId: 'b', menuScanStatus: 'SUCCESS', menuScanTimestamp: 2000 });
    persistenceMock.loadMenuScanCache.mockRejectedValueOnce(new Error('read failed'));
    const harness = renderPersistence();

    act(() => {
      harness.api.persistMenuScan(failing);
    });
    act(() => {
      harness.api.persistMenuScan(passing);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save menu scan cache entry: read failed')
    );
    expect(persistenceMock.saveMenuScanCache).toHaveBeenCalledTimes(1);
    const [saved] = persistenceMock.saveMenuScanCache.mock.calls[0];
    expect(Object.keys(saved)).toEqual(['b']);
  });
});
