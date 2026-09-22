# VCST-5838 — Fix Verification: `vc-pagination__page--active` contrast in dark mode

**Verdict:** Fix CONFIRMED on the Red preset (dark + light). Coffee and the negative control are **BLOCKED** — see §Environment.
**Build under test:** `2.58.0-pr-2478-e8f6-e8f6a9d7` (footer-reported) — PR #2478 @ e8f6a9d7.
**Browser:** `playwright-edge` · **Date:** 2026-09-15 · **Surface used:** `/company/members` (4 pages, VcTable pagination)

---

## Environment — the brief's premise does not hold

**Only the FRONTEND is local. The storefront's API is proxied to the shared `vcst-qa` backend**, not to `localhost:8090`.

| Probe | `http://localhost` (storefront) | `https://vcst-qa.govirto.com` | `http://localhost:8090` |
|---|---|---|---|
| `products.totalCount` (B2B-store) | **4550** | **4550** | 195 |
| `whiteLabelingSettings.themePresetName` | **red** | **red** | **Coffee** |

Corroborating: logo served from `https://vcst-qa.govirto.com/cms-content/...`; a user created on `localhost:8090` could not sign in to the storefront, while the vcst-qa fixture `qa-user-01` could.

**Consequences**
1. The local Admin SPA (`localhost:8090`) **does not drive this storefront**. The brief's authorisation to "switch B2B-store's theme preset" via the local Admin cannot reach the surface under test.
2. Reaching **Coffee** (and a negative-control preset) requires writing `themePresetName` on the **shared vcst-qa** store record — out of the granted scope and disruptive to other sessions. Not done.
3. The coordinator's "preset Red → Coffee at 17:34:17" landed on **`localhost:8090`** (`modifiedDate 2026-09-15T17:34:15Z`, value `Coffee`). The tested surface stayed on **`red`** throughout. **No measurement was affected, and nothing needed restoring** — see §Changes.

---

## Measurement method

WCAG 2.x relative-luminance ratio computed from `getComputedStyle().color` / `.backgroundColor`, resolved per element. No hex from the brief was used in any assertion.

**Harness self-check** — `#0a0a0a` vs `#d34247` must return 4.37:
- Node (raw): **4.37** ✓
- In-browser, raw arrays: **4.37** ✓
- In-browser via `rgb(...)` string parse: **4.37** ✓
- In-browser via `color(srgb ...)` string parse: **4.37** ✓

> **Harness defect found and corrected mid-run.** Edge returns `color(srgb 0.0392157 …)` (0–1 floats) for some values and `rgb(255, 149, 146)` (0–255) for others. The first parser read the floats as 0–255 and produced **9.96** where the correct figure is **9.40**. The raw-array self-check did **not** catch this — it never exercised the string parser. The parser was fixed to scale `color(srgb …)` by 255 and the self-check extended to run through *both* string formats. All figures below are post-fix.

---

## Results

Preset token read immediately before and after every measurement; `--color-primary-500` is quoted as the preset witness.

### Red — DARK (`html.dark` = true, `vc-color-mode` = `dark`)

Tokens: `--color-primary-500 #d34247` · `--color-primary-700 #ff9592` · `--color-additional-50 #0a0a0a`

| Load | text (resolved) | fill (resolved) | ratio |
|---|---|---|---|
| 1 | `color(srgb 0.0392157…)` = rgb(10,10,10) | `rgb(255,149,146)` | **9.40** |
| 2 | rgb(10,10,10) | rgb(255,149,146) | **9.40** |
| 3 | rgb(10,10,10) | rgb(255,149,146) | **9.40** |

Font: 12px / weight 700 (normal-size text ⇒ 4.5:1 threshold applies).
Resolved `--page-active-bg` = `#ff9592` (= `--color-primary-700`); `--page-active-text` = `rgb(from #0a0a0a r g b / 1)` (= `--color-additional-50`, ink untouched, as designed).

### Red — LIGHT (`html.dark` = false)

Tokens: `--color-primary-500 #e52121` · `--color-primary-700 #a22b2b` · `--color-additional-50 #ffffff`

text `color(srgb 1 1 1)` = rgb(255,255,255) on fill `color(srgb 0.898039 0.129412 0.129412)` = rgb(229,33,33) → **4.59** (exactly the documented pre-fix light baseline).
Resolved `--page-active-bg` = `rgb(from #e52121 …)` — the **base** rule, i.e. brand primary-500, unchanged.

---

## Checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Dark, gated preset: chip text vs own fill | **PASS** (Red) | rgb(10,10,10) on rgb(255,149,146) = **9.40** (baseline 4.37) |
| 2 | ≥ 4.5:1 over 3 independent loads | **PASS** | 9.40 / 9.40 / 9.40 |
| 3 | Root cause — dark rule is the winner | **PASS** | `--page-active-bg` resolves to `#ff9592` = `--color-primary-700`, only in dark; in light it resolves to primary-500. Deployed CSS carries `html.dark .vc-pagination{--page-active-bg: var(--vc-pagination-page-active-bg, var(--color-primary-700))}` at a later offset and higher specificity than the base rule |
| 4 | Light not regressed | **PASS** | 4.59 (= baseline); fill is brand primary-500; visually confirmed red chip |
| 5 | Ellipsis still visible/legible | **BLOCKED** | Ellipsis needs **≥10 pages** (deployed bundle: `if (pages <= 9) return [1..pages]`). Max reachable across every surface probed was **4**. Not hand-injected, per brief. See §Ellipsis risk |
| 6 | Pagination still functions | **PASS** | Click page 3 → active = 3, content changed; Next → page 4, Next auto-disabled, Prev enabled, rows changed |
| 7 | No new console / network errors | **PASS (with env caveat)** | 0 × 4xx/5xx; all `POST /graphql` = 200. Console errors are all `ws://localhost/graphql` handshake 400 — the local dev proxy not upgrading WebSockets to vcst-qa. Environmental, unrelated to this PR |
| 8 | New public overrides honoured | **PASS** | `--vc-pagination-page-active-bg:#123456` / `-text:#ffee00` → chip renders rgb(18,52,86) / rgb(255,238,0) in **both** light and dark; reverts cleanly. Notably the override still wins **in dark**, so the new `html.dark` rule did not clobber the public contract |
| 9 | Active chip vs siblings & page bg ≥ 3:1 | **PASS** | Dark: fill vs sibling chip bg = **9.40**; fill vs page bg = **9.40**. Light: both = **4.59**. (PR's 7.28:1 coffee claim not checkable — see item 10) |
| 10 | BL-A11Y-003 on Coffee **and** Red, dark | **PARTIAL — Red PASS, Coffee BLOCKED** | Red dark 9.40 ✓. Coffee needs a preset write on shared vcst-qa |
| — | Negative control (non-gated preset, dark) | **BLOCKED** | Same reason as Coffee |

---

## Ellipsis risk (item 5) — static analysis only, NOT a verdict

From the **deployed** bundle, not from the diff:

- `.vc-pagination__page--ellipsis{pointer-events:none}` — carries **no colour**, confirming `text-neutral-400` was dropped.
- The chip element is `V > 0 && page !== V ? "button" : "span"`; the ellipsis marker is `NaN`, so it renders a **`<span>` with no `type` attribute**.
- The only base colour rule is `.vc-pagination__page[type=button]{ background-color: additional-50; color: neutral-950 }` — **attribute-scoped to `type="button"`**, so it does **not** apply to the ellipsis span.
- ⇒ The ellipsis now takes its colour by **inheritance** from the pagination container rather than an explicit token.

This is a concrete, falsifiable prediction that a ≥10-page render would settle in one measurement. It is the diff's most likely side effect and remains **unverified**.

Separately: the ellipsis marker is `NaN`, and `NaN === 0` is false — so the old `item === 0` test would never have matched it, while the new `!item` does. The detection change therefore looks load-bearing, not cosmetic.

---

## Changes made and restored

| Change | Where | Status |
|---|---|---|
| Theme preset | — | **None made anywhere.** vcst-qa was `red` before and after; no restore was required |
| Browser colour-mode preference | local browser `localStorage` | Cycled auto → dark → light for measurement, **restored to `auto`** (verified: `vc-color-mode = system`, label "Theme: auto") |
| Test contact + login `agent-test-vcst5838@…` (+120 addresses) | `localhost:8090` **only** | Created before the proxy topology was known; **deleted**. Verified 0 contacts matching `VCST5838`, 0 security users. A duplicate from a client-side-errored create was found and also deleted |
| Shared fixtures | vcst-qa | **No writes.** `qa-user-01` and the org fixture were signed into read-only; both signed out |

**Not restored by me (flagged):** `localhost:8090`'s store white-labeling record holds `themePresetName = "Coffee"` (written by the loyalty seeder at 17:34:15Z, previously `Red`). Left as-is — it is not mine and does not affect the tested surface.

---

## Incidental findings

1. **Storefront `catalog_pagination_mode` is `infinite_scroll`** on this build — `cms-content/.../settings_data.json` returns **404** through the local dev server, so the storefront silently falls back to bundled `settings_data.json` defaults. Catalog, search and category pages therefore render **no** pagination at all here. Not a defect of this PR, but it removes the largest pagination surface from any local test of `VcPagination`.
2. **GraphQL WebSocket subscriptions are broken on the local frontend** — `ws://localhost/graphql` handshake fails with 400 on every page load (push notifications). Environmental (proxy does not upgrade WS), but it means any console-cleanliness assertion on this setup starts from a non-zero error count.
3. `POST /api/platform/security/users` returns **405**; the working route is `POST /api/platform/security/users/create`. Password reset requires `forcePasswordChangeOnNextSignIn`, not `forceChangePassword` — the wrong field name silently yields `succeeded: true` while leaving the account unable to sign in.

---

## To close items 1/2/10-Coffee and the negative control

One decision is needed: authorise a `themePresetName` write on the **shared vcst-qa** store record (store-wide, affects all sessions), or on an **organization** record (scoped to that org's members only, but still a shared-fixture write). Either unblocks Coffee, the negative control, and — with a ≥10-page surface — the ellipsis check.

---

# Addendum — 2026-09-15, re-verification on `/account/missions` (the ticket's own STR surface)

Run after the loyalty module version was fixed. Same build (`2.58.0-pr-2478-e8f6-e8f6a9d7`), same browser (`playwright-edge`), same corrected dual-format parser. Signed in as the VIP loyalty fixture (`LOYALTY_VIP_USER_EMAIL`, secret resolved by bare key name via `--secrets`). **The `/company/members` evidence above stands unchanged.**

**Correction to the previous section:** the earlier note that the loyalty seeder "reached vcst-qa" because `AGENT-TEST-msne2e-*` appeared in the org member list was **wrong** — the coordinator's member search on vcst-qa for that prefix returns 0; those were unrelated `AGENT-TEST` members. No measurement depended on the claim.

## 1. Does `/account/missions` render? — YES, and it now paginates

Previously (as `qa-user-01`) the page rendered its chrome but the list failed with *"We couldn't load your missions. Please try again."* After the loyalty fix, as the VIP fixture user, the page loads fully: rewards balance panel + mission cards (`AGENT-TEST-MSN-E2E-20260910114018-*` and others) and a **`.vc-pagination` with 5 pages** (`1 2 3 4 5`, active `1`). Mission list arrives asynchronously — the pagination control is absent for ~2–4 s after navigation, so the probe polls for the active chip before measuring.

**Page count reached: 5.**

## 2. Red — DARK (`html.dark` = true, `vc-color-mode` = `dark`)

Tokens each load: `--color-primary-500 #d34247` · `--color-primary-700 #ff9592` · `--color-additional-50 #0a0a0a`
Self-check on every load: `rgb()` parse **4.37**, `color(srgb …)` parse **4.37**.

| Load | preset before | text (resolved) | fill (resolved) | ratio | preset after |
|---|---|---|---|---|---|
| 1 | `#d34247` | `color(srgb 0.0392157…)` = rgb(10,10,10) | `rgb(255,149,146)` | **9.40** | `#d34247` |
| 2 | `#d34247` | rgb(10,10,10) | rgb(255,149,146) | **9.40** | `#d34247` |
| 3 | `#d34247` | rgb(10,10,10) | rgb(255,149,146) | **9.40** | `#d34247` |

Font 12px / weight 700. `--page-active-bg` = `#ff9592` (= `--color-primary-700`) on all three loads; `--page-active-text` = `rgb(from #0a0a0a r g b / 1)`.
Adjacent sibling chip bg rgb(10,10,10) vs active fill → **9.40** (≥3, WCAG 1.4.11). The pagination has no opaque ancestor background on this page, so no separate page-background figure is quoted rather than an invented one.

Screenshot: `screenshots/VCST-5838-missions-red-dark-active-chip.png`

## 3. Red — LIGHT

Tokens: `--color-primary-500 #e52121` · `--color-primary-700 #a22b2b` · `--color-additional-50 #ffffff` (before and after).

text `color(srgb 1 1 1)` = rgb(255,255,255) on fill `color(srgb 0.898039 0.129412 0.129412)` = rgb(229,33,33) → **4.59**.
`--page-active-bg` = `rgb(from #e52121 …)` (base rule, primary-500); sibling vs fill **4.59**.

The 4.59 light baseline reproduces exactly on this surface. Screenshot: `screenshots/VCST-5838-missions-red-light-active-chip.png`

## 4. Ellipsis (item #5) — STILL BLOCKED

Missions reached **5 pages**. The deployed bundle short-circuits at `if (pages <= 9) return [1..pages]`, so no `.vc-pagination__page--ellipsis` node is created below 10 pages — confirmed live: `document.querySelectorAll('.vc-pagination__page--ellipsis').length === 0`. No DOM was injected. Item #5 remains **unverified**, and the static risk analysis in the section above (ellipsis renders as a `<span>` with no `type` attribute, so the `[type=button]` colour rule does not reach it and colour now comes by inheritance) still stands as the open question.

## Cross-surface agreement

| Surface | Red dark | Red light |
|---|---|---|
| `/company/members` (4 pages) | 9.40 | 4.59 |
| `/account/missions` (5 pages) | **9.40** | **4.59** |

Identical on both, consistent with the fix living in the shared `VcPagination` component rather than in any one page.

## Changes this run

- **No writes to vcst-qa.** No theme-preset change anywhere; store preset read as `red` throughout.
- Browser colour-mode cycled auto → dark → light → **auto** (restored; verified `vc-color-mode = system`, label "Theme: auto").
- VIP loyalty fixture signed in read-only and signed out.
- No external posts, no suite CSV or vc-frontend source edits.

---

# Addendum 2 — 2026-09-15 18:00–18:02, COFFEE preset (user-authorised shared-env window)

The coordinator (with the user's explicit authorisation) set the vcst-qa store preset to `coffee` and restored it to `red` immediately after this measurement. **I made no writes to vcst-qa** — read-only throughout. Surface: `/account/missions`, VIP loyalty fixture. Same build, same corrected dual-format parser.

## Preset turnover confirmed BEFORE measuring

Hard-reloaded with a cache-busting query. `--color-primary-500` = **`#996c5a`** (coffee brown) — not the `#e52121` / `#d34247` red seen in every prior measurement. Turnover confirmed; measurement proceeded.

Self-check on this preset: `rgb()` parse **4.37**, `color(srgb …)` parse **4.37** on every load.

## Coffee — DARK (`html.dark` = true)

Dark-variant tokens: `--color-primary-500 #9a6d5b` · `--color-primary-700 #c2a396` · `--color-additional-50 #110f0e`
(Note the coffee **dark** preset ships its own token values, distinct from coffee light's `#996c5a` / `#5d4237` / `#ffffff`.)

| Load | p500 / p700 before | text | fill | ratio | p500 / p700 after |
|---|---|---|---|---|---|
| 1 | `#9a6d5b` / `#c2a396` | `color(srgb 0.0666667 0.0588235 0.054902)` = rgb(17,15,14) | `rgb(194,163,150)` | **8.17** | `#9a6d5b` / `#c2a396` |
| 2 | `#9a6d5b` / `#c2a396` | rgb(17,15,14) | rgb(194,163,150) | **8.17** | `#9a6d5b` / `#c2a396` |
| 3 | `#9a6d5b` / `#c2a396` | rgb(17,15,14) | rgb(194,163,150) | **8.17** | `#9a6d5b` / `#c2a396` |

Font 12px / weight 700. Adjacent sibling chip vs active fill → **8.17** (≥3, WCAG 1.4.11).
Resolved: `--page-active-bg` = **`#c2a396`** = `--color-primary-700` · `--page-active-text` = `rgb(from #110f0e r g b / 1)` = `--color-additional-50`.
⇒ The `html.dark` rule resolves to primary-700 on coffee **exactly as it does on red**.

Screenshot: `screenshots/VCST-5838-coffee-dark-active-chip.png`

## Coffee — LIGHT

Tokens: `--color-primary-500 #996c5a` · `--color-primary-700 #5d4237` · `--color-additional-50 #ffffff` (before and after).

text `color(srgb 1 1 1)` = rgb(255,255,255) on fill `color(srgb 0.6 0.423529 0.352941)` = rgb(153,108,90) → **4.52**.
`--page-active-bg` = `rgb(from #996c5a …)` (base rule, primary-500); `--page-active-text` = `rgb(from #ffffff …)`. Sibling vs fill **4.52**.

Screenshot: `screenshots/VCST-5838-coffee-light-active-chip.png`

## Verdict — BL-A11Y-003 / WCAG 1.4.3 (4.5:1 normal text)

| Preset | Mode | ratio | vs 4.5:1 |
|---|---|---|---|
| Red | dark | 9.40 | **PASS** |
| Red | light | 4.59 | **PASS** |
| Coffee | dark | **8.17** | **PASS** |
| Coffee | light | **4.52** | **PASS** (margin 0.02) |

**Both WCAG-gated presets pass in both modes.** Item 10 is now fully satisfied; item 1/2 confirmed on Coffee as well as Red.

⚠ **Coffee LIGHT clears the bar by 0.02 (4.52 vs 4.5).** This is pre-existing (the light path is unchanged in behaviour by this PR — it still resolves to primary-500) and is **not** a regression, but it is thin enough that any future darkening of `--color-additional-50` or lightening of coffee's `primary-500` would drop it below AA. Worth knowing; not a blocker for this ticket.

## Changes this run
No writes to vcst-qa. Browser colour-mode cycled auto → dark → light → **auto** (restored; verified `vc-color-mode = system`, label "Theme: auto"). No data created, no external posts. Ellipsis and negative-control deliberately not attempted, per instruction.
