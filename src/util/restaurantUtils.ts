import { GfConfidenceLevel, Restaurant, RestaurantFilters } from '../types/restaurant';

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function hasRestaurantGfEvidence(restaurant: Restaurant): boolean {
  return restaurant.hasGFMenu || restaurant.gfMenu.length > 0;
}

export function getGfConfidenceLevel(restaurant: Restaurant): GfConfidenceLevel {
  if (restaurant.gfMenu.length > 0) return 'confirmed';
  if (restaurant.hasGFMenu) return 'name_match';
  if (restaurant.menuScanStatus === 'SUCCESS') return 'no_evidence';
  if (restaurant.menuScanStatus === 'FAILED' || restaurant.menuScanStatus === 'NO_WEBSITE') {
    return 'unavailable';
  }

  return 'pending';
}

export function getRestaurantIdentityKey(restaurant: Pick<Restaurant, 'placeId' | 'name' | 'address'>): string | null {
  if (!restaurant) return null;
  const placeId = restaurant.placeId?.trim() || '';
  if (placeId) return `pid:${placeId}`;

  const name = restaurant.name?.trim() || '';
  const address = restaurant.address?.trim() || '';
  if (name && address) return `na:${name}|${address}`;

  return null;
}

export function getRestaurantListKey(
  restaurant: Pick<Restaurant, 'placeId' | 'name' | 'address'>,
  fallbackIndex?: number
): string {
  return getRestaurantIdentityKey(restaurant) ?? `restaurant:${fallbackIndex ?? 'unknown'}`;
}

export function isSameRestaurantIdentity(
  left: Pick<Restaurant, 'placeId' | 'name' | 'address'> | null | undefined,
  right: Pick<Restaurant, 'placeId' | 'name' | 'address'> | null | undefined
): boolean {
  if (!left || !right) return false;

  const leftPlaceId = (left.placeId || '').trim();
  const rightPlaceId = (right.placeId || '').trim();
  if (leftPlaceId && rightPlaceId) {
    return leftPlaceId === rightPlaceId;
  }

  const leftFallback = getRestaurantIdentityKey(left);
  const rightFallback = getRestaurantIdentityKey(right);
  return leftFallback != null && leftFallback === rightFallback;
}

export function filterAndSortRestaurants(
  restaurants: Restaurant[],
  filters: RestaurantFilters,
  strictCeliac: boolean
): Restaurant[] {
  const query = filters.searchQuery.trim();
  const queryRegex = query ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
  
  const needsGfEvidence = filters.gfOnly || strictCeliac;
  const minRating = filters.minRating;
  const maxDist = filters.maxDistanceMeters;
  const openNowOnly = filters.openNowOnly;
  
  const filtered = restaurants.filter((restaurant) => {
    // 1. Boolean/Numeric filters (Fastest)
    if (openNowOnly && restaurant.openNow !== true) return false;
    if (minRating > 0 && (restaurant.rating ?? 0) < minRating) return false;
    if (maxDist > 0 && restaurant.distanceMeters > maxDist) return false;

    // 2. GF Evidence check
    if (needsGfEvidence) {
      const hasGfItems = restaurant.gfMenu.length > 0;
      if (strictCeliac) {
        if (!hasGfItems && !(restaurant.hasGFMenu && (restaurant.rating ?? 0) >= 4.0)) return false;
      } else if (filters.gfOnly && !(restaurant.hasGFMenu || hasGfItems)) {
        return false;
      }
    }

    // 3. Search query
    if (queryRegex) {
      if (!queryRegex.test(restaurant.name)) {
        if (!restaurant.gfMenu.some((item) => queryRegex.test(item))) return false;
      }
    }

    return true;
  });

  // Sort the filtered array directly to avoid extra shallow copy
  if (filters.sortMode === 'distance') {
    return filtered.sort((a, b) => a.distanceMeters - b.distanceMeters);
  } else {
    return filtered.sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });
  }
}
