import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import {
  Restaurant,
  RestaurantFilters,
  RestaurantUiState,
  FavoriteStatus,
} from '../types/restaurant';
import {
  fetchNearbyRestaurants,
  fetchWebsiteForPlace,
  fetchHtml,
  extractGfEvidence,
  extractRawMenuText,
  findMenuLink,
  distanceBetween,
} from '../data/placesRepository';
import { SettingsManager } from '../util/SettingsManager';
import { useSettings } from './SettingsContext';
import { useFilters } from './FiltersContext';

const MENU_SCAN_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const MAX_SCANS_PER_BATCH = 5;

// Get API key from app.json extra
const MAPS_API_KEY =
  (Constants.expoConfig?.extra as any)?.MAPS_API_KEY ?? '';

// ─── Context types ───────────────────────────────────────────────────────────

interface RestaurantContextValue {
  uiState: RestaurantUiState;
  loadNearbyRestaurants: () => Promise<void>;
  setFavoriteStatus: (restaurant: Restaurant, status: FavoriteStatus) => void;
  requestMenuRescan: (restaurant: Restaurant) => void;
}

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

export function useRestaurants(): RestaurantContextValue {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error('useRestaurants must be inside RestaurantProvider');
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const { strictCeliac } = useSettings();
  const { filters } = useFilters();

  const [uiState, setUiState] = useState<RestaurantUiState>({
    status: 'idle',
    restaurants: [],
    message: null,
    userLatitude: null,
    userLongitude: null,
  });

  // Raw restaurant data (before filtering)
  const rawRestaurants = useRef<Restaurant[]>([]);
  const userLat = useRef<number | null>(null);
  const userLng = useRef<number | null>(null);
  const favoriteMap = useRef<Record<string, string>>({});
  const cacheAttempted = useRef(false);
  const filtersRef = useRef(filters);

  // Keep filtersRef current
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // ─── Init: load persisted data ──────────────────────────────
  useEffect(() => {
    (async () => {
      favoriteMap.current = await SettingsManager.loadFavorites();
    })();
  }, []);

  // ─── Filter & emit state ─────────────────────────────────────
  const emitFilteredState = useCallback(
    (message?: string | null) => {
      const f = filtersRef.current;
      const raw = rawRestaurants.current;
      if (raw.length === 0 || userLat.current == null || userLng.current == null)
        return;

      let filtered = raw.filter((r) => {
        let fitsGF = !f.gfOnly || r.hasGFMenu || r.gfMenu.length > 0;

        if (strictCeliac) {
          const hasEvidence = r.gfMenu.length > 0;
          const isHighRatedGF = (r.hasGFMenu || r.gfMenu.length > 0) && (r.rating ?? 0) >= 4.0;
          fitsGF = hasEvidence || isHighRatedGF;
        }

        const q = f.searchQuery.toLowerCase();
        const passesSearch =
          !q ||
          r.name.toLowerCase().includes(q) ||
          r.gfMenu.some((item) => item.toLowerCase().includes(q));

        if (!fitsGF || !passesSearch) return false;
        if (f.openNowOnly && r.openNow !== true) return false;
        if (f.minRating > 0 && (r.rating ?? 0) < f.minRating) return false;
        if (f.maxDistanceMeters > 0 && r.distanceMeters > f.maxDistanceMeters) return false;
        return true;
      });

      if (f.sortMode === 'distance') {
        filtered = filtered.sort((a, b) => a.distanceMeters - b.distanceMeters);
      } else {
        filtered = filtered.sort((a, b) => a.name.localeCompare(b.name));
      }

      if (filtered.length === 0) {
        setUiState({
          status: 'error',
          restaurants: [],
          message: 'No restaurants found. Try adjusting your filters.',
          userLatitude: userLat.current,
          userLongitude: userLng.current,
        });
        return;
      }

      setUiState({
        status: 'success',
        restaurants: filtered,
        message: message ?? null,
        userLatitude: userLat.current,
        userLongitude: userLng.current,
      });
    },
    [strictCeliac]
  );

  // ─── Menu scanning ───────────────────────────────────────────
  const scanMenu = useCallback(
    async (restaurant: Restaurant) => {
      if (!MAPS_API_KEY) return;

      const idx = rawRestaurants.current.findIndex((r) => r.placeId === restaurant.placeId);
      if (idx >= 0) {
        rawRestaurants.current[idx] = { ...rawRestaurants.current[idx], menuScanStatus: 'FETCHING' };
      }
      emitFilteredState();

      const website = await fetchWebsiteForPlace(restaurant.placeId, MAPS_API_KEY);
      if (!website) {
        if (idx >= 0) {
          rawRestaurants.current[idx] = {
            ...rawRestaurants.current[idx],
            menuScanStatus: 'NO_WEBSITE',
            menuScanTimestamp: Date.now(),
          };
        }
        emitFilteredState();
        return;
      }

      let menuUrl = website;
      let html = await fetchHtml(website);
      if (html) {
        const menuLink = findMenuLink(html, website);
        if (menuLink && menuLink !== website) {
          menuUrl = menuLink;
          const menuHtml = await fetchHtml(menuLink);
          if (menuHtml) html = menuHtml;
        }
      }

      const gfMenu = html ? extractGfEvidence(html) : [];
      const rawMenuText = html ? extractRawMenuText(html) : null;

      if (idx >= 0) {
        rawRestaurants.current[idx] = {
          ...rawRestaurants.current[idx],
          menuUrl,
          gfMenu,
          rawMenuText,
          menuScanTimestamp: Date.now(),
          menuScanStatus: html ? 'SUCCESS' : 'FAILED',
        };
      }

      emitFilteredState();
      await SettingsManager.saveCache({
        restaurants: rawRestaurants.current,
        lat: userLat.current,
        lng: userLng.current,
        timestamp: Date.now(),
      });
    },
    [emitFilteredState]
  );

  const kickOffMenuScans = useCallback(
    (restaurants: Restaurant[]) => {
      const now = Date.now();
      let launched = 0;
      for (const r of restaurants) {
        if (!r.placeId || r.menuScanStatus === 'FETCHING') continue;
        const age =
          r.menuScanTimestamp > 0 ? now - r.menuScanTimestamp : Infinity;
        if (age < MENU_SCAN_TTL_MS && r.menuScanStatus !== 'NOT_STARTED') continue;
        if (launched >= MAX_SCANS_PER_BATCH) break;
        launched++;
        scanMenu(r);
      }
    },
    [scanMenu]
  );

  // ─── Apply favorites ─────────────────────────────────────────
  const favoriteKey = useCallback((r: Restaurant): string | null => {
    if (r.placeId) return `pid:${r.placeId}`;
    if (r.name && r.address) return `na:${r.name}|${r.address}`;
    return null;
  }, []);

  const applyFavorites = useCallback((restaurants: Restaurant[]) => {
    return restaurants.map((r) => {
      const key = favoriteKey(r);
      if (key && favoriteMap.current[key]) {
        return { ...r, favoriteStatus: favoriteMap.current[key] as FavoriteStatus };
      }
      return r;
    });
  }, [favoriteKey]);

  // ─── Load cached data ────────────────────────────────────────
  const loadCachedIfAvailable = useCallback(async () => {
    if (cacheAttempted.current) return;
    cacheAttempted.current = true;
    const cached = await SettingsManager.loadCache();
    if (!cached?.restaurants?.length) return;

    const withFavorites = applyFavorites(cached.restaurants);
    rawRestaurants.current = withFavorites;
    userLat.current = cached.lat;
    userLng.current = cached.lng;

    let msg = 'Showing cached results';
    if (cached.timestamp) {
      const d = new Date(cached.timestamp);
      msg += ` (${d.toLocaleString()})`;
    }
    emitFilteredState(msg);
    kickOffMenuScans(cached.restaurants);
  }, [emitFilteredState, kickOffMenuScans, applyFavorites]);

  // ─── Main load ───────────────────────────────────────────────
  const loadNearbyRestaurants = useCallback(async () => {
    if (!MAPS_API_KEY) {
      setUiState({
        status: 'error',
        restaurants: [],
        message: 'Maps API key is missing. Please configure MAPS_API_KEY.',
        userLatitude: null,
        userLongitude: null,
      });
      return;
    }

    await loadCachedIfAvailable();

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setUiState({
        status: 'permission_required',
        restaurants: [],
        message: 'Location permission is needed to find nearby restaurants.',
        userLatitude: null,
        userLongitude: null,
      });
      return;
    }

    setUiState((prev) => ({
      ...prev,
      status: 'loading',
      message: 'Finding restaurants near you…',
    }));

    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;

      const restaurants = await fetchNearbyRestaurants(latitude, longitude, MAPS_API_KEY);

      // Apply distances and favorites
      const restaurantsWithFavorites = applyFavorites(restaurants);
      const restaurantsWithDistance = restaurantsWithFavorites.map((r) => ({
        ...r,
        distanceMeters: distanceBetween(latitude, longitude, r.latitude, r.longitude),
      }));

      rawRestaurants.current = restaurantsWithDistance;
      userLat.current = latitude;
      userLng.current = longitude;

      emitFilteredState();

      await SettingsManager.saveCache({
        restaurants: restaurantsWithDistance,
        lat: latitude,
        lng: longitude,
        timestamp: Date.now(),
      });

      kickOffMenuScans(restaurantsWithDistance);
    } catch (err: any) {
      const errmsg = `Could not load restaurants: ${err?.message ?? 'Unknown error'}`;
      if (rawRestaurants.current.length > 0 && userLat.current != null) {
        emitFilteredState('Showing cached results — ' + errmsg);
      } else {
        setUiState({
          status: 'error',
          restaurants: [],
          message: errmsg,
          userLatitude: null,
          userLongitude: null,
        });
      }
    }
  }, [loadCachedIfAvailable, emitFilteredState, kickOffMenuScans, applyFavorites]);

  // ─── Favorites ───────────────────────────────────────────────
  const setFavoriteStatus = useCallback(
    (restaurant: Restaurant, status: FavoriteStatus) => {
      const key = favoriteKey(restaurant);
      if (!key) return;
      if (!status) {
        delete favoriteMap.current[key];
      } else {
        favoriteMap.current[key] = status;
      }

      const idx = rawRestaurants.current.findIndex(
        (r) => r.placeId === restaurant.placeId
      );
      if (idx >= 0) {
        rawRestaurants.current[idx] = { ...rawRestaurants.current[idx], favoriteStatus: status };
      }

      SettingsManager.saveFavorites(favoriteMap.current);
      emitFilteredState();
    },
    [emitFilteredState, favoriteKey]
  );

  // ─── Manual rescan ───────────────────────────────────────────
  const requestMenuRescan = useCallback(
    (restaurant: Restaurant) => {
      const idx = rawRestaurants.current.findIndex((r) => r.placeId === restaurant.placeId);
      if (idx >= 0) {
        rawRestaurants.current[idx] = {
          ...rawRestaurants.current[idx],
          menuScanStatus: 'FETCHING',
          menuScanTimestamp: Date.now(),
          gfMenu: [],
        };
      }
      emitFilteredState();
      scanMenu(restaurant);
    },
    [emitFilteredState, scanMenu]
  );

  return (
    <RestaurantContext.Provider
      value={{
        uiState,
        loadNearbyRestaurants,
        setFavoriteStatus,
        requestMenuRescan,
      }}
    >
      {children}
    </RestaurantContext.Provider>
  );
}