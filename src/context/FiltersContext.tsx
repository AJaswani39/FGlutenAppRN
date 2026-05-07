import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { RestaurantFilters } from '../types/restaurant';
import { DEFAULT_FILTERS, SettingsManager } from '../util/SettingsManager';
import { logger } from '../util/logger';

interface FiltersContextValue {
  filters: RestaurantFilters;
  setFilters: (partial: Partial<RestaurantFilters>) => void;
  resetFilters: () => void;
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

export function useFilters(): FiltersContextValue {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters must be inside FiltersProvider');
  return ctx;
}

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFiltersState] = useState<RestaurantFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const savedFilters = await SettingsManager.loadFilters();
        if (!isMounted) return;
        setFiltersState(savedFilters);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to load restaurant filters: ${message}`);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const setFilters = useCallback((partial: Partial<RestaurantFilters>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...partial };
      void SettingsManager.saveFilters(next).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to save restaurant filters: ${message}`);
      });
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    void SettingsManager.saveFilters(DEFAULT_FILTERS).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to reset restaurant filters: ${message}`);
    });
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
