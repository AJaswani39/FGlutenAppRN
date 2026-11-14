import type { Restaurant } from '../types/restaurant';
import { getGfConfidenceLevel } from '../util/restaurantUtils';

export type MenuSafetyLevel = 'safe' | 'caution' | 'unknown' | 'unsafe';

export interface MenuAnalysisResult {
  overallSafety: MenuSafetyLevel;
  score: number;
  /** Items confirmed gluten-free by local scan */
  glutenFreeItems: string[];
  warnings: string[];
  crossContamRisk: string;
  summary: string;
  riskFactors?: { factor: string; severity: number; description: string }[];
  /** Populated by AI deep-scan (safe items) */
  safeItems?: string[];
  /** Populated by AI deep-scan (caution items) */
  cautionItems?: string[];
  /** Populated by AI deep-scan (items to avoid) */
  unsafeItems?: string[];
}

export interface RestaurantSafetyScore {
  level: MenuSafetyLevel;
  score: number | null;
  title: string;
  summary: string;
  reasons: string[];
}

const GF_POSITIVE_REGEX = /gluten[\s-]?free|\bgf\b|celiac[\s-]?friendly|coeliac[\s-]?friendly|no[\s-]?gluten/i;

const LINE_SPLIT_REGEX = /[\n\r]+/;
const TAG_STRIP_REGEX = /<[^>]*>/g;
const WHITESPACE_REGEX = /\s+/g;
const COMMA_SPLIT_REGEX = /[,;]/;

const GLUTEN_SOURCES = [
  'wheat',
  'barley',
  'rye',
  'spelt',
  'triticale',
  'malt',
  'semolina',
  'durum',
  'kamut',
  'bulgur',
  'farro',
  'crouton',
  'breaded',
  'battered',
  'flour',
  'pasta',
  'noodle',
  'dumpling',
  'soy sauce',
  'teriyaki',
];

const GLUTEN_SOURCES_REGEX = new RegExp(`\\b(${GLUTEN_SOURCES.join('|')})\\b`, 'gi');


const CC_PATTERNS = [
  /share[\s\w]{0,30}kitchen/gi,
  /cross[\s-]?contamin/gi,
  /same[\s\w]{0,20}fryer/gi,
  /shared?[\s\w]{0,20}fryer/gi,
  /not[\s-]?celiac[\s-]?safe/gi,
  /may contain wheat/gi,
  /processed in a facility/gi,
];

// Bounded memoization cache for getRestaurantSafetyScore.
//
// The detail modal re-renders frequently (scan progress, favorites, AI session
// updates all flow through the context), and the score computation runs several
// regex passes over the menu text each time. Restaurant objects are spread
// copies, so we key on content rather than reference identity.
const SAFETY_SCORE_CACHE_LIMIT = 64;
const safetyScoreCache = new Map<string, RestaurantSafetyScore>();

function safetyScoreCacheKey(
  restaurant: Restaurant,
  strictCeliac: boolean
): string {
  // Only fields that affect the computed score are included.
  return [
    restaurant.placeId || '',
    restaurant.rawMenuText || '',
    restaurant.gfMenu.join('\u0000'),
    restaurant.aiAnalysisResult ? '1' : '0',
    restaurant.favoriteStatus || '',
    restaurant.rating ?? '',
    restaurant.openNow ?? '',
    restaurant.hasGFMenu ? '1' : '0',
    restaurant.menuScanStatus,
    strictCeliac ? '1' : '0',
  ].join('\u0001');
}
/**
 * Trims the safety-score memoization cache to ensure it does not exceed the defined limit.
 * This function removes the oldest entries from the cache when the limit is exceeded.
 * It is called after adding a new entry to the cache to maintain its size.
 */
function trimSafetyScoreCache() {
  while (safetyScoreCache.size > SAFETY_SCORE_CACHE_LIMIT) {
    // Map preserves insertion order; drop the oldest entry.
    const firstKey = safetyScoreCache.keys().next().value;
    if (firstKey === undefined) break;
    safetyScoreCache.delete(firstKey);
  }
}

/** Clears the safety-score memoization cache. Callers that mutate menu data
 * outside of the normal scan pipeline (e.g. direct edits) should invoke this. */
export function clearSafetyScoreCache() {
  safetyScoreCache.clear();
}

