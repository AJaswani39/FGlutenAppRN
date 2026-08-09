import { logger } from './logger';

/**
 * Removes non-content tags like scripts, styles, and navigation from HTML string.
 */
export function stripNonContentTags(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '') // Strip HTML comments
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '') // Strip scripts robustly
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '') // Strip styles robustly
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '') // Strip noscript
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '') // Strip SVG graphics (often contain huge paths)
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '\n')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '\n')
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, '\n')
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, '\n')
    .replace(
      /<([a-z][\w-]*)\b([^>]*)>[\s\S]*?<\/\1>/gi,
      (fullMatch, tagName: string, attributes: string) => {
        const isUtilityRegion =
          /(?:class|id)\s*=\s*["'][^"']*(?:cookie|consent|privacy|gdpr|onetrust|cmp|utility|navigation|navbar|drawer|overlay|modal)[^"']*["']/i.test(
            attributes,
          );
        const isHiddenRegion =
          /\bhidden(?:\s*=\s*(?:["'][^"']*["']|[^\s>]+))?|aria-hidden\s*=\s*["']true["']/i.test(attributes);

        return isUtilityRegion || isHiddenRegion ? '\n' : fullMatch;
      },
    )
    .replace(
      /<([a-z][\w-]*)\b([^>]*)\/?\s*>/gi,
      (fullMatch, _tagName: string, attributes: string) => {
        const isHiddenElement =
          /\bhidden(?:\s*=\s*(?:["'][^"']*["']|[^\s>]+))?|aria-hidden\s*=\s*["']true["']/i.test(attributes);

        return isHiddenElement ? '\n' : fullMatch;
      },
    );
}

/**
 * Converts HTML to a list of text segments, stripping tags and normalizing whitespace.
 */
export function htmlToTextSegments(html: string): string[] {
  const safeHtml = html.slice(0, 500_000);
  const strippedHtml = stripNonContentTags(safeHtml);
  const menuFocusedHtml = extractMenuContainerHtml(strippedHtml);
  const sourceHtml = menuFocusedHtml || strippedHtml;
  const withBreaks = sourceHtml
    .replace(
      /<(?:br\s*\/?|\/p|\/div|\/li|\/ul|\/ol|\/section|\/article|\/tr|\/table|\/h[1-6])>/gi,
      '\n'
    )
    .replace(/&(?:nbsp|amp|quot|apos|lt|gt|egrave|ucirc|eacute|ntilde);|&#(?:x[0-9a-f]+|[0-9]+);/gi, decodeHtmlEntity)
    .replace(/<[^>]+>/g, ' ') // Strip all remaining HTML tags
    .replace(/\{[\s\S]*?\}/g, ' ') // Strip JSON-like objects (often leaked from JS hydration)
    .replace(/\[[\s\S]*?\]/g, ' ') // Strip JSON-like arrays
    .replace(/[{}()[\]]/g, '') // Strip remaining stray brackets
    .replace(/[^\p{L}\p{N}\s.,!?'"$&%-]/gu, ' ') // Strip symbols while preserving Unicode letters and numbers
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n');

  return withBreaks
    .split('\n')
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(
      (segment) =>
        !/^(?:revoke|manage|update|accept|reject)\s+(?:cookie|privacy|consent)|^(?:cookie|privacy)\s+(?:settings|preferences|consent)/i.test(
          segment,
        ),
    )
    .filter((segment) => !isLikelyNonMenuNoise(segment))
    .filter(segment => segment.length > 2); // Filter out tiny random character fragments
}

function extractMenuContainerHtml(html: string): string {
  const menuContainerPattern = /<([a-z][\w-]*)\b[^>]*(?:class|id)\s*=\s*["'][^"']*\b(?:menu|food|entrees?|appetizers?|desserts?|drinks?|beverages?)\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
  const blocks = Array.from(html.matchAll(menuContainerPattern), (match) => match[0]);
  return blocks.join('\n');
}

function decodeHtmlEntity(entity: string): string {
  const namedEntities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&egrave;': 'è',
    '&ucirc;': 'û',
    '&eacute;': 'é',
    '&ntilde;': 'ñ',
  };
  const named = namedEntities[entity.toLowerCase()];
  if (named !== undefined) return named;

  const numericMatch = entity.match(/^&#(x[0-9a-f]+|[0-9]+);$/i);
  if (!numericMatch) return entity;

  const codePoint = numericMatch[1].toLowerCase().startsWith('x')
    ? Number.parseInt(numericMatch[1].slice(1), 16)
    : Number.parseInt(numericMatch[1], 10);

  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : entity;
}

function isLikelyNonMenuNoise(segment: string): boolean {
  const cssClassTokens = segment.match(/\.[A-Za-z_-][\w-]*/g) || [];
  const cssPropertyTokens = segment.match(/\b(?:display|position|font-family|background-color|padding|margin)\s*:/gi) || [];
  const cssKeywordTokens = segment.match(/\b(?:font-family|background-color|justify-content|align-items|flex-direction)\b/gi) || [];
  const utilityCopy = /^(?:download|get|install|join|sign\s+up|follow|book|reserve|view|learn)\b.*\b(?:app|application|newsletter|rewards?|gift cards?|careers?|jobs?|reservations?)\b/i.test(
    segment,
  );
  const marketingCopy = /^(?:welcome|visit\s+us|find\s+us|contact\s+us|our\s+locations?|hours?|learn\s+more|subscribe)\b|\b(?:limited[- ]time|special\s+offer|now\s+available|join\s+our)\b/i.test(
    segment,
  );

  return (
    cssClassTokens.length >= 2 ||
    cssPropertyTokens.length >= 1 ||
    cssKeywordTokens.length >= 1 ||
    utilityCopy ||
    marketingCopy ||
    /^(?:var\(|@media\b|@font-face\b|from\s+['"]|import\s+)/i.test(segment)
  );
}

/**
 * Attempts to find a potential menu link within an HTML string.
 */
export function findMenuLink(html: string, baseUrl: string): string | null {
  const menuPattern = /href=["']([^"']*(?:menu|food|eat|dining)[^"']*)["']/gi;
  const EXCLUDED_EXTENSIONS = /\.(?:pdf|jpg|jpeg|png|gif|svg|css|js|zip|mp4|webp)$/i;
  const EXCLUDED_PATHS = /(?:catering|private[-_ ]?dining|events?|reservations?|privacy|account|login|order[-_ ]?online|delivery)/i;
  const seen = new Set<string>();
  const candidates: Array<{ url: string; score: number }> = [];

  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch (error) {
    logger.warn(`findMenuLink: failed to parse base URL ${baseUrl}: ${error}`);
    return null;
  }

  for (const match of html.matchAll(menuPattern)) {
    const href = match[1]?.trim();
    if (!href) continue;
    
    if (
      href.startsWith('#') ||
      href.toLowerCase().startsWith('javascript:') ||
      href.toLowerCase().startsWith('mailto:') ||
      href.toLowerCase().startsWith('tel:')
    ) {
      continue;
    }

    try {
      const resolvedUrl = new URL(href, base);
      if (resolvedUrl.protocol !== 'http:' && resolvedUrl.protocol !== 'https:') continue;

      const pathname = resolvedUrl.pathname.toLowerCase();
      if (EXCLUDED_EXTENSIONS.test(pathname) || EXCLUDED_PATHS.test(pathname)) continue;

      const pathAndQuery = `${pathname}${resolvedUrl.search}`;

      let score = 0;
      if (/\bmenu\b/.test(pathAndQuery)) score += 5;
      if (/\bfood\b/.test(pathAndQuery)) score += 3;
      if (/\b(?:eat|dining)\b/.test(pathAndQuery)) score += 1;
      if (resolvedUrl.origin === base.origin) score += 1;

      resolvedUrl.hash = '';
      const resolved = resolvedUrl.toString();
      const normalized = resolved.toLowerCase();
      if (seen.has(normalized)) continue;

      seen.add(normalized);
      candidates.push({ url: resolved, score });
    } catch (error) {
      logger.warn(`findMenuLink: failed to parse URL ${href}: ${error}`);
    }
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.url || null;
}

export function normalizeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Cleans a menu line, removing tags and truncating long fragments.
 */
export function cleanMenuLine(line: string): string {
  let cleaned = line.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length > 100) {
    const fragments = cleaned.split(/[.!?]/);
    for (const fragment of fragments) {
      if (
        /gluten[\s-]?free|\bgf\b|celiac|coeliac/i.test(fragment) &&
        fragment.trim().length > 15
      ) {
        cleaned = fragment.trim();
        break;
      }
    }
  }

  return cleaned.slice(0, 200);
}

/**
 * Searches for indicators of a menu section in text segments.
 */
export function findMainContent(segments: string[]): string {
  const menuIndicators = ['menu', 'food', 'dining', 'entree', 'appetizer', 'dessert'];

  for (let index = 0; index < segments.length; index += 1) {
    const lower = segments[index].toLowerCase();
    const isMenuHeading =
      /\bmenu\b/i.test(lower) ||
      menuIndicators.slice(1).some((indicator) => new RegExp(`^${indicator}s?\\b`, 'i').test(lower));

    if (isMenuHeading && segments[index].length < 60) {
      const block = segments.slice(index, Math.min(index + 80, segments.length));
      const focusedItems = block.slice(1).filter(isLikelyMenuItem);
      if (focusedItems.length >= 2) {
        return [block[0], ...includeMenuDescriptions(block)].join('\n');
      }
      return block.join('\n');
    }
  }

  return '';
}

function isLikelyMenuItem(segment: string): boolean {
  if (segment.length < 4 || segment.length > 160) return false;
  if (/(?:\$\s?\d+(?:\.\d{1,2})?|\b\d+(?:\.\d{1,2})?\s?(?:usd|dollars?)\b)/i.test(segment)) return true;
  if (/^(?:appetizers?|entrees?|mains?|desserts?|drinks?|beverages?|sides?)\b/i.test(segment)) return true;
  if (/gluten[\s-]?free|\bgf\b|celiac|coeliac/i.test(segment)) return true;
  return /^[A-Z][\w'&-]*(?:\s+[A-Z][\w'&-]*){1,5}(?:\s|$)/.test(segment);
}

function includeMenuDescriptions(block: string[]): string[] {
  const selected: string[] = [];

  for (let index = 1; index < block.length; index += 1) {
    const segment = block[index];
    if (isLikelyMenuItem(segment)) {
      selected.push(segment);
      const next = block[index + 1];
      if (next && isLikelyMenuDescription(next)) {
        selected.push(next);
        index += 1;
      }
    }
  }

  return selected;
}

function isLikelyMenuDescription(segment: string): boolean {
  return (
    segment.length >= 20 &&
    segment.length <= 140 &&
    !isLikelyMenuItem(segment) &&
    /\b(?:with|served|topped|made|contains|includes|choice|sauce|dressing|allergen|wheat|milk|egg|soy|nuts?)\b/i.test(segment)
  );
}

/**
 * Extracts snippets of gluten-free evidence from HTML or text segments.
 */
export function extractGfEvidence(htmlOrSegments: string | string[]): string[] {
  const segments = typeof htmlOrSegments === 'string' ? htmlToTextSegments(htmlOrSegments) : htmlOrSegments;
  const evidence: string[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    if (!/gluten[\s-]?free|\bgf\b|celiac|coeliac/i.test(segment)) continue;
    if (segment.length <= 10 || segment.length >= 250) continue;

    const cleaned = cleanMenuLine(segment);
    const normalized = cleaned.toLowerCase().replace(/[\s-]+/g, ' ').trim();
    if (!cleaned || seen.has(normalized)) continue;

    seen.add(normalized);
    evidence.push(cleaned);

    if (evidence.length >= 15) {
      break;
    }
  }

  return evidence;
}

/**
 * Extracts a larger block of raw menu text for scanning.
 */
export function extractRawMenuText(htmlOrSegments: string | string[]): string {
  const segments = typeof htmlOrSegments === 'string' ? htmlToTextSegments(htmlOrSegments) : htmlOrSegments;
  return findMainContent(segments).slice(0, 3000);
}

export function hasLikelyMenuContent(segments: string[]): boolean {
  const itemLikeSegments = segments.filter((segment) => {
    if (segment.length < 4 || segment.length > 160) return false;
    if (/\bmenu\b|\b(?:food|dining|entrees?|appetizers?|desserts?)\b/i.test(segment)) return false;
    return !/^(?:welcome|about|contact|hours|location|catering|private events)\b/i.test(segment);
  });
  const priceLines = segments.filter((segment) => /(?:\$\s?\d+(?:\.\d{1,2})?|\b\d+(?:\.\d{1,2})?\s?(?:usd|dollars?)\b)/i.test(segment));
  const categoryHeadings = segments.filter((segment) => /^(?:appetizers?|entrees?|mains?|desserts?|drinks?|beverages?|sides?)\b/i.test(segment));
  const gfEvidence = segments.filter((segment) => /gluten[\s-]?free|\bgf\b|celiac|coeliac/i.test(segment));

  return (
    (itemLikeSegments.length >= 2 && (priceLines.length > 0 || categoryHeadings.length > 0 || gfEvidence.length > 0)) ||
    (itemLikeSegments.length >= 1 && gfEvidence.length > 0)
  );
}
