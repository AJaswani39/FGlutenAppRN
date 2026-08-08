import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import {
  HTML_CACHE_MAX_ENTRIES,
  cacheHtml,
  getCachedHtml,
  cacheAnalysis,
  getCachedAnalysis,
  getAnalysisCacheKey,
  getOrCreateInFlightAnalysis,
  getOrCreateInFlightHtmlFetch,
  getPositiveIntegerEnv,
  htmlCache,
  analysisCache,
  inFlightHtmlFetches,
  inFlightAnalysisRequests,
} from './server.js';

beforeEach(() => {
  htmlCache.clear();
  analysisCache.clear();
  inFlightHtmlFetches.clear();
  inFlightAnalysisRequests.clear();
});

test('validates positive integer environment values', () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);

  try {
    delete process.env.TEST_CACHE_CONFIG_MISSING;
    process.env.TEST_CACHE_CONFIG_BLANK = '  ';
    process.env.TEST_CACHE_CONFIG_VALID = '60';
    process.env.TEST_CACHE_CONFIG_INVALID = 'not-a-number';
    process.env.TEST_CACHE_CONFIG_ZERO = '0';

    assert.equal(getPositiveIntegerEnv('TEST_CACHE_CONFIG_MISSING', 30), 30);
    assert.equal(getPositiveIntegerEnv('TEST_CACHE_CONFIG_BLANK', 30), 30);
    assert.equal(getPositiveIntegerEnv('TEST_CACHE_CONFIG_VALID', 30), 60);
    assert.equal(getPositiveIntegerEnv('TEST_CACHE_CONFIG_INVALID', 30), 30);
    assert.equal(getPositiveIntegerEnv('TEST_CACHE_CONFIG_ZERO', 30), 30);
    assert.equal(warnings.length, 2);
  } finally {
    console.warn = originalWarn;
    delete process.env.TEST_CACHE_CONFIG_BLANK;
    delete process.env.TEST_CACHE_CONFIG_VALID;
    delete process.env.TEST_CACHE_CONFIG_INVALID;
    delete process.env.TEST_CACHE_CONFIG_ZERO;
  }
});

test('creates stable analysis keys for equivalent inputs', () => {
  const options = { strictCeliac: true, dairyFree: false, nutFree: true, soyFree: false };
  const reorderedOptions = { soyFree: false, nutFree: true, dairyFree: false, strictCeliac: true };

  assert.equal(
    getAnalysisCacheKey('Menu text', options),
    getAnalysisCacheKey('Menu text', reorderedOptions),
  );
  assert.notEqual(
    getAnalysisCacheKey('Menu text', options),
    getAnalysisCacheKey('Menu text', { ...options, dairyFree: true }),
  );
  assert.notEqual(getAnalysisCacheKey('Menu text', options), getAnalysisCacheKey('Different menu', options));
});

test('returns and expires cached analysis results', () => {
  const key = getAnalysisCacheKey('Menu text', { strictCeliac: true });
  cacheAnalysis(key, '{"overallSafety":"CAUTION"}');

  assert.equal(getCachedAnalysis(key), '{"overallSafety":"CAUTION"}');

  analysisCache.get(key).expiresAt = Date.now() - 1;
  assert.equal(getCachedAnalysis(key), null);
  assert.equal(analysisCache.has(key), false);
});

test('coalesces concurrent analysis requests for the same cache key', async () => {
  let resolveAnalysis;
  let analysisCalls = 0;
  const pendingAnalysis = new Promise((resolve) => {
    resolveAnalysis = resolve;
  });

  const first = getOrCreateInFlightAnalysis('analysis-key', () => {
    analysisCalls += 1;
    return pendingAnalysis;
  });
  const second = getOrCreateInFlightAnalysis('analysis-key', () => {
    analysisCalls += 1;
    return pendingAnalysis;
  });

  assert.equal(first.isCoalesced, false);
  assert.equal(second.isCoalesced, true);
  assert.strictEqual(first.promise, second.promise);

  resolveAnalysis('{"overallSafety":"CAUTION"}');
  assert.equal(await first.promise, '{"overallSafety":"CAUTION"}');
  assert.equal(analysisCalls, 1);
  await Promise.resolve();
  assert.equal(inFlightAnalysisRequests.size, 0);
});

test('clears a failed analysis request so a later retry can run', async () => {
  let rejectAnalysis;
  let analysisCalls = 0;
  const pendingAnalysis = new Promise((resolve, reject) => {
    rejectAnalysis = reject;
  });

  const first = getOrCreateInFlightAnalysis('failed-analysis-key', () => {
    analysisCalls += 1;
    return pendingAnalysis;
  });
  const second = getOrCreateInFlightAnalysis('failed-analysis-key', () => {
    analysisCalls += 1;
    return pendingAnalysis;
  });

  const failure = new Error('Puter request failed.');
  rejectAnalysis(failure);
  await assert.rejects(first.promise, { message: failure.message });
  await assert.rejects(second.promise, { message: failure.message });
  await Promise.resolve();

  assert.equal(analysisCalls, 1);
  assert.equal(inFlightAnalysisRequests.size, 0);

  const retry = getOrCreateInFlightAnalysis('failed-analysis-key', () => {
    analysisCalls += 1;
    return Promise.resolve('{"overallSafety":"CAUTION"}');
  });

  assert.equal(retry.isCoalesced, false);
  assert.equal(await retry.promise, '{"overallSafety":"CAUTION"}');
  assert.equal(analysisCalls, 2);
});

test('returns cached HTML for an unexpired URL', () => {
  cacheHtml('https://example.com/menu', '<html>menu</html>');

  assert.equal(getCachedHtml('https://example.com/menu'), '<html>menu</html>');
});

test('removes expired cached HTML before returning it', () => {
  const key = 'https://example.com/menu';
  cacheHtml(key, '<html>menu</html>');
  htmlCache.get(key).expiresAt = Date.now() - 1;

  assert.equal(getCachedHtml(key), null);
  assert.equal(htmlCache.has(key), false);
});

test('evicts the oldest entry when the cache reaches capacity', () => {
  for (let index = 0; index <= HTML_CACHE_MAX_ENTRIES; index += 1) {
    cacheHtml(`https://example.com/menu-${index}`, `<html>${index}</html>`);
  }

  assert.equal(htmlCache.size, HTML_CACHE_MAX_ENTRIES);
  assert.equal(getCachedHtml('https://example.com/menu-0'), null);
  assert.equal(
    getCachedHtml(`https://example.com/menu-${HTML_CACHE_MAX_ENTRIES}`),
    `<html>${HTML_CACHE_MAX_ENTRIES}</html>`,
  );
});

test('coalesces concurrent requests for the same uncached URL', async () => {
  let resolveFetch;
  let fetchCalls = 0;
  const pendingHtml = new Promise((resolve) => {
    resolveFetch = resolve;
  });

  const first = getOrCreateInFlightHtmlFetch('https://example.com/menu', () => {
    fetchCalls += 1;
    return pendingHtml;
  });
  const second = getOrCreateInFlightHtmlFetch('https://example.com/menu', () => {
    fetchCalls += 1;
    return pendingHtml;
  });

  assert.equal(first.isCoalesced, false);
  assert.equal(second.isCoalesced, true);
  assert.strictEqual(first.promise, second.promise);

  resolveFetch('<html>menu</html>');
  assert.equal(await first.promise, '<html>menu</html>');
  assert.equal(fetchCalls, 1);
  await Promise.resolve();
  assert.equal(inFlightHtmlFetches.size, 0);
});
