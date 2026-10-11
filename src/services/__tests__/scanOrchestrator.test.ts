import { Restaurant } from '../../types/restaurant';
import { ScanOrchestrator } from '../scanOrchestrator';
import { scanRestaurantMenu, scanRestaurantMenuWithBrowser } from '../menuScanner';
import type { MenuScanResult } from '../menuScanner';

jest.mock('../menuScanner', () => ({
  scanRestaurantMenu: jest.fn(),
  scanRestaurantMenuWithBrowser: jest.fn(),
}));

const scanMock = scanRestaurantMenu as jest.Mock;
const browserScanMock = scanRestaurantMenuWithBrowser as jest.Mock;

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    placeId: 'place',
    name: 'Cafe',
    address: '123 Main',
    latitude: 1,
    longitude: 2,
    rating: null,
    openNow: null,
    hasGFMenu: false,
    gfMenu: [],
    distanceMeters: 0,
    menuUrl: null,
    rawMenuText: null,
    menuScanStatus: 'NOT_STARTED',
    menuScanTimestamp: 0,
    favoriteStatus: null,
    ...overrides,
  };
}

function scanResult(overrides: Partial<MenuScanResult> = {}): MenuScanResult {
  return {
    menuUrl: 'https://example.com/menu',
    gfMenu: ['Gluten-free pasta'],
    rawMenuText: 'Menu text',
    menuScanStatus: 'SUCCESS',
    menuScanTimestamp: 0,
    ...overrides,
  };
}