/**
 * Analyzes the provided menu text to determine gluten-free options, potential gluten sources, and cross-contamination risks.
 * Returns a MenuAnalysisResult object containing the overall safety level, score, identified gluten-free items,
 * warnings about gluten sources, cross-contamination risk, and a summary of the findings.
 * @param text The menu text to analyze.
 * @returns A MenuAnalysisResult object summarizing the analysis of the menu text.
 */
export function analyseMenuText(text: string): MenuAnalysisResult {
  const lines = text.split(LINE_SPLIT_REGEX);
  const glutenFreeItems: string[] = [];
  const foundGlutenSources = new Set<string>();

  // 1. Optimized line-by-line pass for item extraction and gluten source detection
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 5) continue;
    const hasGfMarker = GF_POSITIVE_REGEX.test(trimmed);

    // Fast check for GF marker
    if (hasGfMarker) {
      if (glutenFreeItems.length < 12 && trimmed.length >= 10 && trimmed.length <= 200) {
        const cleaned = extractGfItem(trimmed);
        if (cleaned && !glutenFreeItems.some((item) => item.toLowerCase() === cleaned.toLowerCase())) {
          glutenFreeItems.push(cleaned);
        }
      }
    }

    if (!hasGfMarker) {
      GLUTEN_SOURCES_REGEX.lastIndex = 0;
      const sourcesMatch = trimmed.matchAll(GLUTEN_SOURCES_REGEX);
      for (const match of sourcesMatch) {
        foundGlutenSources.add(match[0].toLowerCase());
        if (foundGlutenSources.size >= 10) break; // Cap findings for performance
      }
    }

    if (foundGlutenSources.size >= 10) break;
  }

  const warnings: string[] = [];
  if (foundGlutenSources.size > 0) {
    warnings.push(`Gluten-containing: ${Array.from(foundGlutenSources).slice(0, 6).join(', ')}`);
  }

  let crossContamRisk = '';
  const ccMatches = CC_PATTERNS.flatMap((pattern) => {
    pattern.lastIndex = 0;
    return [...text.matchAll(pattern)].map((match) => match[0]);
  });
  if (ccMatches.length > 0) {
    crossContamRisk = ccMatches.slice(0, 3).join('; ');
    warnings.push('Cross-contamination risk detected');
  }

  const hasPositive = glutenFreeItems.length > 0;
  const hasWarnings = warnings.length > 0;
  const hasCrossContam = ccMatches.length > 0;

  let overallSafety: MenuSafetyLevel;
  let summary: string;
  let score = 45;

  if (hasPositive && !hasCrossContam && !hasWarnings) {
    overallSafety = 'safe';
    score = Math.min(95, 78 + glutenFreeItems.length * 3);
    summary = `Found ${glutenFreeItems.length} gluten-free option${glutenFreeItems.length !== 1 ? 's' : ''} with no detected risks.`;
  } else if (hasPositive && (hasCrossContam || hasWarnings)) {
    overallSafety = 'caution';
    score = Math.max(45, 68 + glutenFreeItems.length * 2 - warnings.length * 9 - (hasCrossContam ? 12 : 0));
    summary = 'GF options found but risk factors detected. Consult staff before ordering.';
  } else if (!hasPositive && hasWarnings) {
    overallSafety = 'unsafe';
    score = Math.max(10, 34 - warnings.length * 6 - (hasCrossContam ? 10 : 0));
    summary = 'No explicit GF options found. Gluten-containing items are present.';
  } else {
    overallSafety = 'unknown';
    score = 40;
    summary = 'Insufficient menu information. Contact restaurant directly.';
  }

  return {
    overallSafety,
    score,
    glutenFreeItems,
    warnings,
    crossContamRisk,
    summary,
  };
}

/**
 * Calculates the safety score for a restaurant based on its menu text, GF menu clues, AI analysis, and other attributes.
 * Returns a RestaurantSafetyScore object containing the safety level, numeric score, title, summary, and reasons for the score.
 * The score is memoized to improve performance for repeated calculations on the same restaurant data.
 * @param restaurant The restaurant for which to calculate the safety score.
 * @param options Optional settings, including strictCeliac mode for stricter scoring.
 * @returns A RestaurantSafetyScore object summarizing the safety evaluation of the restaurant.
 */
