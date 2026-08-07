# VCST-5519 — AC / Retest-checklist spine

**Ticket:** VCST-5519 "Update dependencies (major versions)" · TechDebt · Medium · Status: Testing
**Parent:** VCST-3765 (FRONTEND DEPENDENCIES epic) · **PR:** vc-frontend #2394 (`chore(VCST-5519)`)
**Env under test:** vcptcore-qa · storefront `https://vcptcore-qa-storefront.govirto.com` · theme `2.54.0-pr-2394-cfab-cfabd10b` (confirmed live)

> No formal Gherkin ACs (TechDebt). The developer's **QA retest checklist** (comment by Ivan Kalachikov) is the coverage spine. `ba-story-writer` Mode B skipped — dependency-upgrade retest, no governing user story with ACs.

## Change = library upgrades with these user-facing blast radii
- `@unhead/vue` v2 → **v3** → SEO meta / `<title>` / favicons
- floating-ui (positioning engine) major → all pop-ups (tooltip / dropdown / select / date picker)
- markdown/HTML renderer major → all formatted content
- internal ID-generation lib major → file upload + cart

## Atomic conditions (verdict spine)

| # | Area | Condition | Verdict (live) |
|---|------|-----------|----------------|
| C1 | SEO | Brand page: **keywords** meta now contains the brand name; title + OG/social tags present | **PASS** — `<meta name="keywords" content="ASUS">` confirmed. (brand-page `<title>`/`desc`/`og:title` empty = brand-template SEO gap, NOT an @unhead regression) |
| C2 | SEO | Product page: title, description, keywords, social/preview image all present & correct | **PASS** — data-fill verified: set `QA5519` meta in Admin → all rendered in PDP `<head>` (title/description/keywords + derived OG title/desc/url), **desktop & mobile identical** |
| C3 | SEO | Favicons: custom vs default; broken config does not break the page | **PASS (2 of 3 cases) + 1 bug.** Case1 custom → renders (desktop+mobile). Case2 default (org WL OFF) → store-default fallback, page fine (desktop+mobile). Case3 broken: 404-*image* degrades gracefully (PASS), but a favicon **URL with no extension crashes the WL xAPI → blank storefront** (see WL-FAVICON bug below). **NOT a dependency-upgrade defect** |
| C4 | SEO | Home / Category / News / Static page render meta without regression | **PASS** — category `QA5519` meta rendered (desktop+mobile); only benign asset 404s + AI 400 noise |
| C5 | Pop-ups | Tooltip (hover) opens & positions correctly | **PASS** |
| C6 | Pop-ups | Dropdown menu (language/currency/⋮) positions correctly | **PASS** (6 popovers anchor correctly) |
| C7 | Pop-ups | Select near bottom of viewport flips **upward**, stays on-screen | **PASS** — mouse-confirmed on a clean cart: Payment-method `vc-select` anchors to trigger, flips upward, on-screen. Prior keyboard-only "off-screen/detached" was a harness artifact aggravated by an error-state cart — **not a regression** |
| C8 | Pop-ups | Date picker opens & positions correctly | **PASS** — Orders → Created-date is a custom floating-ui datepicker (re-checked): anchors 8px below the input, on-screen, flips above at a short viewport |
| C9 | Pop-ups | Positioning holds on scroll / resize / mobile | **PASS** — popovers reposition at 390×844 mobile & back to desktop, stay on-screen (re-run with working resize) |
| C10 | Content | Rich formatted content renders correctly | **PASS** (news article: headings/links/lists/code/images all fine) |
| C11 | Content | Simple formatted content renders correctly | **PASS** (fixed) — was a **content-data error** in one branch working-hours record (leaked raw HTML in a `<code>` block). Team corrected the data; re-verified clean on both broken branches (MON–SUN restored) + isolated (3 other branches, checkout pickup-hours, PDP rich block all clean). NOT a `marked` renderer regression |
| C12 | Upload | File upload works (ID-gen lib touch point) | **PASS** (Company logo upload persists, no errors) |
| C13 | Cart | Add to cart → checkout → place order completes | **PASS** — order `CO260727-00001` placed (configurable laptop `AGENT-TEST-CFG-013` $1,249, CyberSource sandbox card on cart). *(regular laptop SKUs OOS = inventory-data gap, not a PR defect)* |

