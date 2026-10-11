import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, jest } from '@jest/globals';
import { Restaurant, RestaurantFilters, RestaurantUiState } from '../../types/restaurant';
import { useRestaurantCollectionState } from '../useRestaurantCollectionState';

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

function filters(overrides: Partial<RestaurantFilters> = {}): RestaurantFilters {
  return {
    gfOnly: false,
    gfEvidenceOnly: false,
    openNowOnly: false,
    sortMode: 'name',
    maxDistanceMeters: 0,
    minRating: 0,
    searchQuery: '',
    ...overrides,
  };
}

function renderCollectionState(options: {
  restaurants?: Restaurant[];
  initialFilters?: RestaurantFilters;
  strictCeliac?: boolean;
  uiState?: Partial<RestaurantUiState>;
}) {
  const { restaurants = [], initialFilters = filters(), strictCeliac = false, uiState } = options;
  const rawRestaurants = { current: restaurants };
  const userLat = { current: 40 };
  const userLng = { current: -74 };
  const state = {
    status: 'success',
    restaurants,
    message: null,
    userLatitude: 40,
    userLongitude: -74,
    scanProgress: null,
    ...uiState,
  } as RestaurantUiState;
  const uiStateRef = { current: state };
  const setUiState = jest.fn((update: React.SetStateAction<RestaurantUiState>) => {
    uiStateRef.current =
      typeof update === 'function' ? update(uiStateRef.current) : update;
  });
  const syncSavedRestaurants = jest.fn();
  const getScanProgress = jest.fn(() => null);

  let filtersValue = initialFilters;
  let api!: ReturnType<typeof useRestaurantCollectionState>;

  function Probe() {
    api = useRestaurantCollectionState({
      rawRestaurants,
      filters: filtersValue,
      strictCeliac,
      userLat,
      userLng,
      uiStateRef,
      getScanProgress,
      syncSavedRestaurants,
      setUiState,
    });
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
    setUiState,
    syncSavedRestaurants,
    latestState: () => uiStateRef.current,
    rerenderWithFilters: (next: RestaurantFilters) => {
      filtersValue = next;
      act(() => {
        renderer.update(<Probe />);
      });
    },
  };
}

describe('useRestaurantCollectionState', () => {
  it('emits the filtered and sorted collection', () => {
    const restaurants = [
      restaurant({ placeId: 'a', name: 'Zeta' }),
      restaurant({ placeId: 'b', name: 'Alpha' }),
    ];
    const harness = renderCollectionState({ restaurants, initialFilters: filters({ searchQuery: 'a' }) });

    const callsBeforeRefresh = harness.setUiState.mock.calls.length;
    harness.api.refreshCollectionState();

    expect(harness.syncSavedRestaurants).toHaveBeenCalled();
    expect(harness.setUiState).toHaveBeenCalledTimes(callsBeforeRefresh + 1);
    const state = harness.setUiState.mock.calls.at(-1)![0] as RestaurantUiState;
    expect(state.restaurants.map((r) => r.name)).toEqual(['Alpha', 'Zeta']);
    expect(state.userLatitude).toBe(40);
    expect(state.userLongitude).toBe(-74);
    expect(state.message).toBeNull();
  });

  it('defaults the empty reason from the raw restaurant count', () => {
    const withResults = renderCollectionState({
      restaurants: [restaurant()],
      initialFilters: filters({ searchQuery: 'zzz' }),
    });
    withResults.api.emitFilteredState();
    const filteredOut = withResults.setUiState.mock.calls.at(-1)![0] as RestaurantUiState;
    expect(filteredOut.message).toBe('No restaurants match your current filters.');

    const withoutResults = renderCollectionState({ restaurants: [] });
    withoutResults.api.emitFilteredState();
    const empty = withoutResults.setUiState.mock.calls.at(-1)![0] as RestaurantUiState;
    expect(empty.message).toBe(
      'No nearby restaurants found. Try expanding your distance or refreshing your search.'
    );
  });

  it('honors an explicit empty reason override', () => {
    const harness = renderCollectionState({
      restaurants: [],
      initialFilters: filters(),
    });

    harness.api.emitFilteredState({ emptyReason: 'filters' });

    const state = harness.setUiState.mock.calls.at(-1)![0] as RestaurantUiState;
    expect(state.message).toBe('No restaurants match your current filters.');
  });

  it('preserves the current message and status in refreshCollectionState', () => {
    const harness = renderCollectionState({
      restaurants: [restaurant()],
      uiState: { status: 'loading', message: 'Refreshing nearby restaurants…' },
    });

    harness.api.refreshCollectionState();

    const state = harness.setUiState.mock.calls.at(-1)![0] as RestaurantUiState;
    expect(state.status).toBe('loading');
    expect(state.message).toBe('Refreshing nearby restaurants…');
  });

  it('lets overrides win over the current ui state', () => {
    const harness = renderCollectionState({
      restaurants: [restaurant()],
      uiState: { status: 'loading', message: 'Old message' },
    });

    harness.api.refreshCollectionState({ status: 'success', message: 'New message' });

    const state = harness.setUiState.mock.calls.at(-1)![0] as RestaurantUiState;
    expect(state.status).toBe('success');
    expect(state.message).toBe('New message');
  });

  it('requires scanned GF evidence in strict celiac mode', () => {
    const restaurants = [
      restaurant({ placeId: 'a', hasGFMenu: true }),
      restaurant({ placeId: 'b', gfMenu: ['GF crust'] }),
    ];
    const harness = renderCollectionState({ restaurants, strictCeliac: true });

    harness.api.emitFilteredState();

    const state = harness.setUiState.mock.calls.at(-1)![0] as RestaurantUiState;
    expect(state.restaurants.map((r) => r.placeId)).toEqual(['b']);
  });

  it('skips re-emitting while idle with no restaurants', () => {
    const harness = renderCollectionState({ restaurants: [], uiState: { status: 'idle' } });

    expect(harness.setUiState).not.toHaveBeenCalled();
  });

  it('re-emits when the filters change', () => {
    const restaurants = [restaurant({ placeId: 'a', hasGFMenu: true })];
    const harness = renderCollectionState({ restaurants });

    const initialCalls = harness.setUiState.mock.calls.length;
    expect(initialCalls).toBe(1);

    harness.rerenderWithFilters(filters({ gfOnly: true }));

    expect(harness.setUiState.mock.calls.length).toBeGreaterThan(initialCalls);
    const latest = harness.setUiState.mock.calls.at(-1)![0] as RestaurantUiState;
    expect(latest.restaurants).toHaveLength(1);
  });
});