export function getRestaurantSafetyScore(
  restaurant: Restaurant,
  options: { strictCeliac?: boolean } = {}
): RestaurantSafetyScore {
  const strictCeliac = options.strictCeliac === true;
  const cacheKey = safetyScoreCacheKey(restaurant, strictCeliac);
  const cached = safetyScoreCache.get(cacheKey);
  if (cached) return cached;

  const result = computeRestaurantSafetyScore(restaurant, strictCeliac);
  safetyScoreCache.set(cacheKey, result);
  trimSafetyScoreCache();
  return result;
}

/**
 * Computes the safety score for a restaurant based on its menu text, GF menu clues, AI analysis, and other attributes.
 * Returns a RestaurantSafetyScore object containing the safety level, numeric score, title, summary, and reasons for the score.
 * This function does not use memoization and is called by getRestaurantSafetyScore, which handles caching.
 * @param restaurant The restaurant for which to compute the safety score.
 * @param strictCeliac Whether to apply stricter scoring for strict celiac considerations.
 * @returns A RestaurantSafetyScore object summarizing the safety evaluation of the restaurant.
 */
function computeRestaurantSafetyScore(
  restaurant: Restaurant,
  strictCeliac: boolean
): RestaurantSafetyScore {
  const text = restaurant.rawMenuText?.trim() || restaurant.gfMenu.join('\n');
  const analysis = restaurant.aiAnalysisResult || (text.length > 0 ? analyseMenuText(text) : null);
  const reasons: string[] = [];
  const hasUnavailableScan = ['NO_MENU_CONTENT', 'FAILED', 'NO_WEBSITE'].includes(restaurant.menuScanStatus);

  if (!text && (!analysis || hasUnavailableScan)) {
    return {
      level: 'unknown',
      score: null,
      title: getSafetyTitle('unknown'),
      summary: getFallbackSummary(restaurant),
      reasons: ['No menu evidence available'],
    };
  }

  let score = analysis?.score ?? 35;

  if (restaurant.favoriteStatus === 'safe') {
    score += 12;
    reasons.push('Marked safe by you');
  } else if (restaurant.favoriteStatus === 'try') {
    score += 2;
    reasons.push('Marked as worth trying');
  } else if (restaurant.favoriteStatus === 'avoid') {
    score -= 35;
    reasons.push('Marked avoid by you');
  }

  if (restaurant.gfMenu.length > 0) {
    score += Math.min(18, 8 + restaurant.gfMenu.length * 2);
    reasons.push(`${restaurant.gfMenu.length} GF menu reference${restaurant.gfMenu.length !== 1 ? 's' : ''} found`);
  } else if (restaurant.hasGFMenu) {
    score += 8;
    reasons.push('Restaurant name suggests GF options');
  }

  if (restaurant.rating != null) {
    if (restaurant.rating >= 4.5) {
      score += 5;
      reasons.push('Highly rated');
    } else if (restaurant.rating < 3.5) {
      score -= 5;
      reasons.push('Lower rating');
    }
  }

  if (restaurant.openNow === false) {
    score -= 3;
    reasons.push('Currently closed');
  }

  if (strictCeliac && analysis?.crossContamRisk) {
    score -= 12;
    reasons.push('Strict mode: cross-contact language detected');
  }

  if (getGfConfidenceLevel(restaurant) === 'unavailable') {
    score -= 8;
    reasons.push('Menu evidence unavailable');
  }

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const level = getLevelForScore(clampedScore, analysis?.overallSafety);

  return {
    level,
    // Keep the numeric score inside the band for the final level so a high
    // local/favorite-boosted score cannot contradict an AI "unsafe"/"caution" label.
    score: capScoreForSafetyLevel(clampedScore, level),
    title: getSafetyTitle(level),
    summary: analysis?.summary ?? getFallbackSummary(restaurant),
    reasons: reasons.slice(0, 4),
  };
}

/** Lower rank = more cautious. Used so analysis overallSafety can never be "upgraded" by score. */
const SAFETY_LEVEL_RANK: Record<MenuSafetyLevel, number> = {
  unsafe: 0,
  unknown: 1,
  caution: 2,
  safe: 3,
};

