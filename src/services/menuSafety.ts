import { Restaurant } from '../types/restaurant';
import { getGfConfidenceLevel } from '../util/restaurantUtils';

export type MenuSafetyLevel = 'safe' | 'caution' | 'unknown' | 'unsafe';

export interface MenuAnalysisResult {
  overallSafety: MenuSafetyLevel;
  score: number;
  glutenFreeItems: string[];
  warnings: string[];
  crossContamRisk: string;
  summary: string;
}

export interface RestaurantSafetyScore {
  level: MenuSafetyLevel;
  score: number;
  title: string;
  summary: string;
  reasons: string[];
}

const GF_POSITIVE = [
  /gluten[\s-]?free/i,
  /\bgf\b/i,
  /celiac[\s-]?friendly/i,
  /coeliac[\s-]?friendly/i,
  /no[\s-]?gluten/i,
];

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

const CC_PATTERNS = [
  /share[\s\w]{0,30}kitchen/gi,
  /cross[\s-]?contamin/gi,
  /same[\s\w]{0,20}fryer/gi,
  /shared?[\s\w]{0,20}fryer/gi,
  /not[\s-]?celiac[\s-]?safe/gi,
  /may contain wheat/gi,
  /processed in a facility/gi,
];

export function analyseMenuText(text: string): MenuAnalysisResult {
  const lines = text.split(/[\n\r]+/);
  const glutenFreeItems: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 10 || trimmed.length > 200) continue;

    if (GF_POSITIVE.some((pattern) => pattern.test(trimmed))) {
      const cleaned = extractGfItem(trimmed);
      if (cleaned && !glutenFreeItems.some((item) => item.toLowerCase() === cleaned.toLowerCase())) {
        glutenFreeItems.push(cleaned);
      }
    }
    if (glutenFreeItems.length >= 12) break;
  }

  const warnings: string[] = [];
  const foundGlutenSources = findGlutenSources(lines);
  if (foundGlutenSources.length > 0) {
    warnings.push(`Gluten-containing: ${foundGlutenSources.slice(0, 6).join(', ')}`);
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

export function getRestaurantSafetyScore(
  restaurant: Restaurant,
  options: { strictCeliac?: boolean } = {}
): RestaurantSafetyScore {
  const text = restaurant.rawMenuText?.trim() || restaurant.gfMenu.join('\n');
  const analysis = text.length > 0 ? analyseMenuText(text) : null;
  const reasons: string[] = [];
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

  if (options.strictCeliac && analysis?.crossContamRisk) {
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
    score: clampedScore,
    title: getSafetyTitle(level),
    summary: analysis?.summary ?? getFallbackSummary(restaurant),
    reasons: reasons.slice(0, 4),
  };
}

function getLevelForScore(score: number, analysisLevel?: MenuSafetyLevel): MenuSafetyLevel {
  if (analysisLevel === 'unsafe' && score < 55) return 'unsafe';
  if (analysisLevel === 'unknown' && score < 60) return 'unknown';
  if (score >= 75) return 'safe';
  if (score >= 50) return 'caution';
  if (score >= 35) return 'unknown';
  return 'unsafe';
}

function getSafetyTitle(level: MenuSafetyLevel): string {
  if (level === 'safe') return 'Strong GF signal';
  if (level === 'caution') return 'Use caution';
  if (level === 'unsafe') return 'High risk';
  return 'Needs verification';
}

function getFallbackSummary(restaurant: Restaurant): string {
  if (restaurant.menuScanStatus === 'FETCHING') return 'Menu scan is still running.';
  if (restaurant.menuScanStatus === 'NO_WEBSITE') return 'No website was found to inspect for menu evidence.';
  if (restaurant.menuScanStatus === 'FAILED') return 'Menu scan could not load reliable evidence.';
  return 'Not enough menu text is available yet.';
}

function findGlutenSources(lines: string[]): string[] {
  const found = new Set<string>();

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const gfLine = GF_POSITIVE.some((pattern) => pattern.test(lowerLine));
    for (const source of GLUTEN_SOURCES) {
      if (!lowerLine.includes(source)) continue;
      if (gfLine) continue;
      found.add(source);
    }
  }

  return [...found];
}

function extractGfItem(line: string): string {
  let cleaned = line.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

  if (cleaned.length > 80) {
    const parts = cleaned.split(/[,;]/);
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
