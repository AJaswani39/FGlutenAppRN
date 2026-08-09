import assert from 'node:assert/strict';
import http from 'node:http';
import test, { beforeEach } from 'node:test';
import { URL } from 'node:url';
import {
  HTML_CACHE_MAX_ENTRIES,
  cacheHtml,
  getCachedHtml,
  getBrowserRenderCacheKey,
  getOrRenderMenuText,
  getBrowserResolverRule,
  cacheAnalysis,
  getCachedAnalysis,
  getAnalysisCacheKey,
  getOrCreateInFlightAnalysis,
  getOrCreateBrowserRender,
  getOrCreateInFlightHtmlFetch,
  getPositiveIntegerEnv,
  htmlCache,
  analysisCache,
  createPinnedLookup,
  extractPdfText,
  fetchPinnedWithTimeout,
  getSafeUrlLogDetails,
  inFlightHtmlFetches,
  inFlightAnalysisRequests,
  isImageContentType,
  isBotVerificationPage,
  isAllowedBrowserRequest,
  isPdfContentType,
  isPrivateIp,
  parsePublicHttpUrl,
  renderPdfFirstPage,
  renderMenuWithBrowser,
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

test('recognizes PDF content types', () => {
  assert.equal(isPdfContentType('application/pdf'), true);
  assert.equal(isPdfContentType('application/pdf; charset=binary'), true);
  assert.equal(isPdfContentType('text/html'), false);
});

test('recognizes image content types', () => {
  assert.equal(isImageContentType('image/jpeg'), true);
  assert.equal(isImageContentType('image/png; charset=binary'), true);
  assert.equal(isImageContentType('application/pdf'), false);
});

test('extracts embedded text from a PDF and renders a page for OCR fallback', async () => {
  const text = 'Gluten-Free Pasta $18';
  const stream = 'BT /F1 18 Tf 72 720 Td (' + text + ') Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += String(index + 1) + ' 0 obj\n' + object + '\nendobj\n';
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += 'xref\n0 ' + String(objects.length + 1) + '\n0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += 'trailer\n<< /Size ' + String(objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + String(xrefOffset) + '\n%%EOF';

  const extractedText = await extractPdfText(Buffer.from(pdf, 'utf8'));
  assert.match(extractedText, /Gluten-Free Pasta/);

  const renderedPage = await renderPdfFirstPage(Buffer.from(pdf, 'utf8'));
  assert.ok(Buffer.isBuffer(renderedPage));
  assert.ok(renderedPage.byteLength > 0);
});

test('reports malformed PDFs as unreadable menu content', async () => {
  await assert.rejects(
    () => extractPdfText(Buffer.from('not a PDF')),
    (error) => error.status === 422 && error.message === 'PDF text extraction failed.',
  );
});

test('blocks private IPv4-mapped IPv6 addresses', () => {
  assert.equal(isPrivateIp('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateIp('::ffff:7f00:1'), true);
  assert.equal(isPrivateIp('::ffff:10.0.0.1'), true);
  assert.equal(isPrivateIp('::ffff:8.8.8.8'), false);
});

test('pinned lookup returns the approved IPv4 record', () => {
  const lookup = createPinnedLookup([
    { address: '93.184.216.34', family: 4 },
    { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
  ]);
  let result;

  lookup('example.com', { family: 4 }, (error, address, family) => {
    result = { error, address, family };
  });

  assert.deepEqual(result, { error: null, address: '93.184.216.34', family: 4 });
});

test('pinned lookup supports Node all-record lookup requests', () => {
  const lookup = createPinnedLookup([{ address: '93.184.216.34', family: 4 }]);
  let result;

  lookup('example.com', { all: true, family: 4 }, (error, addresses) => {
    result = { error, addresses };
  });

  assert.deepEqual(result, {
    error: null,
    addresses: [{ address: '93.184.216.34', family: 4 }],
  });
});

test('pinned lookup returns the approved IPv6 record when requested', () => {
  const lookup = createPinnedLookup([
    { address: '93.184.216.34', family: 4 },
    { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
  ]);
  let result;

  lookup('example.com', { family: 6 }, (error, address, family) => {
    result = { error, address, family };
  });

  assert.deepEqual(result, {
    error: null,
    address: '2606:2800:220:1:248:1893:25c8:1946',
    family: 6,
  });
});

test('pinned lookup reports an error when no records are approved', () => {
  const lookup = createPinnedLookup([]);
  let result;

  lookup('example.com', { family: 4 }, (error, address, family) => {
    result = { error, address, family };
  });

  assert.equal(result.address, undefined);
  assert.equal(result.family, undefined);
  assert.match(result.error.message, /could not be resolved/);
});

test('allows standard HTTP and HTTPS ports', () => {
  assert.equal(parsePublicHttpUrl('http://example.com:80/menu').port, '');
  assert.equal(parsePublicHttpUrl('https://example.com:443/menu').port, '');
  assert.equal(parsePublicHttpUrl('http://example.com/menu').protocol, 'http:');
  assert.equal(parsePublicHttpUrl('https://example.com/menu').protocol, 'https:');
});

test('safe URL log details omit query strings and fragments', () => {
  assert.deepEqual(
    getSafeUrlLogDetails(new URL('https://example.com/menu?token=secret#private-fragment')),
    {
      protocol: 'https:',
      hostname: 'example.com',
      port: '(default)',
      pathname: '/menu',
    },
  );
});

test('rejects nonstandard HTTP and HTTPS ports', () => {
  assert.throws(
    () => parsePublicHttpUrl('http://example.com:8080/menu'),
    /standard HTTP or HTTPS port/,
  );
  assert.throws(
    () => parsePublicHttpUrl('https://example.com:8443/menu'),
    /standard HTTP or HTTPS port/,
  );
});

test('pinned request adapter connects using the approved address', async () => {
  const server = http.createServer((request, response) => {
    assert.equal(request.headers.host, 'example.com');
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('pinned response');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let response;
  try {
    const { port } = server.address();
    response = await fetchPinnedWithTimeout(
      new URL(`http://example.com:${port}/menu`),
      [{ address: '127.0.0.1', family: 4 }],
      { headers: { Host: 'example.com' } },
    );
    const chunks = [];
    for await (const chunk of response.rawBody) {
      chunks.push(chunk);
    }

    assert.equal(response.ok, true);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/plain');
    assert.equal(Buffer.concat(chunks).toString('utf8'), 'pinned response');
  } finally {
    response?.cleanup();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('pinned request adapter aborts when the body stalls after headers', async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.flushHeaders();
    setTimeout(() => response.end('late body'), 250);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let response;
  try {
    const { port } = server.address();
    response = await fetchPinnedWithTimeout(
      new URL(`http://example.com:${port}/slow-menu`),
      [{ address: '127.0.0.1', family: 4 }],
      {},
      75,
    );
    const reader = response.body.getReader();

    await assert.rejects(reader.read(), (error) => error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || /aborted/i.test(error?.message || ''));
  } finally {
    response?.cleanup();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
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

test('allows one browser render at a time while coalescing duplicates', async () => {
  let resolveRender;
  const first = getOrCreateBrowserRender('browser:https://example.com/menu', () => new Promise((resolve) => {
    resolveRender = resolve;
  }));
  const duplicate = getOrCreateBrowserRender('browser:https://example.com/menu', () => Promise.resolve('unused'));
  const differentUrl = getOrCreateBrowserRender('browser:https://example.com/other', () => Promise.resolve('unused'));

  assert.equal(first.isBusy, false);
  assert.equal(first.isCoalesced, false);
  assert.equal(duplicate.isCoalesced, true);
  assert.strictEqual(duplicate.promise, first.promise);
  assert.equal(differentUrl.isBusy, true);

  await Promise.resolve();
  resolveRender('rendered menu');
  assert.equal(await first.promise, 'rendered menu');

  await Promise.resolve();
  const later = getOrCreateBrowserRender('browser:https://example.com/other', () => Promise.resolve('next render'));
  assert.equal(later.isBusy, false);
  assert.equal(await later.promise, 'next render');
});

test('uses a separate cache namespace for browser-rendered text', () => {
  assert.equal(getBrowserRenderCacheKey(new URL('https://example.com/menu')), 'browser:https://example.com/menu');
});

test('only permits same-host HTTPS browser requests', () => {
  assert.equal(isAllowedBrowserRequest('https://menu.example/dishes', 'menu.example'), true);
  assert.equal(isAllowedBrowserRequest('http://menu.example/dishes', 'menu.example'), false);
  assert.equal(isAllowedBrowserRequest('https://cdn.example/menu.js', 'menu.example'), false);
  assert.equal(isAllowedBrowserRequest('not a URL', 'menu.example'), false);
});

test('pins the browser hostname to an approved DNS record', () => {
  assert.equal(
    getBrowserResolverRule('menu.example', [{ address: '93.184.216.34', family: 4 }]),
    'MAP menu.example 93.184.216.34,EXCLUDE localhost',
  );
});

test('recognizes bot-verification pages as non-menu content', () => {
  assert.equal(isBotVerificationPage('Performing security verification\nchallenges.cloudflare.com'), true);
  assert.equal(
    isBotVerificationPage('This website uses a security service to protect against malicious bots. Cloudflare'),
    true,
  );
  assert.equal(isBotVerificationPage('Menu\nGluten-Free Pasta $18'), false);
});

test('renders visible menu text and closes the browser', async () => {
  let closeCalls = 0;
  let launchOptions;
  let requestHandler;
  const browser = {
    newPage: async () => ({
      setRequestInterception: async () => {},
      on: (event, handler) => {
        if (event === 'request') requestHandler = handler;
      },
      goto: async () => {},
      waitForNetworkIdle: async () => {},
      evaluate: async () => 'Menu\n\n\nGluten-Free Pasta\n$18',
    }),
    close: async () => {
      closeCalls += 1;
    },
  };

  const text = await renderMenuWithBrowser(new URL('https://menu.example/dishes'), {
    launchBrowser: async (options) => {
      launchOptions = options;
      return browser;
    },
    resolveHostname: async () => [{ address: '93.184.216.34', family: 4 }],
    timeoutMs: 100,
  });

  assert.equal(text, 'Menu\n\nGluten-Free Pasta\n$18');
  assert.match(launchOptions.args.join(' '), /--host-resolver-rules=MAP menu\.example 93\.184\.216\.34/);
  assert.equal(closeCalls, 1);

  let aborted = false;
  requestHandler({
    resourceType: () => 'image',
    url: () => 'https://menu.example/banner.jpg',
    abort: async () => {
      aborted = true;
    },
    continue: async () => {},
  });
  assert.equal(aborted, true);
});

test('caches and coalesces interactive menu renders', async () => {
  let resolveRender;
  let renderCalls = 0;
  const url = new URL('https://menu.example/dishes');
  const pendingRender = new Promise((resolve) => {
    resolveRender = resolve;
  });

  const first = getOrRenderMenuText(url, () => {
    renderCalls += 1;
    return pendingRender;
  });
  const duplicate = getOrRenderMenuText(url, () => {
    renderCalls += 1;
    return pendingRender;
  });

  await Promise.resolve();
  resolveRender('Gluten-Free Pasta');

  assert.deepEqual(await first, { text: 'Gluten-Free Pasta', cacheStatus: 'MISS' });
  assert.deepEqual(await duplicate, { text: 'Gluten-Free Pasta', cacheStatus: 'COALESCED' });
  assert.equal(renderCalls, 1);
  assert.deepEqual(await getOrRenderMenuText(url), { text: 'Gluten-Free Pasta', cacheStatus: 'HIT' });
});