/** Resolves once the orchestrator's async workers settle. */
async function waitUntil(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for orchestrator condition');
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Harness {
  orchestrator: ScanOrchestrator;
  restaurants: Restaurant[];
  onRestaurantUpdate: jest.Mock;
  notifyCalls: () => number;
  /** Applied status transitions per placeId, in call order. */
  statusLog: (placeId: string) => Array<string | undefined>;
}

function createHarness(initialRestaurants: Restaurant[] = []): Harness {
  const restaurants = [...initialRestaurants];
  const statuses = new Map<string, Array<string | undefined>>();
  let notifyCount = 0;

  const logStatus = (target: Restaurant, next: Restaurant) => {
    const log = statuses.get(target.placeId) ?? [];
    log.push(next.menuScanStatus);
    statuses.set(target.placeId, log);
  };

  const onRestaurantUpdate = jest.fn(
    (target: Restaurant, updater: (current: Restaurant) => Restaurant) => {
      const index = restaurants.findIndex((r) => r.placeId === target.placeId);
      if (index === -1) return false;
      const next = updater(restaurants[index]);
      logStatus(target, next);
      restaurants[index] = next;
      return true;
    }
  );

  const orchestrator = new ScanOrchestrator({
    mapsApiKey: 'maps-key',
    onRestaurantUpdate,
    onNotifyUI: () => {
      notifyCount += 1;
    },
  });

  return {
    orchestrator,
    restaurants,
    onRestaurantUpdate,
    notifyCalls: () => notifyCount,
    statusLog: (placeId) => statuses.get(placeId) ?? [],
  };
}

describe('scanOrchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('scanBatch', () => {
    it('marks targets as FETCHING and applies successful scan results', async () => {
      const a = restaurant({ placeId: 'a' });
      const b = restaurant({ placeId: 'b' });
      const harness = createHarness([a, b]);
      scanMock.mockImplementation(async ({ restaurant: r }) => scanResult({ menuScanTimestamp: 111 }));

      await harness.orchestrator.scanBatch(harness.restaurants);
      await waitUntil(() =>
        harness.restaurants.every((r) => r.menuScanStatus === 'SUCCESS')
      );

      expect(scanMock).toHaveBeenCalledTimes(2);
      expect(harness.statusLog('a')).toEqual(['FETCHING', 'SUCCESS']);
      expect(harness.restaurants[0].gfMenu).toEqual(['Gluten-free pasta']);
      expect(harness.restaurants[0].menuScanTimestamp).toBe(111);
      expect(harness.notifyCalls()).toBeGreaterThan(0);
    });

    it('only scans restaurants that are eligible per TTL policy', async () => {
      const stale = restaurant({ placeId: 'stale', menuScanStatus: 'SUCCESS', menuScanTimestamp: 0 });
      const fresh = restaurant({
        placeId: 'fresh',
        menuScanStatus: 'SUCCESS',
        menuScanTimestamp: Date.now() - 1000,
      });
      const neverScanned = restaurant({ placeId: 'never' });
      const harness = createHarness([stale, fresh, neverScanned]);
      scanMock.mockImplementation(async ({ restaurant: r }) => scanResult());

      await harness.orchestrator.scanBatch(harness.restaurants);
      await waitUntil(() =>
        harness.restaurants.filter((r) => r.placeId !== 'fresh').every((r) => r.menuScanStatus === 'SUCCESS')
      );

      expect(scanMock.mock.calls.map((call) => call[0].restaurant.placeId)).toEqual(['stale', 'never']);
    });

    it('does nothing without a maps api key', async () => {
      const harness = createHarness([restaurant({ placeId: 'a' })]);
      const orchestrator = new ScanOrchestrator({
        mapsApiKey: '',
        onRestaurantUpdate: harness.onRestaurantUpdate,
        onNotifyUI: () => {},
      });

      await orchestrator.scanBatch(harness.restaurants);
      await waitUntil(() => scanMock.mock.calls.length > 0, 200).catch(() => undefined);

      expect(scanMock).not.toHaveBeenCalled();
      expect(harness.statusLog('a')).toEqual([]);
      expect(harness.restaurants[0].menuScanStatus).toBe('NOT_STARTED');
    });

    it('marks a restaurant FAILED when the scan throws', async () => {
      const harness = createHarness([restaurant({ placeId: 'a' })]);
      scanMock.mockRejectedValue(new Error('network down'));

      await harness.orchestrator.scanBatch(harness.restaurants);
      await waitUntil(() => harness.restaurants[0].menuScanStatus === 'FAILED');

      expect(harness.restaurants[0].menuScanStatus).toBe('FAILED');
      expect(console.error).toHaveBeenCalledWith('Scan failed for Cafe', expect.any(Error));
    });

    it('never marks an aborted scan as FAILED', async () => {
      const harness = createHarness([restaurant({ placeId: 'a' })]);
      scanMock.mockImplementation(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('The operation was aborted')));
          })
      );

      await harness.orchestrator.scanBatch(harness.restaurants);
      harness.orchestrator.flushQueue();

      await waitUntil(() => harness.statusLog('a').includes('FETCHING'));
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Abort-and-forget: the stuck FETCHING state disappears when the batch is
      // replaced by a fresh search, and the failure is not reported as FAILED.
      expect(harness.restaurants[0].menuScanStatus).toBe('FETCHING');
      expect(harness.statusLog('a')).not.toContain('FAILED');
    });

    it('tracks batch keys while scanning and clears them once idle', async () => {
      const harness = createHarness([restaurant({ placeId: 'a' }), restaurant({ placeId: 'b' })]);
      const deferred = createDeferred<MenuScanResult>();
      scanMock.mockImplementation(() => deferred.promise);

      await harness.orchestrator.scanBatch(harness.restaurants);

      expect(harness.orchestrator.getBatchKeys()).toEqual(['pid:a', 'pid:b']);

      deferred.resolve(scanResult());
      await waitUntil(() => harness.orchestrator.getBatchKeys().length === 0);
    });

    it('is a no-op once destroyed', async () => {
      const harness = createHarness([restaurant({ placeId: 'a' })]);
      scanMock.mockResolvedValue(scanResult());

      harness.orchestrator.destroy();
      await harness.orchestrator.scanBatch(harness.restaurants);

      expect(scanMock).not.toHaveBeenCalled();
    });
  });

  describe('retryFailed', () => {
    it('rescans only restaurants in FAILED state', async () => {
      const failed = restaurant({ placeId: 'failed', menuScanStatus: 'FAILED', menuScanTimestamp: 500 });
      const success = restaurant({ placeId: 'success', menuScanStatus: 'SUCCESS' });
      const harness = createHarness([failed, success]);
      scanMock.mockImplementation(async ({ restaurant: r }) => scanResult());

      await harness.orchestrator.retryFailed(harness.restaurants);
      await waitUntil(() => harness.restaurants[0].menuScanStatus === 'SUCCESS');

      expect(scanMock.mock.calls.map((call) => call[0].restaurant.placeId)).toEqual(['failed']);
      expect(harness.restaurants[1].menuScanStatus).toBe('SUCCESS');
    });

    it('does nothing when no scan has failed', async () => {
      const harness = createHarness([restaurant({ placeId: 'a', menuScanStatus: 'SUCCESS' })]);
      scanMock.mockResolvedValue(scanResult());

      await harness.orchestrator.retryFailed(harness.restaurants);

      expect(scanMock).not.toHaveBeenCalled();
    });
  });

  describe('requestRescan', () => {
    it('clears scanned GF data and forces a FETCHING state', async () => {
      const existing = restaurant({
        placeId: 'a',
        menuScanStatus: 'SUCCESS',
        gfMenu: ['Old item'],
        rawMenuText: 'Old text',
      });
      const harness = createHarness([existing]);
      const deferred = createDeferred<MenuScanResult>();
      scanMock.mockImplementation(() => deferred.promise);

      await harness.orchestrator.requestRescan(existing);

      expect(harness.restaurants[0].menuScanStatus).toBe('FETCHING');
      expect(harness.restaurants[0].gfMenu).toEqual([]);

      deferred.resolve(scanResult({ gfMenu: ['Fresh item'] }));
      await waitUntil(() => harness.restaurants[0].gfMenu.length === 1);
      expect(harness.restaurants[0].gfMenu).toEqual(['Fresh item']);
    });

    it('aborts and replaces an in-flight scan for the same restaurant', async () => {
      const target = restaurant({ placeId: 'a' });
      const harness = createHarness([target]);
      const first = createDeferred<MenuScanResult>();
      const second = createDeferred<MenuScanResult>();
      scanMock
        .mockImplementationOnce(({ signal }: { signal: AbortSignal }) => {
          signal.addEventListener('abort', () => first.reject(new Error('aborted')));
          return first.promise;
        })
        .mockImplementationOnce(() => second.promise);

      await harness.orchestrator.scanBatch(harness.restaurants);
      await harness.orchestrator.requestRescan(target);
      await waitUntil(() => scanMock.mock.calls.length === 2);

      // The stale scan finishing must not overwrite the newer rescan.
      first.resolve(scanResult({ gfMenu: ['stale'] }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(harness.restaurants[0].gfMenu).toEqual([]);

      second.resolve(scanResult({ gfMenu: ['fresh'] }));
      await waitUntil(() => harness.restaurants[0].gfMenu.length > 0);
      expect(harness.restaurants[0].gfMenu).toEqual(['fresh']);
      expect(harness.restaurants[0].menuScanStatus).toBe('SUCCESS');
    });

    it('does not enqueue when the restaurant cannot be updated', async () => {
      const missing = restaurant({ placeId: 'missing' });
      const harness = createHarness([restaurant({ placeId: 'other' })]);
      scanMock.mockResolvedValue(scanResult());

      await harness.orchestrator.requestRescan(missing);

      expect(scanMock).not.toHaveBeenCalled();
    });

    it('is a no-op once destroyed', async () => {
      const harness = createHarness([restaurant({ placeId: 'a', menuScanStatus: 'SUCCESS' })]);
      scanMock.mockResolvedValue(scanResult());

      harness.orchestrator.destroy();
      await harness.orchestrator.requestRescan(harness.restaurants[0]);

      expect(scanMock).not.toHaveBeenCalled();
      expect(harness.onRestaurantUpdate).not.toHaveBeenCalled();
    });
  });

  describe('requestInteractiveMenuRender', () => {
    it('renders a browser menu and applies the result', async () => {
      const jsOnly = restaurant({
        placeId: 'a',
        menuScanStatus: 'JS_ONLY',
        menuUrl: 'https://ordering.toasttab.com/x',
      });
      const harness = createHarness([jsOnly]);
      browserScanMock.mockResolvedValue(
        scanResult({ menuScanStatus: 'SUCCESS', gfMenu: ['GF bread'], menuScanTimestamp: 222 })
      );

      await harness.orchestrator.requestInteractiveMenuRender(jsOnly);
      await waitUntil(() => harness.restaurants[0].menuScanStatus === 'SUCCESS');

      expect(browserScanMock).toHaveBeenCalledTimes(1);
      expect(harness.restaurants[0].gfMenu).toEqual(['GF bread']);
      expect(harness.restaurants[0].menuScanTimestamp).toBe(222);
    });

    it('rejects when a render is already active for the same restaurant', async () => {
      const jsOnly = restaurant({
        placeId: 'a',
        menuScanStatus: 'NO_MENU_CONTENT',
        menuUrl: 'https://example.com/menu',
      });
      const harness = createHarness([jsOnly]);
      const first = createDeferred<MenuScanResult | null>();
      browserScanMock.mockImplementation(() => first.promise);

      const firstRequest = harness.orchestrator.requestInteractiveMenuRender(jsOnly);
      await harness.orchestrator.requestInteractiveMenuRender(jsOnly);

      expect(browserScanMock).toHaveBeenCalledTimes(1);

      first.resolve(null);
      await firstRequest;
    });

    it('ignores requests for restaurants without a place id', async () => {
      const harness = createHarness([restaurant({ placeId: '' })]);

      await harness.orchestrator.requestInteractiveMenuRender(harness.restaurants[0]);

      expect(browserScanMock).not.toHaveBeenCalled();
      expect(harness.onRestaurantUpdate).not.toHaveBeenCalled();
    });

    it('marks NO_MENU_CONTENT when the render fails', async () => {
      const jsOnly = restaurant({
        placeId: 'a',
        menuScanStatus: 'NO_MENU_CONTENT',
        menuUrl: 'https://example.com/menu',
      });
      const harness = createHarness([jsOnly]);
      browserScanMock.mockRejectedValue(new Error('render crashed'));

      await harness.orchestrator.requestInteractiveMenuRender(jsOnly);
      await waitUntil(() => harness.restaurants[0].menuScanStatus === 'NO_MENU_CONTENT');

      expect(harness.restaurants[0].menuScanStatus).toBe('NO_MENU_CONTENT');
      expect(console.error).toHaveBeenCalledWith(
        'Interactive menu render failed for Cafe',
        expect.any(Error)
      );
    });

    it('is a no-op once destroyed', async () => {
      const jsOnly = restaurant({
        placeId: 'a',
        menuScanStatus: 'JS_ONLY',
        menuUrl: 'https://example.com/menu',
      });
      const harness = createHarness([jsOnly]);
      browserScanMock.mockResolvedValue(scanResult());

      harness.orchestrator.destroy();
      await harness.orchestrator.requestInteractiveMenuRender(jsOnly);

      expect(browserScanMock).not.toHaveBeenCalled();
    });
  });

  describe('flushQueue', () => {
    it('drops queued restaurants that have not started and clears batch tracking', async () => {
      const restaurants = Array.from({ length: 4 }, (_, index) =>
        restaurant({ placeId: `p${index}` })
      );
      const harness = createHarness(restaurants);
      scanMock.mockImplementation(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          })
      );

      await harness.orchestrator.scanBatch(harness.restaurants);
      const startedCount = scanMock.mock.calls.length;
      harness.orchestrator.flushQueue();

      expect(startedCount).toBeLessThan(4);
      expect(harness.orchestrator.getBatchKeys()).toEqual([]);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(scanMock.mock.calls.length).toBe(startedCount);
    });
  });

  describe('destroy', () => {
    it('aborts in-flight scans', async () => {
      const harness = createHarness([restaurant({ placeId: 'a' })]);
      let fetchSignal: AbortSignal | undefined;
      scanMock.mockImplementation(({ signal }: { signal: AbortSignal }) => {
        fetchSignal = signal;
        return new Promise<MenuScanResult>(() => {});
      });

      await harness.orchestrator.scanBatch(harness.restaurants);
      harness.orchestrator.destroy();

      expect(fetchSignal?.aborted).toBe(true);
    });
  });

  describe('setConfig', () => {
    it('routes notifications through the updated config', async () => {
      const harness = createHarness([restaurant({ placeId: 'a' })]);
      const nextNotify = jest.fn();
      const deferred = createDeferred<MenuScanResult>();
      scanMock.mockImplementation(() => deferred.promise);

      await harness.orchestrator.scanBatch(harness.restaurants);
      harness.orchestrator.setConfig({
        mapsApiKey: 'maps-key',
        onRestaurantUpdate: harness.onRestaurantUpdate,
        onNotifyUI: nextNotify,
      });
      deferred.resolve(scanResult());
      await waitUntil(() => harness.restaurants[0].menuScanStatus === 'SUCCESS');

      expect(nextNotify).toHaveBeenCalled();
    });
  });

  describe('concurrency', () => {
    it('never runs more than CONCURRENT_SCAN_LIMIT scans at once', async () => {
      const restaurants = Array.from({ length: 5 }, (_, index) =>
        restaurant({ placeId: `p${index}` })
      );
      const harness = createHarness(restaurants);
      let active = 0;
      let maxActive = 0;

      scanMock.mockImplementation(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 50));
        active -= 1;
        return scanResult();
      });

      await harness.orchestrator.scanBatch(harness.restaurants);
      await waitUntil(() =>
        harness.restaurants.every((r) => r.menuScanStatus === 'SUCCESS')
      );

      expect(scanMock).toHaveBeenCalledTimes(5);
      expect(maxActive).toBeGreaterThan(1);
      expect(maxActive).toBeLessThanOrEqual(2);
    });
  });
});
