import { useCallback, useEffect, MutableRefObject } from 'react';
import { Restaurant, RestaurantFilters, RestaurantUiState } from '../types/restaurant';
import {
  EmptyResultsReason,
  getCollectionReason,
  resolveFilteredRestaurantUiState,
} from './restaurantState';

interface Options {
  rawRestaurants: MutableRefObject<Restaurant[]>;
  filters: RestaurantFilters;
  strictCeliac: boolean;
  userLat: MutableRefObject<number | null>;
  userLng: MutableRefObject<number | null>;
  uiStateRef: MutableRefObject<RestaurantUiState>;
  getScanProgress: () => RestaurantUiState['scanProgress'];
  syncSavedRestaurants: () => void;
  setUiState: React.Dispatch<React.SetStateAction<RestaurantUiState>>;
}

export function useRestaurantCollectionState({
  rawRestaurants,
  filters,
  strictCeliac,
  userLat,
  userLng,
  uiStateRef,
  getScanProgress,
  syncSavedRestaurants,
  setUiState,
}: Options) {
  const emitFilteredState = useCallback(
    (options: { emptyReason?: EmptyResultsReason; message?: string | null; status?: RestaurantUiState['status'] } = {}) => {
      syncSavedRestaurants();
      setUiState(
        resolveFilteredRestaurantUiState({
          restaurants: rawRestaurants.current,
          filters,
          strictCeliac,
          currentStatus: uiStateRef.current.status,
          emptyReason: options.emptyReason ?? getCollectionReason(rawRestaurants.current.length),
          message: options.message,
          status: options.status,
          userLatitude: userLat.current,
          userLongitude: userLng.current,
          scanProgress: getScanProgress(),
        })
      );
    },
    [filters, getScanProgress, rawRestaurants, setUiState, strictCeliac, syncSavedRestaurants, uiStateRef, userLat, userLng]
  );

  const refreshCollectionState = useCallback(
    (overrides: { emptyReason?: EmptyResultsReason; message?: string | null; status?: RestaurantUiState['status'] } = {}) => {
      emitFilteredState({
        emptyReason: getCollectionReason(rawRestaurants.current.length),
        message: uiStateRef.current.message,
        status: uiStateRef.current.status,
        ...overrides,
      });
    },
    [emitFilteredState, rawRestaurants, uiStateRef]
  );

  useEffect(() => {
    if (rawRestaurants.current.length === 0 && uiStateRef.current.status === 'idle') {
      return;
    }

    refreshCollectionState();
  }, [filters, refreshCollectionState, strictCeliac, uiStateRef]);

  return { emitFilteredState, refreshCollectionState };
}
