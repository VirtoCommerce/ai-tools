# VCST-5412 — vc-shell behaviour changes / hardening + bundle-swap functional verification

**Env:** vcmp-dev Vendor Portal (`https://vcmp-dev.govirto.com/apps/vendor-portal/`), app footer `2.1.0`,
**`@vc-shell/framework` v2.3.0** (build `2026-07-28T09:06:51Z`, commit `eb3675e7a`, read from the live console banner).
**Browser:** playwright-edge. **Date:** 2026-07-28. **Account:** `admin` (Administrator).

> **Attribution caveat:** deployed framework is **2.3.0 — one minor AHEAD of the 2.2.0 named in the test plan**, so it
> contains PR VirtoCommerce/vc-shell#255 *plus later work*. No finding below can be attributed to PR #255 alone.

## Verdicts

| ID | Verdict | Category | Evidence |
|----|---------|----------|----------|
| BS-09 | **PASS** | — | Framework chunk loaded **exactly once**; see counts below. `evidence/net-js-initial.txt` |
| BS-11 | **PASS** | — | Source view renders block-per-line beautified HTML; split view in sync; content not corrupted on switch back. `screenshots/BS-11-editor-source-view-formatted.png`, `BS-11-split-view.png` |
| BS-12 | **PASS** | — | Messy HTML (unclosed `<li>`/`<p>`, multi-space) repaired + beautified; **byte-identical after 3 view switches**; no loss, no duplicated tags. `screenshots/BS-12-source-roundtrip-1.png` vs `-3.png` |
| BS-13 | **PARTIAL** | see note | Charts render correct data (donut 465/62 = grid totals, Orders line, Offers bar). Widget drag-reorder + resize **NOT-EXECUTABLE** (harness cannot drive gridstack). Widget period selection (90D/12M) **reset to defaults** after a genuine full reload + re-login. `screenshots/BS-13-dashboard-initial.png` |
| BS-14 | **PASS** | — | Login Sign-in disabled→enabled on fill; product form: clear name → `[invalid]` + "The name field is required"; refill → state **and** message cleared. vee-validate reactive; no duplicate-copy symptom |
| BH-01 | **PASS** | — | AI panel (iframe bridge) opened, message sent, reply arrived **with correct context** ("a total of **465 products**" = grid `1–20 of 465`). No origin/dropped-message warnings. `screenshots/BH-01-ai-reply.png` |
| BH-02 | **NOT-EXECUTABLE** | Expected hardening | An AI origin **is** configured on this env; forcing the no-origin path would require mutating shared config. Confirmed *positively* instead via BH-01 (explicit-origin bridge works). See §BH-02 note |
| BH-03 | **FAIL** | **Defect** | `vc-video` sandbox lacks `allow-same-origin` → YouTube player crashes, **video does not play** (black box). See §Defect 1 |
| BH-04 | **FAIL** | **Defect** | Bootstrap path OK (full load → `#/login`), but a session invalidated **mid-session** produces no redirect, no toast, silently empty widgets. See §Defect 2 |
| BH-05 | **PASS** (no duplicates) | — / see §Defect 3 | 5×403 + 3×500 across 8 distinct requests produced **zero duplicate** toasts — the interceptor-duplication guard holds. But they produced **zero toasts at all** (silent failure) → tracked separately as §Defect 3. `screenshots/BH-05-403-toasts.png` |
| BH-08 | **PASS (partial)** | — | Confirm dialog + image popup each closed **only** the intended popup; no orphaned overlay, page interactive after. A genuinely *nested* popup-from-popup is not reachable in this app (modals correctly aria-hide the rest) → arbitrary-order leg NOT-EXECUTABLE |
| BH-09 | **NOT-EXECUTABLE SAFELY** | — | Would require writing a malformed value into **shared** platform UI-customization settings; other agents are active on this env. Not attempted per instruction |
| BH-10 | **NOT-EXECUTABLE** | needs dev confirmation | **No minimum-dimensions rule is enforced** on product image upload here: a **1×1 PNG was accepted** with no message; a valid 800×800 also uploaded; repeated uploads fine. Cannot test "rejected then accepted" if no rule exists. `screenshots/BH-10-tiny-image-rejected.png` |
| BH-11 | **PARTIAL** | see §BH-11 | Width + order + visibility restored; **sorting and filter reset**. Detail below |
| BH-12 | **PASS** | — | Column toggled then navigated away on the very next action; state survived on return. *Caveat:* MCP round-trip latency (~hundreds of ms–s) cannot guarantee the write landed strictly inside the debounce window |
| BH-13 | **PASS** | — | Maximize → label correctly becomes "Restore" → Restore → Close; blade reopened fine. **No console errors/warnings about deprecated `expanded`/`closable` props** |
| BH-14 | **PASS** | — | 6 remote modules loaded, menu fully populated, no remote-load errors. Counts below |

