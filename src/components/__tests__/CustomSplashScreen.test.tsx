import React from 'react';
import { act, render } from '@testing-library/react-native';
import { cancelAnimation, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { CustomSplashScreen } from '../CustomSplashScreen';

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: { View: require('react-native').View },
    useSharedValue: (value: number) => React.useRef({ value }).current,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withTiming: jest.fn(() => 1),
    cancelAnimation: jest.fn(),
    Easing: { bezier: jest.fn() },
  };
});
jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn() }));

function finishAnimation() {
  const callback = jest.mocked(withTiming).mock.calls[0][2]!;
  callback(true);
}
function runScheduledCallback() {
  const callback = jest.mocked(scheduleOnRN).mock.calls[0][0];
  callback();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => {
  jest.useRealTimers();
});

it('schedules the finish pause on the RN runtime and uses the latest callback', async () => {
  const first = jest.fn();
  const latest = jest.fn();
  const view = await render(<CustomSplashScreen onFinish={first} isDark={false} />);
  await view.rerender(<CustomSplashScreen onFinish={latest} isDark={false} />);
  finishAnimation();
  expect(scheduleOnRN).toHaveBeenCalledTimes(1);
  expect(latest).not.toHaveBeenCalled();
  runScheduledCallback();
  await act(() => { jest.advanceTimersByTime(149); });
  expect(latest).not.toHaveBeenCalled();
  await act(() => { jest.advanceTimersByTime(1); });
  expect(latest).toHaveBeenCalledTimes(1);
  expect(first).not.toHaveBeenCalled();
});

it('ignores a finish callback queued before unmount', async () => {
  const onFinish = jest.fn();
  const view = await render(<CustomSplashScreen onFinish={onFinish} isDark={true} />);
  finishAnimation();
  await view.unmount();
  runScheduledCallback();
  await act(() => { jest.advanceTimersByTime(150); });
  expect(cancelAnimation).toHaveBeenCalledTimes(1);
  expect(onFinish).not.toHaveBeenCalled();
});

it('cancels the pause timer on unmount', async () => {
  const onFinish = jest.fn();
  const view = await render(<CustomSplashScreen onFinish={onFinish} isDark={false} />);
  finishAnimation();
  runScheduledCallback();
  await view.unmount();
  await act(() => { jest.advanceTimersByTime(150); });
  expect(onFinish).not.toHaveBeenCalled();
});
