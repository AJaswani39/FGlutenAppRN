import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, jest } from '@jest/globals';
import { ThemeProvider } from '../../context/ThemeContext';
import { Restaurant } from '../../types/restaurant';
import {
  RestaurantSummaryCard,
  getConfidenceMeta,
  getFavoriteMeta,
} from '../RestaurantSummaryCard';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

function createRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    placeId: 'place-123',
    name: 'Gluten Free Bakery',
    address: '100 Main St',
    latitude: 40.7,
    longitude: -74.0,
    rating: 4.8,
    openNow: true,
    hasGFMenu: true,
    gfMenu: ['Bread', 'Muffins'],
    distanceMeters: 1609, // ~1.0 mi or ~1.6 km
    menuUrl: 'https://example.com/menu',
    rawMenuText: 'GF items available',
    menuScanStatus: 'SUCCESS',
    menuScanTimestamp: 1700000000000,
    favoriteStatus: null,
    ...overrides,
  };
}

describe('RestaurantSummaryCard helper functions', () => {
  describe('getFavoriteMeta', () => {
    it('returns meta for safe', () => {
      expect(getFavoriteMeta('safe')).toEqual({
        label: 'Safe',
        tone: 'success',
        icon: 'shield-checkmark',
      });
    });

    it('returns meta for try', () => {
      expect(getFavoriteMeta('try')).toEqual({
        label: 'Try',
        tone: 'warning',
        icon: 'flag',
      });
    });

    it('returns meta for avoid', () => {
      expect(getFavoriteMeta('avoid')).toEqual({
        label: 'Avoid',
        tone: 'error',
        icon: 'close-circle',
      });
    });

    it('returns null when favoriteStatus is null', () => {
      expect(getFavoriteMeta(null)).toBeNull();
    });
  });

  describe('getConfidenceMeta', () => {
    it('returns confirmed for restaurant with GF menu', () => {
      const meta = getConfidenceMeta(createRestaurant({ hasGFMenu: true, gfMenu: ['Bread'] }));
      expect(meta.label).toBe('Confirmed');
      expect(meta.tone).toBe('success');
    });

    it('returns likely GF for name matches without explicit menu', () => {
      const meta = getConfidenceMeta(
        createRestaurant({
          name: 'Gluten Free Pizza',
          hasGFMenu: true,
          gfMenu: [],
          menuScanStatus: 'NOT_STARTED',
        })
      );
      expect(meta.label).toBe('Likely GF');
      expect(meta.tone).toBe('warning');
    });

    it('returns no evidence when scan completed without findings', () => {
      const meta = getConfidenceMeta(
        createRestaurant({
          name: 'Regular Burger',
          hasGFMenu: false,
          gfMenu: [],
          menuScanStatus: 'SUCCESS',
        })
      );
      expect(meta.label).toBe('No evidence');
      expect(meta.tone).toBe('neutral');
    });

    it('returns unavailable when scan failed without menu', () => {
      const meta = getConfidenceMeta(
        createRestaurant({
          name: 'Regular Cafe',
          hasGFMenu: false,
          gfMenu: [],
          menuScanStatus: 'FAILED',
          menuUrl: null,
        })
      );
      expect(meta.label).toBe('Unavailable');
    });
  });
});

describe('RestaurantSummaryCard component', () => {
  function renderCard(props: {
    restaurant: Restaurant;
    useMiles?: boolean;
    onPress?: () => void;
    compact?: boolean;
    onRescan?: () => void;
    onShare?: () => void;
  }) {
    const { useMiles = true, ...rest } = props;
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider initialIsDark={false}>
          <RestaurantSummaryCard useMiles={useMiles} {...rest} />
        </ThemeProvider>
      );
    });
    return renderer;
  }

  it('renders restaurant name and address', () => {
    const renderer = renderCard({
      restaurant: createRestaurant({ name: 'Wildflour Bakery', address: '456 Oak Rd' }),
    });
    const texts = renderer.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('Wildflour Bakery');
    expect(texts).toContain('456 Oak Rd');
  });

  it('renders fallback address when empty', () => {
    const renderer = renderCard({
      restaurant: createRestaurant({ address: '' }),
    });
    const texts = renderer.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('Address unavailable');
  });

  it('formats distance in miles and km correctly', () => {
    const milesRenderer = renderCard({
      restaurant: createRestaurant({ distanceMeters: 1609 }),
      useMiles: true,
    });
    const milesTexts = milesRenderer.root.findAllByType(Text).map((t) => t.props.children);
    expect(milesTexts.some((txt) => typeof txt === 'string' && txt.includes('mi'))).toBe(true);

    const kmRenderer = renderCard({
      restaurant: createRestaurant({ distanceMeters: 1609 }),
      useMiles: false,
    });
    const kmTexts = kmRenderer.root.findAllByType(Text).map((t) => t.props.children);
    expect(kmTexts.some((txt) => typeof txt === 'string' && txt.includes('km'))).toBe(true);
  });

  it('displays favorite badge override when set', () => {
    const renderer = renderCard({
      restaurant: createRestaurant({ favoriteStatus: 'safe' }),
    });
    const texts = renderer.root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('Safe');
  });

  it('triggers onPress callback when container is tapped', () => {
    const onPressMock = jest.fn();
    const renderer = renderCard({
      restaurant: createRestaurant(),
      onPress: onPressMock,
    });

    const pressable = renderer.root.findByProps({ accessibilityRole: 'button' });
    act(() => {
      pressable.props.onPress();
    });

    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('renders retry button and triggers onRescan when scan failed', () => {
    const onRescanMock = jest.fn();
    const renderer = renderCard({
      restaurant: createRestaurant({ menuScanStatus: 'FAILED' }),
      onRescan: onRescanMock,
    });

    const retryBtn = renderer.root.findByProps({ accessibilityLabel: 'Retry menu scan' });
    expect(retryBtn).toBeDefined();

    act(() => {
      retryBtn.props.onPress({ stopPropagation: () => {} });
    });

    expect(onRescanMock).toHaveBeenCalledTimes(1);
  });

  it('renders share button when onShare provided and shareable content exists', () => {
    const onShareMock = jest.fn();
    const renderer = renderCard({
      restaurant: createRestaurant({ rawMenuText: 'GF Pasta available' }),
      onShare: onShareMock,
    });

    const shareBtn = renderer.root.findByProps({ accessibilityLabel: 'Share Gluten Free Bakery safety card' });
    expect(shareBtn).toBeDefined();

    act(() => {
      shareBtn.props.onPress({ stopPropagation: () => {} });
    });

    expect(onShareMock).toHaveBeenCalledTimes(1);
  });
});
