import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ThemeProvider } from '../../context/ThemeContext';
import { useRestaurants } from '../../context/RestaurantContext';
import { MenuScanProgress } from '../../types/restaurant';
import { ScanProgressBanner } from '../ScanProgressBanner';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../../context/RestaurantContext', () => ({
  useRestaurants: jest.fn(),
}));

const useRestaurantsMock = useRestaurants as jest.MockedFunction<typeof useRestaurants>;

describe('ScanProgressBanner', () => {
  const retryFailedScansMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useRestaurantsMock.mockReturnValue({
      retryFailedScans: retryFailedScansMock,
    } as any);
  });

  function renderBanner(progress: MenuScanProgress) {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider initialIsDark={false}>
          <ScanProgressBanner progress={progress} />
        </ThemeProvider>
      );
    });
    return renderer;
  }

  function getRenderedTexts(renderer: TestRenderer.ReactTestRenderer): string[] {
    return renderer.root.findAllByType(Text).map((node) => {
      const children = node.props.children;
      if (Array.isArray(children)) {
        return children.filter(Boolean).join('');
      }
      return String(children ?? '');
    });
  }

  it('renders active scan progress with activity indicator', () => {
    const renderer = renderBanner({
      active: true,
      completed: 3,
      total: 10,
      failed: 0,
    });

    const texts = getRenderedTexts(renderer);
    expect(texts.some((t) => t.includes('Scanning menus 3/10'))).toBe(true);
    expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Retry failed scans' })).toHaveLength(0);
  });

  it('renders completed scan progress when active is false', () => {
    const renderer = renderBanner({
      active: false,
      completed: 10,
      total: 10,
      failed: 0,
    });

    const texts = getRenderedTexts(renderer);
    expect(texts.some((t) => t.includes('Menu scans complete 10/10'))).toBe(true);
    expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Retry failed scans' })).toHaveLength(0);
  });

  it('renders failure count and retry button when failures exist and scan is finished', () => {
    const renderer = renderBanner({
      active: false,
      completed: 8,
      total: 10,
      failed: 2,
    });

    const texts = getRenderedTexts(renderer);
    expect(texts.some((t) => t.includes('2 failed'))).toBe(true);

    const retryBtn = renderer.root.findByProps({ accessibilityLabel: 'Retry failed scans' });
    expect(retryBtn).toBeDefined();

    act(() => {
      retryBtn.props.onPress();
    });

    expect(retryFailedScansMock).toHaveBeenCalledTimes(1);
  });

  it('does not render retry button while scans are still actively running even if some failed', () => {
    const renderer = renderBanner({
      active: true,
      completed: 2,
      total: 5,
      failed: 1,
    });

    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Retry failed scans' })).toHaveLength(0);
  });
});
