import { Restaurant } from '../types/restaurant';

const PLACES_API_BASE = 'https://places.googleapis.com/v1/places:searchNearby';
const PLACE_DETAIL_BASE = 'https://places.googleapis.com/v1/places';

interface PlacesNearbyResult {
  places?: Array<{
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    rating?: number;
    currentOpeningHours?: { openNow: boolean };
    location?: { latitude: number; longitude: number };
    websiteUri?: string;
  }>;
}

/**
 * Fetches nearby restaurants using the Google Places API (New) v1.
 * Mirrors PlacesRepository.java fetchNearbyRestaurants().
 */
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

  const res = await fetch(PLACES_API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.rating,places.currentOpeningHours,places.location',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Places API error ${res.status}: ${await res.text()}`);
  }

  const json: PlacesNearbyResult = await res.json();
  const places = json.places ?? [];

  return places.map((p) => {
    const name = p.displayName?.text ?? '';
    const nameLower = name.toLowerCase();
    const hasGFMenu =
      nameLower.includes('gluten') ||
      nameLower.includes(' gf ') ||
      nameLower.startsWith('gf ') ||
      nameLower.endsWith(' gf');

    return {
      placeId: p.id,
      name,
      address: p.formattedAddress ?? '',
      latitude: p.location?.latitude ?? 0,
      longitude: p.location?.longitude ?? 0,
      rating: p.rating ?? null,
      openNow: p.currentOpeningHours?.openNow ?? null,
      hasGFMenu,
      gfMenu: [],
      distanceMeters: 0,
      menuUrl: null,
      rawMenuText: null,
      menuScanStatus: 'NOT_STARTED',
      menuScanTimestamp: 0,
      favoriteStatus: null,
    };
  });
}

/**
 * Fetches the website URI for a given place ID.
 * Mirrors MenuScannerRepository.java fetchWebsiteForPlace().
 */
export async function fetchWebsiteForPlace(
  placeId: string,
  apiKey: string
): Promise<string | null> {
  try {
    const res = await fetch(`${PLACE_DETAIL_BASE}/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'websiteUri',
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.websiteUri ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetches HTML from a URL (used for menu scanning).
 */
export async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; FGlutenBot/1.0; +https://fgluten.io)',
        Accept: 'text/html',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Extracts gluten-free evidence lines from raw HTML.
 * Mirrors MenuScannerRepository.java extractGfEvidence().
 */
export function extractGfEvidence(html: string): string[] {
  const gfKeywords = /gluten[\s-]?free|gf menu|celiac|coeliac|\bGF\b/gi;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const sentences = text.split(/[.!?\n;]+/);
  const evidence: string[] = [];
  for (const sentence of sentences) {
    if (gfKeywords.test(sentence)) {
      const trimmed = sentence.trim();
      if (trimmed.length > 5 && trimmed.length < 300) {
        evidence.push(trimmed);
        if (evidence.length >= 15) break;
      }
    }
  }
  return evidence;
}

/**
 * Extracts raw menu text (first 3000 chars) from HTML.
 * Mirrors MenuScannerRepository.java extractRawMenuText().
 */
export function extractRawMenuText(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 3000);
}

/**
 * Finds a /menu or /food sub-link in HTML.
 */
export function findMenuLink(html: string, baseUrl: string): string | null {
  const menuPattern = /href=["']([^"']*(?:menu|food|eat|dining)[^"']*)["']/gi;
  const matches = html.matchAll(menuPattern);
  for (const match of matches) {
    const href = match[1];
    if (!href || href.startsWith('#')) continue;
    if (href.startsWith('http')) return href;
    try {
      const base = new URL(baseUrl);
      return new URL(href, base).toString();
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Calculates Haversine distance between two lat/lng points in meters.
 */
export function distanceBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
