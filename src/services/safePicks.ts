import { Restaurant } from '../types/restaurant';
import { getRestaurantSafetyScore, RestaurantSafetyScore } from './menuSafety';
import { getComparableDistanceMeters } from '../util/restaurantUtils';

export interface SafeRestaurantPick {
  // The restaurant object itself, containing all its details.
  restaurant: Restaurant;
  safetyScore: RestaurantSafetyScore;
  rankScore: number;
  highlights: string[];
}

export function getSafeRestaurantPicks(
  // The list of restaurants to evaluate for safety and ranking.
  restaurants: Restaurant[],
  options: { strictCeliac?: boolean; limit?: number } = {}
): SafeRestaurantPick[] {
  const limit = options.limit ?? 3;

  return restaurants
    .map((restaurant) => {
      // Calculate the safety score for the restaurant, considering whether strict celiac options are required.
      const safetyScore = getRestaurantSafetyScore(restaurant, { strictCeliac: options.strictCeliac });
      const rankScore = getRankScore(restaurant, safetyScore.score ?? 0);
      return {
        restaurant,
        safetyScore,
        rankScore,
        highlights: getHighlights(restaurant, safetyScore.score ?? 0),
      };
    })
    .filter((pick) => pick.restaurant.favoriteStatus !== 'avoid')
    .filter(
      (pick) =>
        // Include the restaurant if it has a safety score of 50 or higher, has any GF menu clues, or is marked as 'safe' by the user.
        (pick.safetyScore.score !== null && pick.safetyScore.score >= 50) ||
        pick.restaurant.gfMenu.length > 0 ||
        pick.restaurant.favoriteStatus === 'safe'
    )
    .sort((left, right) => {
      // Sort the picks first by rank score (higher is better), and then by distance (closer is better) if the rank scores are equal.
      const rankDelta = right.rankScore - left.rankScore;
      if (rankDelta !== 0) return rankDelta;
      return getComparableDistanceMeters(left.restaurant) - getComparableDistanceMeters(right.restaurant);
    })
    .slice(0, limit);
}

function getRankScore(restaurant: Restaurant, safetyScore: number): number {
  let score = safetyScore;

  if (restaurant.openNow === true) score += 8;
  if (restaurant.openNow === false) score -= 12;
  if (restaurant.rating != null) score += Math.max(0, restaurant.rating - 3) * 4;
  if (restaurant.favoriteStatus === 'safe') score += 12;
  if (restaurant.favoriteStatus === 'try') score += 4;
  // Note: 'avoid' restaurants are filtered out before ranking, so no penalty is applied here.

  const distanceKm = getComparableDistanceMeters(restaurant) / 1000;
  score -= Math.min(16, distanceKm * 2.5);

  return Math.round(score);
}

function getHighlights(restaurant: Restaurant, safetyScore: number): string[] {
  const highlights: string[] = [];
  // Add highlights based on the restaurant's attributes and safety score.
  if (restaurant.favoriteStatus === 'safe') highlights.push('Marked safe');
  if (restaurant.openNow === true) highlights.push('Open now');
  if (restaurant.rating != null && restaurant.rating >= 4.5) highlights.push(`${restaurant.rating.toFixed(1)} stars`);
  if (restaurant.gfMenu.length > 0) highlights.push(`${restaurant.gfMenu.length} GF clue${restaurant.gfMenu.length !== 1 ? 's' : ''}`);
  if (safetyScore >= 80) highlights.push('Strong score');

  return highlights.slice(0, 3);
}
