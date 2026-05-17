import AsyncStorage from '@react-native-async-storage/async-storage';
import { FavoriteStatus, RestaurantFilters, SortMode, Restaurant, AiChatMessage } from '../types/restaurant';
import { MenuAnalysisResult } from './menuSafety';
import { logger } from '../util/logger';

export interface CachePayload {
  restaurants: Restaurant[];
  lat: number | null;
  lng: number | null;
  timestamp: number;
}

export const DEFAULT_FILTERS: RestaurantFilters = {
  gfOnly: false,
  openNowOnly: false,
  sortMode: 'distance',
  maxDistanceMeters: 0,
  minRating: 0,
  searchQuery: '',
};

const KEYS = {
  FILTERS: 'restaurant_filters',
  FAVORITES: 'restaurant_favorites',
  SAVED_RESTAURANTS_DB: 'restaurant_saved_db',
  CACHE: 'restaurant_cache',
  SETTINGS: 'fg_settings',
};

const MENU_SCAN_STATUSES = new Set<Restaurant['menuScanStatus']>([
  'NOT_STARTED',
  'FETCHING',
  'SUCCESS',
  'NO_WEBSITE',
  'FAILED',
  'JS_ONLY',
]);

const FAVORITE_STATUSES = new Set<Exclude<FavoriteStatus, null>>(['safe', 'try', 'avoid']);

// ─── Normalization Helpers ─────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeNullableFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeSortMode(value: unknown): SortMode {
  return value === 'distance' || value === 'name' ? value : 'distance';
}

function normalizeFavoriteStatus(value: unknown): FavoriteStatus {
  return typeof value === 'string' && FAVORITE_STATUSES.has(value as Exclude<FavoriteStatus, null>)
    ? (value as Exclude<FavoriteStatus, null>)
    : null;
}

function normalizeStringArray(value: unknown, maxLength?: number): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return typeof maxLength === 'number' ? normalized.slice(0, maxLength) : normalized;
}

export function normalizeFilters(value: unknown): RestaurantFilters {
  const record = isRecord(value) ? value : {};
  return {
    gfOnly: normalizeBoolean(record.gfOnly),
    openNowOnly: normalizeBoolean(record.openNowOnly),
    sortMode: normalizeSortMode(record.sortMode),
    maxDistanceMeters: Math.max(0, normalizeFiniteNumber(record.maxDistanceMeters, 0)),
    minRating: Math.min(5, Math.max(0, normalizeFiniteNumber(record.minRating, 0))),
    searchQuery: normalizeString(record.searchQuery).trim(),
  };
}

export function normalizeFavoriteMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const normalized: Record<string, string> = {};
  for (const [key, status] of Object.entries(value)) {
    if (!key.trim()) continue;
    if (typeof status === 'string' && FAVORITE_STATUSES.has(status as Exclude<FavoriteStatus, null>)) {
      normalized[key] = status;
    }
  }
  return normalized;
}

export function normalizeRestaurant(value: unknown): Restaurant | null {
  if (!isRecord(value)) return null;

  const placeId = normalizeString(value.placeId).trim();
  const name = normalizeString(value.name, 'Unknown restaurant').trim() || 'Unknown restaurant';
  const address = normalizeString(value.address).trim();
  const latitude = normalizeNullableFiniteNumber(value.latitude);
  const longitude = normalizeNullableFiniteNumber(value.longitude);

  if ((!placeId && !address && name === 'Unknown restaurant') || latitude == null || longitude == null) {
    return null;
  }

  const rating = normalizeNullableFiniteNumber(value.rating);
  const openNow = typeof value.openNow === 'boolean' ? value.openNow : null;
  const hasGFMenu = normalizeBoolean(value.hasGFMenu);
  const gfMenu = normalizeStringArray(value.gfMenu, 15);
  const menuUrl = normalizeString(value.menuUrl).trim() || null;
  const rawMenuText = normalizeString(value.rawMenuText).trim() || null;
  // aiAnalysisResult is opaque data from disk — cast to MenuAnalysisResult since we
  // cannot revalidate every field without a full schema. Nulled if not a plain object.
  const aiAnalysisResult = isRecord(value.aiAnalysisResult)
    ? (value.aiAnalysisResult as unknown as MenuAnalysisResult)
    : null;

  const aiChatHistory: AiChatMessage[] | undefined = Array.isArray(value.aiChatHistory)
    ? (value.aiChatHistory as any[]).map((msg): AiChatMessage => ({
        role: msg.role === 'user' ? 'user' : 'model',
        text: normalizeString(msg.text),
        timestamp: normalizeFiniteNumber(msg.timestamp, Date.now()),
      }))
    : undefined;

  const menuScanStatus = MENU_SCAN_STATUSES.has(value.menuScanStatus as Restaurant['menuScanStatus'])
    ? (value.menuScanStatus as Restaurant['menuScanStatus'])
    : 'NOT_STARTED';

  return {
    placeId,
    name,
    address,
    latitude,
    longitude,
    rating: rating != null ? Math.min(5, Math.max(0, rating)) : null,
    openNow,
    hasGFMenu,
    gfMenu,
    distanceMeters: Math.max(0, normalizeFiniteNumber(value.distanceMeters, 0)),
    menuUrl,
    rawMenuText,
    menuScanStatus,
    menuScanTimestamp: Math.max(0, normalizeFiniteNumber(value.menuScanTimestamp, 0)),
    favoriteStatus: normalizeFavoriteStatus(value.favoriteStatus),
    aiAnalysisResult,
    aiChatHistory,
  };
}

