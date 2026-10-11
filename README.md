# FGlutenApp — React Native (Expo)

A full React Native port of the original Android FGlutenApp, built with Expo SDK 57 and EAS.

## Features

| Feature | Status |
|---|---|
| 📍 Location-based restaurant search | ✅ |
| 🤖 AI menu scanning (heuristic + keyword) | ✅ |
| 📸 Menu photo OCR (Cloud Vision) | ✅ |
| 💬 AI menu chat (Puter AI, gpt-4o-mini) | ✅ |
| 🛡️ Safety scorecard + cuisine risk hints | ✅ |
| ❤️ Favorites (Safe / Try / Avoid) | ✅ |
| 🔍 Smart filters (GF-only, GF-evidence, Open Now, Distance, Rating) | ✅ |
| 📋 Explore list + 🗺️ native map tab with clustering | ✅ |
| ❤️ Saved places tab | ✅ |
| ⚙️ Settings tab (dietary needs, units, data management) | ✅ |
| 💾 Offline cache (AsyncStorage, 14-day scan TTL) | ✅ |
| 📏 Miles / KM toggle | ✅ |
| 🧬 Strict Celiac mode (+ dairy/nut/soy-free) | ✅ |
| 🌙 Dark mode (system default) | ✅ |
| 📱 iOS + Android | ✅ |

## Project Structure

```
FGlutenAppRN/
├── App.tsx                         # Root entry point (providers + error boundaries)
├── app.config.js                   # Expo config (bundle ID, permissions, API keys from env)
├── eas.json                        # EAS build profiles
├── src/
│   ├── types/
│   │   ├── restaurant.ts           # Core data model (mirrors Restaurant.java)
│   │   └── navigation.ts           # Navigation types
│   ├── theme/
│   │   └── colors.ts               # Design token system (dark theme)
│   ├── config/
│   │   ├── runtimeConfig.ts        # Reads Constants.expoConfig.extra at runtime
│   │   └── platformConfig.ts       # Platform-specific Maps/AI key selection
│   ├── constants/
│   │   ├── api.ts                  # API endpoints + timeouts
│   │   └── scan.ts                 # Scan TTL (14 days), batch size, concurrency
│   ├── data/
│   │   └── placesRepository.ts     # Google Places API + HTML fetching (mirrors PlacesRepository.java)
│   ├── services/
│   │   ├── scanOrchestrator.ts     # Scan queue, batching, concurrency control
│   │   ├── menuScanner.ts          # Static HTML menu scanning (mirrors MenuScannerRepository.java)
│   │   ├── menuSafety.ts           # Safety scoring engine
│   │   ├── menuOcr.ts              # Cloud Vision OCR for menu photos
│   │   ├── puterAiService.ts       # Puter AI analysis + menu chat
│   │   ├── persistenceService.ts   # AsyncStorage cache, favorites, scan cache (mirrors RestaurantCacheManager.java)
│   │   ├── cuisineRiskHints.ts     # Per-cuisine risk notes
│   │   ├── diningChecklist.ts      # Dining-out checklist content
│   │   └── safePicks.ts            # Generic GF safe-pick suggestions
│   ├── hooks/
│   │   ├── useDebounce.ts          # Debounced values (search input)
│   │   └── useErrorBoundary.ts     # Error boundary hook helper
│   ├── context/
│   │   ├── RestaurantContext.tsx   # Global state (mirrors RestaurantViewModel.java + HomeViewModel.java)
│   │   ├── useRestaurantLoader.ts  # Location + network fetch lifecycle
│   │   ├── useRestaurantFavorites.ts # Favorites map + historical saved DB
│   │   ├── useRestaurantPersistence.ts # Debounced cache writes, scan-cache queue, AppState flush
│   │   ├── useRestaurantCacheHydration.ts # Cold-start cache restore
│   │   ├── useRestaurantCollectionState.ts # Filtered/sorted UI state derivation
│   │   ├── useRestaurantMutator.ts # Diffed updates with selective persistence
│   │   ├── FiltersContext.tsx      # Filter state
│   │   ├── SettingsContext.tsx     # Units, strict mode, dietary needs (mirrors SettingsManager.java)
│   │   ├── ThemeContext.tsx        # Dark/light theming
│   │   └── AppProviders.tsx        # Provider composition root
│   ├── navigation/
│   │   └── AppNavigator.tsx        # Bottom tab navigator (Home / Find / Map / Saved / Settings)
│   ├── components/
│   │   ├── AppErrorBoundary.tsx    # Top-level error boundary + reporting
│   │   ├── FeatureErrorBoundaries.tsx # Per-feature boundary isolation
│   │   ├── CustomSplashScreen.tsx  # Animated splash
│   │   ├── LocationSearchBar.tsx   # Manual area search
│   │   ├── NetworkBanner.tsx       # Offline indicator
│   │   ├── RestaurantSummaryCard.tsx # List row card
│   │   ├── ScanProgressBanner.tsx  # Live menu-scan progress
│   │   ├── Skeleton.tsx            # Loading placeholders
│   │   └── ui.tsx                  # Shared primitives
│   ├── util/
│   │   ├── http.ts                 # fetchWithTimeout with abort support
│   │   ├── logger.ts / errorReporting.ts # Dev-gated logging + error reports
│   │   ├── restaurantUtils.ts      # Identity, filtering, sorting
│   │   ├── collectionUtils.ts      # Saved-place merge + empty-state logic
│   │   ├── cacheUtils.ts           # Cache restore + scan progress
│   │   ├── scanUtils.ts            # TTL-based scan target selection
│   │   ├── geoUtils.ts / mapClustering.ts # Distance + map clustering
│   │   ├── htmlUtils.ts            # HTML parsing + GF evidence extraction
│   │   ├── formatters.ts / haptics.ts # Display formatting + haptics
│   │   └── menuAiContext.ts / menuAiResponse.ts # AI prompt context + response parsing
│   └── screens/
│       ├── HomeScreen.tsx          # Dashboard (mirrors HomeFragment.java)
│       ├── RestaurantListScreen.tsx # List + filter (mirrors RestaurantListFragment.java)
│       ├── MapScreen.tsx           # Native restaurant map with clustering
│       ├── SavedPlacesScreen.tsx   # Safe / Try / Avoid saved places
│       ├── SettingsScreen.tsx      # Dietary needs, units, data management
│       └── components/
│           ├── RestaurantDetailModal.tsx  # Detail sheet (mirrors RestaurantDetailBottomSheet.java)
│           ├── MenuAnalysisSheet.tsx      # AI analysis (mirrors MenuAnalysisBottomSheet.kt)
│           ├── MenuChatSheet.tsx          # AI menu chat
│           ├── RestaurantMenuEvidence.tsx # Scanned GF menu evidence list
│           ├── RestaurantSafetySection.tsx # Safety summary section
│           └── SafetyScorecard.tsx        # Safety score breakdown
```

