import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { act, render, RenderResult, userEvent } from '@testing-library/react-native';
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
const retryFailedScansMock = jest.fn();
const restaurantsContextValue: ReturnType<typeof useRestaurants> = {
  uiState: {
    status: 'idle',
    restaurants: [],
    message: null,
    userLatitude: null,
    userLongitude: null,
    scanProgress: null,
  },
  savedRestaurants: [],
  loadNearbyRestaurants: async () => undefined,
  setFavoriteStatus: () => undefined,
  requestMenuRescan: () => undefined,
  requestInteractiveMenuRender: () => undefined,
  retryFailedScans: retryFailedScansMock,
  updateAiSession: () => undefined,
  clearAllData: async () => undefined,
};

describe('ScanProgressBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRestaurantsMock.mockReturnValue(restaurantsContextValue);
  });

  async function renderBanner(progress: MenuScanProgress) {
    let renderer!: RenderResult;
    await act(async () => {
      renderer = await render(
        <ThemeProvider initialIsDark={false}>
          <ScanProgressBanner progress={progress} />
        </ThemeProvider>
      );
    });
    return renderer;
  }

  function getRenderedTexts(renderer: RenderResult): string[] {
    return renderer.container.queryAll((node) => node.type === 'Text').map((node) => {
      const children = node.props.children;
      if (Array.isArray(children)) {
        return children.filter(Boolean).join('');
      }
      return String(children ?? '');
    });
  }

  it('renders active scan progress with activity indicator', async () => {
    const renderer = await renderBanner({
      active: true,
      completed: 3,
      total: 10,
      failed: 0,
    });

    const texts = getRenderedTexts(renderer);
    expect(texts.some((t) => t.includes('Scanning menus 3/10'))).toBe(true);
    expect(renderer.container.queryAll((node) => node.type === 'ActivityIndicator')).toHaveLength(1);
    expect(renderer.container.queryAll((node) => node.props.accessibilityLabel === 'Retry failed scans')).toHaveLength(0);
  });

  it('renders completed scan progress when active is false', async () => {
    const renderer = await renderBanner({
      active: false,
      completed: 10,
      total: 10,
      failed: 0,
    });

    const texts = getRenderedTexts(renderer);
    expect(texts.some((t) => t.includes('Menu scans complete 10/10'))).toBe(true);
    expect(renderer.container.queryAll((node) => node.type === 'ActivityIndicator')).toHaveLength(0);
    expect(renderer.container.queryAll((node) => node.props.accessibilityLabel === 'Retry failed scans')).toHaveLength(0);
  });

  it('renders failure count and retry button when failures exist and scan is finished', async () => {
    const renderer = await renderBanner({
      active: false,
      completed: 8,
      total: 10,
      failed: 2,
    });

    const texts = getRenderedTexts(renderer);
    expect(texts.some((t) => t.includes('2 failed'))).toBe(true);

    const retryBtn = renderer.container.queryAll((node) => node.props.accessibilityLabel === 'Retry failed scans')[0];
    expect(retryBtn).toBeDefined();

    await userEvent.press(retryBtn);

    expect(retryFailedScansMock).toHaveBeenCalledTimes(1);
  });

  it('does not render retry button while scans are still actively running even if some failed', async () => {
    const renderer = await renderBanner({
      active: true,
      completed: 2,
      total: 5,
      failed: 1,
    });

    expect(renderer.container.queryAll((node) => node.props.accessibilityLabel === 'Retry failed scans')).toHaveLength(0);
  });
});
