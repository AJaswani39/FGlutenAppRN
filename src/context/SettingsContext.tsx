import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { PersistenceService } from '../services/persistenceService';
import { logger } from '../util/logger';

interface SettingsContextValue {
  useMiles: boolean;
  strictCeliac: boolean;
  setUseMiles: (val: boolean) => void;
  setStrictCeliac: (val: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be inside SettingsProvider');
  return ctx;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [useMiles, setUseMilesState] = useState(false);
  const [strictCeliac, setStrictCeliacState] = useState(false);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const [savedUseMiles, savedStrictCeliac] = await Promise.all([
          PersistenceService.getSetting('use_miles'),
          PersistenceService.getSetting('strict_celiac'),
        ]);

        if (!isMounted) return;
        setUseMilesState(savedUseMiles);
        setStrictCeliacState(savedStrictCeliac);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to load settings: ${message}`);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const setUseMiles = useCallback((val: boolean) => {
    setUseMilesState(val);
    void PersistenceService.setSetting('use_miles', val).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to save distance unit setting: ${message}`);
    });
  }, []);

  const setStrictCeliac = useCallback((val: boolean) => {
    setStrictCeliacState(val);
    void PersistenceService.setSetting('strict_celiac', val).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to save strict celiac setting: ${message}`);
    });
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        useMiles,
        strictCeliac,
        setUseMiles,
        setStrictCeliac,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
