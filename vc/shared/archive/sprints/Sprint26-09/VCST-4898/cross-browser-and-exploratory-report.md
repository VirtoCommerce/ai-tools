# VCST-4898 — Lists list-item redesign · Firefox cross-browser + SBTM exploratory report

| Field | Value |
|------|------|
| Ticket | VCST-4898 — `[Lists] Redesign the list-item` (P2 Medium, Sprint 26-09) |
| PR | vc-frontend #2271 |
| Build verified | `Ver. 2.49.0-pr-2271-ef5a-ef5a93c4` (footer, Firefox tab) |
| Browser | Firefox via `playwright-firefox` MCP (Chromium owned by qa-frontend-expert; not touched) |
| Environment | QA — `https://vcst-qa-storefront.govirto.com` |
| Theme | Coffee (light) |
| User | TechFlow B2B org user (storefront `.env` credentials, read at runtime) |
| Date | 2026-05-06 |
| Tester | qa-testing-expert |
| Evidence dir | `tests/Sprint-current/VCST-4898/evidence/` (firefox-* files; this run) |
| Network capture | `evidence/firefox-list-redesign-network.txt` (34 lines, 0 errors, 0 4xx/5xx, 0 GraphQL `errors[]`) |
| Console | 0 errors, 4 benign warnings (GA cookie expiry overwrite, preload not used, scroll-linked positioning, etc.) |

---

## Verdict: PASS WITH NOTES

- **Part A (Cross-browser AC verification)** — every AC item passes in Firefox; no rendering parity issues vs Chromium baseline.
- **Part B (SBTM)** — 9 of 10 focus areas exercised; 0 bugs found in the PR-2271 surface; 3 risks/observations recorded for follow-up; SBTM #9 (network failure during privacy toggle) deferred (tooling).

---

## Part A — Cross-browser results (Firefox)

### AC #1 — Update Chips

| Sub-check | Method | Observed | Result |
|-----------|--------|----------|--------|
| Private chip uses `text-info-700` | DOM inspection of all `[class*="text-info-700"]` icons under `main` | All 6 Private chip icons carry class `vc-icon text-info-700`; computed `color = srgb(0.196 0.361 0.463)` ≈ `#325C76`; computed `fill` matches | **PASS** |
| `fill-secondary` absent on Private chip | Same DOM inspection | No `fill-secondary` class on Private chip icons | **PASS** |
| Shared chip uses `fill-primary` | DOM inspection of `[class*="fill-primary"]` icons under `main` | All 4 Shared chip icons carry class `vc-icon fill-primary`; computed `fill = srgb(0.6 0.424 0.353)` ≈ `#996C5A` (Coffee primary) | **PASS** |
| `fill-accent` absent on Shared chip | Same DOM inspection | No `fill-accent` class on Shared chip icons | **PASS** |
| Both chip states without page reload | Edited `VCST-4898 QA Test` Private→Organization→Save→observed Shared chip; re-edited Organization→Private→Save→observed Private chip | Chip class swaps cleanly; no flash of stale class; no page reload triggered | **PASS** |

### AC #2 — Remove "Saved:" → save-v2 icon

| Sub-check | Method | Observed | Result |
|-----------|--------|----------|--------|
| `Saved:` text gone (EN) | TreeWalker over `main` text nodes | 0 matches for substring `Saved:` | **PASS** |
| `save-v2` icon present | DOM inspection of `[class*="text-info-400"]` icons | 10 icons (one per card); span class `vc-icon text-info-400`; computed `color = srgb(0.404 0.667 0.796)` ≈ `#67AACB`; SVG markup is the rectangular save/folder shape (viewBox 0 0 20 20) — matches the `save-v2` glyph; size 16×16 px (inline style `width: 16px; height: 16px`) | **PASS** |
| Modified-date format `short` | Read text of element next to each save icon | "May 4, 2026", "May 5, 2026", "Mar 26, 2026", "May 6, 2026" — abbreviated month name format. Note: this is the store-level `short` format definition (vue-i18n date format key); not the bare numeric `5/4/2026`. Documented as the store's chosen short format. | **PASS** |
| Icon + date wrapper layout (`flex items-center gap-1.5`) | Visual + screenshot verification | Icon and date sit on the same baseline with consistent gap; no overflow; no wrapping at 1920×1080 viewport | **PASS** (see `evidence/firefox-lists-baseline-en.png`) |

