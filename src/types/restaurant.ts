export type MenuScanStatus = 'NOT_STARTED' | 'FETCHING' | 'SUCCESS' | 'NO_WEBSITE' | 'FAILED' | 'JS_ONLY';
export type FavoriteStatus = 'safe' | 'try' | 'avoid' | null;
export type SortMode = 'distance' | 'name';
export type GfConfidenceLevel = 'confirmed' | 'name_match' | 'no_evidence' | 'unavailable' | 'pending';

export interface AiChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface Restaurant {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  openNow: boolean | null;
  hasGFMenu: boolean;
  gfMenu: string[];
  distanceMeters: number;
  menuUrl: string | null;
  rawMenuText: string | null;
  menuScanStatus: MenuScanStatus;
  menuScanTimestamp: number;
  favoriteStatus: FavoriteStatus;
  aiAnalysisResult?: any | null; // Using any to avoid circular dependency for now, or we move the type
  aiChatHistory?: AiChatMessage[];
}

export interface RestaurantFilters {
  gfOnly: boolean;
  openNowOnly: boolean;
  sortMode: SortMode;
  maxDistanceMeters: number;
  minRating: number;
  searchQuery: string;
}

export type AppStatus = 'idle' | 'loading' | 'success' | 'permission_required' | 'error';

export interface RestaurantUiState {
  status: AppStatus;
  restaurants: Restaurant[];
  message: string | null;
  userLatitude: number | null;
  userLongitude: number | null;
  scanProgress: MenuScanProgress | null;
}

export interface MenuScanProgress {
  completed: number;
  total: number;
  failed: number;
  active: boolean;
}