## Setup

### 1. Add your API configuration

Set platform-specific Google Maps API keys in your local environment.
`app.config.js` publishes the matching key to each native platform and exposes
both keys to the JS bundle for direct Places requests:

```bash
ANDROID_MAPS_API_KEY=YOUR_ANDROID_GOOGLE_MAPS_API_KEY
IOS_MAPS_API_KEY=YOUR_IOS_GOOGLE_MAPS_API_KEY
```

> **Required APIs** (same as the Android app):
> - Places API (New) — for restaurant search
> - Maps SDK for Android / iOS — for map view (native build)
>
> Treat this as a public mobile client key. Restrict it in Google Cloud by
> package/bundle/signing identity and only allow the APIs above.
>
> `GCP_API_KEY` is accepted as a legacy fallback for the base Maps key.

For production AI/OCR, prefer the Cloud Run proxy so Puter and Vision keys do
not ship in the mobile app:

```bash
AI_PROXY_BASE_URL=https://YOUR-CLOUD-RUN-URL
```

The proxy itself needs:

```bash
PUTER_API_KEY=YOUR_PUTER_AUTH_TOKEN
VISION_API_KEY=YOUR_CLOUD_VISION_API_KEY
```

If `AI_PROXY_BASE_URL` is not set, the app can still use direct local fallback
keys during development:

