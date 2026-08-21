import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FavoriteStatus, MenuScanProgress, Restaurant, RestaurantUiState, AiChatMessage } from '../types/restaurant';
import { PersistenceService } from '../services/persistenceService';

import { MenuAnalysisResult } from '../services/menuSafety';
import { filterAndSortRestaurants } from '../util/restaurantUtils';
import { useFilters } from './FiltersContext';
import { useSettings } from './SettingsContext';
import { useRestaurantMutator } from './useRestaurantMutator';
import { ScanOrchestrator, ScanOrchestratorConfig } from '../services/scanOrchestrator';
import {
  EmptyResultsReason,
  MENU_SCAN_TTL_MS,
  getAiProxyBaseUrl,
  getCachedResultsMessage,
  getEmptyResultsMessage,
  getMapsApiKey,
  getScanProgressForRestaurants,
} from './restaurantState';
import { useRestaurantFavorites } from './useRestaurantFavorites';
import { useRestaurantPersistence } from './useRestaurantPersistence';
import { useRestaurantCacheHydration } from './useRestaurantCacheHydration';
import { useRestaurantLoader } from './useRestaurantLoader';

interface EmitFilteredStateOptions {
  emptyReason?: EmptyResultsReason;
  message?: string | null;
  status?: RestaurantUiState['status'];
}

function getCollectionReason(restaurantCount: number): EmptyResultsReason {
  return restaurantCount === 0 ? 'nearby' : 'filters';
}

interface RestaurantContextValue {
  uiState: RestaurantUiState;
  savedRestaurants: Restaurant[];
  loadNearbyRestaurants: (overrideCoords?: { latitude: number; longitude: number }) => Promise<void>;
  setFavoriteStatus: (restaurant: Restaurant, status: FavoriteStatus) => void;
  requestMenuRescan: (restaurant: Restaurant) => void;
  requestInteractiveMenuRender: (restaurant: Restaurant) => void;
  retryFailedScans: () => void;
  updateAiSession: (
    restaurant: Restaurant,
    session: { analysis?: MenuAnalysisResult | null; chat?: AiChatMessage[]; deepAnalysis?: string | null }
  ) => void;
}

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

