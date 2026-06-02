# SBTM Session — Storefront Locale-Prefix URL Routing

- **Area:** Storefront locale-prefixed URL routing (Vue Router + HTML5 History API)
- **Date:** 2026-06-01
- **Duration:** ~30 min
- **Platform:** 3.1032.0 · **Theme:** vc-theme-b2b-vue 2.50.0-alpha.2358
- **Browser/Env:** playwright-firefox · vcst-qa-storefront.govirto.com · authenticated (Emily Johnson / TechFlow B2B org)
- **Session type:** [EXP] (scenario-discovery)
- **Discovery technique:** Coverage-diff hunting + Boundary-of-features; Bad Neighborhood / Saboteur tours as familiar-problem filters
- **Charter:** Discover locale-prefix routing scenarios not covered by suite `046 L10N-CAT-001` (DE-locale category permalink, direct URL — ONE case) and not in any `VC-*` bug-catalog entry. Context: PR #2306 / VCST-5144 ("locale prefix eats pathname chars") just shipped.

---

## Net-New Scenarios Discovered (MANDATORY)

| # | Scenario | Why uncovered (no suite + no catalog entry) | What we found | Suggested next charter |
|---|----------|---------------------------------------------|---------------|------------------------|
| 1 | **Switch language while ON a deep route** whose slug begins with the target locale's 2-letter code | 046 only covers *direct-URL* category permalink; never the *switcher-on-deep-route* flow. No `VC-*` entry for locale switching. | **BUG.** On `/en-GB/destinations` → click "Deutsch" → URL becomes `/de/stinations` → 404. The `de` of `destinations` is eaten. Pure real-user action. | Charter: enumerate every top-level catalog slug whose first 2 chars match a supported locale code (de/it/no/pl/fi/ru/es/pt/fr/sv/el); regression-guard the switcher rewrite. |
| 2 | **Direct-nav to a non-prefixed slug beginning with the active locale code** | 046 navigates a *category-GUID permalink*, never a *friendly slug* colliding with a locale token. | **BUG (same root cause).** Active locale = de, address-bar `/destinations` → `/de/stinations` → 404. With active locale = en-GB the identical nav → `/en-GB/destinations` renders fine → proves it's locale-token char-eating, not a dead slug. | (covered by #1 charter) |
| 3 | **Explicit `/{otherLocale}/` deep link while session locale differs** (bookmark / shared link / SSR landing) | 046 lands on the *already-active* locale; never tests an incoming prefix that DISAGREES with the persisted locale. No catalog entry. | **BUG (prefix-stacking variant).** Active locale = de, nav to `/en/` → `/de/en/` → 404. Router treats `en` as a pathname segment and prepends `/de/` instead of switching locale. Breaks bookmarked/shared `/en/...` links. | Charter: round-trip every supported locale prefix as an incoming explicit deep link from a *different* active locale; assert locale-switch (not prefix-stack). |
| 4 | **PDP deep-link + refresh under locale prefix** | 046 = category only; PDP route type never exercised under a prefix. | PASS. `/de/products-with-options/shirts-jeans-and-more/hoodie` renders + survives refresh; in-app links re-prefixed to `/de/...`. | — |
| 5 | **Locale prefix + query string** (search & catalog facets) | 046 has no query-string case. | PASS. `/de/search?q=apple` → "Ihre Suche nach apple … 130 Ergebnisse"; query coexists with prefix, correct locale + results. | — |
| 6 | **Account route under locale prefix** (authenticated) | 046 covers catalog only; account routes never tested with prefix. | PASS. `/de/account/orders` → "Bestellungen", prefix preserved. | — |
| 7 | **Boundary chars after prefix** — double slash | Not in 046 or any catalog entry. | PASS (partial). `/de//catalog` tolerated → "Katalog", no char-eating. Trailing-slash / percent-encoded / fragment NOT yet probed (time). | Charter: fuzz post-prefix boundary chars (`%2F`, trailing `/`, `#frag`, unicode) across route types. |

> At least one net-new scenario delivered → session correctly labeled **[EXP]**. Scenarios 1–3 are net-new **and** uncovered defects.

---

## Bugs Found

