import { API_ENDPOINTS, API_TIMEOUTS } from '../constants';
import { Restaurant } from '../types/restaurant';
import { logger } from '../util/logger';

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = API_TIMEOUTS.DEFAULT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

interface PlacesNearbyResult {
  places?: PlacesNearbyPlace[];
}

interface PlacesNearbyPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  currentOpeningHours?: { openNow?: boolean };
  location?: { latitude?: number; longitude?: number };
}

function normalizeNearbyRestaurant(place: PlacesNearbyPlace): Restaurant | null {
  const placeId = typeof place.id === 'string' ? place.id.trim() : '';
  const latitude =
    typeof place.location?.latitude === 'number' && Number.isFinite(place.location.latitude)
      ? place.location.latitude
      : null;
  const longitude =
    typeof place.location?.longitude === 'number' && Number.isFinite(place.location.longitude)
      ? place.location.longitude
      : null;

  if (!placeId || latitude == null || longitude == null) {
    return null;
  }

  const name =
    typeof place.displayName?.text === 'string' && place.displayName.text.trim()
      ? place.displayName.text.trim()
      : 'Unknown restaurant';
  const address = typeof place.formattedAddress === 'string' ? place.formattedAddress.trim() : '';
  const rating =
    typeof place.rating === 'number' && Number.isFinite(place.rating)
      ? Math.min(5, Math.max(0, place.rating))
      : null;
  const openNow =
    typeof place.currentOpeningHours?.openNow === 'boolean'
      ? place.currentOpeningHours.openNow
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

function stripNonContentTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '\n')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '\n')
    .replace(/<header[\s\S]*?<\/header>/gi, '\n')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '\n');
}

function htmlToTextSegments(html: string): string[] {
  const withBreaks = stripNonContentTags(html)
    .replace(
      /<(?:br\s*\/?|\/p|\/div|\/li|\/ul|\/ol|\/section|\/article|\/tr|\/table|\/h[1-6])>/gi,
      '\n'
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n');

  return withBreaks
    .split('\n')
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function cleanMenuLine(line: string): string {
  let cleaned = line.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length > 100) {
    const fragments = cleaned.split(/[.!?]/);
    for (const fragment of fragments) {
      if (
        /gluten[\s-]?free|\bgf\b|celiac|coeliac/i.test(fragment) &&
        fragment.trim().length > 15
      ) {
        cleaned = fragment.trim();
        break;
      }
    }
  }

  return cleaned.slice(0, 200);
}

function findMainContent(segments: string[]): string {
  const menuIndicators = ['menu', 'food', 'dining', 'entree', 'appetizer', 'dessert'];

  for (let index = 0; index < segments.length; index += 1) {
    const lower = segments[index].toLowerCase();
    if (menuIndicators.some((indicator) => lower.includes(indicator)) && segments[index].length < 60) {
      return segments.slice(index, Math.min(index + 80, segments.length)).join('\n');
    }
  }

  return segments.slice(0, 120).join('\n');
}

export async function fetchNearbyRestaurants(
  lat: number,
  lng: number,
  apiKey: string,
  radiusMeters = 5000
): Promise<Restaurant[]> {
  const body = {
    includedTypes: ['restaurant'],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radiusMeters,
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

  const payload: PlacesNearbyResult = await response.json();
  const places = payload.places ?? [];

  return places
    .map((place) => normalizeNearbyRestaurant(place))
    .filter((restaurant): restaurant is Restaurant => restaurant !== null);
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
    logger.error(`fetchWebsiteForPlace failed for ${placeId}: ${message}`);
    return null;
  }
}

export async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FGlutenBot/1.0; +https://fgluten.io)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      logger.warn(`fetchHtml: HTTP ${response.status} for ${url}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`fetchHtml failed for ${url}: ${message}`);
    return null;
  }
}

export function extractGfEvidence(html: string): string[] {
  const safeHtml = html.slice(0, 500_000);
  const evidence: string[] = [];
  const seen = new Set<string>();

  for (const segment of htmlToTextSegments(safeHtml)) {
    if (!/gluten[\s-]?free|\bgf\b|celiac|coeliac/i.test(segment)) continue;
    if (segment.length <= 10 || segment.length >= 250) continue;

    const cleaned = cleanMenuLine(segment);
    const normalized = cleaned.toLowerCase().replace(/[\s-]+/g, ' ').trim();
    if (!cleaned || seen.has(normalized)) continue;

    seen.add(normalized);
    evidence.push(cleaned);

    if (evidence.length >= 15) {
      break;
    }
  }

  return evidence;
}

export function extractRawMenuText(html: string): string {
  const safeHtml = html.slice(0, 500_000);
  const segments = htmlToTextSegments(safeHtml);
  return findMainContent(segments).slice(0, 3000);
}

export function findMenuLink(html: string, baseUrl: string): string | null {
  const menuPattern = /href=["']([^"']*(?:menu|food|eat|dining)[^"']*)["']/gi;
  const seen = new Set<string>();

  for (const match of html.matchAll(menuPattern)) {
    const href = match[1]?.trim();
    if (!href) continue;
    if (
      href.startsWith('#') ||
      href.toLowerCase().startsWith('javascript:') ||
      href.toLowerCase().startsWith('mailto:') ||
      href.toLowerCase().startsWith('tel:')
    ) {
      continue;
    }

    try {
      const resolved = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
      const normalized = resolved.toLowerCase();
      if (seen.has(normalized)) continue;

      seen.add(normalized);
      return resolved;
    } catch (error) {
      logger.warn(`findMenuLink: failed to parse URL ${href}: ${error}`);
    }
  }

  return null;
}

export function distanceBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const radius = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
