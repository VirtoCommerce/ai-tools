# Testing checklist — VCST-6214 vc-frontend-next: regression of the vc-frontend merges into the new theme (up to 2.59)

**Env:** vcst-qa (`TEST_ENV=vcst`, B2B-store) · storefront `{{FRONT_URL}}` serves **vc-frontend-next `3.0.0-alpha.2685`** (declared `vc-deploy-dev@vcst-qa theme/artifact.json` = deployed bundle, Paprika theme) · backend platform **3.1076.0**; 81/88 modules = the theme's `backend-packages.json`, **7 are newer PR builds from other tickets**: Return `3.1005.0-pr-28`, SalesRep `3.1013.0-pr-18`, XCart `3.1040.0-pr-149`, XOrder `3.1015.0-pr-55`, Quote `3.1004.0-pr-159`, PageBuilder `3.1034.0-pr-172`, FileExperienceApi `3.1007.0-pr-25` → a returns / sales-rep / cart / order failure must be checked against those before it is attributed to the theme.
**Scope:** vc-frontend-next PR #2 (merge of vc-frontend `dev` @ #2519 + VCST-5840 port) and PR #3 (vc-frontend 2.59 / backend 3.1076.0), both **merged**. The new theme itself was tested before — out of scope.
**Path:** routed `feature-test` FULL (≥2 domains) → **operator override FAST `--visual --coverage`** (2026-10-09). No Test Model, no new cases.
**Oracle:** `{SPEC}` = the ticket description + PR #2/#3 QA checklists · BL text cut per row (`bl:extract --id`) · `{OBSERVED}` for every UI string (a doc is authoritative for mechanism, not surface).
**Lanes:** 4a `qa-frontend-expert` / playwright-chrome · 4v `ui-ux-expert` / Chrome DevTools (minted account; `vs. DESIGN` SKIPPED — the ticket carries no Prototype link) · C1 after the 2a triage returns.
**Always-on:** console errors · network 4xx/5xx · GraphQL `errors[]` inside a 200 · error toasts — on every row, not only J1.

## A. Barcode lookup — vc-frontend#2501 (BL-SRCH-002, BL-SRCH-004, BL-SRCH-007)

| # | Condition | Lane | Verdict |
|---|---|---|---|
| A1 | A barcode matching **one** product opens that product's page | 4a | **PASS** — fields temporarily `["gtin"]` (restored, see Settings log); `@td(BARCODE_GTIN_UNIQUE.gtin)` → PDP of the unique product (`4a-A1-barcode-single-hit-pdp`) |
| A2 | A barcode matching **several** → list headed with the code; **no** facets, filters button, in-stock / branch controls; sorting control still present and reorders | 4a | **PASS** — "Your search for barcode … returned the following / 3 products found"; no sidebar/facets/filters/in-stock/branch; "Price, high to low" reordered C $13 > B $12 > A $11 (`4a-A2-barcode-multi-hit-list`) |
| A3 | An unknown code → "No products found for barcode `CODE`" empty state; reset returns to the catalog | 4a | **PASS** — heading as specified; reset → `/catalog`. Copy note → I10 (`4a-A3-barcode-unknown-empty`) |

## B. Missions banners — vc-frontend#2524 (signed in, loyalty on; BL-LOY-020)

