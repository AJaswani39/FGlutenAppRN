import React from 'react';
import { Text } from 'react-native';
import { act, render, RenderResult } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import NetInfo, {
  NetInfoChangeHandler,
  NetInfoState,
  NetInfoStateType,
} from '@react-native-community/netinfo';
import { ThemeProvider } from '../../context/ThemeContext';
import { NetworkBanner } from '../NetworkBanner';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-native-community/netinfo', () => ({
  NetInfoStateType: {
    unknown: 'unknown',
    none: 'none',
    cellular: 'cellular',
    wifi: 'wifi',
    bluetooth: 'bluetooth',
    ethernet: 'ethernet',
    wimax: 'wimax',
    vpn: 'vpn',
    other: 'other',
  },
  addEventListener: jest.fn(),
}));

const netInfoMock = NetInfo as typeof NetInfo & {
  addEventListener: jest.MockedFunction<typeof NetInfo.addEventListener>;
};

function disconnectedState(): NetInfoState {
  return {
    type: NetInfoStateType.none,
    isConnected: false,
    isInternetReachable: false,
    details: null,
  };
}

function wifiState(isInternetReachable: boolean): NetInfoState {
  return {
    type: NetInfoStateType.wifi,
    isConnected: true,
    isInternetReachable,
    details: {
      isConnectionExpensive: false,
      ssid: null,
      bssid: null,
      strength: null,
      ipAddress: null,
      subnet: null,
      frequency: null,
      linkSpeed: null,
      rxLinkSpeed: null,
      txLinkSpeed: null,
    },
  };
}

function unknownState(): NetInfoState {
  return {
    type: NetInfoStateType.unknown,
    isConnected: null,
    isInternetReachable: null,
    details: null,
  };
}

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

  async function renderBanner() {
    let renderer!: RenderResult;
    await act(async () => {
      renderer = await render(
        <ThemeProvider initialIsDark={false}>
          <NetworkBanner />
        </ThemeProvider>
      );
    });
    return renderer;
  }

  it('subscribes to NetInfo on mount and cleans up on unmount', async () => {
    const renderer = await renderBanner();
    expect(netInfoMock.addEventListener).toHaveBeenCalledTimes(1);

    await act(() => {
      renderer.unmount();
    });
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('renders the offline message text', async () => {
    const renderer = await renderBanner();
    const texts = renderer.container.queryAll((node) => node.type === 'Text');
    const offlineText = texts.find((t) => t.props.children === 'No internet connection. AI disabled.');
    expect(offlineText).toBeDefined();
  });

  it('updates pointerEvents to auto when disconnected', async () => {
    const renderer = await renderBanner();
    const handler = listeners[0];

    await act(() => {
      handler(disconnectedState());
    });

    const animatedView = renderer.container.queryAll((node) => node.props.pointerEvents === 'auto')[0];
    expect(animatedView).toBeDefined();
  });

  it('sets pointerEvents to none when connected and reachable', async () => {
    const renderer = await renderBanner();
    const handler = listeners[0];

    await act(() => {
      handler(wifiState(true));
    });

    const animatedView = renderer.container.queryAll((node) => node.props.pointerEvents === 'none')[0];
    expect(animatedView).toBeDefined();
  });

  it('treats connected without internet reachability as disconnected', async () => {
    const renderer = await renderBanner();
    const handler = listeners[0];

    await act(() => {
      handler(wifiState(false));
    });

    const animatedView = renderer.container.queryAll((node) => node.props.pointerEvents === 'auto')[0];
    expect(animatedView).toBeDefined();
  });

  it('ignores events where isConnected is null', async () => {
    const renderer = await renderBanner();
    const handler = listeners[0];

    await act(() => {
      handler(unknownState());
    });

    const animatedView = renderer.container.queryAll((node) => node.props.pointerEvents === 'none')[0];
    expect(animatedView).toBeDefined();
  });
});
