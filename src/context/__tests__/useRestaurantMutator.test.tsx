import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, jest } from '@jest/globals';
import { Restaurant } from '../../types/restaurant';
import { useRestaurantMutator } from '../useRestaurantMutator';

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

function renderMutator(restaurants: Restaurant[]) {
  const rawRestaurants = { current: restaurants };
  const updateSavedRestaurant = jest.fn();
  const persistCache = jest.fn();
  const persistMenuScan = jest.fn();

  let api!: ReturnType<typeof useRestaurantMutator>;
  function Probe() {
    api = useRestaurantMutator({ rawRestaurants, updateSavedRestaurant, persistCache, persistMenuScan });
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
    updateSavedRestaurant,
    persistCache,
    persistMenuScan,
  };
}

describe('useRestaurantMutator', () => {
  it('updates a matching restaurant and reports the change', () => {
    const target = restaurant({ placeId: 'a' });
    const other = restaurant({ placeId: 'b' });
    const harness = renderMutator([target, other]);

    const updated = harness.api(target, (current) => ({ ...current, gfMenu: ['GF bun'] }));

    expect(updated).toBe(true);
    expect(harness.rawRestaurants.current[0].gfMenu).toEqual(['GF bun']);
    expect(harness.rawRestaurants.current[1]).toBe(other);
    expect(harness.updateSavedRestaurant).toHaveBeenCalledWith(target, expect.any(Function));
  });

  it('matches by fallback identity when place ids are absent', () => {
    const target = restaurant({ placeId: '', name: 'Rice House', address: '7 Main' });
    const harness = renderMutator([target]);

    const updated = harness.api(target, (current) => ({ ...current, rating: 4.5 }));

    expect(updated).toBe(true);
    expect(harness.rawRestaurants.current[0].rating).toBe(4.5);
  });

  it('reports no change when nothing matches', () => {
    const harness = renderMutator([restaurant({ placeId: 'a' })]);

    const updated = harness.api(restaurant({ placeId: 'zzz' }), (current) => current);

    expect(updated).toBe(false);
    expect(harness.persistCache).not.toHaveBeenCalled();
    expect(harness.persistMenuScan).not.toHaveBeenCalled();
  });

  it('reports no change when the updater is a no-op', () => {
    const target = restaurant({ placeId: 'a' });
    const harness = renderMutator([target]);

    const updated = harness.api(target, (current) => current);

    expect(updated).toBe(false);
    expect(harness.persistCache).not.toHaveBeenCalled();
    expect(harness.updateSavedRestaurant).toHaveBeenCalled();
  });

  it('persists the cache when a scan reaches a terminal status', () => {
    const target = restaurant({ placeId: 'a', menuScanStatus: 'FETCHING' });
    const harness = renderMutator([target]);

    harness.api(target, (current) => ({ ...current, menuScanStatus: 'SUCCESS' }));

    expect(harness.persistCache).toHaveBeenCalledTimes(1);
    expect(harness.persistMenuScan).toHaveBeenCalledTimes(1);
    expect(harness.persistMenuScan).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: 'a', menuScanStatus: 'SUCCESS' })
    );
  });

  it('does not persist anything for an in-flight status transition', () => {
    const target = restaurant({ placeId: 'a' });
    const harness = renderMutator([target]);

    harness.api(target, (current) => ({ ...current, menuScanStatus: 'FETCHING' }));

    expect(harness.persistCache).not.toHaveBeenCalled();
    expect(harness.persistMenuScan).not.toHaveBeenCalled();
  });

  it('persists the cache when a favorite changes but not the scan cache', () => {
    const target = restaurant({ placeId: 'a' });
    const harness = renderMutator([target]);

    harness.api(target, (current) => ({ ...current, favoriteStatus: 'safe' }));

    expect(harness.persistCache).toHaveBeenCalledTimes(1);
    expect(harness.persistMenuScan).not.toHaveBeenCalled();
  });

  it('persists both stores when ai analysis changes', () => {
    const target = restaurant({ placeId: 'a', menuScanStatus: 'SUCCESS', menuScanTimestamp: 10 });
    const harness = renderMutator([target]);
    const analysis = {
      overallSafety: 'safe' as const,
      score: 90,
      glutenFreeItems: ['GF pizza'],
      warnings: [],
      crossContamRisk: 'low',
      summary: 'Safe',
    };

    harness.api(target, (current) => ({ ...current, aiAnalysisResult: analysis }));

    expect(harness.persistCache).toHaveBeenCalledTimes(1);
    expect(harness.persistMenuScan).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: 'a', aiAnalysisResult: analysis })
    );
  });

  it('persists the scan cache when chat history changes', () => {
    const target = restaurant({ placeId: 'a', menuScanStatus: 'SUCCESS', menuScanTimestamp: 10 });
    const harness = renderMutator([target]);

    harness.api(target, (current) => ({
      ...current,
      aiChatHistory: [{ role: 'user', text: 'is the bun GF?', timestamp: 1 }],
    }));

    expect(harness.persistMenuScan).toHaveBeenCalledTimes(1);
  });
});
