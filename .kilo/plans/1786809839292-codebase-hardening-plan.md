# Codebase Hardening Plan — Remaining Type-Safety & Structure Fixes

Follow-up to the completed first pass (disk-rehydration casts in `persistenceService.ts`).
Ordered "one step at a time," ascending risk. Each step ends with a validation gate.

## Current status of known issues

| # | Issue | Risk | Verified |
|---|-------|------|----------|
| 1 | Duplicate `isRecord` (`typeGuards.ts` vs local in `persistenceService.ts`) | low | shared version lets arrays through |
| 2 | `favoriteKey(r)!` non-null assertion, unguarded | low | `useRestaurantFavorites.ts:27` |
| 3 | Runtime circular dep: `types/restaurant` ↔ `services/menuSafety` | low | both imports are type-only |
| 4 | Dead re-exports `export { getEmptyResultsMessage }` in `App.tsx:56` & `RestaurantContext.tsx:56` | low | grep: no consumers |
| 5 | Dynamic `require()` inside `App.tsx` render (lines 61-67) | med | all packages used unconditionally |
| 6 | `SettingsContext` 5x duplicated setter boilerplate | med | identical shape |
| 7 | `RestaurantContext.tsx` "god provider" (395 lines) | high | mixed concerns |
| 8 | Inconsistent React import style (`React.useState` + named `useState`) | cosmetic | scattered |

## Validation tools (per step)

- `npm run typecheck` (`tsc --noEmit`)
- `npx jest --runInBand` (full suite; the lone failing suite `cloud-run-proxy/server.test.js` is an unrelated pre-existing JS test missing the `pdf-parse` dep — ignore it)

---

## Step 1 — Fix the duplicate, inconsistent `isRecord`

- **Goal:** single source of truth; shared guard must reject arrays (matching the stricter local copy).
- **Action:** in `src/util/typeGuards.ts`, add `&& !Array.isArray(value)` to `isRecord`. Delete the local `isRecord` in `persistenceService.ts` and import the shared one from `../util/typeGuards` (verify it isn't already re-imported elsewhere in that file — it isn't).
- **Risk check:** the 5 callers (`placesRepository`, `puterAiService`, `htmlUtils`, `menuOcr`, `menuAiResponse`) all rely on `isRecord` to mean "plain object" — rejecting arrays is the *correct* behavior they already assume. Run typecheck + full suite.

## Step 2 — Guard `favoriteKey(r)!`

- **Goal:** eliminate the unguarded `!` where `favoriteKey` can legitimately return `null`.
- **Action:** `src/context/useRestaurantFavorites.ts:27`. Currently:
  ```ts
  const liveMap = new Map(liveFavorites.map(r => [favoriteKey(r)!, r]));
  ```
  Filter out nulls instead of asserting:
  ```ts
  const liveMap = new Map(
    liveFavorites
      .map((r): [string, Restaurant] | null => { const k = favoriteKey(r); return k ? [k, r] : null; })
      .filter((entry): entry is [string, Restaurant] => entry !== null)
  );
  ```
- **Validation:** typecheck + `jest src/context/__tests__/RestaurantContext.test.tsx`.

## Step 3 — Break the `types ↔ services` circular dependency

- **Goal:** no runtime circular import; make intent explicit.
- **Action (type-only imports, zero runtime change):**
  - `src/types/restaurant.ts:1` → `import type { MenuAnalysisResult } from '../services/menuSafety';`
  - `src/services/menuSafety.ts:1` → `import type { Restaurant } from '../types/restaurant';`
  - (Optional, future): extract `MenuAnalysisResult`/`MenuSafetyLevel` into `src/types/menuSafety.ts` so `types/` never touches `services/`. Mark as out-of-scope for now — the `import type` fix already fully removes the runtime cycle.
- **Validation:** typecheck (confirm elision) + full suite.

## Step 4 — Remove dead re-exports