| # | Severity | Title | Evidence | Net-new? |
|---|----------|-------|----------|----------|
| B1 | **High** | Locale switch / nav eats leading pathname chars when slug begins with active locale code (`/destinations` → `/de/stinations` → 404) | `reports/exploratory/screenshots/BUG-locale-prefix-eats-chars-de-stinations.png` | Yes |
| B2 | **High** | Explicit `/{locale}/` deep link prepends active locale instead of switching it (`/en/` → `/de/en/` → 404) when session locale differs | same mechanism; 404 view | Yes |

**Both are residuals of PR #2306 (VCST-5144) — the same path-slicing routine, on inputs the fix author did not enumerate.** Likely one underlying defect with two surfaces.

### B1 / B2 — repro (all real-user, all confirmed ≥2×, all SILENT — 0 console errors)
1. Set session locale to German (language switcher → Deutsch). Active locale persists.
2. **B1a (switcher-on-deep-route):** open a category whose slug starts with `de` — `/en-GB/destinations` (valid, renders). Click language switcher → **Deutsch**. → URL rewrites to `/de/stinations` → **404 "Seite nicht gefunden"**. Expected `/de/destinations` (22 products).
3. **B1b (direct-nav):** with active locale = de, type `/destinations` in address bar. → `/de/stinations` → 404. Control: with active locale = en-GB the *same* nav → `/en-GB/destinations` renders → isolates the trigger to **active-locale-code === slug's leading token**.
4. **B2 (prefix-stack):** with active locale = de, navigate to explicit `/en/`. → `/de/en/` → 404. Router fails to treat `en` as a locale switch.

**Root cause (2 sentences):** The locale-prefix normalizer strips a leading segment equal to the *active* locale's 2-letter code from the incoming pathname (assuming the URL already carries the prefix), then re-prepends `/{activeLocale}/`. When the path's first token coincidentally equals/starts-with that code (`de`stinations) the chars are consumed; when it's a *different* explicit locale (`en`) the code fails to switch and stacks the prefix.

**Trigger condition (for regression):** active locale `X` (2-letter) AND incoming pathname's first segment begins with `X` OR equals another supported locale code. Common flows (switch from home, in-app link nav) are unaffected — hence High, not Critical (no data loss; needs a slug/locale collision or an explicit cross-locale deep link).

---

## Risk Areas
- **Char-eating generalizes** to any locale↔slug collision: on the current catalog only `destinations` (de) is a live victim, but the catalog drifts — any future top-level slug starting with `it/no/pl/fi/ru/es/pt/fr/sv/el/de/zh/ja/en` under the matching locale will silently 404.
- **Bookmarks / shared links / SEO / SSR landings** to `/{locale}/...` break when the visitor's persisted locale differs (B2) — exactly the cross-locale share scenario a multi-language store relies on.
- **Silent failure:** no router TypeError, no 5xx — the SPA renders its own 404 on `index.html` 200. Monitoring/error tracking will NOT catch this; only a content-aware test will.

## Observations
- 15 locales available (pl, sv, no, de, fr, it, en-US, zh, pt, ja, el, fi, en-GB, ru, es); many 2-letter codes → wide collision surface.
- Locale is **sticky** (persisted): a non-prefixed direct nav re-applies the stored prefix (`/catalog` → `/de/catalog`) — correct behavior, but it's the same normalizer that misfires in B1/B2.
- Per-locale menu config differs (en menu ~16 items; de menu shows only Printers / "TV de" / SEE ALL) — out of charter scope, noted only.
- Page title localizes correctly even on the 404 ("404 Seite nicht gefunden"), so locale resolution itself works — the defect is purely path normalization.

## Questions
- Is the normalizer matching the locale code with `startsWith` (explains char-eating) or a fixed `slice(prefixLength)`? Source review of the PR #2306 diff would pin which.
- Should an incoming explicit `/{locale}/` ALWAYS win over the persisted locale (switch), rather than being treated as a pathname? (B2 hinges on this product decision.)
- Does this also affect `/{locale}/category/{guid}` permalinks (the 046 case) when active locale ≠ requested? Not retested this session — 046 only covers the *matching*-locale case.

