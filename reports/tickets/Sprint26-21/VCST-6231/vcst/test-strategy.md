# Test strategy — VCST-6231

## Round 1 of 3 — 2026-10-27

Status: APPROVED (elena.mutykova, 2026-10-27) · Depth label: deep (computed)
Blocked: no for this ticket — F6 fired on a PR the operator ruled out of scope (2026-10-27): "NOT DEPLOYED: VirtoCommerce/vc-frontend#2600 — vc-frontend@2.61.0-pr-2600-e356-e356eaa3: vc-frontend 2.61.0-pr-2600-e356-e356eaa3 not deployed (has 2.61.0-pr-2577-4c17-4c171a96)"; #2600 is VCST-6232's
Build: VirtoCommerce/vc-frontend#2577 @ 4c171a96 (with #2592 @ 0a6e5e9c merged into its branch) · Stand: vcst (vcst-qa-storefront, B2B-store) · Deployed: NO → F6 for #2600 only (out of scope); #2577 + #2592: bundle UNKNOWN, the stand reports 2.61.0-pr-2577-4c17-4c171a96 (= #2577's head) and the operator confirms it · Previous: none
Floors fired: F1 (priority Highest; R1 Critical) · F3 (rendering files preflight.scss, _typography-roles.scss, soft/_tokens.scss) · F4 (revenue-critical: cart) · F5 (102 suites at risk, regression:select) · F6 (NOT DEPLOYED #2600 — out of scope) · F8 (ui-kit: preflight.scss) · F10 (org context: sales-rep) · F11 (hidden behaviour: default-values) · F12 (zones: H-13, H-16, H-19, H-20, H-21 and the other non-none hotspots) · not fired: F2 (type Task, not a Story), F7 (type Task, ACs present), F9 (no floor read in doubt)
Change map: C:\Users\mutyk\My Projects\ai-tools\.vc-fix\vc-test\VCST-6231\vcst\change-map.json

**Mission.** Find out, on the layered classic build 2.61.0-pr-2577-4c17 on vcst, what the cascade layers, the design switch and the `!important` removal (#2577 + #2592) break for a buyer — buyer path, money display, print, org-only pages — and whether the design attribute, data-preset and the layer order meet the ACs, for the PO deciding VCST-6231.

### Inputs
| Input | What we have | Gap → project risk |
|---|---|---|
| Project environment | vcst-qa-storefront, store B2B-store; build 2.61.0-pr-2577-4c17-4c171a96; the served index CSS opens with `@layer theme,base,plugins-vendor,vc,components,plugins,utilities; … vc.vendor,vc.kit,vc.app,vc.design,vc.print` (read 2026-10-27). F11 stand values {OBSERVED} 2026-10-27: `design: "classic"` in the served settings chunk (/assets/select-address-modal.vue_vue_type_script_setup_true_lang-B0S6x8Vh.js); `themePresetName = red` (anonymous GraphQL `whiteLabelingSettings(storeId:"B2B-store")`); layer statement read from /assets/index-Drdbrg33.css. Lanes chrome/firefox/edge free; pixel engine with vc-frontend-dev and vc-frontend-2577 checkouts. Roles: USER_LOGIN buyer; sales-rep and a Builder page with a products block discovered in the run | P1–P5 |
| Product elements | storefront only: entry stylesheets + PostCSS SFC wrap (layers), print rules into vc.print/vc.kit, 39 `!important`/`!` removals, ProceedTo/PlaceOrder margin moved to callers, VcLineItem price wrapper, --vc-product-price-line-height / --vc-image-* tokens, image-gallery v-show, VcLayout print sticky in JS, design attribute + lazy design entry, data-preset removed | |
| Quality criteria | AC-1…AC-26 (description's Acceptance section); BL none; kb KB-29A75D95 (presets), KB-50EBEEE9 (checkout lives on /cart); VCST-6529 (follow-up), VCST-6493 (print order); design link none | P5 |

### Risks
| R | What a customer would see if this is wrong | Source | L×I | Level |
|---|---|---|---|---|
| R1 | On cart → checkout → order → order payment, product, category with a range facet, a buyer finds a control hidden, overlapped or restyled, a price twice or missing, a focus ring gone, or a step that stops placing or paying the order | AC-6 · AC-8 · AC-9 · AC-12 · client-app/assets/styles/main.scss:8 · postcss.sfc-layers.cjs:106 · client-app/ui-kit/components/molecules/slider/nouislider.layer.css:6 | 4×4=16 | Critical |
| R2 | Classic shows an unlisted visual difference against the pre-layer build on home, category, product, cart, checkout, account, orders and sign-in, light and dark | AC-6 · AC-7 · client-app/assets/styles/preflight.scss:16 (F8) | 4×3=12 | High |
| R3 | A cart or order line shows its price twice or not at all at a narrow container or in print; a deleted line prints a price the screen hides | AC-11 · client-app/ui-kit/components/molecules/line-item/vc-line-item.vue:99 · client-app/assets/styles/print/molecules/vc-line-item.scss:29 | 4×3=12 | High |
| R4 | A printed order payment, order details or cart page carries Edit/pay/add-to-cart buttons or a sticky sidebar, or the Edit buttons vanish on screen at md+ | AC-11 · AC-16 · client-app/pages/account/order-payment.vue:161 · client-app/assets/styles/print/atoms/vc-button.scss:2 · client-app/assets/styles/_print-kit.scss:17 · postcss.sfc-layers.cjs:58 · client-app/ui-kit/components/templates/layout/vc-layout.vue:61 · client-app/ui-kit/components/templates/layout/vc-layout.vue:77 · client-app/pages/compare-products.vue:316 | 4×3=12 | High |
| R5 | The Proceed/Place order button on cart or checkout sits flush against the block above it, or doubles its margin | client-app/shared/checkout/components/proceed-to.vue:2 | 4×2=8 | Medium |
| R6 | List and sale prices clip or overlap, product titles clip in fixed-height cards, images crop wrongly | client-app/ui-kit/components/molecules/product-price/vc-product-price.vue:57 · client-app/ui-kit/components/molecules/product-title/vc-product-title.vue:83 · client-app/ui-kit/components/atoms/image/vc-image.vue:96 | 3×3=9 | Medium |
| R7 | Buttons, tables and icons on account pages change size, padding or margins because a utility now beats a Vc* component | AC-7 · client-app/pages/account/order-details.vue:25 · client-app/assets/styles/helpers/_transitions.scss:88 · client-app/ui-kit/components/atoms/icon/vc-icon.vue:298 | 4×3=12 | High |
| R8 | Product gallery thumbnails show dead prev/next buttons, a padded or duplicated strip after client-side navigation | client-app/shared/catalog/components/image-gallery.vue:169 | 3×3=9 | Medium |
| R9 | `<html data-preset>` is missing or stale, so a fork's preset hooks stop matching | AC-4 · client-app/core/composables/useThemeContext.ts:61 · VCST-6529 | 5×2=10 | High |
| R10 | With the stand's design (classic) `<html data-design>` is late, missing or wrong, a designs/soft CSS request is made, or the preset's colours change in light/dark | AC-1 · AC-3 · AC-5 · AC-15 · AC-22 · client-app/core/utilities/design/index.ts:32 · client-app/app-runner.ts:349 · floor:F11 | 3×3=9 | Medium |
| R11 | A B2B org actor on an org-only page — a purchase-request requester going to quote, a sales-rep operator on a customer's layout blocks — finds the button without its gap or printing, or no focus ring | AC-8 · client-app/modules/sales-rep/components/layout-block.vue:110 · floor:F10 | 3×2=6 | Medium |
| R12 | A built stylesheet declares layers out of the declared order (the vendors sheet creating vc before theme), so base outranks vc and a Builder products block's h2 loses its size | AC-10 · AC-18 · AC-19 · AC-20 · AC-21 · client-app/assets/styles/vendors.scss:5 · client-app/assets/styles/_layers.scss:4 · VCST-6529 | 3×3=9 | Medium |
| R13 | The layer/design checks, browserslist refresh or styling docs are missing or red, so a wrong layer order ships unnoticed | AC-17 · AC-23 · AC-24 · AC-25 · scripts/check-css-layers.ts:106 | 4×2=8 | Medium |

Project risks: P1 vcst serves design "classic" and no soft build is available for this run → accepted; the soft halves go to Out of scope. · P2 no pre-change build runs on the stand for the "as before" ACs → mitigated: the pixel engine renders the vc-frontend-dev and vc-frontend-2577 checkouts side by side; stand scenarios use the AC text and the shipped rules. · P3 vcst is not declared in the profile's test block (capabilities: stand not writable) → run /vc-test:init before the run, else S-1, S-2, S-4, S-5, S-6, S-8, S-9, S-12 (data created in the case) are BLOCKED. · P4 deployment UNKNOWN in the bundle for #2577/#2592 → mitigated: the deploy probe reports 2.61.0-pr-2577-4c17-4c171a96 and the operator confirmed it; re-read the version at entry. · P5 no sales-rep account and no Builder page named; five PO questions: Q1 AC-4 vs VCST-6529 item 8 (data-preset), Q2 AC-19's statement vs the PR/decision artifact (plugins-vendor, vc.print; no vc.preset, vc.design.kit/app), Q3 AC-21's kit/app print split vs one _print.scss in vc.print, Q4 AC-24's check-soft-styles.ts vs the shipped check-designs.ts, Q5 AC-7's 5 listed flip sites vs the PR's 8 → discover the data with live-discover (BLOCKED if absent); the questions go to the PO in the verdict.

### Strategy mix
Analytical ✔ · Methodical ✔ · Consultative ✔ · Model-based ✔: R9, R10, R11 are MODEL (scenarios carry them) · Reactive ✔: F1/F12, and R9/R12/R13 rest on {HYPOTHESIS} parts ·
Regression-averse — : vc-test runs no regression (U7), F5's suites go to Out of scope · Process-compliant — : no external standard in scope (focus ring is AC-8, not a WCAG audit)

### Approach per risk
| R | Technique / approach | Oracle {authority} | Layer · tool | Lane · agent | Effort |
|---|---|---|---|---|---|
| R1 | FLOW, EG — S-12 (charter: buyer path + F12 hotspots, range facet, focus) | AC-6, AC-9, AC-12 {SPEC} · KB-50EBEEE9 {OBSERVED} | storefront · Playwright | chrome · qa-frontend-expert | high |
| R2 | VISUAL:PIXEL — Visual lane + F8 token audit | AC-6 {SPEC} | storefront build · pixel engine | script · pixel engine (ui-ux-expert) | high |
| R3 | FLOW, EP — S-2 | AC-11 {SPEC} | storefront · Playwright | chrome · qa-frontend-expert | high |
| R4 | FLOW, DT — S-1 | AC-11, AC-16 {SPEC} | storefront · Playwright | firefox · qa-testing-expert | high |
| R5 | EP — S-5 | AC-6, AC-11 {SPEC} — expected: each caller's margin as before (cart mt-2) | storefront · Playwright | chrome · qa-frontend-expert | medium |
| R6 | EP — S-6 | AC-6 {SPEC} — expected: line-height as before (1.335) | storefront · Playwright | edge · qa-backend-expert | medium |
| R7 | EP, EG — S-8 | AC-7 {SPEC} | storefront · Playwright | firefox · qa-testing-expert | high |
| R8 | ST, BVA — S-4 | AC-6 {SPEC} — the product page unchanged | storefront · Playwright | firefox · qa-testing-expert | medium |
| R9 | MODEL — S-7 | AC-4 {HYPOTHESIS} (contradicted by VCST-6529 item 8 → PO) | storefront · Playwright | chrome · qa-frontend-expert | high |
| R10 | MODEL — S-3, S-10 | AC-1, AC-3, AC-5, AC-15 {SPEC} | storefront · Playwright | chrome · qa-frontend-expert | medium |
| R11 | MODEL — S-9 | AC-6, AC-8 {SPEC} | storefront · Playwright | edge · qa-backend-expert | medium |
| R12 | EG, EXPLORE — S-11 | AC-10, AC-18 {SPEC} · AC-19 statement, AC-21 print split {HYPOTHESIS} → PO Q2, Q3 | storefront CSS · HTTP + Playwright | edge · qa-backend-expert | medium |
| R13 | EG, EXPLORE — ac-checks | AC-17, AC-23, AC-25 {SPEC} · AC-24 {HYPOTHESIS} → PO Q4 (its rules read against check-designs.ts) | GitHub checks + files | api · checklist AC run | medium |

### Scenarios
| S | Class | What it does | Bug it hunts | Why likely | Score | Proof | Writes |
|---|---|---|---|---|---|---|---|
| S-1 | 3 | Order payment page in print and on screen: Edit buttons hidden in print, shown at md+ | The two Edit buttons got print:hidden, but other VcButtons on the page (back to order, orders list, pay) or the Edit buttons at another breakpoint still print, or print:hidden hides them on screen | untested (client-app/pages/account/order-payment.vue (print:hidden on two VcB...), new-door (H-19) · R4 | 12 | browser | — |
| S-2 | 1 | Line-item price in print at a narrow container: shown once, never twice, never lost | The print rule .vc-line-item__price { display:block } now sits in vc.print above vc.kit's container-query hide, so at a container <= 4xl the printed line shows the price column AND the property price (two prices), or a deleted line prints a price the screen does not show | untested (client-app/ui-kit/components/molecules/line-item/vc-line-item.vue a...), untested (client-app/ui-kit/components/molecules/line-item/vc-line-item.vue (...) · R3 | 10 | browser | — |
| S-3 | 2 | data-design is on <html> before the app mounts, classic paints with no design request (throttled) | The design is read from the bundled settings by two consumers (getDesign for the attribute, getThemeConfig for $cfg); on the deployed build the attribute is written late, missing, or disagrees with the resolved setting, or classic still fetches a designs/* chunk | setting-other-consumers (design @ VirtoCommerce/vc-frontend:client-app/core/composables/useT...) · R10 | 6 | browser | — |
| S-4 | 2 | Gallery thumbnails when the image count changes without a reload | Thumbnail prev/next buttons are now hidden by a v-show beside Swiper's lock rule while the Swiper loop flag is set only at init; navigating client-side between products (or variations) with many and few images leaves buttons visible on a locked strip, a padded strip, or a looping strip of duplicates | new-door (H-32) · R8 | 6 | browser | — |
| S-5 | 3 | ProceedTo and PlaceOrder spacing at every caller | The outer mt-4 left ProceedTo/PlaceOrder and moved to five callers; a caller not updated (or the sticky cart variant) now has no top margin, or gets mt-2 and mt-4 together | untested (client-app/shared/checkout/components/proceed-to.vue and its five c...), untested (client-app/shared/checkout/components/proceed-to.vue and checkout/c...) · R5 | 6 | browser | — |
| S-6 | 3 | VcProductPrice line height through the new token in cards, line items and property price | line-height now reads --vc-product-price-line-height (default 1.335, 1.5 in the property price); a consumer that sets font size but inherits a different token value shows clipped or overlapping list/sale prices | untested (client-app/ui-kit/components/molecules/product-price/vc-product-pri...) · R6 | 5 | browser | — |
| S-7 | 2 | <html data-preset> after preset fallback and after the dark toggle | The PR deletes setPresetAttribute (its new test asserts the attribute is absent), so <html data-preset> is never written or goes stale after the preset changes, against AC-4 | prior-bug (VCST-6529), prior-bug (KB-29A75D95) · R9 | 4 | browser | — |
| S-8 | 3 | Tailwind utilities on Vc* components beyond the five listed flip sites | Utilities are unlayered and now always beat a Vc* component's layered style; a utility that used to lose (min-w, px, gap, display, ! removed) now applies at a site not in AC-7's list, changing buttons and tables on account pages | untested (remaining !important/! removals in pages, modules, shared and ui-ki...) · R7 | 4 | browser | — |
| S-9 | 4 | Purchase-request requester: ProceedTo to the quote, on screen and in print | For the purchase-request actor the ProceedTo now gets mt-4 from the caller and print:hidden instead of print:!hidden; the button loses its gap, or prints, on the purchase-request page | untested (client-app/shared/checkout/components/proceed-to.vue and checkout/c...) · R11 | 3 | browser | — |
| S-10 | 6 | Classic design with the store's current preset, light and dark: colours unchanged | The design setting's two consumers diverge or the layered theme tokens lose to the unlayered runtime preset differently, so with the existing preset and dark mode the colours differ from classic | setting-other-consumers (design @ VirtoCommerce/vc-frontend:client-app/core/composables/useT...) · R10 | 2 | browser | — |
| S-11 | 1 | Compiled vendors sheet head: does the plain @import ... layer(vc.vendor) create vc before theme, and does a Builder page keep its h2 | Sass hoists @import "swiper/css" layer(vc.vendor) above the @use "layers" output, so the vendors sheet declares vc before theme/base; if that sheet is linked before preflight on the stand, base outranks every vc rule and a Builder products block's h2 loses its size | prior-bug (VCST-6529), untested (client-app/assets/styles/main.scss, preflight.scss, vendors.scss, _...) · R12 | 3 | browser | — |
| S-12 | 3 | Free exploratory session on the layered build's buyer path | Charter: explore cart, checkout (shipping, billing, review), order details and order payment, compare, product page and category with filters on the layered classic build, plus their neighbours (quotes, purchase requests, BOPIS pickup, sales-rep blocks), on screen and in print, light and dark, desktop and mobile — looking for prices shown twice or not at all, totals that disagree with lines, buttons that print or vanish, hidden or overlapped order-state controls, broken focus and any step that stops a buyer from placing or paying an order | exploratory (free) · R1 | 0 | browser | — |

Shared store: none
Changed rows: S-10 = C-24 (swapped in for the scorer's S-10 = C-22: class 6 carried a setting-other-consumers signal and had no scenario — U64 (a); C-22 goes to Out of scope)

### Artifacts
| Artifact | Decision |
|---|---|
| Scenarios | RUN — S-1…S-12 |
| Test model | SKIP — scenarios cover the MODEL risks |
| Mind map | SKIP — the model does not run and no domain map is PRESENT |
| Checklist | RUN (always) — one row per AC; R13 by the background AC run |
| Exploratory | RUN — S-12, the free class-3 scenario · 45 min, FIRST (R9 High on {HYPOTHESIS}) — charter: R1 + the F12 hotspots H-13, H-16, H-19, H-20, H-21, H-24, H-28, H-31, H-32, H-34, H-41 |
| Visual lane | RUN (F3, F8) — instruments: PIXEL (R2, plugins/vc-frontend/visual over the dev and pr-2577 checkouts) + F8 token audit of the served CSS; browser work on Playwright lanes only (.claude/rules/vc-browser.md) |
| Contract refresh | SKIP — the diff names no GraphQL operation and changes no REST contract |
| Coverage triage + regression | SKIP — vc-test runs no regression (U7); the 102 suites at risk are in Out of scope |
| Verifier | RUN (Critical R1) |
| Case authoring | never in the run (D2) — candidate cases are listed at close-out |

### Data
Created in the case (USER_LOGIN, AGENT-TEST-, deleted in Cleanup): an order awaiting payment (S-1), a cart with a sale-priced and a deactivated product (S-2, S-12), products with 1/4/8 images (S-4), a list+sale product (S-6), an order and a quote (S-8), a purchase request (S-9). live-discover: a category with a price range facet (S-12), a Builder page with a products block (S-11), a sales-rep account (S-12). Checkout may live on /cart on this build (KB-50EBEEE9) — S-5 records where ProceedTo renders.
Must differ: R3/R6 sale price < list price (one price vs two is then decidable) · R8 image counts on both sides of the thumbnail fit · R9 the stand's preset is red, not the default coffee, so an attribute written from a default instead of the resolved preset is caught · R10 light vs dark tokens · Before redeploy: none

### Out of scope
- PR #2600 (VCST-6232, not deployed) and its hotspots tailwind.config.ts:229, tailwind.config.ts:332, tailwind.config.ts:313, tailwind.config.ts:315, tailwind.config.ts:225, client-app/assets/styles/_typography-roles.scss:8, client-app/assets/styles/_typography-roles.scss:17, client-app/core/utilities/design/index.ts:37, client-app/core/utilities/design/index.ts:51, client-app/core/constants/design.ts:11, client-app/assets/styles/soft/_tokens.scss:6, .storybook/preview-head.html:6 — operator scope decision 2026-10-27 — residual: VCST-6232's
- Soft design: AC-2, AC-14, the soft halves of AC-3, AC-5 and AC-16 — the stand bundles design "classic" (P1); needs a build with design: soft — residual Medium
- AC-13 Storybook before/after diff — no Storybook build of #2577 is named — residual Medium · AC-26 release notes, and AC-7's release-notes half — no release yet; checked at release — residual Low
- Preset change and the coffee preset: AC-4 "kept in sync when the preset changes", the coffee halves of AC-3 and AC-6 — vcst runs red only, the stand is not writable for vc-test (capabilities) and no scenario writes the store's preset — residual Medium
- AC-1's missing-key and unknown-design halves (client-app/core/utilities/design/index.ts:32) — vcst serves one bundled value; needs a build with the key removed or misspelt (the PR's unit test is an input, not proof) — residual Low
- Regression (F5, regression:select over vc-frontend): suites 001, 002, 003, 004, 005, 008, 010, 011, 011b, 012, 013, 014, 014b, 014c, 015, 020, 020b, 024, 025, 026, 027, 027b, 028, 029, 030, 037, 038, 039, 040a, 040b, 040c, 041, 042, 048c, 049, 050b3, 050h, 050l, 050m, 050m2, 050m3, 050o, 051, 053, 057, 058, 059, 059b, 060, 060b, 060c, 061, 061b, 062, 063, 064, 064b, 065, 068, 069, 070, 072, 072e, 072f, 073, 073a, 073b, 074, 075, 075b, 075c, 075d, 075e, 075f, 078, 078b, 081, 083, 083b, 083c, 083d, 083e, 086, 087, 088, 089, 090, 091, 092, 092b, 093, 093b, 095, 096, 097, 098, 099, 100, 101, 103, 106, 112 — vc-test runs no regression (U7); follow-up `/qa-regression` over these suites — residual High
- H-27 (postcss.sfc-layers.cjs:45 layer-order mtime cache), H-28 and H-9 — single instance: H-27 is a yarn dev build-time cache and exists in no deployed build; "throttled" in H-28/H-9 names network throttling, a per-page-load promise that holds nothing across instances (checked: change-map risk text and the cited lines) — residual Low
- client-app/plugins/builder-preview/components/scroll-to-element.vue:17 — Builder editor preview only, no buyer surface — residual Low
- Not selected (budget) C-6 VcLayout sticky across a real print/afterprint, C-15 VcProductTitle height and line clamp, C-16 VcImage fit/fallback at 21 call sites, C-23 dark mode then print, C-20 sales-rep focus ring in and out of edit mode, C-5 Firefox number spinners and header search (client-app/ui-kit/components/molecules/input/vc-input.vue:443) — residual Low each (S-1/S-12 see print emulation, images and focus in passing)
- Not selected C-13 line-item price column across every consumer and width (S-2 covers cart), C-19 focus ring under the 9 layered outline rules (S-12 looks for broken focus) — residual Medium each
- Not selected C-10 every VcButton with a display utility in print, C-17 add-to-cart and line-items buttons in print (VCST-6493) — residual Medium (S-1 lists the order payment page only)
- Not selected C-22 range facet when the nouislider CSS chunk races the JS chunk (swapped out for C-24) — residual Medium (S-12 checks the facet at rest and dragging, not the race)
- Not selected C-1 layer order on the MF build entered cold through lazy routes, C-3 federated plugin CSS unlayered against the layered host — residual Medium (S-11 reads the head only)
### Criteria
Entry: the stand reports 2.61.0-pr-2577-4c17 and its index CSS opens with the layer statement · `npm run env:check` green · USER_LOGIN signs in · vcst declared for vc-test (P3) · Suspend (BLOCKED): the stand version changes mid-run, no Playwright lane starts, sign-in fails, or case data cannot be created
Exit: every in-scope R1–R13 has a result or a named deviation · the S-12 box (45 min) is spent · the PIXEL diff is produced for R2 · the five PO questions Q1–Q5 (P5) are in the verdict

### Amendments

### Reconciliation (filled at close-out)
| R | Planned | Ran (item ids · charter · lane · case ids) | Result | Deviation — reason |
|---|---|---|---|---|

Candidate cases (→ /qa-test-lifecycle): none yet · Carried to Round 2 / escalation: none yet
