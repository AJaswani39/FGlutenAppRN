import {
  extractGfEvidence,
  extractRawMenuText,
  fetchHtml,
  fetchWebsiteForPlace,
  findMenuLink,
  htmlToTextSegments,
} from '../data/placesRepository';

export interface MenuScanResult {
  menuUrl: string | null;
  gfMenu: string[];
  rawMenuText: string | null;
  menuScanStatus: Restaurant['menuScanStatus'];
  menuScanTimestamp: number;
}

export async function scanRestaurantMenu({
  restaurant,
  mapsApiKey,
  scanStartedAt,
}: {
  restaurant: Restaurant;
  mapsApiKey: string;
  scanStartedAt: number;
}): Promise<MenuScanResult | null> {
  if (!mapsApiKey || !restaurant.placeId) return null;

  // Use existing menuUrl as a hint if available, otherwise fetch from Places API
  const initialUrl =
    restaurant.menuUrl || (await fetchWebsiteForPlace(restaurant.placeId, mapsApiKey));

  if (!initialUrl) {
    return {
      menuUrl: null,
      gfMenu: [],
      rawMenuText: null,
      menuScanStatus: 'NO_WEBSITE',
      menuScanTimestamp: scanStartedAt,
    };
  }

  let menuUrl = initialUrl;
  let html = await fetchHtml(initialUrl);

  // If we found a specific menu link on the home page, try to fetch it for richer data
  if (html) {
    const menuLink = findMenuLink(html, initialUrl);
    if (menuLink && menuLink !== initialUrl) {
      const menuHtml = await fetchHtml(menuLink);
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

  return {
    menuUrl,
    gfMenu,
    rawMenuText,
    menuScanStatus: html ? 'SUCCESS' : 'FAILED',
    menuScanTimestamp: scanStartedAt,
  };
}


