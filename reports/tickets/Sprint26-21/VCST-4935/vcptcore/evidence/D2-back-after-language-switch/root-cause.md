# D2: root cause (pre-existing, not introduced by vc-frontend#2576)

## Verdict

- **Reproduced** on vcptcore (theme pr-2576) on a PDP, a nested category and a top-level category.
- **A/B on the same routes: PRE-EXISTING.** vcst-qa runs theme pr-2570, and its bundle has the pre-PR selector. It produces the same 404 on the PDP and the nested category, with the same decisive request: `GetSlugInfo {permalink:"fr/<path>", cultureName:"en-US"}` → `entityInfo:null`, sent on popstate with no document load.
- The PR does not cause it. The PR also does not fix it.

## Mechanism (bundle code on both stands; source at `.fix-workspace/vc-frontend` `client-app/`)

1. **The selector pushes a history entry, then reloads.** In `language-selector.vue` `select()`, `pinLocale(culture)` is followed by `removeLocaleFromUrl()`, which calls `history.pushState(null, "", <url without locale>)` (`useLanguages.ts`, not replaceState), and then `location.reload()`. History is now `[/fr/x, /x]`. The `/fr/x` entry stays reachable.
2. **Locale and router base are fixed once, at boot.** `app-runner.ts` resolves `currentCultureName` (the pinned en-US), creates i18n with it and calls `createRouter({ base: … })` (`router/index.ts`, `createWebHistory(base)`). The base is `""` for the default locale.
3. **Nothing re-derives the locale on popstate.** No `popstate` listener exists in the app source. The bundle's only `popstate` hit is the App Insights SDK. On Back, vue-router (base `""`) matches `/fr/x` to the slug catch-all with path `fr/x`. The slug resolver sends it with the current i18n culture en-US, `slugInfo` is empty, and the 404 view renders at HTTP 200. `<html lang>` stays en-US.
4. **A reload works** because a full boot reads the locale from the URL again (row 8).
5. **Variant b (non-default → non-default)** is the same mechanism with one more entry. After the reload, `initLocale` calls `history.pushState(/<new-locale>/x)` (still a push in PR 2576, now built through `getLocalizedPath`). History becomes `[/fr/x, /x, /en-GB/x]`. The first Back is absorbed: the URL stays `/en-GB/…`. The second Back reaches `/fr/x` and gives 404 (vcst row 7). On vcptcore the intermediate entry keeps the previous language's permalink (`/nl-BL/<nl-NL permalink>`), as reported earlier.

## What PR 2576 changed on this path, and why it does not matter here

- `select()` now strips the locale before its own `getSlugInfo`. That lookup now resolves, so `previousCultureSlug` gets cleared. The pre-PR build sent `fr/<path>`, got null, and fell back after the reload. **This is the only request-shape difference between the two builds. It happens before the reload and has no effect on Back.**
- `initLocale` was refactored to use `getLocalizedPath`. It still calls `pushState` with the same condition.
- `virto-pages.vue` now has an `immediate` watch on `permalink` that calls `updateLocalizedUrl`, a replaceState. It matters only on Page Builder routes, and it is the likely source of the stray `getPageDocument {id:"?"}` there (not verified in this run).

## Fix direction (for /qa-fix; theme, single repo, vc-frontend)

- Use `history.replaceState` instead of `pushState` in `removeLocaleFromUrl()` when it runs just before `location.reload()`. The same applies to the `initLocale` rewrite at boot. A language switch then adds no history entry, and Back returns to the page before the switch.
- Alternatively, or in addition, on popstate to a URL whose locale prefix differs from the active locale, do a full reload so the boot sequence runs again.

## Open point (not a blocker)

A top-level category on vcst (`/fr/alcoholic-drinks`) kept showing the category in English at the `/fr/` URL instead of a 404, although its Back `GetSlugInfo` was also null (row 6). The same route on vcptcore gave 404. The nested category on vcst did give 404 (row 5), so this is a rendering difference between the two theme bases or their data on one route, not a different mechanism. Either way the result is broken: a locale mismatch at minimum.

## Severity recommendation

**Medium (P2), PRE-EXISTING, not a release blocker for VCST-4935.** It breaks browser Back after any language switch, on every slug route, and reload recovers. It loses no data and blocks no checkout. Classify it as found in testing; it was not introduced by this ticket. File it separately against vc-frontend instead of reopening PR 2576.

## kb

KB-912B0774 was confirmed on vcst_qa (theme pr-2570), noting that the defect is pre-existing. The entry's closing sentence describes a control from a different direction (`/sv/catalog`, switching from the default to a non-default language), which this same-route A/B supersedes.