export function useRestaurants(): RestaurantContextValue {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error('useRestaurants must be inside RestaurantProvider');
  }

  return context;
}

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const { strictCeliac } = useSettings();
  const { filters } = useFilters();

  const [uiState, setUiState] = useState<RestaurantUiState>({
    status: 'idle',
    restaurants: [],
    message: null,
    userLatitude: null,
    userLongitude: null,
    scanProgress: null,
  });

  const uiStateRef = useRef(uiState);
  useEffect(() => {
    uiStateRef.current = uiState;
  }, [uiState]);

  const rawRestaurants = useRef<Restaurant[]>([]);
  const userLat = useRef<number | null>(null);
  const userLng = useRef<number | null>(null);
  const filtersRef = useRef(filters);
  const isMounted = useRef(true);
  const {
    savedRestaurants,
    favoriteKey,
    applyFavorites,
    syncSavedRestaurants,
    loadFavorites,
    setFavoriteMapStatus,
    updateSavedRestaurant,
  } = useRestaurantFavorites(rawRestaurants);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const { menuScanCache, persistCache, flushPersistence, persistMenuScan } = useRestaurantPersistence({
    rawRestaurants,
    userLat,
    userLng,
  });

  // ── Restaurant mutation (diffing + selective persistence) ────────────────

  const updateRestaurant = useRestaurantMutator({
    rawRestaurants,
    updateSavedRestaurant,
    persistCache,
    persistMenuScan,
  });

  const getScanProgress = useCallback((): MenuScanProgress | null => {
    return getScanProgressForRestaurants(rawRestaurants.current, orchestrator.current?.getBatchKeys() ?? []);
  }, []);

  const emitFilteredState = useCallback(
    (options: EmitFilteredStateOptions = {}) => {
      const raw = rawRestaurants.current;
      const filtered = filterAndSortRestaurants(raw, filtersRef.current, strictCeliac);

      // Preserve 'loading' status if background tasks trigger a notification
      // unless we are explicitly trying to set a new status.
      const currentStatus = uiStateRef.current.status;
      const status = options.status ?? (currentStatus === 'loading' ? 'loading' : 'success');
      const emptyReason = options.emptyReason ?? getCollectionReason(raw.length);

      syncSavedRestaurants();
      setUiState({
        status,
        restaurants: filtered,
        message:
          filtered.length === 0
            ? options.message ?? getEmptyResultsMessage(emptyReason)
            : options.message ?? null,
        userLatitude: userLat.current,
        userLongitude: userLng.current,
        scanProgress: getScanProgress(),
      });
    },
    [getScanProgress, strictCeliac, syncSavedRestaurants]
  );

  const refreshCollectionState = useCallback(
    (overrides: EmitFilteredStateOptions = {}) => {
      emitFilteredState({
        emptyReason: getCollectionReason(rawRestaurants.current.length),
        message: uiStateRef.current.message,
        status: uiStateRef.current.status,
        ...overrides,
      });
    },
    [emitFilteredState]
  );

  useEffect(() => {
    if (rawRestaurants.current.length === 0 && uiStateRef.current.status === 'idle') {
      return;
    }

    refreshCollectionState();
  }, [emitFilteredState, filters, refreshCollectionState, strictCeliac]);

  const mergeCachedScanData = useCallback((freshRestaurants: Restaurant[]) => {
    const cachedByKey = new Map<string, Restaurant>();

    for (const cachedRestaurant of rawRestaurants.current) {
      const key = favoriteKey(cachedRestaurant);
      if (key) {
        cachedByKey.set(key, cachedRestaurant);
      }
    }

    return freshRestaurants.map((freshRestaurant) => {
      const key = favoriteKey(freshRestaurant);
      const cachedRestaurant = key ? cachedByKey.get(key) : null;
      const cachedScan = freshRestaurant.placeId ? menuScanCache.current[freshRestaurant.placeId] : null;
      if (!cachedRestaurant && !cachedScan) return freshRestaurant;

      // The general restaurant cache intentionally omits raw menu text. Prefer the
      // dedicated scan entry whenever it exists so fresh evidence survives a restart.
      const scanSource = cachedScan ?? cachedRestaurant;
      if (!scanSource) return freshRestaurant;

      return {
        ...freshRestaurant,
        menuUrl: cachedRestaurant?.menuUrl ?? freshRestaurant.menuUrl,
        rawMenuText: scanSource.rawMenuText,
        gfMenu: [...scanSource.gfMenu],
        menuScanStatus:
          scanSource.menuScanStatus === 'FETCHING'
            ? 'NOT_STARTED'
            : scanSource.menuScanStatus,
        menuScanTimestamp:
          scanSource.menuScanStatus === 'FETCHING'
            ? 0
            : scanSource.menuScanTimestamp,
        aiAnalysisResult: scanSource.aiAnalysisResult,
        aiChatHistory: scanSource.aiChatHistory,
        aiDeepAnalysis: scanSource.aiDeepAnalysis,
      };
    });
  }, [favoriteKey]);

  const orchestrator = useRef<ScanOrchestrator | null>(null);

  // Initialize and sync orchestrator config
  useEffect(() => {
    const config: ScanOrchestratorConfig = {
      mapsApiKey: getMapsApiKey(),
      htmlProxyBaseUrl: getAiProxyBaseUrl(),
      onRestaurantUpdate: updateRestaurant,
      onNotifyUI: () => emitFilteredState(),
      getIdentityKey: favoriteKey,
    };

    if (!orchestrator.current) {
      orchestrator.current = new ScanOrchestrator(config);
    } else {
      orchestrator.current.setConfig(config);
    }
  }, [emitFilteredState, favoriteKey, persistCache, updateRestaurant]);

  useEffect(() => {
    return () => {
      orchestrator.current?.destroy();
    };
  }, []);

  const kickOffMenuScans = useCallback(
    (restaurants: Restaurant[]) => {
      void orchestrator.current?.scanBatch(restaurants);
    },
    []
  );

  const emitCachedState = useCallback((message: string) => {
    emitFilteredState({ emptyReason: 'filters', message });
  }, [emitFilteredState]);

  const setMenuScanCache = useCallback((cache: Awaited<ReturnType<typeof PersistenceService.loadMenuScanCache>>) => {
    menuScanCache.current = cache;
  }, [menuScanCache]);

  const { loadCachedIfAvailable } = useRestaurantCacheHydration({
    rawRestaurants,
    userLat,
    userLng,
    applyFavorites,
    loadFavorites,
    setMenuScanCache,
    emitCachedState,
    startScans: kickOffMenuScans,
    isMounted: () => isMounted.current,
  });

  const { loadNearbyRestaurants } = useRestaurantLoader({
    rawRestaurants,
    userLat,
    userLng,
    filtersRef,
    uiStateRef,
    isMounted,
    setUiState,
    getScanProgress,
    emitFilteredState,
    mergeCachedScanData,
    applyFavorites,
    flushQueue: () => orchestrator.current?.flushQueue(),
    loadCachedIfAvailable,
    persistCache,
    startScans: kickOffMenuScans,
  });

  const setFavoriteStatus = useCallback(
    (restaurant: Restaurant, status: FavoriteStatus) => {
      if (!setFavoriteMapStatus(restaurant, status)) return;

      updateRestaurant(restaurant, (current) => ({
        ...current,
        favoriteStatus: status,
      }));

      refreshCollectionState();
    },
    [refreshCollectionState, setFavoriteMapStatus, updateRestaurant]
  );
  const requestMenuRescan = useCallback(
    (restaurant: Restaurant) => {
      void orchestrator.current?.requestRescan(restaurant);
    },
    []
  );

  const requestInteractiveMenuRender = useCallback(
    (restaurant: Restaurant) => {
      void orchestrator.current?.requestInteractiveMenuRender(restaurant);
    },
    []
  );

  const retryFailedScans = useCallback(() => {
    void orchestrator.current?.retryFailed(rawRestaurants.current);
  }, []);

  const updateAiSession = useCallback(
    (restaurant: Restaurant, session: { analysis?: MenuAnalysisResult | null; chat?: AiChatMessage[]; deepAnalysis?: string | null }) => {
      updateRestaurant(restaurant, (current) => ({
        ...current,
        aiAnalysisResult: session.analysis !== undefined ? session.analysis : current.aiAnalysisResult,
        aiChatHistory: session.chat !== undefined ? session.chat : current.aiChatHistory,
        aiDeepAnalysis: session.deepAnalysis !== undefined ? session.deepAnalysis : current.aiDeepAnalysis,
      }));
    },
    [updateRestaurant]
  );

  const contextValue = useMemo(
    () => ({
      uiState,
      savedRestaurants,
      loadNearbyRestaurants,
      setFavoriteStatus,
      requestMenuRescan,
      requestInteractiveMenuRender,
      retryFailedScans,
      updateAiSession,
    }),
    [uiState, savedRestaurants, loadNearbyRestaurants, setFavoriteStatus, requestMenuRescan, requestInteractiveMenuRender, retryFailedScans, updateAiSession]
  );

  return (
    <RestaurantContext.Provider value={contextValue}>
      {children}
    </RestaurantContext.Provider>
  );
}
