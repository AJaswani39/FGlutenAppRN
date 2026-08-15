import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PersistenceService } from '../services/persistenceService';
import { logger } from '../util/logger';

interface SettingsContextValue {
  useMiles: boolean;
  strictCeliac: boolean;
  dairyFree: boolean;
  nutFree: boolean;
  soyFree: boolean;
  setUseMiles: (val: boolean) => void;
  setStrictCeliac: (val: boolean) => void;
  setDairyFree: (val: boolean) => void;
  setNutFree: (val: boolean) => void;
  setSoyFree: (val: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be inside SettingsProvider');
  return ctx;
}

/**
 * Manages a single boolean preference: loads it from AsyncStorage once on
 * mount and persists every write. Replaces the per-setting `useState` +
 * hand-rolled `useCallback` boilerplate that used to be duplicated five times.
 */
function useBooleanSetting(
  key: string,
  fallback = false
): [boolean, (val: boolean) => void] {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const saved = await PersistenceService.getSetting(key);
        if (!cancelled) setValue(saved);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to load setting '${key}': ${message}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key]);

  const set = useCallback(
    (val: boolean) => {
      setValue(val);
      void PersistenceService.setSetting(key, val).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to save setting '${key}': ${message}`);
      });
    },
    [key]
  );

  return useMemo(() => [value, set] as const, [value, set]);
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [useMiles, setUseMiles] = useBooleanSetting('use_miles');
  const [strictCeliac, setStrictCeliac] = useBooleanSetting('strict_celiac');
  const [dairyFree, setDairyFree] = useBooleanSetting('dairy_free');
  const [nutFree, setNutFree] = useBooleanSetting('nut_free');
  const [soyFree, setSoyFree] = useBooleanSetting('soy_free');

  return (
    <SettingsContext.Provider
      value={{
        useMiles,
        strictCeliac,
        dairyFree,
        nutFree,
        soyFree,
        setUseMiles,
        setStrictCeliac,
        setDairyFree,
        setNutFree,
        setSoyFree,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