**Counts:** 8 PASS · 1 PASS-partial · 2 PARTIAL · 2 FAIL · 3 NOT-EXECUTABLE

## BS-09 / BH-14 — actual framework load counts

Measured from the real waterfall (`evidence/net-js-initial.txt`) plus direct byte checks:

| Asset | Requests | Size |
|-------|----------|------|
| `vc-shell-framework49842.js` (host, real framework) | **1** | 114,882 B |
| per-remote `…__loadShare___mf_0_vc_mf_2_shell_mf_1_framework__loadShare__.*.js` | 6 (one per remote) | **289 B each** — share-registration shim only |
| `vc-shell-vendor-vee49842.js` (vee-validate runtime, host) | **1** | 11,309 B |
| MarketplaceRegistration `vee_mf_2_validate__loadShare__` shim | 1 | 988 B |

The shim body confirms singleton sharing, not duplication:
`loadShare("@vc-shell/framework",{customShareInfo:{shareConfig:{singleton:!0,strictVersion:!1,requiredVersion:"^2.0.0"}}})`

**Remotes loaded OK (6):** Import, MarketplaceCommissions, MarketplaceCommunication, MarketplaceQuote,
MarketplaceRegistration, MarketplaceReviews — 6× `remoteEntry.js` + 6× `main.js`, all 200, menu fully populated.
Host also bundles `vc-shell-vendor-charts` + `vc-shell-vendor-gridstack`, i.e. the opt-in `./dashboard` +
`./charts` subpath exports are correctly wired app-side — **no Required migration outstanding.**

## BH-11 / BH-12 — exactly which table state survived

Set on `My Offers`: sort `name:ASC` · search `ski` · hide `Default` · show `Outer Id` · move `SKU#` before
`Created` · widen `Product name` (245 px → 1094 px).

| Property | Navigate away & back | Full reload (+ re-login) |
|----------|----------------------|--------------------------|
| Column **order** (`SKU#` before `Created`) | ✅ restored | ✅ restored |
| Column **visibility** (`Default` hidden, `Outer Id` shown) | ✅ restored | ✅ restored |
| Column **width** | ✅ restored (custom 923 px, not the 245 px default; not byte-identical — flex redistribution) | ✅ restored |
| **Sorting** | ❌ reset to default (first row `Dynastar SPEED 400 LTD`, not `103 Fast 016`) | ❌ reset |
| **Filter** / search | ❌ reset (299 items, not 37) | ❌ reset |

Sort + filter live in the URL query (`?offers_list_sort=name:ASC&offers_list_search=ski`) and the nav menu
link targets the bare route, dropping them. This is **plausibly by design** (deep-linkable URL state, distinct
from the `vc-data-table` persistence store that covers width/order/visibility) — flagged for dev confirmation
rather than filed as a defect. **BH-12 (debounce guard) passed:** a toggle immediately followed by navigation
was still persisted.

## Defect 1 (BH-03) — `vc-video` default sandbox breaks YouTube playback — HIGH

Product → Videos → Add video → YouTube URL → **Preview**: metadata resolves (oEmbed title/thumbnail render),
the `<iframe>` mounts and `GET /embed/aqz-KE-bpKQ?feature=oembed` returns **200**, but the player never
initialises — the Preview area stays a **black box** and the iframe's a11y tree is **empty**.

```
Uncaught SecurityError: Failed to read the 'caches' property from 'Window':
  Cache storage is disabled because the context is sandboxed and lacks the 'allow-same-origin' flag.
YouTube self-reported JS errors (error_204):  msg=Script error.&type=UnhandledWindowError
                                             msg=writeEmbed is not defined&type=UnhandledWindowReferenceError
```

