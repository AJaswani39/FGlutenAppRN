import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [useMiles, setUseMilesState] = useState(false);
  const [strictCeliac, setStrictCeliacState] = useState(false);
  const [dairyFree, setDairyFreeState] = useState(false);
  const [nutFree, setNutFreeState] = useState(false);
  const [soyFree, setSoyFreeState] = useState(false);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const [
          savedUseMiles,
          savedStrictCeliac,
          savedDairy,
          savedNut,
          savedSoy,
        ] = await Promise.all([
          PersistenceService.getSetting('use_miles'),
          PersistenceService.getSetting('strict_celiac'),
          PersistenceService.getSetting('dairy_free'),
          PersistenceService.getSetting('nut_free'),
          PersistenceService.getSetting('soy_free'),
        ]);

        if (!isMounted) return;
        setUseMilesState(savedUseMiles);
        setStrictCeliacState(savedStrictCeliac);
        setDairyFreeState(savedDairy);
        setNutFreeState(savedNut);
        setSoyFreeState(savedSoy);
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

  const setDairyFree = useCallback((val: boolean) => {
    setDairyFreeState(val);
    void PersistenceService.setSetting('dairy_free', val).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to save dairy-free setting: ${message}`);
    });
  }, []);

  const setNutFree = useCallback((val: boolean) => {
    setNutFreeState(val);
    void PersistenceService.setSetting('nut_free', val).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to save nut-free setting: ${message}`);
    });
  }, []);

  const setSoyFree = useCallback((val: boolean) => {
    setSoyFreeState(val);
    void PersistenceService.setSetting('soy_free', val).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to save soy-free setting: ${message}`);
    });
  }, []);

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
