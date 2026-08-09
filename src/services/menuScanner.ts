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

export function canUseBrowserMenuFallback(
  restaurant: Pick<Restaurant, 'menuScanStatus' | 'menuUrl'>
): boolean {
  if (restaurant.menuScanStatus !== 'JS_ONLY' && restaurant.menuScanStatus !== 'NO_MENU_CONTENT') {
    return false;
  }

  const menuUrl = normalizeHttpUrl(restaurant.menuUrl);
  return Boolean(menuUrl?.startsWith('https://'));
}

export async function scanRestaurantMenuWithBrowser({
  restaurant,
  scanStartedAt,
  htmlProxyBaseUrl = '',
}: {
  restaurant: Restaurant;
  scanStartedAt: number;
  htmlProxyBaseUrl?: string;
}): Promise<MenuScanResult | null> {
  if (!canUseBrowserMenuFallback(restaurant)) return null;

  const menuUrl = normalizeHttpUrl(restaurant.menuUrl);
  if (!menuUrl) return null;

  const renderedText = await fetchRenderedMenuText(menuUrl, htmlProxyBaseUrl);
  const segments = renderedText ? htmlToTextSegments(renderedText) : [];
  const [gfMenu, rawMenuText] = await Promise.all([
    Promise.resolve(renderedText ? extractGfEvidence(segments) : []),
    Promise.resolve(renderedText ? extractRawMenuText(segments) : null),
  ]);
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

export async function scanRestaurantMenu({
  restaurant,
  mapsApiKey,
  scanStartedAt,
  htmlProxyBaseUrl = '',
}: {
  restaurant: Restaurant;
  mapsApiKey: string;
  scanStartedAt: number;
  htmlProxyBaseUrl?: string;
}): Promise<MenuScanResult | null> {
  if (!mapsApiKey || !restaurant.placeId) return null;

  // Use existing menuUrl as a hint if available, otherwise fetch from Places API
  const websiteCandidate =
    restaurant.menuUrl || (await fetchWebsiteForPlace(restaurant.placeId, mapsApiKey));
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
  const JS_PROVIDERS = /toasttab\.com|chownow\.com|bentobox\.com|singleplatform\.com|doordash\.com|ubereats\.com|grubhub\.com/i;
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
  let html = await fetchHtml(initialUrl, htmlProxyBaseUrl);

  // If we found a specific menu link on the home page, try to fetch it for richer data
  if (html) {
    const menuLink = findMenuLink(html, initialUrl);
    if (menuLink && menuLink !== initialUrl) {
      const menuHtml = await fetchHtml(menuLink, htmlProxyBaseUrl);
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


