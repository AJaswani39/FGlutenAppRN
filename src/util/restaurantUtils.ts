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
  const placeId = restaurant.placeId.trim();
  if (placeId) return `pid:${placeId}`;

  const name = restaurant.name.trim();
  const address = restaurant.address.trim();
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
  left: Pick<Restaurant, 'placeId' | 'name' | 'address'>,
  right: Pick<Restaurant, 'placeId' | 'name' | 'address'>
): boolean {
  const leftPlaceId = left.placeId.trim();
  const rightPlaceId = right.placeId.trim();
  if (leftPlaceId && rightPlaceId) {
    return leftPlaceId === rightPlaceId;
  }
): boolean {
  const leftPlaceId = left.placeId.trim();
  const rightPlaceId = right.placeId.trim();
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

  const filtered = restaurants.filter((restaurant) => {
    // 1. Check GF requirements first (logical checks are faster than string/regex)
    if (filters.gfOnly || strictCeliac) {
      const hasGfItems = restaurant.gfMenu.length > 0;
      const hasAnyEvidence = restaurant.hasGFMenu || hasGfItems;
      
      if (strictCeliac) {
        // Strict celiac needs explicit menu items or high-rated general evidence
        if (!hasGfItems && !(hasAnyEvidence && (restaurant.rating ?? 0) >= 4.0)) return false;
      } else if (filters.gfOnly && !hasAnyEvidence) {
        return false;
      }
    }

    // 2. Simple numeric/boolean filters
    if (filters.openNowOnly && restaurant.openNow !== true) return false;
    if (filters.minRating > 0 && (restaurant.rating ?? 0) < filters.minRating) return false;
    if (filters.maxDistanceMeters > 0 && restaurant.distanceMeters > filters.maxDistanceMeters) return false;

    // 3. Search query (regex test is faster than toLowerCase() + includes() as it avoids allocations)
    if (queryRegex) {
      const nameMatch = queryRegex.test(restaurant.name);
      if (!nameMatch) {
        const menuMatch = restaurant.gfMenu.some((item) => queryRegex.test(item));
        if (!menuMatch) return false;
      }
    }

    return true;
  });

  // Sort the filtered array directly to avoid extra shallow copy
  return filtered.sort((left, right) => {
    if (filters.sortMode === 'distance') {
      return left.distanceMeters - right.distanceMeters;
    }
    return left.name.localeCompare(right.name);
  });
}
