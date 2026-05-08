export const API_ENDPOINTS = {
  PLACES_NEARBY: 'https://places.googleapis.com/v1/places:searchNearby',
  PLACE_DETAILS: 'https://places.googleapis.com/v1/places',
  VISION_ANNOTATE: 'https://vision.googleapis.com/v1/images:annotate',
} as const;

export const API_TIMEOUTS = {
  DEFAULT: 10000,
} as const;
