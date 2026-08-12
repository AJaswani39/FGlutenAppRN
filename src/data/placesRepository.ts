import { API_ENDPOINTS } from '../constants';
import { Restaurant } from '../types/restaurant';
import { logger } from '../util/logger';
import { fetchWithTimeout } from '../util/http';
import { detectMenuSourceFormat } from '../util/htmlUtils';
import { isRecord } from '../util/typeGuards';

const DEFAULT_SEARCH_RADIUS_METERS = 5000;
const MAX_SEARCH_RADIUS_METERS = 20000;
const NEARBY_CACHE_COORD_DECIMALS = 4;
const nearbySessionCache = new Map<string, Restaurant[]>();

export function clearNearbySessionCache(): void {
  nearbySessionCache.clear();
}

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function normalizeSearchRadiusMeters(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_SEARCH_RADIUS_METERS;
  }

  return Math.min(value, MAX_SEARCH_RADIUS_METERS);
}

function cloneRestaurants(restaurants: Restaurant[]): Restaurant[] {
  return restaurants.map((restaurant) => ({
    ...restaurant,
    gfMenu: [...restaurant.gfMenu],
    aiChatHistory: restaurant.aiChatHistory ? [...restaurant.aiChatHistory] : undefined,
  }));
}

function getNearbySessionCacheKey(lat: number, lng: number, radiusMeters: number): string {
  return [
    lat.toFixed(NEARBY_CACHE_COORD_DECIMALS),
    lng.toFixed(NEARBY_CACHE_COORD_DECIMALS),
    Math.round(radiusMeters),
  ].join(':');
}

function normalizeNearbyRestaurant(place: unknown): Restaurant | null {
  if (!isRecord(place)) {
    return null;
  }

  const placeId = typeof place.id === 'string' ? place.id.trim() : '';
  const location = isRecord(place.location) ? place.location : null;
  const displayName = isRecord(place.displayName) ? place.displayName : null;
  const currentOpeningHours = isRecord(place.currentOpeningHours) ? place.currentOpeningHours : null;
  const latitude =
    typeof location?.latitude === 'number' && Number.isFinite(location.latitude)
      ? location.latitude
      : null;
  const longitude =
    typeof location?.longitude === 'number' && Number.isFinite(location.longitude)
      ? location.longitude
      : null;

  if (!placeId || latitude == null || longitude == null) {
    return null;
  }

  const name =
    typeof displayName?.text === 'string' && displayName.text.trim()
      ? displayName.text.trim()
      : 'Unknown restaurant';
  const address = typeof place.formattedAddress === 'string' ? place.formattedAddress.trim() : '';
  const rating =
    typeof place.rating === 'number' && Number.isFinite(place.rating)
      ? Math.min(5, Math.max(0, place.rating))
      : null;
  const openNow =
    typeof currentOpeningHours?.openNow === 'boolean'
      ? currentOpeningHours.openNow
      : null;
  const hasGFMenu = /\bgluten[\s-]?free\b|\bgf\b/i.test(name);

  return {
    placeId,
    name,
    address,
    latitude,
    longitude,
    rating,
    openNow,
    hasGFMenu,
    gfMenu: [],
    distanceMeters: 0,
    menuUrl: null,
    rawMenuText: null,
    menuScanStatus: 'NOT_STARTED',
    menuScanTimestamp: 0,
    favoriteStatus: null,
  };
}


export async function fetchNearbyRestaurants(
  lat: number,
  lng: number,
  apiKey: string,
  radiusMeters = DEFAULT_SEARCH_RADIUS_METERS
): Promise<Restaurant[]> {
  if (!isValidLatitude(lat) || !isValidLongitude(lng)) {
    throw new Error('Invalid search coordinates.');
  }

  const searchRadiusMeters = normalizeSearchRadiusMeters(radiusMeters);
  const cacheKey = getNearbySessionCacheKey(lat, lng, searchRadiusMeters);
  const cached = nearbySessionCache.get(cacheKey);
  if (cached) {
    return cloneRestaurants(cached);
  }

  const body = {
    includedTypes: ['restaurant'],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: searchRadiusMeters,
      },
    },
  };

  const response = await fetchWithTimeout(API_ENDPOINTS.PLACES_NEARBY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.rating,places.currentOpeningHours,places.location',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Places API error ${response.status}: ${await response.text()}`);
  }

  const payload: unknown = await response.json();
  const places = isRecord(payload) && Array.isArray(payload.places) ? payload.places : [];

  const restaurants = places
    .map((place) => normalizeNearbyRestaurant(place))
    .filter((restaurant): restaurant is Restaurant => restaurant !== null);

  nearbySessionCache.set(cacheKey, cloneRestaurants(restaurants));
  return cloneRestaurants(restaurants);
}