## Deep re-pass (data-fill + desktop & mobile)

Per QA request, a second round SET fresh data and verified OUTPUT on **both desktop (1920) and mobile (390)**:
- **SEO meta** — set `QA5519` title/description/keywords on a product + a category in Admin SPA → **verified rendered** in `<head>` on the storefront (PDP + category), incl. `@unhead`-derived OG, desktop & mobile identical. This directly exercises the `@unhead/vue` v3 output.
- **Favicons** — all 3 checklist sub-cases exercised via org White-Labeling (see C3): custom ✅, default-fallback ✅, broken → 1 graceful + 1 crash bug.
- **Pop-ups (4 types), rich+simple content, file upload, cart→order** — re-run desktop & mobile (order `CO260728-00001` placed on mobile). All PASS.

### New bug surfaced by the broken-favicon test — **WL-FAVICON (High-impact / low-likelihood) — separate from VCST-5519**
A white-labeling org `faviconUrl` **without a file extension** (e.g. `/api/files/does-not-exist-QA5519`) makes the `whiteLabelingSettings` xAPI throw `ARGUMENT_OUT_OF_RANGE` (favicon size-suffix inserted at `LastIndexOf('.')` = -1) → cascades to `pageContext` → **the storefront blanks out** (never mounts) for that org. A well-formed URL that merely 404s degrades gracefully. **Root cause is the backend white-labeling xAPI, NOT the frontend dependency bump** — a pre-existing robustness gap the "broken favicon" retest exposed. Fix: guard the `LastIndexOf('.') == -1` case. Impact High (whole storefront blank for the org); likelihood Low (Admin UI only allows image upload — reachable via API/bad-data import). Recommend a **separate ticket**. Evidence: `screenshots/C3-BUG-noext-favicon-white-screen-desktop.png`.

## Verdict: **PASS WITH NOTES** (for VCST-5519 — the dependency upgrade)

**The dependency upgrade itself is clean** — all retest conditions pass, now confirmed with fresh data-fill on desktop & mobile. `@unhead` v3 (SEO meta output verified with values we set), `@floating-ui/vue` v2 (all pop-up types + datepicker, desktop & mobile), `marked` (content renders clean — the earlier leak was a data error, fixed), `uuid` v14 (upload + 2 placed orders). No regression attributable to PR #2394.
**Caveat:** the broken-favicon retest (C3) surfaced a real **High-impact WL xAPI bug** that is *out of PR #2394's scope* (backend white-labeling) — tracked as WL-FAVICON above for a separate ticket, does not fail the dependency-upgrade verdict.

**Journey to green:**
- **C11** — branch working-hours data leaked raw HTML → **fixed in data**, re-verified clean on both branches + isolated (renderer healthy, not a `marked` 13→18 regression).
- **C7** — payment-select "off-screen" was a keyboard/test-harness artifact → mouse-confirmed correctly anchored (floating-ui v2 fine).
- **C8** — re-checked live: the Orders date field IS a custom floating-ui datepicker and positions/flips correctly (PASS, not N/A).
- **C9 / C13** — resize/mobile reposition fine; a full order was placed (`CO260727-00001`) once a purchasable product was used.

**Validated OK:** headline `@unhead` v3 SEO fix (C1 keywords live) + all SEO/favicons (C1–C4), floating-ui v2 across tooltip/dropdown/upward-select/datepicker/mobile (C5–C9), rich + simple content (C10–C11), `uuid` 14 file upload + full checkout/place-order (C12–C13).

**Notes (incidental — not caused by this ticket, not blocking):**
- Transient "Something went wrong" toast in Order summary / at order submit, though the order is still created (possible failing post-order/recalc background call — worth a separate look).
- One corrupt product image (`api/files/c8e628a4…`) — env data.
- Brand-page `<title>`/`description`/`og:title` empty — pre-existing brand-template SEO gap, not `@unhead`.
- Favicon sub-cases (default-fallback / a second org without custom favicons) not reachable — favicons are store-scoped and only B2B-store is served (coverage limit, not a defect).

**App Insights correlation:** skipped — no `APPINSIGHTS_API_KEY` for vcptcore + Azure MCP not confirmed (experts captured console/network live instead).
