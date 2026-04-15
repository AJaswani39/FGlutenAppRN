import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { RestaurantFilters, SortMode } from '../types/restaurant';
import { SettingsManager } from '../util/SettingsManager';

interface FiltersContextValue {
  filters: RestaurantFilters;
  setFilters: (partial: Partial<RestaurantFilters>) => void;
  resetFilters: () => void;
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

const DEFAULT_FILTERS: RestaurantFilters = {
  gfOnly: false,
  openNowOnly: false,
  sortMode: 'distance',
  maxDistanceMeters: 0,
  minRating: 0,
  searchQuery: '',
};

export function useFilters(): FiltersContextValue {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters must be inside FiltersProvider');
  return ctx;
}

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFiltersState] = useState<RestaurantFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    (async () => {
      const savedFilters = await SettingsManager.loadFilters();
      if (savedFilters) {
        setFiltersState(savedFilters);
      }
    })();
  }, []);

  const setFilters = useCallback((partial: Partial<RestaurantFilters>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...partial };
      SettingsManager.saveFilters(next);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    SettingsManager.saveFilters(DEFAULT_FILTERS);
  }, []);

  return (
    <FiltersContext.Provider
      value={{
        filters,
        setFilters,
        resetFilters,
      }}
    >
      {children}
    </FiltersContext.Provider>
  );
}