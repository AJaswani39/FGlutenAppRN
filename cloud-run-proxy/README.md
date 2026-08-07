# FGluten Cloud Run Proxy

Small server-side gateway for cost-bearing AI and OCR calls.

## Endpoints

- `GET /health`
- `POST /analyze-menu`
- `POST /ask-menu-question`
- `POST /ocr-menu-photo`

## Required Environment

```bash
PUTER_API_KEY=your-puter-token
VISION_API_KEY=your-cloud-vision-api-key
```

Optional:

```bash
PORT=8080
ALLOWED_ORIGIN=*
MAX_BODY_BYTES=1500000
RATE_LIMIT_REQUESTS=60
RATE_LIMIT_WINDOW_MS=60000
```

## Deploy

From this folder:

```bash
gcloud run deploy fgluten-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars PUTER_API_KEY=YOUR_PUTER_TOKEN,VISION_API_KEY=YOUR_VISION_KEY
```

Then set the mobile app env:

```bash
AI_PROXY_BASE_URL=https://YOUR-CLOUD-RUN-URL
```
