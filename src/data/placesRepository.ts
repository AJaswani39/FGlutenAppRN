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

