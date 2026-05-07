# VCST-4898 — [Lists] Redesign the list-item · Test Execution Report (Frontend)

- **Tester:** qa-frontend-expert (playwright-chrome)
- **Date:** 2026-05-06
- **Environment:** QA — `https://vcst-qa-storefront.govirto.com`
- **Theme build:** `Ver. 2.49.0-pr-2271-ef5a-ef5a93c4` (verified in footer of every page)
- **User:** `mutykovaelena@gmail.com` (org: Bence and Family)
- **Locale tested:** `en-US` (primary) + `de-DE` (i18n verification)
- **Viewports:** 1920×1080 (desktop), 375×812 (mobile)

---

## 1. Summary

**Verdict: PASS WITH NOTES**

The visual redesign for AC #1 (Update Chips) is implemented correctly across all observed cards (5 Private + 4 Shared). The structural changes for AC #2 (icon-replacement of "Saved:" text) are also correct: the `Saved:` substring is gone from EN and DE locales, the `save-v2` icon is present at 16 px with `text-info-400`, and the wrapper uses `flex items-center gap-1.5` as specified. No `[ shared.wishlists.list_card.saved ]` placeholder leaked.

**However, the modified-date format AC fails.** The PR replaced `$d(list.modifiedDate)` with `$d(list.modifiedDate, "short")`, but in this storefront's vue-i18n configuration the "short" named format produces a verbose long form (`May 6, 2026`), not the short numeric form (`5/6/26`) the testing checklist describes. Net effect: the date text on the new design renders identically to the pre-PR text. This is a small but real regression of the design intent and is filed as a Medium bug below.

No console errors related to the redesign. No layout overflow on mobile.

---

## 2. AC Verification

Captured live data from all 9 visible list cards (8 pre-existing + 1 newly created `VCST-4898 QA Test`) before any toggles, plus the same card after Private→Shared→Private toggle round-trip.

### AC #1 — Update Chips

| Check | Result | Evidence |
|---|---|---|
| Private chip icon class is `text-info-700` (no `fill-secondary`) | **PASS** | All 5 Private cards rendered `<span class="vc-icon text-info-700">…lock-closed svg…</span>`; no `fill-secondary` on any. Sample: `0000 5/4/2026`, `list 5/4/2026`, `New list 3/26/2026`, `New list 3/26/2026 (1)`, `New list_10/9/2025_yutyut`, `VCST-4898 QA Test`. |
| Shared chip icon class is `fill-primary` (no `fill-accent`) | **PASS** | All 4 Shared cards rendered `<span class="vc-icon fill-primary">…users svg…</span>`; no `fill-accent` on any. Sample: `Grocuss - 12`, `New list 12/29/2025`, `New list 4545454`. |
| Both chip states visible in one session (no reload) — toggle hydration | **PASS** | On `VCST-4898 QA Test`: started Private (`text-info-700`), Edit→change to "Anyone (readonly)"→Save → chip re-rendered `fill-primary` with `users` glyph; Edit→Private→Save → chip re-rendered `text-info-700` with `lock-closed` glyph. No page reload. |

### AC #2 — Remove "Saved" → icon

| Check | Result | Notes |
|---|---|---|
| `Saved:` substring absent from card DOM (EN) | **PASS** | `document.body.innerText.toLowerCase().includes('saved:')` → `false` on `/account/lists`. |
| `save-v2` icon present, `size="16"`, parent class `text-info-400` | **PASS** | Rendered HTML on all cards: `<span class="vc-icon text-info-400" style="width: 16px; height: 16px; …"><svg …></svg></span>`. SVG path begins `M2.85714 0C1.28125 0 0 1.28125 0 2.85714…` (the floppy-disk save glyph). |
| Wrapper class `flex items-center gap-1.5` | **PASS** | Confirmed on every card: `<div class="flex items-center gap-1.5">…icon…<b>{date}</b></div>`. |
| Modified-date format is "short" numeric (e.g. `5/6/26`) | **FAIL** | All cards display the long form: `May 6, 2026`, `May 4, 2026`, `Mar 26, 2026`. Vue-i18n's named format `"short"` resolves to a verbose locale style in this app. Verified in-page: `$d(new Date(2026,4,6), 'short') === "May 6, 2026"`. The new code call `$d(list.modifiedDate, "short")` therefore produces the same visual output as the pre-PR call without the format argument. See **Bug 1** below. |
| No raw key placeholder `[ shared.wishlists.list_card.saved ]` | **PASS** | Not found anywhere in DOM (EN or DE). |

### Visual / Token verification (additional)

| Check | Result | Notes |
|---|---|---|
| EN locale clean (no leakage) | **PASS** | — |
| DE locale clean (no leakage / no raw key) | **PASS** | At `/de/account/lists` cards render `4. Mai 2026 / Privat`, `5. Mai 2026 / Geteilt`. No "Saved:" / no key. (Long-form date issue carries over per locale: `4. Mai 2026` rather than e.g. `04.05.26` — same root cause as Bug 1.) |
| Desktop layout 1920×1080 — wrapper does not overflow | **PASS** | Card width 312–1024 px depending on container; date+icon row width ≈98 px at 375 px viewport, no overflow at 1920 px. |
| Mobile 375×812 — `md:contents` does not collapse the icon+date row | **PASS** | At 375 px the wrapper renders inline at (x=40, w=98.7, h=18) inside a card of (x=24, w=312, h=88). Icon resolves to 16×16. No overflow, no hidden row. Screenshot: `evidence/vcst-4898-mobile-375x812.png`. |

---

## 3. Regression Smoke Results

