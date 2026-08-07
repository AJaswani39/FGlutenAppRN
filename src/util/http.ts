import { API_TIMEOUTS } from '../constants';

/**
 * A fetch wrapper that aborts the request after a configurable timeout.
 * Extracted as a shared utility to avoid duplication across service files.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = API_TIMEOUTS.DEFAULT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const callerSignal = options.signal;
  const abortOnCallerSignal = () => controller.abort();

  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener('abort', abortOnCallerSignal, { once: true });
  }

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener('abort', abortOnCallerSignal);
  }
}
