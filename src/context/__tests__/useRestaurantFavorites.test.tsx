import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FavoriteMap, Restaurant } from '../../types/restaurant';
import { useRestaurantFavorites } from '../useRestaurantFavorites';
import { PersistenceService } from '../../services/persistenceService';

jest.mock('../../services/persistenceService', () => ({
  PersistenceService: {
    loadFavorites: jest.fn(),
    loadSavedRestaurantsDb: jest.fn(),
    saveFavorites: jest.fn(),
    saveSavedRestaurantsDb: jest.fn(),
  },
}));

const persistenceMock = jest.mocked(PersistenceService);

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

/**
 * The hook object is memoized on `savedRestaurants`, so tests must read
 * `harness.api` fresh after every state update.
 */
function renderFavorites(initial: Restaurant[] = []) {
  const rawRestaurants = { current: initial };

  let api!: ReturnType<typeof useRestaurantFavorites>;
  function Probe() {
    api = useRestaurantFavorites(rawRestaurants);
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
  };
}

describe('useRestaurantFavorites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    persistenceMock.loadFavorites.mockResolvedValue({});
    persistenceMock.loadSavedRestaurantsDb.mockResolvedValue([]);
    persistenceMock.saveFavorites.mockResolvedValue(undefined);
    persistenceMock.saveSavedRestaurantsDb.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes the identity key helper', () => {
    const harness = renderFavorites();

    expect(harness.api.favoriteKey(restaurant({ placeId: 'abc' }))).toBe('pid:abc');
  });

  it('applies the loaded favorite map to a list of restaurants', async () => {
    persistenceMock.loadFavorites.mockResolvedValue({ 'pid:a': 'safe' });
    const harness = renderFavorites();

    const loaded = await harness.api.loadFavorites();

    expect(loaded).toEqual({ 'pid:a': 'safe' });
    const applied = harness.api.applyFavorites([restaurant({ placeId: 'a' })]);
    expect(applied[0].favoriteStatus).toBe('safe');
  });

  it('loads favorites and the historical saved db in parallel', async () => {
    const historical = [restaurant({ placeId: 'old', name: 'Old Place' })];
    persistenceMock.loadSavedRestaurantsDb.mockResolvedValue(historical);
    const harness = renderFavorites();

    await harness.api.loadFavorites();
    act(() => {
      harness.api.syncSavedRestaurants();
    });

    expect(persistenceMock.loadFavorites).toHaveBeenCalledTimes(1);
    expect(persistenceMock.loadSavedRestaurantsDb).toHaveBeenCalledTimes(1);
    // The historical entry has no favorite in the map, so it is not surfaced.
    expect(harness.api.savedRestaurants).toEqual([]);
  });

  it('sets a favorite, records it in the historical db, and persists both stores', () => {
    const harness = renderFavorites();
    const target = restaurant({ placeId: 'a' });

    const ok = harness.api.setFavoriteMapStatus(target, 'safe');

    expect(ok).toBe(true);
    expect(persistenceMock.saveFavorites).toHaveBeenCalledWith({ 'pid:a': 'safe' });
    expect(persistenceMock.saveSavedRestaurantsDb).toHaveBeenCalledWith([
      { ...target, favoriteStatus: 'safe' },
    ]);
  });

  it('updates an existing historical entry instead of duplicating it', async () => {
    const existing = restaurant({ placeId: 'a', name: 'Old Name', favoriteStatus: 'try' });
    persistenceMock.loadSavedRestaurantsDb.mockResolvedValue([existing]);
    const harness = renderFavorites();
    await harness.api.loadFavorites();

    const renamed = restaurant({ placeId: 'a', name: 'New Name', favoriteStatus: 'try' });
    harness.api.setFavoriteMapStatus(renamed, 'try');

    expect(persistenceMock.saveSavedRestaurantsDb).toHaveBeenLastCalledWith([
      { ...renamed, favoriteStatus: 'try' },
    ]);
  });

  it('clears a favorite from both the map and the historical db', async () => {
    persistenceMock.loadFavorites.mockResolvedValue({ 'pid:a': 'safe' });
    const target = restaurant({ placeId: 'a', favoriteStatus: 'safe' });
    persistenceMock.loadSavedRestaurantsDb.mockResolvedValue([target]);
    const harness = renderFavorites();
    await harness.api.loadFavorites();

    const ok = harness.api.setFavoriteMapStatus(target, null);

    expect(ok).toBe(true);
    expect(persistenceMock.saveFavorites).toHaveBeenLastCalledWith({});
    expect(persistenceMock.saveSavedRestaurantsDb).toHaveBeenLastCalledWith([]);
  });

  it('refuses to favorite a restaurant without an identity key', () => {
    const harness = renderFavorites();

    const ok = harness.api.setFavoriteMapStatus(restaurant({ placeId: '', name: '', address: '' }), 'safe');

    expect(ok).toBe(false);
    expect(persistenceMock.saveFavorites).not.toHaveBeenCalled();
    expect(persistenceMock.saveSavedRestaurantsDb).not.toHaveBeenCalled();
  });

  it('logs but does not throw when persistence fails', async () => {
    persistenceMock.saveFavorites.mockRejectedValue(new Error('disk full'));
    persistenceMock.saveSavedRestaurantsDb.mockRejectedValue(new Error('disk full'));
    const harness = renderFavorites();

    expect(() => harness.api.setFavoriteMapStatus(restaurant({ placeId: 'a' }), 'safe')).not.toThrow();
    await act(async () => {
      await Promise.resolve();
    });

    expect(console.error).toHaveBeenCalledWith('Failed to save favorite status: disk full');
    expect(console.error).toHaveBeenCalledWith('Failed to save historical DB: disk full');
  });

  it('applies updaters to historical db entries and resyncs saved state', async () => {
    const existing = restaurant({ placeId: 'a', favoriteStatus: 'safe', gfMenu: [] });
    persistenceMock.loadSavedRestaurantsDb.mockResolvedValue([existing]);
    persistenceMock.loadFavorites.mockResolvedValue({ 'pid:a': 'safe' });
    const harness = renderFavorites();
    await harness.api.loadFavorites();

    act(() => {
      harness.api.updateSavedRestaurant(existing, (current) => ({
        ...current,
        gfMenu: ['GF bun'],
      }));
    });

    expect(persistenceMock.saveSavedRestaurantsDb).toHaveBeenCalledWith([
      expect.objectContaining({ placeId: 'a', gfMenu: ['GF bun'] }),
    ]);
    expect(harness.api.savedRestaurants).toHaveLength(1);
    expect(harness.api.savedRestaurants[0].gfMenu).toEqual(['GF bun']);
  });

  it('skips the db write when the updater returns the same object', async () => {
    const existing = restaurant({ placeId: 'a', favoriteStatus: 'safe' });
    persistenceMock.loadSavedRestaurantsDb.mockResolvedValue([existing]);
    persistenceMock.loadFavorites.mockResolvedValue({ 'pid:a': 'safe' });
    const harness = renderFavorites();
    await harness.api.loadFavorites();

    harness.api.updateSavedRestaurant(existing, (current) => current);

    expect(persistenceMock.saveSavedRestaurantsDb).not.toHaveBeenCalled();
  });

  it('ignores updates for restaurants missing from the historical db', async () => {
    persistenceMock.loadSavedRestaurantsDb.mockResolvedValue([]);
    const harness = renderFavorites();

    harness.api.updateSavedRestaurant(restaurant({ placeId: 'ghost' }), (current) => ({
      ...current,
      gfMenu: ['x'],
    }));

    expect(persistenceMock.saveSavedRestaurantsDb).not.toHaveBeenCalled();
  });

  it('merges live favorites with historical entries when syncing', async () => {
    const historical = restaurant({ placeId: 'old', name: 'Old Place', favoriteStatus: 'avoid' });
    persistenceMock.loadSavedRestaurantsDb.mockResolvedValue([historical]);
    persistenceMock.loadFavorites.mockResolvedValue({ 'pid:old': 'avoid' });
    const live = restaurant({ placeId: 'live', name: 'Live Place', favoriteStatus: 'safe' });
    const harness = renderFavorites([live]);

    await harness.api.loadFavorites();
    act(() => {
      harness.api.syncSavedRestaurants();
    });

    expect(harness.api.savedRestaurants.map((r) => r.placeId)).toEqual(['live', 'old']);
  });
});