export async function fetchWebsiteForPlace(placeId: string, apiKey: string): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(`${API_ENDPOINTS.PLACE_DETAILS}/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'websiteUri',
      },
    });

    if (!response.ok) {
      logger.warn(`fetchWebsiteForPlace: HTTP ${response.status} for place ${placeId}`);
      return null;
    }

    const payload = await response.json();
    return typeof payload.websiteUri === 'string' && payload.websiteUri.trim()
      ? payload.websiteUri.trim()
      : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`fetchWebsiteForPlace failed for ${placeId}: ${message}`);
    return null;
  }
}

export async function fetchHtml(url: string, proxyBaseUrl = ''): Promise<string | null> {
  const sourceFormat = detectMenuSourceFormat(url);
  const proxyHtml = await fetchHtmlViaProxy(url, proxyBaseUrl);
  if (proxyHtml) return proxyHtml;

  if (sourceFormat === 'pdf' || sourceFormat === 'image') {
    logger.warn(`fetchHtml: Skipping ${sourceFormat} menu source: ${url}`);
    return null;
  }

  const candidates = getHtmlFetchCandidates(url);
  for (const candidate of candidates) {
    try {
      const response = await fetchWithTimeout(candidate, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
          Accept: 'text/html',
        },
      });

      if (!response.ok) {
        logger.warn(`fetchHtml: HTTP ${response.status} for ${candidate}`);
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      const resolvedFormat = detectMenuSourceFormat(candidate, contentType);
      if (resolvedFormat === 'pdf' || resolvedFormat === 'image') {
        logger.warn(`fetchHtml: Skipping resolved ${resolvedFormat} content-type: ${candidate}`);
        return null;
      }

      return await response.text();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`fetchHtml failed for ${candidate}: ${message}`);
    }
  }

  return null;
}

export async function fetchRenderedMenuText(url: string, proxyBaseUrl = ''): Promise<string | null> {
  const trimmedProxyBaseUrl = proxyBaseUrl.trim().replace(/\/+$/, '');
  if (!trimmedProxyBaseUrl) return null;

  try {
    const response = await fetchWithTimeout(trimmedProxyBaseUrl + '/render-menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = isRecord(payload) && typeof payload.error === 'string' ? payload.error : 'Unknown render failure.';
      logger.warn(`Interactive menu render failed for ${url} (HTTP ${response.status}): ${message}`);
      return null;
    }

    const text = isRecord(payload) && typeof payload.text === 'string' ? payload.text.trim() : '';
    return text || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Interactive menu render request failed for ' + url + ': ' + message);
    return null;
  }
}

async function fetchHtmlViaProxy(url: string, proxyBaseUrl: string): Promise<string | null> {
  const trimmedProxyBaseUrl = proxyBaseUrl.trim().replace(/\/+$/, '');
  if (!trimmedProxyBaseUrl) return null;

  try {
    const response = await fetchWithTimeout(`${trimmedProxyBaseUrl}/fetch-menu-html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = isRecord(payload) && typeof payload.error === 'string' ? payload.error : response.status;
      logger.warn(`fetchHtml proxy failed for ${url}: ${message}`);
      return null;
    }

    const html = isRecord(payload) && typeof payload.html === 'string' ? payload.html.trim() : '';
    return html || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`fetchHtml proxy request failed for ${url}: ${message}`);
    return null;
  }
}

function getHtmlFetchCandidates(url: string): string[] {
  const trimmed = url.trim();
  if (!/^http:\/\//i.test(trimmed)) return [trimmed];

  const secureCandidate = trimmed.replace(/^http:\/\//i, 'https://');
  return secureCandidate === trimmed ? [trimmed] : [secureCandidate, trimmed];
}

