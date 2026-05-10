import { Restaurant } from '../types/restaurant';
import {
  extractGfEvidence,
  extractRawMenuText,
  fetchHtml,
  fetchWebsiteForPlace,
  findMenuLink,
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

  const website = await fetchWebsiteForPlace(restaurant.placeId, mapsApiKey);
  if (!website) {
    return {
      menuUrl: null,
      gfMenu: [],
      rawMenuText: null,
      menuScanStatus: 'NO_WEBSITE',
      menuScanTimestamp: scanStartedAt,
    };
  }

  let menuUrl = website;
  let html = await fetchHtml(website);
  if (html) {
    const menuLink = findMenuLink(html, website);
    if (menuLink && menuLink !== website) {
      menuUrl = menuLink;
      const menuHtml = await fetchHtml(menuLink);
      if (menuHtml) {
        html = menuHtml;
      } else {
        menuUrl = website;
      }
    }
  }

  return {
    menuUrl,
    gfMenu: html ? extractGfEvidence(html) : [],
    rawMenuText: html ? extractRawMenuText(html) : null,
    menuScanStatus: html ? 'SUCCESS' : 'FAILED',
    menuScanTimestamp: scanStartedAt,
  };
}