export function stripLargeFields(restaurant: Restaurant): Restaurant {
  return {
    ...restaurant,
    rawMenuText: null,
  };
}

export function normalizeCachePayload(value: unknown): CachePayload | null {
  if (!isRecord(value) || !Array.isArray(value.restaurants)) return null;

  const restaurants = value.restaurants
    .map((restaurant) => normalizeRestaurant(restaurant))
    .filter((restaurant): restaurant is Restaurant => restaurant !== null)
    // Sort by timestamp descending (newest first)
    .sort((a, b) => b.menuScanTimestamp - a.menuScanTimestamp)
    // Keep only the 50 most recent results to stay within storage limits
    .slice(0, 50);

  return {
    restaurants,
    lat: normalizeNullableFiniteNumber(value.lat),
    lng: normalizeNullableFiniteNumber(value.lng),
    timestamp: Math.max(0, normalizeFiniteNumber(value.timestamp, 0)),
  };
}

// ─── Persistence Service ───────────────────────────────────────

export const PersistenceService = {
  async getSetting(key: string): Promise<boolean> {
    const val = await AsyncStorage.getItem(`${KEYS.SETTINGS}:${key}`);
    return val === 'true';
  },

  async setSetting(key: string, value: boolean): Promise<void> {
    await AsyncStorage.setItem(`${KEYS.SETTINGS}:${key}`, value ? 'true' : 'false');
  },

  async loadFilters(): Promise<RestaurantFilters> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.FILTERS);
      if (raw) return normalizeFilters(JSON.parse(raw));
    } catch (error: unknown) {
      logger.warn(`Failed to load filters: ${error instanceof Error ? error.message : String(error)}`);
    }
    return DEFAULT_FILTERS;
  },

  async saveFilters(filters: RestaurantFilters): Promise<void> {
    await AsyncStorage.setItem(KEYS.FILTERS, JSON.stringify(normalizeFilters(filters)));
  },

  async loadFavorites(): Promise<Record<string, string>> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.FAVORITES);
      if (raw) return normalizeFavoriteMap(JSON.parse(raw));
    } catch (error: unknown) {
      logger.warn(`Failed to load favorites: ${error instanceof Error ? error.message : String(error)}`);
    }
    return {};
  },

  async saveFavorites(map: Record<string, string>): Promise<void> {
    await AsyncStorage.setItem(KEYS.FAVORITES, JSON.stringify(normalizeFavoriteMap(map)));
  },

  async loadSavedRestaurantsDb(): Promise<Restaurant[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.SAVED_RESTAURANTS_DB);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeRestaurant).filter((r): r is Restaurant => r !== null);
      }
    } catch (e) {}
    return [];
  },

  async saveSavedRestaurantsDb(restaurants: Restaurant[]): Promise<void> {
    const light = restaurants.map(stripLargeFields);
    await AsyncStorage.setItem(KEYS.SAVED_RESTAURANTS_DB, JSON.stringify(light));
  },

  async saveCache(data: CachePayload): Promise<void> {
    await AsyncStorage.setItem(KEYS.CACHE, JSON.stringify(normalizeCachePayload(data)));
  },

  async saveCacheLight(data: CachePayload): Promise<void> {
    const lightData = {
      ...data,
      restaurants: data.restaurants.map(stripLargeFields),
    };
    // We don't normalize here to save CPU, just stringify the already-vetted fields
    await AsyncStorage.setItem(KEYS.CACHE, JSON.stringify(lightData));
  },

  async loadCache(): Promise<CachePayload | null> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.CACHE);
      if (raw) return normalizeCachePayload(JSON.parse(raw));
    } catch (error: unknown) {
      logger.warn(`Failed to load cache: ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  },
};
