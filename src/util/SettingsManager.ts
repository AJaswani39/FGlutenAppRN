import AsyncStorage from '@react-native-async-storage/async-storage';
import { RestaurantFilters, SortMode } from '../types/restaurant';

const KEYS = {
  FILTERS: 'restaurant_filters',
  FAVORITES: 'restaurant_favorites',
  CACHE: 'restaurant_cache',
  SETTINGS: 'fg_settings',
};

export const SettingsManager = {
  // ─── Units ───────────────────────────────────────────────────
  async useMiles(): Promise<boolean> {
    const val = await AsyncStorage.getItem(`${KEYS.SETTINGS}:use_miles`);
    return val === 'true';
  },
  async setUseMiles(useMiles: boolean): Promise<void> {
    await AsyncStorage.setItem(`${KEYS.SETTINGS}:use_miles`, useMiles ? 'true' : 'false');
  },

  // ─── Strict Celiac ───────────────────────────────────────────
  async isStrictCeliac(): Promise<boolean> {
    const val = await AsyncStorage.getItem(`${KEYS.SETTINGS}:strict_celiac`);
    return val === 'true';
  },
  async setStrictCeliac(strict: boolean): Promise<void> {
    await AsyncStorage.setItem(`${KEYS.SETTINGS}:strict_celiac`, strict ? 'true' : 'false');
  },

  // ─── Distance Units ──────────────────────────────────────────
  formatDistance(meters: number, useMiles: boolean): string {
    if (meters <= 0) return '';
    if (useMiles) {
      const miles = meters / 1609.34;
      if (miles >= 0.1) return `${miles.toFixed(1)} mi`;
      const feet = Math.round(meters * 3.28084);
      return `${feet} ft`;
    } else {
      if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
      return `${Math.round(meters)} m`;
    }
  },

  // ─── Filters ─────────────────────────────────────────────────
  async loadFilters(): Promise<RestaurantFilters> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.FILTERS);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          gfOnly: parsed.gfOnly ?? false,
          openNowOnly: parsed.openNowOnly ?? false,
          sortMode: (parsed.sortMode as SortMode) ?? 'distance',
          maxDistanceMeters: parsed.maxDistanceMeters ?? 0,
          minRating: parsed.minRating ?? 0,
          searchQuery: parsed.searchQuery ?? '',
        };
      }
    } catch (_) {}
    return {
      gfOnly: false,
      openNowOnly: false,
      sortMode: 'distance',
      maxDistanceMeters: 0,
      minRating: 0,
      searchQuery: '',
    };
  },

  async saveFilters(filters: RestaurantFilters): Promise<void> {
    await AsyncStorage.setItem(KEYS.FILTERS, JSON.stringify(filters));
  },

  // ─── Favorites ───────────────────────────────────────────────
  async loadFavorites(): Promise<Record<string, string>> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.FAVORITES);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {};
  },

  async saveFavorites(map: Record<string, string>): Promise<void> {
    await AsyncStorage.setItem(KEYS.FAVORITES, JSON.stringify(map));
  },

  // ─── Restaurant cache ───────────────────────────────────────
  async saveCache(data: object): Promise<void> {
    await AsyncStorage.setItem(KEYS.CACHE, JSON.stringify(data));
  },

  async loadCache(): Promise<any | null> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.CACHE);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  },
};