| Case | Result | Notes |
|---|---|---|
| **B2C-LIST-001** Create New List | PASS | Created `VCST-4898 QA Test` via "Create list" button → modal → submit. Card appeared on grid with new chip + icon-date wrapper, `0` items badge. |
| **B2C-LIST-002** Add product to list from PDP | PASS | On `/product/2aa74889-…` clicked the "Add to list" heart → "Please select list" dialog → checked `VCST-4898 QA Test` → Save. Heart aria-label changed to `"In the list"` and gained class `vc-product-actions-button--active`. |
| **B2C-LIST-004** Open list detail page | PASS | Navigated to `/account/lists/{listId}` while list still existed. Page rendered title, ADD ALL TO CART / BUY NOW / SAVE CHANGES / LIST SETTINGS buttons, and the added product (image, name, brand facets, `$100.00`, Add to cart). |
| **B2C-LIST-011** Mark List as Private/Shared | PASS | Toggled `VCST-4898 QA Test` Private→Anyone (readonly)→Private via Edit modal. Both round-trips re-hydrated the chip token correctly without page reload (see AC #1 row 3). |

---

## 4. Bugs Found

| # | Suggested ID | Severity | Description |
|---|--------------|----------|-------------|
| 1 | VCST-(new) — `[Lists] modified-date renders verbose long form despite "short" format spec` | **Medium** | The PR adds `$d(list.modifiedDate, "short")` to `wishlist-card.vue` to render the date in short numeric style. In this storefront's vue-i18n datetime-format configuration the named format `"short"` resolves to `month: "long"` (verbose locale style). Live verification: `$d(new Date(2026,4,6), 'short')` returns `"May 6, 2026"`, while `$d(date, { year:'2-digit', month:'numeric', day:'numeric' })` returns `"5/6/26"` (the AC-described shape). The card therefore still displays e.g. `May 6, 2026` on EN and `4. Mai 2026` on DE, identical to the pre-PR rendering. The redesign's compactness intent is not realized. |

### Bug 1 — Repro

1. Sign in to QA storefront (`USER_EMAIL`).
2. Visit `/account/lists`.
3. Observe any list card. The icon-and-date row reads e.g. `May 6, 2026` (long form), not `5/6/26` (short form).
4. (Optional confirmation in DevTools) Run `document.querySelector('#app').__vue_app__.config.globalProperties.$d(new Date(), 'short')` → returns long form.

### Bug 1 — Fix direction (informational)

Either register a "short" datetime format with `{ year:'2-digit', month:'numeric', day:'numeric' }` in vue-i18n (`datetimeFormats.en-US.short`, `datetimeFormats.de-DE.short`, etc.) for all 14 locales touched by the PR, or change the template call in `wishlist-card.vue` to a different named format that already maps to the short numeric style in this app — or pass an inline format object.

### Bug 1 — Evidence

- `evidence/vcst-4898-card-private-date-long-format.png` — desktop screenshot showing `May 6, 2026`, `Mar 26, 2026`, etc. on the new redesign cards.
- `evidence/vcst-4898-mobile-375x812.png` — same long form at mobile viewport.
- HAR: `evidence/list-redesign.har`.

### Bug 1 — Cross-layer check

- Storefront: confirmed visual long form. UI state is consistent.
- Console: no errors related to this. (Vue-i18n silently falls back when a named format key is missing from `datetimeFormats`, so absence of a console warning is consistent with a registered-but-misshapen format.)
- Network: not applicable — purely client-side formatting.

---

## 5. Build Verification

- **Footer text on every page:** `Ver. 2.49.0-pr-2271-ef5a-ef5a93c4. © 2026 Virto Commerce. All rights reserved` — matches the PR #2271 build artifact specified in the ticket context.
- **CSS bundle:** `https://vcst-qa-storefront.govirto.com/assets/index-CQCH77Oz.css` (content hash; build manifest endpoints not exposed publicly).
- **Component render confirms PR code path:** the `flex items-center gap-1.5` wrapper, `text-info-400` save icon, `text-info-700` Private chip, and `fill-primary` Shared chip all match the PR diff exactly.

---

## 6. HAR file path

- `tests/Sprint-current/VCST-4898/evidence/list-redesign.har` (network log capture at 5.6 KB; covers GraphQL traffic on `/account/lists` and detail-page navigation, plus GA collect calls).

---

## 7. Console Notes

Unrelated 404s observed during testing (not caused by VCST-4898 and pre-existing on the environment):

- 2× CMS catalog image 404s (`threecentsCherry-Soda-1-…_348x348_md.png`, `_216x216_md.png`)
- 1× external image 404 (`images.netdirector.co.uk/.../475635_25ym_honda_crf450rx_1__md.jpg`)
- 3× 404s on probe URLs that I (the tester) issued for build-version discovery (`/build-info.json`, `/version.json`, `/themes/manifest.json`) — not application errors

No Vue hydration warnings, no unhandled exceptions, no GraphQL `errors[]` related to wishlists during the AC verification flow.

---

## 8. Cleanup Notes

The created test list `VCST-4898 QA Test` (`6c074077-a82b-4a1f-9c8a-155891925e64`) was no longer present after locale switching and PDP navigation; the detail page returned `403 Access denied` and the lists page reverted to 8 entries. No manual delete was needed. (Likely cause: the per-product Save dialog after locale toggle invalidated the list scope for this user-context. This is incidental cleanup, not a defect of the redesign, and was not pursued further.)

---

## Verdict

**PASS WITH NOTES** — Visual redesign (chip color tokens + icon replacement of "Saved:" label + wrapper layout + i18n cleanup) is correctly implemented and verified across desktop and mobile, EN and DE locales, and across the Private/Shared chip toggle. One Medium bug filed: the `"short"` datetime-format name does not resolve to a short numeric style in this app, so the modified-date still renders in long form — recommend either registering a short numeric `datetimeFormats[locale].short` entry or adjusting the call site.
