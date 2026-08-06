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
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, '\n');
}

/**
 * Converts HTML to a list of text segments, stripping tags and normalizing whitespace.
 */
export function htmlToTextSegments(html: string): string[] {
  const safeHtml = html.slice(0, 500_000);
  const withBreaks = stripNonContentTags(safeHtml)
    .replace(
      /<(?:br\s*\/?|\/p|\/div|\/li|\/ul|\/ol|\/section|\/article|\/tr|\/table|\/h[1-6])>/gi,
      '\n'
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, ' ') // Strip all remaining HTML tags
    .replace(/\{[\s\S]*?\}/g, ' ') // Strip JSON-like objects (often leaked from JS hydration)
    .replace(/\[[\s\S]*?\]/g, ' ') // Strip JSON-like arrays
    .replace(/[{}()[\]]/g, '') // Strip remaining stray brackets
    .replace(/[^\w\s.,!?'"$&%-]/g, ' ') // Strip weird unicode/garbled symbols
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n');

  return withBreaks
    .split('\n')
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(segment => segment.length > 2); // Filter out tiny random character fragments
}

/**
 * Attempts to find a potential menu link within an HTML string.
 */
export function findMenuLink(html: string, baseUrl: string): string | null {
  const menuPattern = /href=["']([^"']*(?:menu|food|eat|dining)[^"']*)["']/gi;
  const EXCLUDED_EXTENSIONS = /\.(?:pdf|jpg|jpeg|png|gif|svg|css|js|zip|mp4|webp)$/i;
  const seen = new Set<string>();

  for (const match of html.matchAll(menuPattern)) {
    const href = match[1]?.trim();
    if (!href || EXCLUDED_EXTENSIONS.test(href)) continue;
    
    if (
      href.startsWith('#') ||
      href.toLowerCase().startsWith('javascript:') ||
      href.toLowerCase().startsWith('mailto:') ||
      href.toLowerCase().startsWith('tel:')
    ) {
      continue;
    }

    try {
      const resolved = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
      const normalized = resolved.toLowerCase();
      if (seen.has(normalized)) continue;

      seen.add(normalized);
      return resolved;
    } catch (error) {
      logger.warn(`findMenuLink: failed to parse URL ${href}: ${error}`);
    }
  }

  return null;
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
    if (menuIndicators.some((indicator) => lower.includes(indicator)) && segments[index].length < 60) {
      return segments.slice(index, Math.min(index + 80, segments.length)).join('\n');
    }
  }

  return segments.slice(0, 120).join('\n');
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