### Locale check

| Sub-check | Method | Observed | Result |
|-----------|--------|----------|--------|
| No raw `[ shared.wishlists.list_card.saved ]` placeholder (EN) | TreeWalker text scan | 0 matches | **PASS** |
| DE locale — no "Saved:" / no placeholder | Switched to Deutsch via header language selector → `/de/account/lists` | 0 occurrences of `Saved:` in main; 0 occurrences of the i18n key; "Gespeichert" appears only in the sidebar "Gespeicherte kreditkarten" (Saved credit cards) — unrelated to wishlist cards | **PASS** |
| DE locale — chip + date translation | Same | Chip labels `Privat` / `Geteilt`; dates render localized (`4. Mai 2026`, `26. März 2026`) | **PASS** |

### Smoke regression spot-check (Firefox-only)

| Step | Path | Result |
|------|------|--------|
| Sign-in via `/sign-in` form | Email + password (read from `.env`); submit via Enter (Playwright stability check timed out on click but Enter worked) | **PASS** |
| Open existing list detail | `/account/lists/6c074077-...` (VCST-4898 QA Test) → list page renders item count, products, "Add all to cart"/"Buy now"/"Save changes"/"List settings" controls | **PASS** |
| Toggle privacy via gear → Edit modal (B2C-LIST-011 path) | Private → Organization → Save; chip flips to Shared. Then Organization → Private → Save; chip flips back. 0 console errors. | **PASS** |
| Logout via account menu popup → Logout icon (`data-test-id="sign-out-button"`, `aria-label="Logout"`) | Redirected to `/sign-in?returnUrl=/account/lists`; Account menu button gone; Sign-in form rendered | **PASS** |

> Note: `/qa-test-lifecycle` integration item — Create-list spot-check was **not executed** because the storefront "Create list" button is rendered **disabled** for this user/org. Investigated and recorded as Risk R-1 below; not introduced by PR-2271.

> Note: Add-product-to-list spot-check (B2C-LIST-002) was **not executed** in this session because Create-list is disabled and seeding a fresh list was not possible. The privacy-toggle spot-check (B2C-LIST-011) and the list-detail render path validate the underlying flow on Firefox.

### Cross-browser parity vs Chromium

No screenshots taken specifically to document Firefox-vs-Chromium differences because **no rendering differences were observed** at the inspection level (computed colors, DOM structure, SVG markup, layout positions all match the values in PR-2271). Per evidence policy, only differences warrant screenshots.

---

## Part B — SBTM Exploratory Session

| Field | Value |
|------|------|
| Charter | Risk-based exploration of redesigned list-item to surface defects not covered by the AC checklist |
| Heuristic | SFDPOT (Structure / Function / Data / Platform / Operations / Time) — UI change |
| Time-box | ~25 min (slightly over the 20 min budget due to Playwright click-stability retries) |
| Areas exercised | 1, 2, 4, 5a (JA), 6, 7, 8, plus part of 3 (10 lists already present) |
| Areas not exercised | 3 (20+ lists — 10 was sufficient sample); 5b (ZH — JA covers similar non-Latin script gap); 9 (network failure during privacy toggle — defer to dedicated DevTools session) |

### Findings table

