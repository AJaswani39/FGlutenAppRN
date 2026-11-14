import { GfConfidenceLevel, Restaurant, RestaurantFilters } from '../types/restaurant';
/**
 * Normalizes a search query string by trimming whitespace and converting it to lowercase.
 * @param query The search query string to normalize.
 * @returns A normalized string suitable for case-insensitive comparisons.
 */
export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}
/**
 * Returns the GF confidence level for a restaurant based on its menu scan results and GF menu clues.
 * @param restaurant The restaurant for which to determine the GF confidence level.
 * @returns A GfConfidenceLevel value indicating the confidence in the restaurant's GF status.
 */
export function getGfConfidenceLevel(restaurant: Restaurant): GfConfidenceLevel {
  if (restaurant.gfMenu.length > 0) return 'confirmed';
  if (restaurant.hasGFMenu) return 'name_match';
  if (restaurant.menuScanStatus === 'SUCCESS') return 'no_evidence';
  if (
    restaurant.menuScanStatus === 'FAILED' ||
    restaurant.menuScanStatus === 'NO_MENU_CONTENT' ||
    restaurant.menuScanStatus === 'NO_WEBSITE'
  ) {
    return 'unavailable';
  }

  return 'pending';
}
/**
 * Returns a unique identity key for a restaurant based on its placeId, name, and address.
 * This key can be used for caching, comparison, or as a unique identifier in lists.
 * @param restaurant The restaurant for which to generate the identity key.
 * @returns A string representing the unique identity key, or null if insufficient data is available.
 */
export function getRestaurantIdentityKey(restaurant: Pick<Restaurant, 'placeId' | 'name' | 'address'>): string | null {
  if (!restaurant) return null;
  const placeId = restaurant.placeId?.trim() || '';
  if (placeId) return `pid:${placeId}`;

  const name = restaurant.name?.trim() || '';
  const address = restaurant.address?.trim() || '';
  if (name && address) return `na:${name}|${address}`;

  return null;
}
/**
 * Returns a unique list key for a restaurant based on its identity key or a fallback index.
 * This key can be used for rendering lists of restaurants where a stable key is required.
 * @param restaurant The restaurant for which to generate the list key.
 * @param fallbackIndex Optional index to use as a fallback if the identity key cannot be generated.
 * @returns A string representing the unique list key for the restaurant.
 */
export function getRestaurantListKey(
  restaurant: Pick<Restaurant, 'placeId' | 'name' | 'address'>,
  fallbackIndex?: number
): string {
  return getRestaurantIdentityKey(restaurant) ?? `restaurant:${fallbackIndex ?? 'unknown'}`;
}
/**
 * Compares two restaurant identities to determine if they refer to the same restaurant.
 * The comparison is based on placeId, name, and address. If both restaurants have a placeId, it is used for comparison.
 * If either restaurant lacks a placeId, the comparison falls back to using the name and address.
 * @param left The first restaurant to compare.
 * @param right The second restaurant to compare.
 * @returns True if the two restaurants are considered the same; otherwise, false.
 */
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

/**
 * Returns a comparable distance in meters for a restaurant, ensuring that invalid or negative distances are treated as infinity.
 * This is useful for sorting or filtering restaurants based on distance, where unknown distances should be treated as the farthest possible.
 * @param restaurant The restaurant for which to get the comparable distance.
 * @returns A non-negative number representing the distance in meters, or Infinity if the distance is invalid.
 */
export function getComparableDistanceMeters(restaurant: Pick<Restaurant, 'distanceMeters'>): number {
  if (!Number.isFinite(restaurant.distanceMeters)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, restaurant.distanceMeters);
}

// Cache the search-query regex across calls — filterAndSortRestaurants runs on
// every state emit and every debounced keystroke, so avoiding re-compilation
// of the escaped query regex is a clear win for near-zero cost.
let cachedSearchQuery = '';
let cachedQueryRegex: RegExp | null = null;

/**
 * Returns a RegExp object for the given search query, caching the result for performance.
 * If the query is empty, returns null.
 * @param query The search query string to convert into a RegExp.
 * @returns A RegExp object for the query, or null if the query is empty.
 */
function getQueryRegex(query: string): RegExp | null {
  if (query === cachedSearchQuery) return cachedQueryRegex;
  cachedSearchQuery = query;
  cachedQueryRegex = query
    ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    : null;
  return cachedQueryRegex;
}

/**
 * Filters and sorts an array of restaurants based on the provided filters, strict celiac mode, and optional safety score function.
 * The filtering criteria include open status, minimum rating, maximum distance, GF evidence, and search query matching.
 * The sorting can be based on distance, safety score, or name.
 * @param restaurants The array of restaurants to filter and sort.
 * @param filters The filtering and sorting criteria to apply.
 * @param strictCeliac A boolean indicating whether to enforce strict celiac filtering.
 * @param options Optional parameters, including a custom function to get the safety score for each restaurant.
 * @returns A new array of restaurants that match the filters and are sorted according to the specified criteria.
 */
export function filterAndSortRestaurants(
  restaurants: Restaurant[],
  filters: RestaurantFilters,
  strictCeliac: boolean,
  options: { getSafetyScore?: (restaurant: Restaurant) => number | null } = {}
): Restaurant[] {
  const query = filters.searchQuery.trim();
  const queryRegex = getQueryRegex(query);
  const getSafetyScore = options.getSafetyScore ?? (() => null);

  const needsGfEvidence = filters.gfOnly || filters.gfEvidenceOnly || strictCeliac;
  const minRating = filters.minRating;
  const maxDist = filters.maxDistanceMeters;
  const openNowOnly = filters.openNowOnly;

  const filtered = restaurants.filter((restaurant) => {
    // 1. Boolean/Numeric filters (Fastest)
    if (openNowOnly && restaurant.openNow !== true) return false;
    if (minRating > 0 && (restaurant.rating ?? 0) < minRating) return false;
    if (maxDist > 0 && getComparableDistanceMeters(restaurant) > maxDist) return false;

    // 2. GF Evidence check
    if (needsGfEvidence) {
      const hasGfItems = restaurant.gfMenu.length > 0;
      if (strictCeliac) {
        // Strict mode: only restaurants with scanned GF menu items.
        if (!hasGfItems) return false;
      } else if (filters.gfEvidenceOnly && !hasGfItems) {
        // GF evidence filter: only restaurants with scanned GF menu items.
        return false;
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
    return filtered.sort((a, b) => getComparableDistanceMeters(a) - getComparableDistanceMeters(b));
  } else if (filters.sortMode === 'safety') {
    return filtered.sort((a, b) => {
      const scoreA = getSafetyScore(a) ?? 0;
      const scoreB = getSafetyScore(b) ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return getComparableDistanceMeters(a) - getComparableDistanceMeters(b);
    });
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