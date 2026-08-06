import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_FILTERS,
  PersistenceService,
  normalizeCachePayload,
  normalizeFavoriteMap,
  normalizeFilters,
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
});
