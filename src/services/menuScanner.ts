import { Restaurant } from '../types/restaurant';
import {
  fetchHtml,
  fetchRenderedMenuText,
  fetchWebsiteForPlace,
} from '../data/placesRepository';
import {
  extractGfEvidence,
  extractRawMenuText,
  hasLikelyMenuContent,
  findMenuLink,
  htmlToTextSegments,
  normalizeHttpUrl,
} from '../util/htmlUtils';

export interface MenuScanResult {
  menuUrl: string | null;
  gfMenu: string[];
  rawMenuText: string | null;
  menuScanStatus: Restaurant['menuScanStatus'];
  menuScanTimestamp: number;
}

// Module-level: these are pure data lookups, no need to recompile per scan.
const JS_PROVIDERS = /toasttab\.com|chownow\.com|bentobox\.com|singleplatform\.com|doordash\.com|ubereats\.com|grubhub\.com/i;

/**
 * Determines if the restaurant's menu can be scanned using a browser-based fallback method.
 * This is true if the restaurant's menu scan status indicates that it is JS-only or has no menu content,
 * and the restaurant has a valid HTTPS menu URL.
 * @param restaurant The restaurant to check for browser-based menu scanning eligibility.
 * @returns True if the restaurant can be scanned using a browser fallback, false otherwise.
 */
export function canUseBrowserMenuFallback(
  restaurant: Pick<Restaurant, 'menuScanStatus' | 'menuUrl'>
): boolean {
  if (restaurant.menuScanStatus !== 'JS_ONLY' && restaurant.menuScanStatus !== 'NO_MENU_CONTENT') {
    return false;
  }

  const menuUrl = normalizeHttpUrl(restaurant.menuUrl);
  return Boolean(menuUrl?.startsWith('https://'));
}
/**
 * Scans the restaurant's menu using a browser-based fallback method, if eligible.
 * This method fetches the rendered menu text from the restaurant's menu URL, extracts GF evidence and raw menu text,
 * and returns a MenuScanResult object with the scan results. 
 * If the restaurant is not eligible for browser-based scanning, it returns null.
 * @param restaurant The restaurant to scan.
 * @param scanStartedAt The timestamp when the scan started.
 * @param htmlProxyBaseUrl Optional base URL for the HTML proxy service.
 * @param signal Optional AbortSignal to cancel the scan request.
 * @returns A Promise that resolves to a MenuScanResult object or null if the restaurant is not eligible for scanning.
 */
export async function scanRestaurantMenuWithBrowser({
  restaurant,
  scanStartedAt,
  htmlProxyBaseUrl = '',
  signal,
}: {
  restaurant: Restaurant;
  scanStartedAt: number;
  htmlProxyBaseUrl?: string;
  signal?: AbortSignal;
}): Promise<MenuScanResult | null> {
  if (!canUseBrowserMenuFallback(restaurant)) return null;

  const menuUrl = normalizeHttpUrl(restaurant.menuUrl);
  if (!menuUrl) return null;

  const renderedText = await fetchRenderedMenuText(menuUrl, htmlProxyBaseUrl, signal);
  const segments = renderedText ? htmlToTextSegments(renderedText) : [];
  const gfMenu = renderedText ? extractGfEvidence(segments) : [];
  const rawMenuText = renderedText ? extractRawMenuText(segments) : null;
  const hasMenuContent = renderedText ? hasLikelyMenuContent(segments) : false;
  const usableMenuText = hasMenuContent ? rawMenuText : null;

  return {
    menuUrl,
    gfMenu,
    rawMenuText: usableMenuText,
    menuScanStatus: usableMenuText ? 'SUCCESS' : 'NO_MENU_CONTENT',
    menuScanTimestamp: scanStartedAt,
  };
}

/**
 * Scans the restaurant's menu by fetching the website and extracting GF evidence and raw menu text.
 * This method handles various scenarios, including restaurants with no website, JS-heavy providers, and menu links.
 * It returns a MenuScanResult object with the scan results, including the menu URL, GF evidence, raw menu text,
 * and the menu scan status. If the restaurant cannot be scanned, it returns null.
 * @param restaurant The restaurant to scan.
 * @param mapsApiKey The Google Maps API key for fetching the restaurant's website.
 * @param scanStartedAt The timestamp when the scan started.
 * @param htmlProxyBaseUrl Optional base URL for the HTML proxy service.
 * @param signal Optional AbortSignal to cancel the scan request.
 * @returns A Promise that resolves to a MenuScanResult object or null if the restaurant cannot be scanned.
 */
export async function scanRestaurantMenu({
  restaurant,
  mapsApiKey,
  scanStartedAt,
  htmlProxyBaseUrl = '',
  signal,
}: {
  restaurant: Restaurant;
  mapsApiKey: string;
  scanStartedAt: number;
  htmlProxyBaseUrl?: string;
  signal?: AbortSignal;
}): Promise<MenuScanResult | null> {
  if (!mapsApiKey || !restaurant.placeId) return null;

  // Use existing menuUrl as a hint if available, otherwise fetch from Places API
  const websiteCandidate =
    restaurant.menuUrl || (await fetchWebsiteForPlace(restaurant.placeId, mapsApiKey, signal));
  const initialUrl = normalizeHttpUrl(websiteCandidate);

  if (!initialUrl) {
    return {
      menuUrl: null,
      gfMenu: [],
      rawMenuText: null,
      menuScanStatus: websiteCandidate ? 'FAILED' : 'NO_WEBSITE',
      menuScanTimestamp: scanStartedAt,
    };
  }

  // Detect JS-heavy providers that we can't scan with static HTML
  if (JS_PROVIDERS.test(initialUrl)) {
    return {
      menuUrl: initialUrl,
      gfMenu: [],
      rawMenuText: null,
      menuScanStatus: 'JS_ONLY',
      menuScanTimestamp: scanStartedAt,
    };
  }

  let menuUrl = initialUrl;
  let html = await fetchHtml(initialUrl, htmlProxyBaseUrl, signal);

  // If we found a specific menu link on the home page, try to fetch it for richer data
  if (html) {
    const menuLink = findMenuLink(html, initialUrl);
    if (menuLink && menuLink !== initialUrl) {
      const menuHtml = await fetchHtml(menuLink, htmlProxyBaseUrl, signal);
      if (menuHtml) {
        html = menuHtml;
        menuUrl = menuLink;
      }
    }
  }

  // Pre-parse the segments once to share between concurrent extraction tasks
  const segments = html ? htmlToTextSegments(html) : [];

  // Concurrent extraction: Run evidence extraction and text cleanup tasks in parallel.
  // We pass pre-parsed segments to avoid redundant regex-heavy parsing.
  const [gfMenu, rawMenuText] = await Promise.all([
    Promise.resolve(html ? extractGfEvidence(segments) : []),
    Promise.resolve(html ? extractRawMenuText(segments) : null),
  ]);
  const hasMenuContent = html ? hasLikelyMenuContent(segments) : false;
  const usableMenuText = hasMenuContent ? rawMenuText : null;

  return {
    menuUrl,
    gfMenu,
    rawMenuText: usableMenuText,
    menuScanStatus: usableMenuText ? 'SUCCESS' : html ? 'NO_MENU_CONTENT' : 'FAILED',
    menuScanTimestamp: scanStartedAt,
  };
}


