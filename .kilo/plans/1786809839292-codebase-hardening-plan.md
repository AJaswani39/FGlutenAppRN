# Codebase Hardening Plan — Completed & Remaining

Final record of the structural pass over the `fglutenapprn` (Expo/React Native + TypeScript) codebase.
Each step was implemented and gated on `tsc --noEmit` + `jest --runInBand`.
The lone failing suite (`cloud-run-proxy/server.test.js`) is pre-existing and unrelated (missing `pdf-parse`).

## Completed (8 steps)

1. **`as unknown as` / `as any[]` disk-rehydration casts in `persistenceService.ts`**
   Added `normalizeMenuAnalysisResult` + `normalizeAiChatHistory` validators that follow the file's
   existing `normalize*` pattern. All four cast sites (`persistenceService.ts:148,153,237,248`) are gone.
   - `tsc`: clean · `PersistenceService.test.ts`: 6/6 pass.

2. **`favoriteKey(r)!` non-null assertion in `useRestaurantFavorites.ts:27`**
   Replaced the unguarded `!` with a map + null-filter (type-preserving `[string, Restaurant]`).
   - `tsc`: clean · `context/` suite: 25/25 pass.

3. **Runtime circular dependency `types/restaurant.ts` ↔ `services/menuSafety.ts`**
   Converted both sides to `import type` — fully elided at compile time, eliminating the
   module-eval cycle Metro had to tolerate "by accident".
   - `tsc`: clean · `services/` suite: 43/43 pass.

4. **Dead re-export `export { getEmptyResultsMessage }`** (only in `RestaurantContext.tsx:56`)
   NOTE: earlier plan listed `App.tsx:56` too, but a grep confirmed `App.tsx` never re-exported it.
   Removed the single dead re-export from `RestaurantContext.tsx`. Definition + legit local usage kept.
   - `tsc`: clean.

5. **Dynamic `require()` in `App.tsx`** (lines 61-67) → static top-level imports
   Collapsed the `ThemedAppShell` prop-threading indirection into a single `AppShell` component
   that imports its deps directly.
   FINDING: `expo-status-bar`'s `StatusBar` does **not** accept `backgroundColor`
   (see `node_modules/expo-status-bar/build/types.d.ts:8-35` and `NativeStatusBarWrapper.tsx` which
   destructures only `{ style, hideTransitionAnimation, animated, hidden }`). The original
   `backgroundColor={colors.background}` was a **latent no-op** masked by the `require()` + hand-rolled
   `ComponentType<{...backgroundColor}>` type that lied it was supported. Dropped the no-op prop.
   (To actually color the Android status bar, set `androidStatusBar.backgroundColor` in `app.config.js` — out of scope.)
   - `tsc`: clean.

6. **`SettingsContext` 5× duplicated setter boilerplate** → `useBooleanSetting(key, fallback)` hook
   Each setting now `const [val, set] = useBooleanSetting('key')`. Batched load preserved via
   per-hook effect; stable setters preserved via `useCallback`. External `SettingsContextValue` API unchanged.
   - `tsc`: clean · full suite: 111/111 pass.

7. **`RestaurantContext.tsx` god-provider** — partial, risk-weighted extraction:
   - **7a (done):** extracted `updateRestaurant` (the 55-line diff/persistence mutator) into
     `useRestaurantMutator.ts`. It had no cyclic deps (only `rawRestaurants`, `updateSavedRestaurant`,
     `persistCache`, `persistMenuScan` — all from earlier hooks). Provider line count dropped by ~55.
   - **7b (intentionally NOT extracted):** the `ScanOrchestrator` lifecycle. There is a *deliberate*
     cyclic lazy-read: `getScanProgress` (declared early) reads `orchestrator.current.getBatchKeys()`
     via a `useRef`, while the orchestrator's config effect needs `emitFilteredState` (declared late).
     That `useRef` + lazy-read is precisely what breaks the declaration-order cycle. Extracting it into
     a hook would require introducing a "latest callback ref" (`configRef`) indirection solely to
     dodge TypeScript's temporal-dead-zone — net-negative for readability. The orchestrator is already
     a well-factored `class`; the wrapper around it is only ~30 lines. Left as-is.
   - **7c (future nicety, not done):** `mergeCachedScanData` (uses only refs → pure-ish) could also
     be hoisted out, but adds little.

8. **Inconsistent React import style** (`React.useX` vs bare `useX`)
   Standardized 6 files (`HomeScreen`, `MapScreen`, `RestaurantListScreen`, `ui.tsx`, `AppErrorBoundary`,
   `Skeleton.tsx`) onto bare named imports. 18 call sites converted.
   Files that also reference `React` for non-hooks (`RestaurantListScreen` → `React.memo`;
   `AppErrorBoundary` → `React.Component`/`React.ReactNode` type refs) keep the default import.
   - `tsc`: clean · full suite: 111/111 pass.

## Verification status

- `tsc --noEmit`: **clean** (exit 0) after every step.
- `jest --runInBand`: **111/111 tests pass** across 18/19 suites (the 1 failure is the
  unrelated, pre-existing `cloud-run-proxy/server.test.js` which can't resolve `pdf-parse`).
- No behavior changes: the public `RestaurantContext`/`SettingsContext` APIs are identical;
  `RestaurantContext.test.tsx` (23 tests incl. scan orchestration, rescan, interactive render,
  favorites) all green after the mutator extraction.

## Out of scope / deferred

- Extracting `MenuAnalysisResult`/`MenuSafetyLevel` into `src/types/menuSafety.ts` so `types/`
  never imports from `services/`. (`import type` already removed the runtime cycle; this is structural nicety.)
- Unit tests for the new `normalizeMenuAnalysisResult` / `normalizeAiChatHistory` / `useBooleanSetting`
  normalizers (the existing `RestaurantContext`/`PersistenceService` suites indirectly cover them).
- Setting Android status-bar background color via `app.config.js` `androidStatusBar` (latent no-op
  discovered in step 5; a behavior change, not a refactor).
- Full god-provider split (orchestrator) — see 7b reasoning above.
