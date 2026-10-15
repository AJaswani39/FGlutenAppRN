import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import NetInfo, { NetInfoChangeHandler } from '@react-native-community/netinfo';
import { ThemeProvider } from '../../context/ThemeContext';
import { NetworkBanner } from '../NetworkBanner';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(),
}));

const netInfoMock = NetInfo as typeof NetInfo & {
  addEventListener: jest.MockedFunction<typeof NetInfo.addEventListener>;
};

describe('NetworkBanner', () => {
  let listeners: NetInfoChangeHandler[] = [];
  const unsubscribeMock = jest.fn();

  beforeEach(() => {
    listeners = [];
    unsubscribeMock.mockClear();
    netInfoMock.addEventListener.mockImplementation((handler) => {
      listeners.push(handler);
      return unsubscribeMock;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderBanner() {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ThemeProvider initialIsDark={false}>
          <NetworkBanner />
        </ThemeProvider>
      );
    });
    return renderer;
  }

  it('subscribes to NetInfo on mount and cleans up on unmount', () => {
    const renderer = renderBanner();
    expect(netInfoMock.addEventListener).toHaveBeenCalledTimes(1);

    act(() => {
      renderer.unmount();
    });
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('renders the offline message text', () => {
    const renderer = renderBanner();
    const texts = renderer.root.findAllByType(Text);
    const offlineText = texts.find((t) => t.props.children === 'No internet connection. AI disabled.');
    expect(offlineText).toBeDefined();
  });

  it('updates pointerEvents to auto when disconnected', () => {
    const renderer = renderBanner();
    const handler = listeners[0];

    act(() => {
      handler({
        type: 'none',
        isConnected: false,
        isInternetReachable: false,
        details: null,
      } as any);
    });

    const animatedView = renderer.root.findByProps({ pointerEvents: 'auto' });
    expect(animatedView).toBeDefined();
  });

  it('sets pointerEvents to none when connected and reachable', () => {
    const renderer = renderBanner();
    const handler = listeners[0];

    act(() => {
      handler({
        type: 'wifi',
        isConnected: true,
        isInternetReachable: true,
        details: null,
      } as any);
    });

    const animatedView = renderer.root.findByProps({ pointerEvents: 'none' });
    expect(animatedView).toBeDefined();
  });

  it('treats connected without internet reachability as disconnected', () => {
    const renderer = renderBanner();
    const handler = listeners[0];

    act(() => {
      handler({
        type: 'wifi',
        isConnected: true,
        isInternetReachable: false,
        details: null,
      } as any);
    });

    const animatedView = renderer.root.findByProps({ pointerEvents: 'auto' });
    expect(animatedView).toBeDefined();
  });

  it('ignores events where isConnected is null', () => {
    const renderer = renderBanner();
    const handler = listeners[0];

    act(() => {
      handler({
        type: 'unknown',
        isConnected: null,
        isInternetReachable: null,
        details: null,
      } as any);
    });

    const animatedView = renderer.root.findByProps({ pointerEvents: 'none' });
    expect(animatedView).toBeDefined();
  });
});
