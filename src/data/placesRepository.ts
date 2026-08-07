import { API_ENDPOINTS, API_TIMEOUTS } from '../constants';
import { Restaurant } from '../types/restaurant';
import { logger } from '../util/logger';
import { fetchWithTimeout } from '../util/http';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
  const places = isRecord(payload) && Array.isArray(payload.places) ? payload.places : [];

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
    logger.warn(`fetchWebsiteForPlace failed for ${placeId}: ${message}`);
    return null;
  }
}

export async function fetchHtml(url: string): Promise<string | null> {
  if (url.toLowerCase().trim().endsWith('.pdf')) {
    logger.warn(`fetchHtml: Skipping direct PDF menu link: ${url}`);
    return null;
  }

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      logger.warn(`fetchHtml: HTTP ${response.status} for ${url}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.toLowerCase().includes('application/pdf')) {
      logger.warn(`fetchHtml: Skipping resolved PDF content-type: ${url}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`fetchHtml failed for ${url}: ${message}`);
    return null;
  }
}