## Charter-from-Gap (next sessions)
1. **Locale↔slug collision sweep** — enumerate all top-level catalog slugs vs the 13 two-letter locale codes; assert no char-eating across direct-nav + switcher-on-page (covers B1).
2. **Cross-locale explicit deep-link round-trip** — for each persisted locale, land on every other `/{locale}/<route>` (home, PDP, category-GUID, search?q, account) and assert a clean locale switch, not a 404 (covers B2 + the 046 permalink gap under mismatch).
3. **Post-prefix boundary fuzz** — trailing slash, `%2F`, `#fragment`, unicode, after the locale prefix across route types (extends scenario #7).

---

## Re-verification — 2026-06-01 (build 2.50.0-alpha.2359)

- **Live build confirmed:** footer reads `Ver. 2.50.0-alpha.2359` (was 2358). index.html regenerated today 08:45 GMT, served `cf-cache-status: DYNAMIC` (uncached). Cache busted via hard query-string reloads. New fix build IS live.
- **Browser/Env:** playwright-firefox · vcst-qa-storefront.govirto.com · authenticated (Emily Johnson / TechFlow). Victim slug `destinations` (collides with `de`) still live — like-for-like re-run of the prior repros.
- Each surface confirmed ≥2×. Locale restored to English (en-GB, persisted) at teardown.

| Surface | Verdict | Observed |
|---------|---------|----------|
| **B1a** char-eating, switcher-on-deep-route | **FIXED** | `/en-GB/destinations` → click Deutsch → URL `/de/destinations`, category renders (22 Ergebnisse, products re-prefixed `/de/...`). Confirmed 2×. No char-eating (was `/de/stinations` → 404). |
| **B1b** char-eating, direct address-bar nav | **FIXED** | Active de → address-bar `/destinations` → `/de/destinations`, 22 results. Confirmed 2×. Control: active en-GB → `/destinations` → `/en-GB/destinations` renders. No char-eating either locale. |
| **B2** prefix-stacking, cross-locale deep link | **NOT FIXED** | Active de → `/en/` → **`/de/en/` → 404 "Seite nicht gefunden"**. Confirmed 3×. Identical to prior bug. |

**B2 — sharper isolation this run (residual root cause narrowed):** The stack/404 is **specific to the bare default-locale token `/en/`**, not cross-locale deep links generally. All of these now switch cleanly (no stack):
- active de → `/en-GB/destinations` → `/en-GB/destinations` ✓ (regional `en-GB` prefix wins)
- active en-GB → `/de/destinations` → `/de/destinations` ✓
- active de → bare `/it/` → `/it/` ✓ (bare non-default locale switches fine)
- active *(it route)* → bare `/en/` → **`/de/en/` → 404** ✗ — the prepended prefix is the **persisted** locale (`de`), not the route-active one (`it`), proving the normalizer ignores `en` as a locale token and stacks it under the stored preference.

So PR #2306 (VCST-5144) fixed the **char-eating leg** (B1a/B1b — `startsWith`/slice on a colliding slug) but **not the bare-`/en/`-stacking leg** (B2). The bare default-locale code `en` is still treated as a pathname segment rather than a locale switch. Regional `en-GB`/`en-US` and other bare 2-letter codes (`it`, `de`) are unaffected.

**Console/network:** B2 404 remains router-**silent** (SPA renders its own 404 on index.html 200 — verified by content). One transient `ApolloError: NetworkError when attempting to fetch resource` observed in-session (not a router exception; consistent with `feedback_apollo_cart_shipment_stale_data` network-blip pattern) — not the locale defect.

**Screenshots (disposable, `test-results/firefox/`):** `SBTM-locale-B1a-FIXED-de-destinations-2359.png`, `SBTM-locale-B1b-FIXED-de-destinations-directnav-2359.png`, `SBTM-locale-B2-NOTFIXED-de-en-404-2359.png`.

**Residual to file/track:** B2 (`/{persistedLocale}/en/` → 404 on incoming bare `/en/`) — bookmarked/shared/SEO `/en/...` links still break for visitors whose persisted locale ≠ en. The fix should treat a bare `/en/` (default-locale code) the same as `/en-GB/` and other bare codes: switch, don't stack.
