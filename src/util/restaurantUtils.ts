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

  const leftFallback = getRestaurantIdentityKey(left);
  const rightFallback = getRestaurantIdentityKey(right);
  return leftFallback != null && leftFallback === rightFallback;
}

export function filterAndSortRestaurants(
  restaurants: Restaurant[],
  filters: RestaurantFilters,
  strictCeliac: boolean
): Restaurant[] {
  const normalizedQuery = normalizeSearchQuery(filters.searchQuery);
  const filtered = restaurants.filter((restaurant) => {
    let fitsGF = !filters.gfOnly || hasRestaurantGfEvidence(restaurant);

    if (strictCeliac) {
      const hasEvidence = restaurant.gfMenu.length > 0;
      const isHighRatedGF = hasRestaurantGfEvidence(restaurant) && (restaurant.rating ?? 0) >= 4.0;
      fitsGF = hasEvidence || isHighRatedGF;
    }

    const passesSearch =
      !normalizedQuery ||
      restaurant.name.toLowerCase().includes(normalizedQuery) ||
      restaurant.gfMenu.some((item) => item.toLowerCase().includes(normalizedQuery));

    if (!fitsGF || !passesSearch) return false;
    if (filters.openNowOnly && restaurant.openNow !== true) return false;
    if (filters.minRating > 0 && (restaurant.rating ?? 0) < filters.minRating) return false;
    if (filters.maxDistanceMeters > 0 && restaurant.distanceMeters > filters.maxDistanceMeters) return false;
    return true;
  });

  return [...filtered].sort((left, right) => {
    if (filters.sortMode === 'distance') {
      return left.distanceMeters - right.distanceMeters;
    }

    return left.name.localeCompare(right.name);
  });
}
