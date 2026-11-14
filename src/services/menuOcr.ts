import { API_ENDPOINTS, API_TIMEOUTS } from '../constants';
import { fetchWithTimeout } from '../util/http';
import { isRecord } from '../util/typeGuards';

/**
 * Extracts readable text from the Vision API response payload.
 * If the payload contains an error, throws an Error with the message.
 * If the payload contains a fullTextAnnotation, returns its text. 
 * If not, checks for textAnnotations and returns the description of the first annotation.
 * If none of these are present, returns an empty string.
 * @param payload The response payload from the Vision API.
 * @returns The extracted text or an empty string if no text is found.
 */
function extractVisionText(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.responses)) {
    return '';
  }

  const result = payload.responses[0];
  if (!isRecord(result)) {
    return '';
  }

  const error = result.error;
  if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) {
    throw new Error(error.message.trim());
  }

  const fullTextAnnotation = result.fullTextAnnotation;
  if (isRecord(fullTextAnnotation) && typeof fullTextAnnotation.text === 'string') {
    return fullTextAnnotation.text;
  }

  const textAnnotations = result.textAnnotations;
  const firstAnnotation = Array.isArray(textAnnotations) ? textAnnotations[0] : null;
  if (isRecord(firstAnnotation) && typeof firstAnnotation.description === 'string') {
    return firstAnnotation.description;
  }

  return '';
}
/**
 * Extracts readable text from a base64-encoded image using the Google Vision API or a proxy service.
 * If a proxyBaseUrl is provided, it sends the image to the proxy for OCR processing.
 * If no proxy is provided, it uses the Vision API directly with the provided apiKey.
 * Throws an error if the image data is empty, if the Vision API key is missing, or if no readable text is found.
 * @param base64 The base64-encoded image data.
 * @param apiKey The Google Vision API key for direct API access (ignored if proxyBaseUrl is provided).
 * @param proxyBaseUrl Optional base URL for a proxy service that handles OCR requests.
 * @returns A Promise that resolves to the extracted text from the image.
 */
export async function extractMenuTextFromImage({
  base64,
  apiKey,
  proxyBaseUrl = '',
}: {
  base64: string;
  apiKey: string;
  proxyBaseUrl?: string;
}): Promise<string> {
  const trimmedKey = apiKey.trim();
  const trimmedBase64 = base64.trim();
  if (!trimmedBase64) {
    throw new Error('No image data was selected.');
  }

  const trimmedProxyBaseUrl = proxyBaseUrl.trim().replace(/\/+$/, '');
  if (trimmedProxyBaseUrl) {
    const response = await fetchWithTimeout(`${trimmedProxyBaseUrl}/ocr-menu-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ base64: trimmedBase64 }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `OCR proxy error ${response.status}`);
    }

    const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
    if (!text) {
      throw new Error('No readable menu text was found in that image.');
    }

    return text;
  }

  if (!trimmedKey) {
    throw new Error('Vision API key is missing.');
  }

  const response = await fetchWithTimeout(`${API_ENDPOINTS.VISION_ANNOTATE}?key=${encodeURIComponent(trimmedKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          image: {
            content: trimmedBase64,
          },
          features: [
            {
              type: 'TEXT_DETECTION',
              maxResults: 1,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Vision API error ${response.status}: ${await response.text()}`);
  }

  const payload: unknown = await response.json();
  const text = extractVisionText(payload);
  const normalized = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) {
    throw new Error('No readable menu text was found in that image.');
  }

  return normalized;
}