/**
 * Maps a numeric score to a safety level, treating analysisLevel as a ceiling.
 * Example: AI says "unsafe" with local score 85 → still "unsafe".
 * Example: AI says "caution" with local score 80 → still "caution".
 * Example: AI says "safe" with local score 40 → still "safe".
 * @param score The numeric score to map to a safety level.
 * @param analysisLevel Optional ceiling for the safety level based on AI analysis.
 * @returns The resolved MenuSafetyLevel based on the score and analysisLevel.
 */
export function getLevelForScore(score: number, analysisLevel?: MenuSafetyLevel): MenuSafetyLevel {
  let levelFromScore: MenuSafetyLevel;
  if (score >= 75) levelFromScore = 'safe';
  else if (score >= 50) levelFromScore = 'caution';
  else if (score >= 35) levelFromScore = 'unknown';
  else levelFromScore = 'unsafe';

  if (!analysisLevel) return levelFromScore;

  return SAFETY_LEVEL_RANK[levelFromScore] > SAFETY_LEVEL_RANK[analysisLevel]
    ? analysisLevel
    : levelFromScore;
}

/** Caps a score so it cannot sit in a safer band than the resolved level. 
 * For example, a score of 85 with an analysisLevel of "caution" will be capped to 74. 
 * This ensures that the numeric score and the overall safety level are consistent and do not contradict each other. 
 * @param score The numeric score to cap.
 * @param level The resolved MenuSafetyLevel that serves as the ceiling for the score.
 * @returns The capped score that aligns with the safety level.
*/
export function capScoreForSafetyLevel(score: number, level: MenuSafetyLevel): number {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  if (level === 'unsafe') return Math.min(clamped, 34);
  if (level === 'unknown') return Math.min(clamped, 49);
  if (level === 'caution') return Math.min(clamped, 74);
  return clamped;
}

/**
 * Resolves overallSafety from score + optional AI/analysis ceiling, then caps the
 * numeric score so both fields always describe the same band.
 * This is useful for cases where the AI analysis provides a ceiling that should not be exceeded by the numeric score.
 * @param score The numeric score to align with the safety level.
 * @param analysisLevel Optional ceiling for the safety level based on AI analysis.
 * @returns An object containing the resolved overallSafety and the capped score.
 */
export function alignScoreWithSafetyLevel(
  score: number,
  analysisLevel?: MenuSafetyLevel
): { overallSafety: MenuSafetyLevel; score: number } {
  const overallSafety = getLevelForScore(score, analysisLevel);
  return {
    overallSafety,
    score: capScoreForSafetyLevel(score, overallSafety),
  };
}
/**
 * Returns a human-readable title for the given safety level.
 * @param level The MenuSafetyLevel for which to get the title.
 * @returns A string representing the title for the safety level.
 */
function getSafetyTitle(level: MenuSafetyLevel): string {
  if (level === 'safe') return 'Strong GF signal';
  if (level === 'caution') return 'Use caution';
  if (level === 'unsafe') return 'High risk';
  return 'Needs verification';
}
/**
 * Returns a fallback summary message for a restaurant based on its menu scan status.
 * This is used when there is insufficient menu evidence to provide a detailed summary.
 * @param restaurant The restaurant for which to get the fallback summary.
 * @returns A string representing the fallback summary message.
 */
function getFallbackSummary(restaurant: Restaurant): string {
  if (restaurant.menuScanStatus === 'FETCHING') return 'Menu scan is still running.';
  if (restaurant.menuScanStatus === 'NO_MENU_CONTENT') return 'The page loaded, but no menu content was found.';
  if (restaurant.menuScanStatus === 'NO_WEBSITE') return 'No website was found to inspect for menu evidence.';
  if (restaurant.menuScanStatus === 'FAILED') return 'Menu scan could not load reliable evidence.';
  return 'Not enough menu text is available yet.';
}



function extractGfItem(line: string): string {
  let cleaned = line.replace(TAG_STRIP_REGEX, '').replace(WHITESPACE_REGEX, ' ').trim();

  if (cleaned.length > 80) {
    const parts = cleaned.split(COMMA_SPLIT_REGEX);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 10 && trimmed.length < 60) {
        return capitalizeFirst(trimmed);
      }
    }
    return cleaned.slice(0, 80);
  }

  return capitalizeFirst(cleaned);
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
