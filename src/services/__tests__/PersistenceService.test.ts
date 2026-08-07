import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_FILTERS,
  PersistenceService,
  normalizeCachePayload,
  normalizeFavoriteMap,
  normalizeFilters,
  normalizeMenuScanCache,
} from '../persistenceService';

jest.mock('@react-native-async-storage/async-storage');

const storage = AsyncStorage as typeof AsyncStorage & { __reset: () => void };

describe('PersistenceService', () => {
  beforeEach(() => {
    storage.__reset();
  });

  it('normalizes invalid saved filters back to safe defaults', async () => {
    await AsyncStorage.setItem(
      'restaurant_filters',
      JSON.stringify({
        gfOnly: 'yes',
        openNowOnly: true,
        sortMode: 'popularity',
        maxDistanceMeters: -50,
        minRating: 9,
        searchQuery: 42,
      })
    );

    await expect(PersistenceService.loadFilters()).resolves.toEqual({
      ...DEFAULT_FILTERS,
      openNowOnly: true,
      minRating: 5,
    });
  });

  it('returns only valid favorite statuses', () => {
    expect(
      normalizeFavoriteMap({
        'pid:1': 'safe',
        'pid:2': 'unknown',
        '': 'avoid',
        'na:Name|Address': 'try',
      })
    ).toEqual({
      'pid:1': 'safe',
      'na:Name|Address': 'try',
    });
  });

  it('drops invalid cache payloads and keeps normalized restaurants', () => {
    expect(normalizeCachePayload({ restaurants: 'invalid' })).toBeNull();

    expect(
      normalizeCachePayload({
        restaurants: [
          {
            placeId: 'abc',
            name: 'GF Spot',
            address: '123 Main',
            latitude: 10,
            longitude: 20,
            rating: 4.8,
            openNow: true,
            hasGFMenu: true,
            gfMenu: [' Gluten Free Pizza ', 7, ''],
            distanceMeters: 1200,
            menuUrl: 'https://example.com/menu',
            rawMenuText: 'Sample menu',
            menuScanStatus: 'SUCCESS',
            menuScanTimestamp: 123,
            favoriteStatus: 'safe',
          },
        ],
        lat: 40,
        lng: -70,
        timestamp: 999,
      })
    ).toEqual({
      restaurants: [
        {
          placeId: 'abc',
          name: 'GF Spot',
          address: '123 Main',
          latitude: 10,
          longitude: 20,
          rating: 4.8,
          openNow: true,
          hasGFMenu: true,
          gfMenu: ['Gluten Free Pizza'],
          distanceMeters: 1200,
          menuUrl: 'https://example.com/menu',
          rawMenuText: 'Sample menu',
          menuScanStatus: 'SUCCESS',
          menuScanTimestamp: 123,
          favoriteStatus: 'safe',
          aiAnalysisResult: null,
          aiChatHistory: undefined,
          aiDeepAnalysis: null,
        },
      ],
      lat: 40,
      lng: -70,
      timestamp: 999,
    });
  });

  it('normalizes filter helpers directly', () => {
    expect(normalizeFilters({ gfOnly: true, sortMode: 'name', searchQuery: '  tacos  ' })).toEqual({
      ...DEFAULT_FILTERS,
      gfOnly: true,
      sortMode: 'name',
      searchQuery: 'tacos',
    });
  });

  it('keeps only fresh terminal menu scan cache entries', () => {
    const now = 10_000;
    const maxAgeMs = 5_000;

    expect(
      normalizeMenuScanCache(
        {
          fresh: {
            placeId: 'fresh',
            gfMenu: [' GF tacos ', 12],
            rawMenuText: 'menu text',
            menuScanStatus: 'SUCCESS',
            menuScanTimestamp: now - 1000,
          },
          expired: {
            placeId: 'expired',
            gfMenu: ['GF salad'],
            menuScanStatus: 'SUCCESS',
            menuScanTimestamp: now - 6000,
          },
          fetching: {
            placeId: 'fetching',
            gfMenu: ['GF bowl'],
            menuScanStatus: 'FETCHING',
            menuScanTimestamp: now,
          },
        },
        maxAgeMs,
        now
      )
    ).toEqual({
      fresh: {
        placeId: 'fresh',
        gfMenu: ['GF tacos'],
        rawMenuText: 'menu text',
        menuScanStatus: 'SUCCESS',
        menuScanTimestamp: now - 1000,
        aiAnalysisResult: null,
        aiChatHistory: undefined,
        aiDeepAnalysis: null,
      },
    });
  });

  it('saves and loads menu scan cache entries', async () => {
    await PersistenceService.saveMenuScanCacheEntry(
      {
        placeId: 'scan-place',
        name: 'Scan Place',
        address: '',
        latitude: 10,
        longitude: 20,
        rating: null,
        openNow: null,
        hasGFMenu: false,
        gfMenu: ['GF pasta'],
        distanceMeters: 0,
        menuUrl: 'https://example.com/menu',
        rawMenuText: 'GF pasta',
        menuScanStatus: 'SUCCESS',
        menuScanTimestamp: Date.now(),
        favoriteStatus: null,
      },
      14 * 24 * 60 * 60 * 1000
    );

    await expect(PersistenceService.loadMenuScanCache(14 * 24 * 60 * 60 * 1000)).resolves.toMatchObject({
      'scan-place': {
        placeId: 'scan-place',
        gfMenu: ['GF pasta'],
        rawMenuText: 'GF pasta',
        menuScanStatus: 'SUCCESS',
      },
    });
  });
});