Expected (BH-03): video plays, fullscreen works, **no sandbox errors**. Actual: sandbox error + no playback.
The sandbox attribute is missing `allow-same-origin` (and the player also needs its script/same-origin
context). Evidence: `screenshots/BH-03-video-sandboxed-iframe.png`, `evidence/net-video.txt`,
`evidence/console-video.txt`. Independently corroborated — a sibling agent's
`screenshots/BUG-vc-video-sandbox-blocks-youtube.png` reaches the same conclusion.

## Defect 2 (BH-04) — session invalidated mid-session: no sign-out, no toast, silently empty data — HIGH

While the SPA was running, the session became invalid. Five `/api/vcmp/*` calls returned **403** and
`POST /api/vcmp/quote/search` returned **302 → HTML** (producing
`SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`). The app **did not return to login,
showed no toast, and did not sign out** — the dashboard simply rendered "No products" / "No offers" / "No data",
i.e. a user would conclude their catalog is empty. Verified the session really was dead: a genuine full page
load redirected correctly to `#/login`, and a fresh sign-in immediately restored all data (465 products).

So the **bootstrap** path is fine; the **live-session** path is not. Likely cause: the interceptor handles
**401** only, while this platform answers an invalidated token with **403** / **302→HTML**, so neither the
sign-out nor the notification branch fires. Evidence: `screenshots/BH-05-403-toasts.png`,
`evidence/net-403-storm.txt`, `evidence/console-errors-after-home.txt`.
*Trigger caveat:* the invalidation may have been caused by another agent signing out the shared `admin`
account — that does not change the client-side handling under test.

## Defect 3 — API failures surface no user notification at all — MEDIUM

Across the run, **8 failing requests** (5×403, 3×500) produced framework logs
(`use-async`, `global-error-handler`, `useSelectDataSource`) but **zero** toasts. Notably
`POST /api/vcmp/seller/categories/search` → **500** leaves the **required** "Select category" field empty and
unpopulated on every product blade with no user-facing message (`screenshots/INC-02-categories-500-and-editor.png`).
This is the inverse of BH-05's duplicate-toast risk: the duplication guard holds, but errors are silent.
The 500 itself is a **backend** defect independent of this PR.

## Other incidental findings (all low severity, all out of scope)

1. `[tiptap warn]: Duplicate extension names found: ['link', 'underline']` — inside `vc-editor` (an area this
   PR touched). Editor works; warning only.
2. Editor **"Insert link" uses a native `window.prompt()`**, not a framework popup — unstyled and outside the
   a11y/focus model, notable in an accessibility-focused release.
3. Unsaved-product image previews request `…/assets/catalog/**undefined**/<file>_216x216.png` → 404; the local
   preview still renders.
4. "Video details" blade **discards unsaved changes without a confirmation**, whereas the product blade prompts
   "You have unsaved changes. Close anyway?" — inconsistent guard.
5. Image gallery popup's accessible name is just **"Close"** (dialog has no meaningful label).
6. Missing catalog assets 404 (`.../9105.jpg`) — test-data, not code.
7. `[@vc-shell/framework#ai-agent-context] Cannot set context data: no blade id available` logs repeatedly on
   dashboard/list mounts; appears benign (AI context still transferred correctly — BH-01).

## BH-02 note — confirmed as intended hardening, NOT filed as a defect

Per the plan's exit criteria: the explicit-origin requirement on the AI postMessage bridge is **expected,
secure-by-default behaviour**. This env has an origin configured, so the "context not transferred + dropped
origin logged" path could not be provoked without mutating shared config; it was instead confirmed from the
positive side (BH-01: with an explicit origin the bridge transfers context and returns replies, with **no**
origin warnings). **No defect filed for BH-02.**

## Teardown

No data written: product description edits **discarded** via the confirm dialog; the `AGENT-TEST-validation-probe`
draft product **never saved**; the previewed video **never saved** (product Videos still 0). `My Offers` column
visibility restored (`Default` shown, `Outer Id` + `Seller Name` hidden); residual `admin` preferences —
`SKU#`/`Created` order and the widened `Product name` width — left in place (cosmetic, per-user). Local upload
fixtures deleted.
