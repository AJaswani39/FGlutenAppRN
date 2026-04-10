# FGlutenApp — React Native (Expo)

A full React Native port of the original Android FGlutenApp, built with Expo SDK 54 and EAS.

## Features

| Feature | Status |
|---|---|
| 📍 Location-based restaurant search | ✅ |
| 🤖 AI menu scanning (heuristic + keyword) | ✅ |
| ❤️ Favorites (Safe / Try / Avoid) | ✅ |
| 🔍 Smart filters (GF-only, Open Now, Distance, Rating) | ✅ |
| 📋 List view + 🗺️ Map-list view | ✅ |
| 💾 Offline cache (AsyncStorage, 3-day scan TTL) | ✅ |
| 📏 Miles / KM toggle | ✅ |
| 🧬 Strict Celiac mode | ✅ |
| 🌙 Dark mode (system default) | ✅ |
| 📱 iOS + Android | ✅ |

## Project Structure

```
FGlutenAppRN/
├── App.tsx                         # Root entry point
├── app.json                        # Expo config (bundle ID, permissions, API key)
├── eas.json                        # EAS build profiles
├── src/
│   ├── types/
│   │   ├── restaurant.ts           # Core data model (mirrors Restaurant.java)
│   │   └── navigation.ts           # Navigation types
│   ├── theme/
│   │   └── colors.ts               # Design token system (dark theme)
│   ├── util/
│   │   └── SettingsManager.ts      # AsyncStorage wrapper (mirrors SettingsManager.java)
│   ├── data/
│   │   └── placesRepository.ts     # Google Places API + menu scanning (mirrors PlacesRepository.java + MenuScannerRepository.java)
│   ├── context/
│   │   └── RestaurantContext.tsx   # Global state (mirrors RestaurantViewModel.java + HomeViewModel.java)
│   ├── navigation/
│   │   └── AppNavigator.tsx        # Bottom tab navigator
│   └── screens/
│       ├── HomeScreen.tsx          # Dashboard (mirrors HomeFragment.java)
│       ├── RestaurantListScreen.tsx # List + filter (mirrors RestaurantListFragment.java)
│       ├── ProfileScreen.tsx       # Settings & stats (mirrors ProfileFragment.kt)
│       └── components/
│           ├── RestaurantDetailModal.tsx  # Detail sheet (mirrors RestaurantDetailBottomSheet.java)
│           └── MenuAnalysisSheet.tsx      # AI analysis (mirrors MenuAnalysisBottomSheet.kt)
```

## Setup

### 1. Add your Google Maps API Key

In `app.json`, fill in the `extra.MAPS_API_KEY` field:

```json
"extra": {
  "MAPS_API_KEY": "YOUR_GOOGLE_MAPS_API_KEY"
}
```

> **Required APIs** (same as the Android app):
> - Places API (New) — for restaurant search
> - Maps SDK for Android / iOS — for map view (native build)

### 2. Install dependencies

```bash
npm install
```

### 3. Run with Expo Go

```bash
npx expo start
```

Scan the QR code with the **Expo Go** app on iOS or Android.

> ⚠️ `react-native-maps` requires a **development build** or production build — it does not work in Expo Go. The map view falls back to a scrollable list of locations in Expo Go mode.

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
| `RestaurantViewModel.java` | `src/context/RestaurantContext.tsx` |
| `PlacesRepository.java` | `src/data/placesRepository.ts` |
| `MenuScannerRepository.java` | `src/data/placesRepository.ts` |
| `RestaurantCacheManager.java` | `src/util/SettingsManager.ts` (AsyncStorage) |
| `SettingsManager.java` | `src/util/SettingsManager.ts` |
| `HomeFragment.java` | `src/screens/HomeScreen.tsx` |
| `RestaurantListFragment.java` | `src/screens/RestaurantListScreen.tsx` |
| `RestaurantDetailBottomSheet.java` | `src/screens/components/RestaurantDetailModal.tsx` |
| `MenuAnalysisBottomSheet.kt` | `src/screens/components/MenuAnalysisSheet.tsx` |
| `ProfileFragment.kt` | `src/screens/ProfileScreen.tsx` |
| `mobile_navigation.xml` | `src/navigation/AppNavigator.tsx` |
| SharedPreferences | AsyncStorage |
| LiveData / ViewModel | React Context + useState/useRef |
| Kotlin Coroutines | async/await |
| ML Kit / TFLite | Local JS heuristic analysis |
| Firebase Auth | *(excluded per user request)* |
| Firebase Firestore | *(excluded per user request)* |

## Notes

- **No sign-in required** — guest mode only, all data stored locally.
- **Menu scanning** uses the same Google Places API (`websiteUri` field) + HTML scraping as the original app.
- **AI analysis** uses a local keyword-based heuristic (same logic as `AIRepository.kt`). Replace with a Gemini/Vertex AI call for production.
- The **Maps API key** is read from `app.json extra` → `Constants.expoConfig.extra.MAPS_API_KEY` at runtime.