```bash
VISION_API_KEY=YOUR_CLOUD_VISION_API_KEY
PUTER_API_KEY=YOUR_PUTER_AUTH_TOKEN
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run with Expo Go

```bash
npx expo start
```

Scan the QR code with the **Expo Go** app on iOS or Android.

> ⚠️ `react-native-maps` requires a **development build** or production build — it does not work in Expo Go.

### 4. Development build (for maps)

```bash
npx eas build --profile development --platform android
# or
npx eas build --profile development --platform ios
```

Install the resulting APK/IPA, then `npx expo start` will connect to it.

## EAS Build

```bash
# Preview APK (Android)
npx eas build --profile preview --platform android

# Production build (both platforms)
npx eas build --profile production --platform all

# Submit to stores
npx eas submit --profile production --platform ios
npx eas submit --profile production --platform android
```

## Android vs React Native — Feature Mapping

| Android | React Native |
|---|---|
| `Restaurant.java` | `src/types/restaurant.ts` |
| `RestaurantViewModel.java` | `src/context/RestaurantContext.tsx` (+ `useRestaurant*` hooks) |
| `PlacesRepository.java` | `src/data/placesRepository.ts` |
| `MenuScannerRepository.java` | `src/services/menuScanner.ts` + `src/services/scanOrchestrator.ts` |
| `RestaurantCacheManager.java` | `src/services/persistenceService.ts` + `src/context/useRestaurantPersistence.ts` |
| `SettingsManager.java` | `src/context/SettingsContext.tsx` + `src/services/persistenceService.ts` |
| `HomeFragment.java` | `src/screens/HomeScreen.tsx` |
| `RestaurantListFragment.java` | `src/screens/RestaurantListScreen.tsx` |
| Map view | `src/screens/MapScreen.tsx` + `src/util/mapClustering.ts` |
| Favorites/saved places | `src/screens/SavedPlacesScreen.tsx` + `src/context/useRestaurantFavorites.ts` |
| `RestaurantDetailBottomSheet.java` | `src/screens/components/RestaurantDetailModal.tsx` |
| `MenuAnalysisBottomSheet.kt` | `src/screens/components/MenuAnalysisSheet.tsx` |
| `mobile_navigation.xml` | `src/navigation/AppNavigator.tsx` |
| SharedPreferences | AsyncStorage |
| LiveData / ViewModel | React Context + useState/useRef |
| Kotlin Coroutines | async/await |
| ML Kit / TFLite | `src/services/menuOcr.ts` (Cloud Vision) + `src/services/menuSafety.ts` |
| Firebase Auth | *(excluded per user request)* |
| Firebase Firestore | *(excluded per user request)* |

## Testing

```bash
npm test          # Jest (jest-expo) unit suite
npm run typecheck # tsc --noEmit
npm run check     # both, in order
```

Tests live in `__tests__` folders next to the code they cover, including
context hooks, services, utils, and error boundaries.

## Notes

- **No sign-in required** — guest mode only, all data stored locally.
- **Menu scanning** uses the same Google Places API (`websiteUri` field) + HTML scraping as the original app, with a two-week (14-day) TTL for rescans.
- **AI analysis** uses local keyword heuristics plus Puter AI (`openai/gpt-4o-mini`) for deep menu analysis and chat. In production, route AI/OCR through `cloud-run-proxy`.
- The **Maps API key** flows from `ANDROID_MAPS_API_KEY` / `IOS_MAPS_API_KEY` env vars → `app.config.js` → `Constants.expoConfig.extra` → `src/config/runtimeConfig.ts`, with `src/config/platformConfig.ts` selecting the platform-specific key at runtime.

## Cloud Run Proxy

The `cloud-run-proxy/` folder contains a small Node 20 service for server-side
AI and OCR calls:

- `POST /analyze-menu`
- `POST /ask-menu-question`
- `POST /ocr-menu-photo`

Deploy from `cloud-run-proxy/`:

```bash
gcloud run deploy fgluten-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars PUTER_API_KEY=YOUR_PUTER_TOKEN,VISION_API_KEY=YOUR_VISION_KEY
```

Then put the deployed URL in the mobile app env:

```bash
AI_PROXY_BASE_URL=https://YOUR-CLOUD-RUN-URL
```
