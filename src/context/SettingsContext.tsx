import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SettingsManager } from '../util/SettingsManager';

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
    (async () => {
      setUseMilesState(await SettingsManager.useMiles());
      setStrictCeliacState(await SettingsManager.isStrictCeliac());
    })();
  }, []);

  const setUseMiles = useCallback((val: boolean) => {
    setUseMilesState(val);
    SettingsManager.setUseMiles(val);
  }, []);

  const setStrictCeliac = useCallback((val: boolean) => {
    setStrictCeliacState(val);
    SettingsManager.setStrictCeliac(val);
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