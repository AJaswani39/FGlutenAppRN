export {
  MENU_SCAN_TTL_MS,
  MAX_SCANS_PER_BATCH,
  CONCURRENT_SCAN_LIMIT,
} from '../constants/scan';

export { getMenuScanTargets } from '../util/scanUtils';

export type { EmptyResultsReason } from '../util/collectionUtils';
export {
  getCollectionReason,
  getEmptyResultsMessage,
  resolveFilteredRestaurantUiState,
  applyFavoritesToRestaurants,
  getSavedRestaurants,
  mergeSavedRestaurants,
} from '../util/collectionUtils';

export { prepareCachedRestaurants, getScanProgressForRestaurants, getCachedResultsMessage } from '../util/cacheUtils';

export { getMapsApiKey, getAiProxyBaseUrl } from '../config/platformConfig';