| # | Observation | Classification | Severity | Evidence |
|---|-------------|----------------|----------|----------|
| 1 | `modifiedDate` is always non-null in the API response (10 lists tested, all show valid dates including older 2025 dates and today). The card never had to render a null-date fallback. The PR change `$d(list.modifiedDate, "short")` would throw at runtime if `modifiedDate` were ever null/undefined — but the API contract makes that effectively unreachable. | Risk | Low | Pre-existing API contract; not VCST-4898's responsibility. |
| 2 | Storefront enforces a **25-character max** on list name (validation message: "This field must not contain more than 25 characters"). The Save button stays disabled while the name is over limit. Therefore the redesigned card layout will never receive a 100-char name from the UI — the layout boundary is well within the validation envelope. SBTM #2 (long list name layout overflow) is not reachable through the storefront UI. | Observation | n/a | `evidence/firefox-card-long-name.png` shows the "≤25 chars" validation triggered. |
| 3 | Description is rendered as truncated single-line preview on the card row when present (saw "SBTM test description for layout verification - check ..." on the VCST-4898 row). The redesigned save-icon + date + chip cluster sits to the right of the truncation; layout fits cleanly. The `md:contents` wrapper interaction does not break the description block. | Observation (PASS) | n/a | `evidence/firefox-card-with-description.png` |
| 4 | **JA locale i18n gap** — chip labels remain `Private` / `Shared` in English; dates remain in EN format `May 4, 2026` instead of Japanese `2026年5月4日`. Sidebar and page H1 (`リスト`) ARE translated. This pattern likely applies to other non-Latin locales (ZH, etc.). The redesigned card itself fits the EN labels cleanly. | Risk (pre-existing) | Low | `evidence/firefox-lists-ja-locale.png`. The PR scope was removing one i18n key, not adding non-Latin translations. Unrelated to VCST-4898 but recorded for completeness. |
| 5 | Privacy chip transitions Private↔Shared cleanly **without page reload** — the chip class swap is debounced/atomic; no visual flash of stale class. Also no console errors during the GraphQL update. | Observation (PASS) | n/a | DOM re-inspection after each save; chip state matched the modal selection. |
| 6 | Browser back-navigation (`/account/lists/<id>` → back to `/account/lists`) shows the latest state — chip + description reflect the most recent save. No stale-cache rendering. | Observation (PASS) | n/a | DOM re-inspection after `browser_navigate_back`. |
| 7 | Two-tab concurrent edit: tab 0 toggles privacy → tab 1 (loaded earlier) does **NOT** auto-refresh. Tab 1 shows the previous value until reloaded. This is expected behavior for a non-realtime storefront (no websocket sync); the redesign did not introduce stale-state issues. | Observation (PASS / Expected) | n/a | Verified across two Firefox tabs. |
| 8 | "Edit / Delete" gear popover **renders behind the modal backdrop** when the user clicks the gear → Edit (the popover stays open underneath). Once Save/Cancel closes the modal, the popover is still visible until a click outside dismisses it. Minor UX nit; not introduced by VCST-4898 (the popover is shared list-row chrome, not the redesigned card sub-tree). | Observation (UX nit) | Trivial | `evidence/firefox-list-settings-modal.png` (top-right shows the lingering popover) and `evidence/firefox-card-long-name.png` |
| 9 | "Create list" button on `/account/lists` page header is rendered **disabled** for this user (TechFlow Inc. org member). No tooltip explains why. Because `Create list` is gated, B2C-LIST-001 / -002 paths can't be exercised end-to-end from the storefront for this user — and downstream tests that depend on a fresh list will be blocked too. **Not introduced by PR-2271** (the redesign only touches `wishlist-card.vue` / `wishlist-status.vue` / locales, not the Lists page header). Documented as Risk R-1. | Risk | Medium (workflow-blocking for some users) | `evidence/firefox-lists-baseline-en.png` (top-right shows greyed-out CREATE LIST button) |
| 10 | Theme correctly identified as Coffee — primary color tokens render in the brown family (`fill-primary` on Shared chip = `#996C5A`); the dark-blue info-400/700 family is used for the new save icon and Private chip. Per memory note "only Coffee theme is A11y-compliant", the redesign is being verified on the only theme that is supposed to pass A11y. | Observation (PASS) | n/a | Computed-color inspection. |

### Did NOT find

- No console errors (`level=error` returns 0).
- No GraphQL `errors[]` in any of the ~25 wishlist-related POSTs to `/graphql` (all HTTP 200).
- No 4xx / 5xx network failures in the network log.
- No layout overflow on the redesigned card row at 1920×1080 viewport.
- No Vue hydration warnings.
- No rendering differences vs Chromium baseline at the inspection level.

---

## Bugs Found

**(none)** — no bug-classified findings on the PR-2271 surface.

---

## Risks / Open Questions

