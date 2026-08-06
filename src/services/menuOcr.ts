import { API_ENDPOINTS, API_TIMEOUTS } from '../constants';
import { fetchWithTimeout } from '../util/http';

interface VisionAnnotateResponse {
  responses?: Array<{
    fullTextAnnotation?: {
      text?: string;
    };
    textAnnotations?: Array<{
      description?: string;
    }>;
    error?: {
      message?: string;
    };
  }>;
}

export async function extractMenuTextFromImage({
  base64,
  apiKey,
}: {
  base64: string;
  apiKey: string;
}): Promise<string> {
  const trimmedKey = apiKey.trim();
  const trimmedBase64 = base64.trim();
  if (!trimmedKey) {
    throw new Error('Vision API key is missing.');
  }
  if (!trimmedBase64) {
    throw new Error('No image data was selected.');
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

  const payload = (await response.json()) as VisionAnnotateResponse;
  const result = payload.responses?.[0];
  if (result?.error?.message) {
    throw new Error(result.error.message);
  }

  const text = result?.fullTextAnnotation?.text ?? result?.textAnnotations?.[0]?.description ?? '';
  const normalized = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) {
    throw new Error('No readable menu text was found in that image.');
  }

  return normalized;
}

