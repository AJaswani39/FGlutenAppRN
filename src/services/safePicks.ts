import { Restaurant } from '../types/restaurant';
import { getRestaurantSafetyScore, RestaurantSafetyScore } from './menuSafety';

export interface SafeRestaurantPick {
  restaurant: Restaurant;
  safetyScore: RestaurantSafetyScore;
  rankScore: number;
  highlights: string[];
}

export function getSafeRestaurantPicks(
  restaurants: Restaurant[],
  options: { strictCeliac?: boolean; limit?: number } = {}
): SafeRestaurantPick[] {
  const limit = options.limit ?? 3;

  return restaurants
    .map((restaurant) => {
      const safetyScore = getRestaurantSafetyScore(restaurant, { strictCeliac: options.strictCeliac });
      const rankScore = getRankScore(restaurant, safetyScore.score);
      return {
        restaurant,
        safetyScore,
        rankScore,
        highlights: getHighlights(restaurant, safetyScore.score),
      };
    })
    .filter((pick) => pick.restaurant.favoriteStatus !== 'avoid')
    .filter((pick) => pick.safetyScore.score >= 50 || pick.restaurant.gfMenu.length > 0 || pick.restaurant.favoriteStatus === 'safe')
    .sort((left, right) => {
      const rankDelta = right.rankScore - left.rankScore;
      if (rankDelta !== 0) return rankDelta;
      return left.restaurant.distanceMeters - right.restaurant.distanceMeters;
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

  const distanceKm = Math.max(0, restaurant.distanceMeters) / 1000;
  score -= Math.min(16, distanceKm * 2.5);

  return Math.round(score);
}

function getHighlights(restaurant: Restaurant, safetyScore: number): string[] {
  const highlights: string[] = [];

  if (restaurant.favoriteStatus === 'safe') highlights.push('Marked safe');
  if (restaurant.openNow === true) highlights.push('Open now');
  if (restaurant.rating != null && restaurant.rating >= 4.5) highlights.push(`${restaurant.rating.toFixed(1)} stars`);
  if (restaurant.gfMenu.length > 0) highlights.push(`${restaurant.gfMenu.length} GF clue${restaurant.gfMenu.length !== 1 ? 's' : ''}`);
  if (safetyScore >= 80) highlights.push('Strong score');

  return highlights.slice(0, 3);
}