- **Goal:** stop leaking `getEmptyResultsMessage` through `App` and `RestaurantContext`.
- **Action:**
  - `App.tsx:56` — delete `export { getEmptyResultsMessage };` (it's imported privately on line 6 for local use; keep that usage).
  - `RestaurantContext.tsx:56` — delete `export { getEmptyResultsMessage };` (imported privately on line 26, used at line 196; keep those).
- **Validation:** grep again for any importer of these symbols from `App`/`RestaurantContext` (none found), then typecheck.

## Step 5 — Replace dynamic `require()` in `App.tsx` with top-level imports

- **Goal:** restore static analysis & tree-shaking; these packages are used unconditionally.
- **Action:** replace the `const { X } = require(...)` block (lines 61-67) and the `ThemedAppShell` prop threading with plain top-level imports:
  ```ts
  import { SafeAreaProvider } from 'react-native-safe-area-context';
  import { GestureHandlerRootView } from 'react-native-gesture-handler';
  import { StatusBar } from 'expo-status-bar';
  import { NetworkBanner } from './src/components/NetworkBanner';
  import { AppErrorBoundary } from './src/components/AppErrorBoundary';
  import { AppProviders } from './src/context/AppProviders';
  import AppNavigator from './src/navigation/AppNavigator';
  ```
  `ThemedAppShell` then references the imported components directly; drop its now-unnecessary component-type props.
- **Validation:** typecheck + launch smoke (manual if a device/emulator is available) — this is the only step where a runtime sanity check matters, since the change swaps `require` for `import`.

## Step 6 — De-duplicate `SettingsContext` setters

- **Goal:** one generic setter factory instead of 5 nearly-identical `useCallback`s.
- **Action:** introduce a helper, e.g.:
  ```ts
  function useBooleanSetting(key: string, fallback = false) {
    const [value, setValue] = useState(fallback);
    useEffect(() => { /* load once */ }, []);
    const set = useCallback((next: boolean) => {
      setValue(next);
      void PersistenceService.setSetting(key, next).catch(logErr);
    }, [key]);
    return [value, set] as const;
  }
  ```
  Then wire `useMiles`, `strictCeliac`, `dairyFree`, `nutFree`, `soyFree` through it. **Preserve exact external API** of `SettingsContextValue` (same keys, same `useCallback`-stable functions) so consumers are unaffected.
- **Validation:** typecheck + `grep` for any consumer relying on per-setter identity (none do — they call the setter), then full suite.

## Step 7 — Split the `RestaurantContext` god-provider  (high risk — do last)

- **Goal:** `RestaurantProvider` currently owns state, orchestration lifecycle, mutation-with-persistence, UI emission, filter sync, and delegates to 4 sub-hooks.
- **Proposed decomposition (no behavior change):**
  - `useRestaurantOrchestrator(...)` — owns the `ScanOrchestrator` instance: init `useEffect`, `setConfig` sync, `destroy` cleanup. Returns `{ scanBatch, requestRescan, requestInteractiveMenuRender, retryFailed, flushQueue }`.
  - `useRestaurantMutator(...)` — owns `updateRestaurant` (the 50-line `useCallback` that diffs status/favorite/ai changes and triggers persistence).
  - Keep `emitFilteredState`, `mergeCachedScanData` where they are; the provider becomes thin wiring of the above + sub-hooks.
- **Constraint:** the orchestrator config depends on `updateRestaurant` and `emitFilteredState` (currently stable via `useCallback`); keep that wiring identical.
- **Risk mitigation:** extract one piece at a time, run typecheck after each extraction, keep a git checkpoint before starting.
- **Validation:** typecheck + `jest src/context` (both `RestaurantContext.test.tsx` and `restaurantState.test.ts`).

## Step 8 — Normalize React import style (cosmetic)

- **Goal:** consistent imports across files.
- **Action:** pick one convention — named imports (`useState`, `useEffect`) consumed directly — and remove the `React.X` usages in `RestaurantListScreen.tsx` (lines 43-47 use `React.useEffect`/`React.useMemo`).
- **Validation:** typecheck (trivial — purely syntactic).

---

## Out of scope (deferred)

- Extracting `MenuAnalysisResult`/`MenuSafetyLevel` into `src/types/menuSafety.ts` (the `import type` fix in Step 3 already resolves the runtime cycle; this is a structural nicety).
- Full test coverage for the new `normalizeMenuAnalysisResult` / `normalizeAiChatHistory` normalizers (add tests in Step 1's PR, but not blocking).
- The `SettingsContext` batched-write optimization (saves multiple disk writes per render cycle); nice-to-have.

## Rollout notes

- Commit in logical, independently-reviewable units matching each step.
- No migrations/migrations path needed — all changes are refactors with identical external behavior.
- The only step needing a non-automated check is Step 5 (app launch smoke test).
