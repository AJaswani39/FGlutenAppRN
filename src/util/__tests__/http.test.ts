import { fetchWithTimeout } from '../http';

const url = 'https://example.com/menu';

/** Installs a fetch mock that exposes the request signal to the handler. */
function mockFetch(
  handler: (requestUrl: string, signal: AbortSignal) => Promise<Response>
): jest.Mock {
  const mock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = typeof input === 'string' ? input : String(input);
    const signal = init?.signal ?? new AbortController().signal;
    return handler(requestUrl, signal);
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** A fetch mock that never settles until the request is aborted. */
function pendingOnAbort(rejectionMessage: string): jest.Mock {
  return mockFetch((_requestUrl, signal) => {
    if (signal.aborted) return Promise.reject(new Error(rejectionMessage));
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error(rejectionMessage)));
    });
  });
}

describe('http', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('fetchWithTimeout', () => {
    it('returns the fetch response and forwards request options', async () => {
      const response = { ok: true } as Response;
      const fetchMock = jest.fn().mockResolvedValue(response);
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(result).toBe(response);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe(url);
      expect(calledInit.method).toBe('POST');
      expect(calledInit.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(calledInit.signal).toBeInstanceOf(AbortSignal);
    });

    it('aborts the request when the default timeout elapses', async () => {
      jest.useFakeTimers();
      let fetchSignal: AbortSignal | null | undefined;
      global.fetch = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        fetchSignal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted by timeout')));
        });
      }) as unknown as typeof fetch;

      const promise = fetchWithTimeout(url);

      jest.advanceTimersByTime(9999);
      expect(fetchSignal?.aborted).toBe(false);

      jest.advanceTimersByTime(1);
      await expect(promise).rejects.toThrow('Aborted by timeout');
      expect(fetchSignal?.aborted).toBe(true);
    });

    it('honors a custom timeout', async () => {
      jest.useFakeTimers();
      let fetchSignal: AbortSignal | null | undefined;
      global.fetch = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        fetchSignal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted by timeout')));
        });
      }) as unknown as typeof fetch;

      const promise = fetchWithTimeout(url, {}, 500);

      jest.advanceTimersByTime(499);
      expect(fetchSignal?.aborted).toBe(false);

      jest.advanceTimersByTime(1);
      await expect(promise).rejects.toThrow('Aborted by timeout');
    });

    it('aborts immediately when the caller signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const fetchMock = pendingOnAbort('Aborted by caller');

      await expect(fetchWithTimeout(url, { signal: controller.signal })).rejects.toThrow(
        'Aborted by caller'
      );

      const calledInit = fetchMock.mock.calls[0][1];
      expect(calledInit.signal.aborted).toBe(true);
    });

    it('propagates a caller abort to the in-flight request', async () => {
      const controller = new AbortController();
      pendingOnAbort('Aborted by caller');

      const promise = fetchWithTimeout(url, { signal: controller.signal });
      controller.abort();

      await expect(promise).rejects.toThrow('Aborted by caller');
    });

    it('detaches the caller abort listener once the request settles', async () => {
      const controller = new AbortController();
      const addSpy = jest.spyOn(controller.signal, 'addEventListener');
      const removeSpy = jest.spyOn(controller.signal, 'removeEventListener');
      global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response) as unknown as typeof fetch;

      await fetchWithTimeout(url, { signal: controller.signal });

      expect(addSpy).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalledTimes(1);
    });

    it('clears the pending timeout timer once resolved', async () => {
      jest.useFakeTimers();
      global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response) as unknown as typeof fetch;

      await fetchWithTimeout(url);

      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
