import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { LocationSearchBar } from '../LocationSearchBar';
import { fetchWithTimeout } from '../../util/http';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../../theme/colors').LightColors }),
}));
jest.mock('../../context/restaurantState', () => ({ getMapsApiKey: () => 'test-key' }));
jest.mock('../ui', () => ({ Ionicons: 'Icon' }));
jest.mock('../../util/http', () => ({ fetchWithTimeout: jest.fn() }));

// Allow for React Native host modules being compiled during the first render.
jest.setTimeout(15000);

const request = jest.mocked(fetchWithTimeout);
const suggestion = {
  placePrediction: {
    placeId: 'new-york',
    text: { text: 'New York, NY, USA' },
    structuredFormat: { mainText: { text: 'New York' }, secondaryText: { text: 'NY, USA' } },
  },
};
function response(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  request.mockReset();
});
afterEach(() => { jest.useRealTimers(); });

async function search(onLocationSelected = jest.fn()) {
  const view = await render(<LocationSearchBar onLocationSelected={onLocationSelected} />);
  const input = view.getByPlaceholderText('Search any city...');
  await fireEvent(input, 'focus');
  await fireEvent.changeText(input, 'New');
  await act(async () => { jest.advanceTimersByTime(500); });
  return view;
}

it('requests regional predictions through Places API (New) and selects their coordinates', async () => {
  request.mockResolvedValueOnce(response({ suggestions: [suggestion, { queryPrediction: {} }] }));
  request.mockResolvedValueOnce(response({ location: { latitude: 40.7, longitude: -74 } }));
  const selected = jest.fn();
  const view = await search(selected);
  expect(request).toHaveBeenNthCalledWith(1,
    'https://places.googleapis.com/v1/places:autocomplete',
    expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': 'test-key' },
      body: JSON.stringify({ input: 'New', includedPrimaryTypes: ['(regions)'] }),
    }),
    10000,
  );
  expect(view.getByText('NY, USA')).toBeTruthy();
  await fireEvent.press(view.getByText('New York'));
  expect(request).toHaveBeenNthCalledWith(2,
    'https://places.googleapis.com/v1/places/new-york',
    expect.objectContaining({ headers: { 'X-Goog-Api-Key': 'test-key', 'X-Goog-FieldMask': 'location' } }),
    10000,
  );
  expect(selected).toHaveBeenCalledWith(40.7, -74);
});

it('does not offer malformed or failed predictions', async () => {
  request.mockResolvedValueOnce(response({ suggestions: [suggestion] }, false));
  const view = await search();
  expect(view.queryByText('New York')).toBeNull();
});

it('does not select a place when its coordinates are invalid', async () => {
  request.mockResolvedValueOnce(response({ suggestions: [suggestion] }));
  request.mockResolvedValueOnce(response({ location: { latitude: '40.7', longitude: -74 } }));
  const selected = jest.fn();
  const view = await search(selected);
  await fireEvent.press(view.getByText('New York'));
  expect(selected).not.toHaveBeenCalled();
  expect(view.getByPlaceholderText('Search any city...').props.value).toBe('');
});

it('aborts and ignores an old response while the next query is debouncing', async () => {
  let resolveOld!: (value: Response) => void;
  request.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  const view = await render(<LocationSearchBar onLocationSelected={jest.fn()} />);
  const input = view.getByPlaceholderText('Search any city...');
  await fireEvent(input, 'focus');
  await fireEvent.changeText(input, 'New');
  await act(async () => { jest.advanceTimersByTime(500); });
  const oldSignal = request.mock.calls[0][1]?.signal;
  expect(oldSignal?.aborted).toBe(false);

  await fireEvent.changeText(input, 'Boston');
  expect(oldSignal?.aborted).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
  // Resolve despite abort: cancellation alone must not let a stale response update the UI.
  await act(async () => { resolveOld(response({ suggestions: [suggestion] })); });
  expect(view.queryByText('New York')).toBeNull();

  const boston = { placePrediction: {
    placeId: 'boston', text: { text: 'Boston, MA, USA' },
    structuredFormat: { mainText: { text: 'Boston' }, secondaryText: { text: 'MA, USA' } },
  } };
  request.mockResolvedValueOnce(response({ suggestions: [boston] }));
  await act(async () => { jest.advanceTimersByTime(500); });
  expect(request).toHaveBeenCalledTimes(2);
  expect(JSON.parse(request.mock.calls[1][1]?.body as string).input).toBe('Boston');
  expect(view.getByText('Boston')).toBeTruthy();
});

it('clears displayed predictions immediately when the query changes', async () => {
  request.mockResolvedValueOnce(response({ suggestions: [suggestion] }));
  const view = await search();
  expect(view.getByText('New York')).toBeTruthy();
  await fireEvent.changeText(view.getByPlaceholderText('Search any city...'), 'Boston');
  expect(view.queryByText('New York')).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
});