| # | Condition | Lane | Verdict |
|---|---|---|---|
| B1 | Balance banner shows title + points; "Points history" opens the history | 4a | **PASS** — "Virto Rewards balance 19,902 points"; "Points history" → `/account/points-history`, "Balance: 19902" (`4a-B1-B2-missions-banners-light`) |
| B2 | Rewards banner shows "Rewards catalog" **only when** the loyalty catalog is available — state the availability observed, and the opposite state if reachable without a settings write | 4a | **PASS (one state)** — catalog available → "Redeem your points" banner + "Rewards catalog" → `/loyalty-catalog` (40 PTS products). Hidden state NOT REACHED (needs a settings write) |
| B3 | Both banners readable in light **and** dark (PR #2) — 4a, not 4v: role-gated, a minted account renders the empty state | 4a | **PASS (visual)** — readable in Light and Dark; ratios not computed (`4a-B3-missions-banners-dark`) |

## C. Language selector — vc-frontend#2513 / VCST-5840 ported to `header-preferences-menu` (BL-A11Y-002, BL-A11Y-004)

| # | Condition | Lane | Verdict |
|---|---|---|---|
| C1 | Desktop preferences menu: each language option has exactly one accessible name (decorative flag `aria-hidden`/empty alt; no duplicated text node) | 4v | **PASS** — 15 options, `<img alt="">` + one `<span>`, one a11y name each; `aria-current` on selected; Esc returns focus (`4v-C1-prefs-menu-desktop-light/dark`) |
| C2 | Mobile menu (375 px): same as C1 | 4v | **PASS** — 15 options, one name each, flags `alt=""`. Advisory: en-GB and en-US both named "English"; no `aria-current` on mobile (`4v-C2-mobile-language-list-375-dark`) |
| C3 | Switching language works from both menus (UI re-renders in the chosen language) | 4a | **PASS** — desktop "Deutsch (Deutschland)" → `/de/catalog`, UI German; 375 menu "English" → unprefixed URL, English (`4a-C3-*`) |
| C4 | Actual screen-reader output (NVDA/VoiceOver) — **MANUAL**, not concludable by this toolkit; C1/C2 are the structural proxy | — | **N/A — MANUAL**: real screen-reader output is not concludable by this toolkit; uncovered, listed in the report |

## D. Other merged features (PR #2)

| # | Condition | Lane | Verdict |
|---|---|---|---|
| D1 | Table row hover visible in light and dark and distinct from a selected row — **lists** table | 4v | **N/A — wrong surface (triage: TEST_STEPS_DEFECT, HIGH)**: `/account/lists` is `WishlistCard` cards and list details `WishlistLineItems` in **both** upstream and the fork (`pages/account/lists.vue:36`, `list-details.vue:86`) — never a `vc-table`; #2532 changed only `vc-table.vue`, `dark/organisms/vc-table.scss`, `modules/returns/*`. "lists" came from PR #2's own QA line. #2532's hover is verified on orders/quotes (D2) |
| D2 | Same as D1 on **orders** and **quotes** tables (needs a data-bearing account) — computed hover vs selected background, light + dark | 4a | **PASS** (hover visible; faint) — faintness is a **deliberate Paprika override** (`_paprika.scss:79-83` light → neutral-100, `:127-131` dark → neutral-200; merge-log decision), not a #2532 regression; design note for VCST-6030 · "distinct from selected" **N/A** — hover exists on both tables in both modes but is faint: light hover `#f1eae0` vs stripe `#f5f1ea` = 1.06:1 (stripes differ 1.11:1); dark `#2f2722` vs `#29201b` 1.09:1. Neither table has a selected-row state → "distinct from selected" not checkable (`4a-D2-*`) |
| D3 | Share a list, then stop sharing it, from the list card (vc-frontend#2476) | 4a | **PASS** — AGENT-TEST list shared "Anyone with link", link opened; "Private" → "Stop sharing this list?" → Private; old link 404 (`4a-D3-*`) |
| D4 | Order details shows "Request return"; the create-return flow completes (vc-frontend#2488; returns policy on) | 4a | **PASS** — `@td(RETURNS_ORDER_A_HAPPY)` "Request return" → wizard → CreateReturn → SubmitReturn = Requested; then cancelled, returnable qty back to 5. No `errors[]` (`4a-D4-*`) |
| D5 | OTP sign-in on `/sign-in` with the emailed code, code read from `/api/notifications/journal` (vc-frontend#2477) | 4a | **PASS** (re-run 13:52–13:55Z after the env fix; round-1 FAIL (env) = 405 from the storefront ingress, which had no `/api/otp` route — added to vcst-qa `infra/environments.yml` by DevOps). Continue → `POST {{FRONT_URL}}/api/otp/request` **200** `{succeeded:true, maskedEmail}` → "Check your email" step; `OtpSignInEmailNotification` journaled (Sent); 6th digit auto-submits `POST /connect/token` `grant_type=otp_email` **200** → signed in, `/account` reachable; no console errors, no 4xx/5xx, no GraphQL `errors[]` (except the J6 sign-out 404). Code input named "Code", focus moves to it. Minted account, 0 failed attempts (`4a-D5r-1…5`, HAR `evidence/D5r-otp-signin/`). Round-1 shot: `4a-D5-otp-request-405-error` |
| D6 | Secondary outline/ghost buttons: text readable (contrast ≥ 4.5:1) in light and dark (vc-frontend#2515; BL-A11Y-003) | 4v | **PASS** — `outline--secondary` 7.11 / hover 5.27 (light), 13.58 / 10.73 (dark); `ghost--neutral` ≥ 4.54. WARN: `outline--primary` hover light 4.49:1; advisory: `ghost--neutral` dark hover has no visible fill change (`4v-D6-*`) |
| D7 | `/oauth/authorize` while signed out asks to sign in (vc-frontend#2467) | 4a | **PASS** — → `/sign-in?returnUrl=/oauth/authorize`; after sign-in with no OAuth params a "We could not continue sign-in" page, no crash (`4a-D7-*`) |

## E. vc-frontend 2.59 (PR #3)

| # | Condition | Lane | Verdict |
|---|---|---|---|
| E1 | Signed in: catalog → cart → checkout → order placed — no GraphQL `errors[]`, no error toasts on backend 3.1076.0 (vc-frontend#2547; BL-GQL-001, BL-GQL-003, BL-CHK-002, BL-CHK-006) | 4a | **PASS** — order CO261009-00001: 25 + 150 shipping + 35 tax = $210, storefront = order detail = admin API; Place order disabled on first click, one order created. HAR 10:31–10:54Z: 364 GraphQL POSTs, 360 bodies, **0 `errors[]`**, no error toast. Incidentals J1, J2 (`4a-E1-*`) |
| E2 | Sales-rep dashboard: orders list and its filters load (SalesRep now a released build upstream — **PR build on this env**, see Env; BL-SR-011, BL-SR-012) | 4a | **PASS** — `/company/dashboard` stats, top sellers, recent orders; filters All / Cancelled (1) / New (5) / Payment required (1) / Processing (2) narrow correctly; zero-match empty state + Reset search (`4a-E2-salesrep-dashboard`) |
| E3 | `/forgot-password`: registered email → success message; the reset email is in the notification journal (`requestPasswordReset` query removed upstream) | 4a | **PASS** — `sendPasswordResetEmail` true, "We sent you a reset password link to your inbox"; journal ResetPasswordEmailNotification Sent 10:42:38Z (`4a-E3-forgot-password-success`) |
| E4 | App version reads the fork's own 3.0.0 track (`3.0.0-alpha.2685`), **not** upstream 2.60.0 | 4a | **PASS** — footer "Ver. 3.0.0-alpha.2685" (EN + DE) |

## F. Known differences — recorded, never filed

| # | Condition | Lane | Verdict |
|---|---|---|---|
| F1 | No ship-to selector in the new header (deferred) | 4a | **N/A — known difference (deferred)**: absent for an org buyer and a multi-org buyer; not filed |
| F2 | No organization switcher in the new header (deferred) | 4a | **N/A — known difference (deferred)**: multi-org account menu shows "John Doe / ACME Store" only; known, not filed (`4a-F2-multi-org-account-menu`) |

## G. Visual lane — design-system + a11y sweep over the touched surfaces (4v)

| # | Condition | Lane | Verdict |
|---|---|---|---|
| G1 | Catalog / barcode empty state, header + preferences menu, account lists: axe-clean (BL-A11Y-004), keyboard-operable (BL-A11Y-001), no layout shift / overflow (BL-UI-001, -003, -004) | 4v | **FAIL** — BL-UI-001: barcode empty state `/search?barcode=<unknown>` CLS **0.41** desktop (×2), **0.76** at 375, one late shift (footer 0→778 px); catalog 0.07, lists 0.02. No overflow; keyboard order logical. a11y findings → section I |
| G2 | Theme note: a11y conclusions are gated for Coffee + Red; **Paprika is a new theme** — state which theme was measured | 4v | **N/A — theme note**: Paprika light + dark; a11y conclusions indicative (theme not gated). `vs. DESIGN` SKIPPED (no Prototype link) |

## H. Existing corpus vs this change (Artifact A, phase 2a — `--coverage`)

| # | Condition | Owner | Verdict |
|---|---|---|---|
| H1 | Every `tc:scope` hit (145 rows / 54 suites, wave B) disposed CONFIRMED / REPAIR / RE-BASE / SUPERSEDED; REPAIR applied + re-linted | test-management-specialist | **PASS** — 145/145 disposed: 121 CONFIRMED · 2 REPAIR (SMK-001, MSNF-075; applied, `suites:review` 0 High+, `suites:lint` OK) · 1 RE-BASE (SR-HD-042) · 21 SUPERSEDED (proposals; 20 = deferred ship-to/org-switcher) |
| H2 | REPAIR + RE-BASE ids executed by C1 (`--no-promote`), or C1 SKIPPED with its reason | orchestrator | **N/A — C1 executed** as `REG-2026-10-09-1257` (1 PASS SR-HD-042 · 1 FAIL SMK-001 · 1 BLOCKED MSNF-075); its cases are triaged in run mode, not here |

## I. Visual-lane findings (4v) — triaged at 5-triage; BL-A11Y rows never block this functional ticket (triage §7a)

| # | Finding | Lane | Verdict |
|---|---|---|---|
| I1 | White text on primary `#e5451c` = 4.04:1 in light (solid-primary "Sign in", "Buy now", "Search"; header `.vc-badge__content`) — WCAG 1.4.3, BL-A11Y-003; dark 7.01 | 4v | **FAIL** (a11y) |
| I2 | Preferences menu group titles + currency names `#948f8a` on `#fff` = 3.2:1 (12 nodes, light); dark selected currency 3.35:1 — WCAG 1.4.3 | 4v | **FAIL** (a11y) |
| I3 | Mobile main menu (375) does not contain focus — Tab past "Settings" reaches "Reset filters" / footer behind the overlay — WCAG 2.4.3, BL-A11Y-001 | 4v | **FAIL** (a11y) |
| I4 | Mobile notifications bell button's accessible name is only the count ("1"); desktop "1 Alerts" — WCAG 4.1.2, BL-A11Y-002 | 4v | **FAIL** (a11y) |
| I5 | List-details quantity spinbutton exposed `invalid=true` on untouched render (`min=1 max=0`) — WCAG 4.1.2, BL-A11Y-004 (VCST-5912 pattern; maybe data-dependent) | 4v | **FAIL** (a11y) |
| I6 | Barcode empty-state hint `.category-products__empty-hint` 4.14:1 in dark — WCAG 1.4.3 | 4v | **FAIL** (a11y) |
| I7 | `aria-label` on generic `div.wishlist-card__date` (axe `aria-prohibited-attr`, incomplete) | 4v | **ADVISORY** — manual check |
| I8 | Home page `image-alt` critical ×9 (`.hero-section__art-img`, `.suppliers-section__logo`) — outside the merged surfaces | 4v | **FAIL** (a11y, out of scope) |
| I9 | BL-UI-006 gaps at 375: header targets 0–4 px apart, footer links 2 px apart (24 px minimum met) | 4v | **ADVISORY** — WARN (24 px minimum met, 8 px spacing not) |
| I10 | Barcode empty-state copy is filter-oriented ("Loosen one of them, or start over." + "Reset filters") on a page with no filters | 4v | **ADVISORY** — copy |

## J. Checklist-lane incidentals (4a) — triaged at 5-triage

| # | Finding | Lane | Verdict |
|---|---|---|---|
| J1 | `CreateOrderFromCart` took **11 952 ms** (HAR 10:49:34Z) — backend; XOrder/XCart are PR builds on this env; seen once | 4a | **FAIL** (perf, needs repro) |
| J2 | ~13 s after Place order `/checkout/completed` showed "Your cart is empty"; "Order completed" appeared ~9 s later — seen once | 4a | **FAIL** (needs repro) |
| J3 | `/de/catalog` sort buttons stay English ("Featured", "Price, low to high"); DE category menubar empty (likely menu data) | 4a | **FAIL** (l10n) |
| J4 | Checkout "Same as shipping address" checkbox named by raw key `billingAddressEqualsShipping` (identical upstream); order comment + return "What is wrong with it?" boxes unnamed; return reasons shown as raw keys (`NoLongerNeeded`) | 4a | **FAIL** (a11y/i18n, inherited) |
| J5 | Copy/UX nits: "1 selected · 1 items"; New List dialog shows "This field is required" before input; order rows `role=button` wrapping cells, quote rows not interactive in a11y tree | 4a | **FAIL** (low, copy/a11y) |
| J6 | Console: sign-out requests `/firebase-messaging-sw.js` → 404 (seen Oct 8 too); logout throws uncaught `ApolloError: Anonymous access denied`; Apollo warning 43 on GetReturns / GetReturnableItems; "Download the Apollo DevTools" in a deployed build | 4a | **FAIL** (low, console) |
| J7 | `/account/missions`, `/account/points-history`, `/company/dashboard`, `/company/my-customers`, `/oauth/authorize` keep title "Virto Commerce" (kb KB-52188DBA for sales-rep) | 4a | **FAIL** (low, page titles) |

**Settings log (B2B-store, admin API, operator-approved):** barcode fields `[]` → `["gtin"]` 10:31:08Z → restored `{scannerEnabled:true, fields:[]}` 10:32:24Z, re-read exact. `OtpSignIn.Enabled` not stored (default false) → true 10:43:20Z → **stored `false`** 10:45:32Z (null restore ignored by the platform; effective state identical, row now explicit). **D5 re-run:** found stored `true` at 13:52:16Z (changed by someone outside this run between 10:45Z and 13:52Z — not by this session) → no enable write → set `false` 13:55:29Z, re-read `false` 13:55:30Z → operator decision: restore the value found → `true` 14:05:02Z, re-read `true`. **Created:** AGENT-TEST list (deleted) · return RET261009-00001 (cancelled) · order CO261009-00001 (kept as E1 record) · 1 reset + 1 OTP notification · 4v minted account `AGENT-TEST-…-v6214b@qa.test` (lists deleted; account left for teardown sweep).

Not covered by this run: the new theme's own surfaces outside the merged changes · durable regression cases for these features on vc-frontend-next (route back: `/qa-test-lifecycle`) · release recommendation (`feature_release_gate: not-assessed`).