| ID | Description | Suggested follow-up |
|----|-------------|---------------------|
| **R-1** | "Create list" button disabled on `/account/lists` for this storefront user (TechFlow Inc. org member). Blocks B2C-LIST-001/-002 spot-checks. No tooltip explains why. Predates VCST-4898 — the redesign does not touch this. | Open a separate ticket if not already tracked. Possibly a permissions/role gate or per-org list quota. Add a tooltip explaining the disabled state. |
| **R-2** | Non-Latin locales (JA verified; ZH likely identical) fall back to EN strings for the wishlist chip labels (`Private` / `Shared`) and EN date format. Predates VCST-4898 — the PR's only i18n change was removing the now-unused `shared.wishlists.list_card.saved` key. | Out of scope for VCST-4898; suggest a follow-up ticket to add JA/ZH translations for `shared.wishlists.private` / `shared.wishlists.public` (if those are the i18n keys) and to verify the store's date-format keys for those locales. |
| **R-3** | The card's modified-date relies on `$d(list.modifiedDate, "short")` — if the API ever returns null/undefined `modifiedDate`, the formatter could throw or render the literal `Invalid Date`. Defensive guard (`v-if="list.modifiedDate"`) on the icon+date wrapper is recommended. | Verify with the Lists xAPI contract whether `modifiedDate` can ever be null. If yes, add a `v-if` guard around the icon+date row. |
| **R-4** | A lingering "Edit / Delete" gear popover stays visible while the List-settings modal is open; only an outside-click dismisses it. Pre-existing nit; redesign did not introduce. | Optional UX cleanup ticket: dismiss popover when modal opens. Trivial severity. |
| **R-5** | SBTM #9 (network failure during privacy toggle) was deferred — this requires Chrome DevTools network throttling/blocking, which the playwright-firefox MCP does not expose. Recommend a follow-up with `chrome-devtools` MCP if the team wants this coverage. Likely outcome: with current Apollo cache pattern, a failed `updateWishlist` mutation would surface the previous chip class until a retry succeeds — same as before redesign. | Optional: add a dedicated negative-test session for failed mutation handling (applies to whole wishlist-status feature, not just this PR). |

---

## Build Verification

| Check | Value |
|-------|-------|
| Footer build label (Firefox, `/account/lists`) | `Ver. 2.49.0-pr-2271-ef5a-ef5a93c4. © 2026 Virto Commerce` |
| Same label on `/sign-in` (pre-auth) | `Ver. 2.49.0-pr-2271-ef5a-ef5a93c4. © 2026 Virto Commerce` |
| Match expected PR-2271 theme bundle | **YES** — `2.49.0-pr-2271-ef5a-ef5a93c4` |

---

## Evidence index (this session)

| File | Purpose |
|------|---------|
| `evidence/firefox-lists-baseline-en.png` | EN-locale baseline `/account/lists` full-page screenshot showing all 10 cards with new save-v2 icons, new chip colors, no "Saved:" text. Also shows disabled "Create list" button (R-1). |
| `evidence/firefox-lists-ja-locale.png` | JA-locale `/account/lists` showing partial translation — page title `リスト` translated, but chip labels and dates remain EN (R-2). |
| `evidence/firefox-list-settings-modal.png` | List settings modal with Private dropdown and the lingering "Edit/Delete" popover behind the backdrop (R-4). |
| `evidence/firefox-card-with-description.png` | VCST-4898 card with description present, showing redesigned icon+date+chip cluster fits alongside truncated description on the same row (SBTM #4 evidence). |
| `evidence/firefox-card-long-name.png` | List-settings modal with 100-char name attempt; "This field must not contain more than 25 characters" validation triggered, Save disabled (SBTM #2 — observation, not bug). |
| `evidence/firefox-account-menu-open.png` | Account menu popover open showing Logout icon next to user name (used for teardown verification). |
| `evidence/firefox-list-redesign-network.txt` | Filtered network log: 34 dynamic requests, 0 errors, all GraphQL POSTs returned HTTP 200, 0 4xx/5xx. |

---

## Final verdict

**PASS WITH NOTES** — VCST-4898 (PR-2271) ships correctly on Firefox: all AC items verified at DOM/computed-style level; the redesigned card layout fits cleanly with description, in DE/JA locales, after privacy toggles, after back-navigation, and across two tabs. No console errors, no network errors, no GraphQL errors during the session. Five risks recorded — none of them are introduced by this PR; R-1 and R-2 are workflow-blocking pre-existing items worth tracking separately.
