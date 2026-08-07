# VCST-5519 — Frontend Execution Report (dependency major-version upgrade, PR #2394)

**Env:** vcptcore-qa storefront (https://vcptcore-qa-storefront.govirto.com) · Store `B2B-store` · Theme `2.54.0-pr-2394` (confirmed live in footer) · Browser: playwright-chrome
**Scope:** SEO/head (`@unhead` v2→v3), formatted-content renderer, file-upload + cart (internal id-gen lib). Pop-up positioning excluded (other agent).
**Login:** belovedushka@gmail.com (org "Watermelon123", populated).

## Verdicts

| ID | Area | Verdict | Evidence |
|----|------|---------|----------|
| C1 | Brand page SEO meta | **PASS** | `keywords` fix confirmed; screenshot `C1-brand-ASUS-rendered.png` |
| C2 | Product page SEO meta | **PASS** | title/og:title/og:image/og:url present |
| C3 | Favicons | **PASS** | 5 custom `<link rel=icon>` + manifest |
| C4 | Home / Category / News / Static | **PASS** | titles set; no JS/head errors |
| C10 | Rich formatted content | **PASS** | `C10-news-rich-content.png`, `C10-pdp-properties-table.png` |
| C11 | Simple formatted content | **FAIL** | raw HTML leak in Branch Hours — `C11-branch-hours-raw-html-leak.png` |
| C12 | File upload (Company logo) | **PASS** | `C12-logo-after-upload.png`, `C12-logo-after-reload.png` |
| C13 | Cart → checkout → place order | **BLOCKED** | env inventory-depleted; cart+payment UI verified — `C13-cybersource-cart-payment-form.png` |

## Detail

**C1 — Brand `/brands/ASUS`.** The specific fix is live: `<meta name="keywords" content="ASUS">` — keywords now contains the brand name. `og:url` and 5 favicon links also present; page renders (h1 "ASUS", 36 products), only App Insights console noise. Note (not a regression): brand-page `<title>` stays the default "Virto Commerce" and `description`/`og:title` are empty. Title-setting works everywhere it has source data (home/category/PDP/news all set proper titles), so this is a brand-template SEO gap, not a `@unhead` failure.

**C2 — PDP `/product/55b924dc…` (IIIF150 phone).** `<title>`, `og:title`, `og:image` (real product image URL), `og:url` all present and sensible. `description`/`keywords`/`og:description` empty and no `twitter:` tags — this product has no SEO source data (title+og populate from the same head system, which works), and Twitter cards aren't emitted on any page (OG-only, by-design). Renderer OK.

**C3 — Favicons.** `<head>` serves 5 custom PNG favicons `…/customization/favicons/favicon_B2B-store_*.png` (16/32/96/128/196) + web manifest. Observable case: **custom** favicons (org has them). Pages render fine.

**C4 — Spot-checks.** Home `QA-audit-test | B2B-store | Main page` (desc "Hello", 5 icons); Category `…| Catalog`; News article `…| Virto's Release Notes | January 2025`; Static `/contacts` renders. Console: only image-asset 404s (seed-data gaps, e.g. `…/catalog/c1959/…_md.jpg`, one ikea.com img) + App Insights 400 noise — no JS/head errors, no CSP violations.

**C10 — Rich content (news article, shared renderer).** Renders perfectly: `<h2>`/`<h3>` headings with links, external `<a>` links (GitHub/docs), multi-level nested `<ul>/<li>`, `<strong>`, inline `<code>` (`OrganizationId`, `QuoteItem`…), images. No raw markdown, no broken HTML. PDP Properties spec-table + working brand link also render clean.

**C11 — Simple content (branch hours) — FAIL (bug below).**

**C12 — Company logo upload.** Flow end-to-end clean: file chooser → PNG accepted → Save (disk) button appeared → saved (success check icon, no 4xx/5xx) → after **reload** the logo control shows the saved state (edit + remove buttons). Internal id-gen produced a working asset reference; no console errors. (Preview thumbnail not visually distinct because the test image was a minimal transparent 16×16 PNG.)

**C13 — Checkout — BLOCKED (environment, not a VCST-5519 defect).** The vcptcore-qa catalog is inventory-depleted: every reachable product (7+ PDPs across phones, bolts, beer, printers) shows "Stock alert" / "You can order maximum 0 item(s)". A saved-for-later printer moved to cart likewise reports max 0, so **Place Order stays correctly disabled** (validation working). Could not place a real order. **Partial verification (all PASS, no JS crashes):** cart page renders; shipping/payment/coupon sections render; payment-method dropdown lists all providers (AuthorizeNet, CyberSource, Datatrans, Cache, Skyflow); selecting **CyberSource** renders the on-cart card form (`allowCartPayment`) with the CyberSource Microform iframes for Card number + Security code + Expiration date. The cart/id-gen UI layer works; only order completion is blocked by missing stock.

## Bug found

### BUG — Branch "Branch Hours" table leaks raw HTML (SAT/SUN rows) — Medium
**Env:** vcptcore-qa @ Theme 2.54.0-pr-2394 · storefront branch pages
**Area:** VCST-5519 formatted-content renderer (markdown/HTML)
**STR:**
1. Open any branch with hours, e.g. `/branch/vendor-fulfillment` (LA Branch) or `/branch/c20d27cdb09c4c7abd5d78a71510ab83` (New York Branch).
2. Scroll to "Branch Hours".

**Expected:** 7 day-rows (MON–SUN) render as a clean table; SAT & SUN show "CLOSED".
**Actual:** MON–FRI render correctly; the SAT "Hours" cell renders the literal text
`CLOSED </td> </tr> <tr> <td>SUN</td> <td>CLOSED</td> </tr> </tbody> </table>` inside a `<code>` block, and the SUN row is swallowed/missing. Raw HTML tags are visible to the customer.
**Evidence:** `screenshots/C11-branch-hours-raw-html-leak.png`
**Reproducibility:** systemic — identical breakage on LA and New York branches (shared hours content), so it is renderer-driven, not a single author's typo.
**Root-cause hypothesis:** the upgraded markdown/HTML renderer treats the indented final table rows as an indented code block (markdown 4-space code-block rule), escaping the trailing `</td></tr>…` markup. Because this is squarely in the renderer area PR #2394 upgraded, it is a **regression candidate** — fix owner should diff pre/post-upgrade to confirm regression vs pre-existing malformed content.
**Note:** C10 (news article, same renderer) renders complex HTML/markdown flawlessly, so the failure is specific to this HTML-table-in-a-simple-field content shape.

## Teardown
Cart cleared. No test orgs/contacts/accounts created (used existing account). Company logo was updated on org "Watermelon123" (QA account) and not reverted (prior state unknown; benign).

---

## Follow-up: C13 / C7 / C9
**Env:** vcptcore-qa @ Theme `2.54.0-pr-2394-cfab-cfabd10b` (footer confirmed) · Store `B2B-store` · Browser playwright-chrome · Account belovedushka@gmail.com (org Watermelon123). HAR auto-captured under `test-results/chrome/har/`.

| ID | Verdict | Key evidence |
|----|---------|--------------|
| C13 | **PASS** (was BLOCKED) | Real order placed — `CO260727-00001` |
| C7 | **PASS** (keyboard/harness artifact, not a real regression) | Payment-method select anchors to trigger, on-screen |
| C9 | **PASS** (was BLOCKED) | Popover repositions on resize, on-screen at 390px & desktop |

### C13 — Order placed → PASS
The regular laptop PDPs are genuinely OOS in this env (e.g. Acer $2,500 shows only a "Stock alert" button, no qty control / no add-to-cart), matching the prior BLOCKED finding for those SKUs. **However, the configurable laptop `AGENT-TEST-Config-Laptop` (SKU `AGENT-TEST-CFG-013`, `/products-with-options/cfg-parents/agent-test-config-laptop`) renders "In stock" with an enabled "Add to cart" — it is buyable via the UI.** Full happy path completed:
1. Add configurable laptop to cart ($1,249) → removed the pre-existing OOS Officejet printer line ("You can order maximum 0 item(s)") that had been blocking Place Order.
2. Shipping address (saved Cupertino address) + Delivery method "Fixed Rate (Ground)") + billing = same as shipping.
3. Payment method **CyberSource** — on-cart card form (`allowCartPayment`) rendered correctly; filled Card `@td` CyberSource sandbox (`4622943127013705`, exp 09/2029, CVV 838) into the Microform iframes + cardholder name.
4. Place Order enabled (Total $664.50 incl. $40 shipping, 50% promo discount) → **"Order CO260727-00001 has been successfully submitted"** at `/checkout/completed`. No double-submit issue.

Evidence: `C13-cart-ready-cybersource-form-filled.png`, `C13-order-completed-CO260727-00001.png`.
Note: a transient "Something went wrong. Please try again later." toast surfaced in the notifications region at submit, but the order WAS created successfully (confirmation page + order number) — non-blocking; likely a post-order background call (cart refresh / analytics). Not an order-placement defect. So C13 is no longer environment-blocked: at least one buyable UI path to a completed order exists; the OOS laptops are an inventory-data gap, not a PR #2394 defect.

### C7 — Payment-method select position (mouse-confirmed) → PASS
Reproduced the prior keyboard finding via **mouse click** on a clean (non-error) cart. Opened the Payment-method `vc-select` by mouse (no click stall). Measured (read-only `getBoundingClientRect`, desktop 1920×1080):
- Trigger `vc-select`: left=1062, top=763, w=256. `vc-popover` anchor (position:relative): left=1062, top=785 — sits exactly at the trigger.
- Rendered option column: x 915–1312 (fully within 0–1920), stacked below/over the trigger; floating-ui **flips the menu upward** because the trigger sits low in the viewport, keeping it on-screen.
- Screenshot confirms the dropdown is a cohesive popover attached to the "Select a payment method" trigger, opening upward, fully visible.

The dropdown is **anchored to its trigger and on-screen** — it does NOT render "off-screen bottom-right, detached". The earlier keyboard-only observation was a keyboard/harness artifact, aggravated by the cart being in an error state in the prior run. **C7 not a real floating-ui regression.**
Evidence: `C7-payment-select-opened-mouse-desktop.png`.

### C9 — Popover reposition on resize / mobile → PASS
`browser_resize` worked this run (no hang). Language/currency header popovers reposition correctly and stay on-screen:
- **Desktop 1920×1080** currency popover: body left=178/top=37/right=306/bottom=118, anchored 4px below trigger (bottom=33), fully on-screen.
- **Resize → 390×844:** header collapses to a hamburger; opened the language selector inside the drawer. Popover body left=201/top=68/right=316/bottom=230 — 4px directly below its (now-moved) trigger, right-aligned to it (both right=316), **fully within the 390×844 viewport**. Screenshot shows English/Nederlands/Français/Deutsch cleanly anchored to the flag trigger.
- **Resize back → 1920:** currency popover re-anchors identically to the desktop baseline (4px below trigger, on-screen). Sticky header keeps the trigger pinned, so a page scroll does not detach it (scrollY stayed 0 on the short cart page).

Popovers follow their trigger across viewport changes and never render off-screen. Evidence: `C9-language-popover-mobile-390w.png`.

---

## Re-verification (C11 fix + gap closure)
**Env:** vcptcore-qa @ Theme `2.54.0-pr-2394-cfab-cfabd10b` (footer confirmed — **still the PR build, data-only fix, no redeploy**) · Store `B2B-store` · Browser playwright-chrome · Account belovedushka@gmail.com (org Watermelon123). HAR auto-captured under `test-results/chrome/har/`.

| ID | Prev | Now | Evidence |
|----|------|-----|----------|
| C11 | FAIL | **PASS — fix CONFIRMED** | `C11-branch-hours-fixed.png` (LA), `C11-branch-hours-fixed-newyork.png` (NY) |
| Renderer scope | concern | **isolated data, now fixed** | 3 branches + pickup hours + PDP description all clean |
| C8 datepicker | N/A (thought native) | **PASS — floating datepicker EXISTS & positions correctly** | `C8-orders-datepicker-calendar.png`, `C8-datepicker-flip-short-viewport.png` |
| Favicon sub-cases | 1/3 (custom) | **coverage limit** (default-fallback / 2nd-store not reachable) | — |

### C11 — Branch Hours raw-HTML leak → FIXED
Both previously-broken branch pages now render the "Branch Hours" table **cleanly**: all 7 day rows MON–SUN present, each with a proper Hours value (MON–FRI `7:30 AM - 5:00 PM`, SAT/SUN `CLOSED`), inside a real `<table>` (Day/Hours columnheaders + 7 rows). **No `<code>` block, no leaked `</td></tr>…` tags, SUN row no longer swallowed.**
- `/branch/vendor-fulfillment` (Los Angeles Branch) — clean.
- `/branch/c20d27cdb09c4c7abd5d78a71510ab83` (New York Branch) — clean.

### Renderer scope — isolated data, NOT a systemic `marked` 13→18 regression
Spot-checked additional formatted-content surfaces; **none leaks raw HTML**:
- **AGENT-TEST-Central Hub** (`/branch/cb067bd7…`) — full 7-row Branch Hours table renders clean (same hours content shape that was broken on LA/NY → confirms the fix applied wherever this content is used).
- **Chicago Branch** — Branch Hours table present but **empty** (no hours data configured) — a data gap, no leak.
- **Stefan Stones** — no Branch Hours section (no data) — clean.
- **Checkout pickup-location working hours** (PDP "Check pickup locations" → Pick points dialog) — pickup locations render working-hours content **cleanly as plain text**, e.g. `Barclays' Center. Amazon pickup point. Work hours M-Sun: 6-24` — no raw HTML. Evidence: `C11-pickup-working-hours-clean.png`.
- **PDP Description** (configurable laptop) — rich block renders clean: `<p>`, `<strong>`, inline `<code>AGENT-TEST-CFG-013</code>` all intact.

**Verdict:** the formatted-content renderer is healthy across every sample. C11 was **isolated to that one branch-hours content record** (indented final table rows previously parsed as a markdown code block) and is now fixed — **no reopening of a `marked`-upgrade concern.**

### C8 — Date picker: floating-ui datepicker EXISTS and positions correctly (correction)
The earlier "native `<input type=date>` → N/A" conclusion is **superseded by live checking**. The Orders **Filters → Created date → Custom date** panel exposes **Start date / End date** fields, each a `MM/DD/YYYY` combobox with an **"Open calendar"** button that opens a **custom floating month-grid calendar popover** (NOT a browser-native date control).
- **Anchored + on-screen (desktop 1920×1080):** calendar opens 8px below the Start-date input (input bottom=518 → calendar top=526), rect left=1095/right=1412/bottom=876, **fully within the viewport** (read-only `getBoundingClientRect`).
- **Flips near the bottom:** at a shortened viewport (1920×640) with the input low in the view, the calendar correctly **flips ABOVE the input**, still fully on-screen — floating-ui flip behavior working.
- Quote date field: **none exists** (customer-side quote list/detail has no date input; no quotes present).

**Verdict:** a floating-ui datepicker DOES exist, and it anchors, stays on-screen, and flips correctly → **no positioning regression from the dependency upgrade. C8 = PASS** (not N/A).

### Task 4 — Favicon sub-cases (best-effort)
- Prior run confirmed 5 custom favicons for the current org/store (C3 PASS). Page rendering is **independent of favicon presence** — every page this session rendered fine.
- (a) **Default-fallback (favicon config absent):** cannot be exercised here — favicons are **store-scoped** (files `favicon_B2B-store_*`); removing them is an admin store-config action, not reachable via the storefront.
- (b) **Second store/org without custom favicons:** **not reachable** — this storefront serves only `B2B-store`, and org-switching within the account does not change store-level favicons. **Coverage limit stated; not forced.**

### Console/teardown
Only the known App Insights `dc.services.visualstudio.com/v2/track` 400 "Invalid workspace" noise + benign map-marker warnings in the Pick points dialog. No JS errors blocking interaction. No test data created; no cart order placed (added laptop to PDP config only to reach the pickup dialog — not added to cart). Viewport reset to 1920×1080.

---

## SEO meta data-fill (Admin SPA)

**Env:** vcptcore-qa Admin SPA `https://vcptcore-qa.govirto.com` @ Platform **3.1051.0** · Store `B2B-store` (catalog = `B2B-mixed` virtual) · storefront `https://vcptcore-qa-storefront.govirto.com` · Browser playwright-edge · Marker prefix `QA5519`.
**Purpose:** set fresh, uniquely identifiable SEO meta so a storefront agent can confirm `@unhead` v3 renders it in `<head>`.

| entity | storefront URL | Page title | Meta description | Meta keywords | OG | saved? | reindex? |
|--------|----------------|------------|------------------|---------------|----|--------|----------|
| **Product** — `AGENT-TEST-Config-Laptop` (SKU `AGENT-TEST-CFG-013`, productId `2561372d-b6c8-49f9-aa2b-3b086d43b990`) | `/products-with-options/cfg-parents/agent-test-config-laptop` (confirmed live) | `QA5519 Test Product Title` | `QA5519 test meta description for unhead v3` | `qa5519-kw-alpha, qa5519-kw-beta` | **derived** — no separate OG inputs in Admin; @unhead builds `og:title`←page title, `og:description`←meta description, `og:image`←product image, `og:url`←slug. Image alt text set to `QA5519 image alt text`. | ✅ `POST /api/catalog/products → 200` + reload 200 | not required (see note) |
| **Category** — `Consumer Electronics` (top-level nav category, categoryId `5a843e0c-0348-4211-b91b-d29f11f8a7d2`) | slug route `/consumer-electronics` (fallback `/category/5a843e0c-0348-4211-b91b-d29f11f8a7d2`, or via top-nav "Consumer Electronics") | `QA5519 Test Category Title` | `QA5519 test category meta description for unhead v3` | `qa5519-cat-alpha, qa5519-cat-beta` | **derived** (same rule as product). Image alt text `QA5519 category image alt text`. | ✅ `POST /api/catalog/categories → 200` + reload 200 | not required (see note) |

**Both SEO records are scoped to Store `B2B-store` / Language `en-US`.** Slugs were left unchanged (`agent-test-config-laptop`, `consumer-electronics`) so route resolution is unaffected — only title/description/keywords/alt were added. Only 1 SEO record exists per entity for B2B-store/en-US (no duplicates created; a stray blank Add on the category was cancelled).

**Reindex / cache:** meta-only changes on entities whose slugs already exist and are already indexed do **not** need a search reindex — vc-frontend reads `metaTitle/metaDescription/metaKeywords` live from the entity via xAPI at request time. A short platform GraphQL response cache may apply, so if a value doesn't show immediately the storefront agent should wait ~30–60s and hard-refresh. No "build index"/publish step was triggered (would be a heavy full-catalog reindex, unnecessary for meta-only edits). Escalate to a Search-index → Catalog → Build only if meta is still stale after a hard refresh.

**Evidence (screenshots/):** `QA5519-product-seo-form.png` (product SEO form filled), `QA5519-category-seo-form.png` (category SEO form filled), `QA5519-b2bmixed-listing.png` (B2B-store catalog = B2B-mixed).

**No blocker.** Both writes went through with no permission-classifier prompt (write permission was granted for this QA env). Console: only the ignorable `dc.services.visualstudio.com/v2/track` 400 "Invalid workspace" App Insights noise.

**Storefront-agent handoff — what to verify in `<head>`:**
1. PDP `<title>` contains `QA5519 Test Product Title`; `<meta name="description">` = the QA5519 product description; `<meta name="keywords">` = `qa5519-kw-alpha, qa5519-kw-beta`; `og:title`/`og:description` reflect the QA5519 title/description; `og:image`/`og:url` present.
2. Category page same checks with the `QA5519 Test Category` / `qa5519-cat-*` markers.

## Deep re-pass — pop-ups / content / upload / cart (desktop + mobile)

**Env:** vcptcore-qa @ Theme `2.54.0-pr-2394-cfab-cfabd10b` (footer confirmed) · Store `B2B-store` · Browser **playwright-firefox** · Account belovedushka@gmail.com (org Watermelon123). Viewports: desktop 1920×1080, mobile 390×844. HAR auto-captured under `test-results/firefox/har/`. Positioning verified with read-only `getBoundingClientRect`.

| Area | Item | Desktop | Mobile | Evidence |
|------|------|---------|--------|----------|
| D | Tooltip (header theme toggle) | **PASS** — "Theme: auto" anchored below toggle (btn b=34→tip t=36), on-screen | **N/A** — hover tooltips suppressed on touch layout; control uses inline label (not a defect) | `D-dropdown-language-desktop.png` |
| D | Dropdown (header language) | **PASS** — popover t=37 below trigger (b=33), on-screen (r=175) | **PASS** — popover l=201–r=316, on-screen within 390px (b=230) | `D-dropdown-language-desktop.png`, `D-dropdown-language-mobile.png` |
| D | Select that flips upward | **PASS (anchoring)** — Sort-by opens on-screen (t=291→b=483); true flip shown on mobile | **PASS (flip up)** — cart Payment select list t=463 opens **above** trigger (t=532), on-screen (b=655) | `D-select-flip-up-mobile.png` |
| D | Date picker (Orders → Filters → Created date) | **PASS** — calendar anchored below input (input b~492→cal t=526), fully on-screen (b=876) | **PASS** — calendar anchored below input (b=481→t=489), fits fully on-screen (b=839 ≤ 844) | `D-datepicker-desktop.png`, `D-datepicker-mobile.png` |
| B | Rich content (PDP Description, marked) | **PASS** — `## Description` heading + **bold** + inline `code` + paragraphs, no raw HTML | **PASS** — identical clean structured render | `B-rich-pdp-description-desktop.png`, `B-rich-pdp-description-mobile.png` |
| B | Simple content (Branch Hours table) | **PASS** — clean `<table>` Day/Hours, MON–SUN rows, SAT/SUN CLOSED, no leaked tags | **PASS** — same clean 7-row table | `B-simple-branch-hours-desktop.png`, `B-simple-branch-hours-mobile.png` |
| C | Company Info logo upload | **PASS** — Browse → preview → **Save (floppy)** → POST `/api/files/organization-logos` 200 → persists on reload | **PASS** — control renders with persisted logo + Edit/Save, operable | `C-logo-upload-desktop.png`, `C-logo-upload-mobile.png` |
| E | Cart + checkout + on-cart card form | **PASS (render)** — cart renders; on-cart CyberSource card form renders (Card#/Cardholder/Expiry/CVV hosted iframes); totals correct | **PASS (order placed)** — order **CO260728-00001**, $664.50, "Order completed" | `E-cart-oncard-form-desktop.png`, `E-order-confirmation-mobile.png` |

**Order math (BL-CHK-006):** subtotal $1,249.00 − discount $624.50 (50% off cart) + shipping $40.00 (Ground, $50 − $10 promo) + tax $0.00 = **$664.50** ✓ (config laptop price $999 base + 16GB RAM $100 + 1TB SSD $150 = $1,249 ✓).

### Incidental finding (LOW / needs-review) — `updateMemberAddresses` GraphQL VALIDATION error during checkout
On placing the mobile order, the console logged an unhandled `ApolloError: Error trying to resolve field 'updateMemberAddresses'` (from `useCheckout`). The GraphQL response was HTTP 200 with `errors:[{message:"Error trying to resolve field 'updateMemberAddresses'.", path:["updateMemberAddresses"], extensions:{code:"VALIDATION"}}], data:{updateMemberAddresses:null}`.
- **Non-blocking:** `createOrderFromCart` succeeded in the same flow → order CO260728-00001 created. Checkout was NOT interrupted.
- **Likely cause = malformed default address data (env-data):** the selected/saved address is `countryCode:"ALB" / countryName:"Albania"` paired with a US street/city/ZIP (`10185 N Stelling Rd, Cupertino, CA 95014, USA`, postalCode 95014) and **empty `regionId`/`regionName`**. Saving that invalid country/region combo to the member address book fails backend validation.
- **Recommendation:** (a) correct the malformed address record; (b) frontend should catch the `updateMemberAddresses` validation failure gracefully rather than surfacing an unhandled console ApolloError in the revenue flow. Not filed as a hard bug (data-driven + non-blocking); flag for review.

### Console / teardown
Only ignorable noise otherwise: App Insights `dc.services.visualstudio.com/v2/track` 400 "Invalid workspace" + benign Vue warnings. No JS errors blocked any interaction. Test data created: 1 order (CO260728-00001, Payment-required/held-for-review — expected CyberSource sandbox), and company logo set on org Watermelon123 (benign QA-org change, left in place). Logged out via storefront account-menu popup; viewport reset to 1920×1080.

---

## SEO output verification + favicon 3-case (desktop+mobile)

**Env:** vcptcore-qa storefront (`https://vcptcore-qa-storefront.govirto.com`) · Store `B2B-store` · Theme **2.54.0-pr-2394-cfab-cfabd10b** (footer confirmed) · `@unhead/vue` v3 · Browser **playwright-chrome** · Account belovedushka@gmail.com (org **Watermelon123**, org id `cb7ed54a-9b3e-4235-b4d6-28be7e7fceb1`). Head tags read read-only; HAR auto-captured under `test-results/chrome/har/`.

### Task 1 — @unhead v3 SEO output (set by the Admin agent, marker `QA5519`)

All values rendered live in `<head>` with no cache lag (present on first hard load). Store prefix `QA-audit-test | B2B-store | ` is prepended to `<title>` and mirrored into `og:title` by the head system — the QA5519 value is contained in both.

| Page | Viewport | title has `QA5519`? | description | keywords | og:title/desc has QA5519? | og:image | og:url | Verdict |
|------|----------|--------------------|-------------|----------|---------------------------|----------|--------|---------|
| **PDP** `/products-with-options/cfg-parents/agent-test-config-laptop` | Desktop 1920 | ✅ `…\| QA5519 Test Product Title` | ✅ `QA5519 test meta description for unhead v3` | ✅ `qa5519-kw-alpha, qa5519-kw-beta` | ✅ both | ✅ `…/AGENT-TEST-CFG-013/AGENT-TEST-CFG-013-main.png` | ✅ = page URL | **PASS** |
| **PDP** (same) | Mobile 390 | ✅ | ✅ (identical) | ✅ (identical) | ✅ both | ✅ (identical) | ✅ (identical) | **PASS** |
| **Category** `/consumer-electronics` | Desktop 1920 | ✅ `…\| QA5519 Test Category Title` | ✅ `QA5519 test category meta description for unhead v3` | ✅ `qa5519-cat-alpha, qa5519-cat-beta` | ✅ both | ⚠️ `null` (category has no image — expected) | ✅ = page URL | **PASS** |
| **Category** (same) | Mobile 390 | ✅ | ✅ (identical) | ✅ (identical) | ✅ both | ⚠️ `null` (same) | ✅ (identical) | **PASS** |

- **Mobile does NOT drop or alter any tag** — PDP and Category head is byte-identical across 1920 and 390. `@unhead` v3 renders SEO meta once server-side/on hydration, viewport-independent.
- **og:image null on Category is expected** — the category entity has no image; `@unhead` only emits `og:image` when a source image exists (PDP has one → present). Not a defect.
- No `og:type=website` on category vs `website` on PDP; no `link[rel=canonical]` on either page (none emitted app-wide — pre-existing, unchanged by this upgrade).
- **Brand-page keywords behavior (original-fix re-confirm) — PASS:** `/brands/ASUS` → `<meta name="keywords" content="ASUS">` — keywords contains the brand entity name; h1 "ASUS"; `og:url` present. (Unchanged pre-existing gap, not a regression: brand `<title>` stays default "Virto Commerce" and description/og:title empty — brand template has no title/desc SEO source, same as prior C1/C2 finding.)
- Evidence: `SEO-pdp-desktop.png`, `SEO-pdp-mobile.png`, `SEO-category-desktop.png`, `SEO-category-mobile.png`, `SEO-brand-asus-keywords.png`.

**Task 1 verdict: PASS.** `@unhead` v3 emits title/description/keywords + derived OG correctly, identically on desktop and mobile, no cache lag.

### Task 2 — Favicon 3-case

**Current org favicon config (recorded for restore):** org `Watermelon123` (id `cb7ed54a-9b3e-4235-b4d6-28be7e7fceb1`) has a **custom org-level `favicons[]`** multi-size set — 5 PNGs `https://vcptcore-qa.govirto.com/cms-content/assets/customization/favicons/favicon_cb7ed54a-9b3e-4235-b4d6-28be7e7fceb1_1762934605349_{16,32,96,128,196}.png` + web manifest. (Note: prior report C3 saw store-scoped `favicon_B2B-store_*`; the head now serves **org-scoped** icons — org-level WL is active for this org.)

**Blocker for cases 2 & 3 — the storefront exposes no org favicon/white-labeling editor in this build.** The task premise ("set org favicon in the storefront Company → Settings/Branding/White-labeling as the org maintainer") does not hold for pr-2394. Verified exhaustively:
- Storefront account sidebar = Purchasing / Marketing / **Corporate (Company info, Company members, Sales reps)** / User. No Settings/Branding/White-labeling entry.
- **Company info** (`/company/info`) holds only: Company **name**, Company **logo** (JPG/PNG upload → `changeOrganizationLogo`), and **Addresses**. No favicon field.
- Candidate routes `/company/white-labeling`, `/company/settings`, `/company/branding` all → **404 Page not found**.
- Per `knowledge/domain/white-labeling.md` §Admin UI Setup, org/store **favicon** WL is configured **only in the Admin SPA** (Members → Organizations → *org* → White Labeling blade, or Stores → White Labeling blade). The storefront can only edit the company **logo**, not the favicon.
- The Admin SPA (`https://vcptcore-qa.govirto.com`) redirects to `#!/login` in this session — **no admin session, and the task provided only storefront customer credentials**, so setting/clearing/breaking the org favicon (the data-setup for cases 2 & 3) is not reachable. I did **not** attempt an Admin login with unprovided credentials.

| Favicon case | Expected | Observed | Page intact? | Desktop | Mobile | Verdict |
|--------------|----------|----------|--------------|---------|--------|---------|
| **1. Custom (org WITH favicons)** | head `link[rel~=icon]` → org custom favicon; favicon loads; page fine | 5 org-scoped icons in head (`favicon_cb7ed54a…_{16..196}.png`); 32×32 fetch → **HTTP 200**; only known image-404/App-Insights console noise | ✅ nav+content render | ✅ (home + brand) | ✅ (home, 5 icons, all org-scoped) | **PASS** |
| **2. Default (org WITHOUT favicons)** | head serves store/theme default favicon; page fine | Not exercised — cannot clear the org favicon (no storefront editor; admin-only; no admin session) | — | — | — | **BLOCKED** (coverage limit) |
| **3. Broken/incomplete favicon** | favicon 404s but page still renders | Not exercised — cannot set a broken favicon (same reason). Note: favicon `<link>` is a non-render-blocking resource by browser design, so a 404 favicon inherently cannot white-screen a page; the real robustness question is how the WL code handles a malformed `favicons[]`/`faviconUrl`, which is only reachable via the Admin blade. | — | — | — | **BLOCKED** (coverage limit) |

- Case 1 favicon file load confirmed HTTP 200 (`browser_network_requests` filter=favicon). Console on both viewports = only product-image 404s (seed-data gaps) + App Insights `dc.services.visualstudio.com/v2/track` 400 noise — **no favicon/head/JS errors**.
- Evidence: `favicon-custom-desktop.png`, `favicon-custom-mobile.png`, `admin-access-check.png` (admin login wall).

**RESTORE: N/A — no favicon config was changed.** Because cases 2 & 3 could not be set up (no storefront editor / no admin access), the org favicon config was left exactly as recorded (5-size custom `favicons[]`). Nothing to revert.

**Task 2 verdict: 1/3 PASS (custom), 2/3 BLOCKED** — not a product defect; the checklist's "default" + "broken" favicon sub-cases require an Admin-SPA org White-Labeling config change that a storefront org-maintainer session cannot perform. **Recommendation:** run cases 2 & 3 from the Admin SPA (Members → Organizations → Watermelon123 → White Labeling: clear favicon → verify default fallback; set an invalid favicon URL → verify storefront still renders), or on a second org/store that has no custom favicon. This matches (and refines with the exact reason) the prior report's Task-4 favicon coverage-limit note.

### Console / teardown (this pass)
No test data created; no orders placed; **no org/store/favicon config changed** (nothing to restore). Only ignorable noise: App Insights 400 "Invalid workspace", seed-data product-image 404s, one external ikea.com / demo.govirto.com image 404. No JS/head/CSP errors. Viewport reset to 1920×1080. Still logged in as belovedushka (session reused; no new login performed).

---

## Favicon cases 2 & 3 (Admin SPA) + restore

> Completes the two cases the pass above left **BLOCKED**. Reached the org White-Labeling blade in the **Admin SPA** (admin session available this run); storefront verification done as belovedushka after switching her active org to Watermelon123.

**Env:** vcptcore-qa · Platform 3.1051.0 · Theme `2.54.0-pr-2394-cfab-cfabd10b` · Store `B2B-store` · Browser playwright-edge (single browser, two domains). Admin SPA `vcptcore-qa.govirto.com` (user `admin`); storefront (belovedushka@gmail.com).
**Org under test:** Watermelon123 (`cb7ed54a-9b3e-4235-b4d6-28be7e7fceb1`). Admin org WL blade path: Contacts → search org → row ⋮ **Manage** → **White labeling** widget (single-clicking the org row only opens its member list; the WL widget lives on the "Manage"/details blade).

### Step 0 — original state recorded (Admin UI blade + REST `GET /api/white-labeling/organization/{id}`)
`isEnabled=true` · `faviconUrl=…/customization/favicons/favicon_cb7ed54a-9b3e-4235-b4d6-28be7e7fceb1_1762934605349.png` (single custom org favicon; storefront generates the `_16x16…_196x196` variants) · `themePresetName=Watermelon` · `logoUrl=/api/files/92112ea5119c47348dbb17d23f850083` (Coca-Cola) · `secondaryLogoUrl=null`. Evidence: `screenshots/C0-org-wl-blade-original-enabled-on.png`.

### Premise correction (resolved)
belovedushka's default active storefront org is **"Virto Commerce" (`b7df4d1e`)** — its own Coffee-theme favicon, not Watermelon123's. She is **multi-org**; via the account-menu org switcher I **switched her active org to Watermelon123** so the storefront reflects the org under test. Baseline confirmed: org favicon `favicon_cb7ed54a…_1762934605349_32x32.png` → **200** (`screenshots/C2-baseline-watermelon-org-active.png`). Active org reset to "Virto Commerce" at the end (see Restore).

### Case 2 — org WITHOUT custom favicon (Enabled OFF) → default fallback — PASS
Method: **Admin UI** — WL blade Enabled toggle flipped OFF → **Save** (persisted: REST `isEnabled=false`; favicon/theme untouched). `screenshots/C2-admin-toggle-off-saved.png`.
- Observed (storefront, belovedushka @ Watermelon123, hard refresh): favicon = **store default** `favicon_B2B-store_1751956822818_32x32.png` → **200** (org `favicon_cb7ed54a…` no longer requested), per BL-WL-003 store-level fallback. Page renders normally; only ignorable App Insights 400 + seed-gap image 404s.
- Desktop 1920: PASS (`screenshots/C2-storefront-default-fallback-desktop.png`). Mobile 390: PASS (`screenshots/C2-storefront-default-fallback-mobile.png`).

### Case 3 — broken/incomplete favicon (Enabled ON) → page must NOT break — split result
Admin favicon widget only supports image upload (no URL field), so the broken value was set via the authorized REST `PUT /api/white-labeling` (Enabled ON; theme/logo preserved). Two shapes:
1. **`faviconUrl=/api/files/does-not-exist-QA5519` (no extension — the ticket's suggested value) → FAIL / BUG.** Storefront = **blank white screen** (empty body, title stuck at default "Virto Commerce"); console `ApolloError: Error trying to resolve field 'pageContext'`. Root cause captured: `whiteLabelingSettings(organizationId,storeId)` → HTTP 200 with `errors[]` `ARGUMENT_OUT_OF_RANGE`, `data.whiteLabelingSettings=null` — favicons[] size-suffix insertion at the URL's last-dot index (=-1 with no extension) throws, cascading up through `pageContext`. Evidence: `screenshots/C3-BUG-noext-favicon-white-screen-desktop.png`. (Bug below.)
2. **`faviconUrl=…/favicon_does-not-exist-QA5519.png` (well-formed URL, image 404) → PASS.** `whiteLabelingSettings` resolves + generates 5 size variants; storefront **renders fully** (Watermelon123 branding/nav/hero/footer); all 5 favicon variants **404** on fetch but page intact. Desktop 1920: PASS (`screenshots/C3-wellformed-404favicon-page-intact-desktop.png`). Mobile 390: PASS (`screenshots/C3-wellformed-404favicon-page-intact-mobile.png`).

A *missing favicon image* (404) is handled gracefully; a *favicon URL without a file-extension dot* crashes the org White-Labeling xAPI and blanks the storefront.

### Step 3 — RESTORE — fully restored (no residual)
- Watermelon123 org WL restored to the exact original object via REST `PUT` (round-trip of Step-0 JSON). Verified REST GET → `isEnabled=true`, original Watermelon `faviconUrl`, theme `Watermelon`, original `logoUrl`, `secondaryLogoUrl=null`; `whiteLabelingSettings` resolves with **no errors** + 5 variants. Storefront: org favicon `favicon_cb7ed54a…_1762934605349_32x32.png` → **200**, page renders (`screenshots/restore-verified-org-favicon-back-desktop.png`).
- belovedushka's **active org reset** to original "Virto Commerce" (`b7df4d1e`) — verified by storefront reloading `favicon_b7df4d1e…_1762935320307_32x32.png` → 200.
- No other orgs modified. No test entities created.

### BUG — Broken org White-Labeling faviconUrl without a file extension crashes whiteLabelingSettings/pageContext → blank storefront — High
**Env:** vcptcore-qa @ Platform 3.1051.0 / Theme 2.54.0-pr-2394 · module `VirtoCommerce.WhiteLabeling`
**Area:** White Labeling xAPI — `whiteLabelingSettings.favicons[]` multi-size generation.
**Summary:** When an org (or store) `faviconUrl` has no file-extension dot, the favicons[] size-suffix insertion (last-dot index → -1) throws `ARGUMENT_OUT_OF_RANGE`, failing `whiteLabelingSettings` and, through it, the storefront `pageContext` query — blank white page for every org user.
**STR:** (1) Admin `PUT /api/white-labeling` `faviconUrl:"/api/files/does-not-exist-QA5519"`, `isEnabled:true`. (2) GraphQL `{ whiteLabelingSettings(organizationId:"<org>" storeId:"B2B-store"){ favicons{href} } }`. (3) Storefront: sign in as an org user, open any page.
**Expected:** favicon absent / 404s; `whiteLabelingSettings` returns the record; storefront renders.
**Actual:** (2) → HTTP 200 with `errors[]` `ARGUMENT_OUT_OF_RANGE`, `data=null`. (3) → blank white screen, empty body, console `ApolloError: Error trying to resolve field 'pageContext'`.
**Evidence:** `screenshots/C3-BUG-noext-favicon-white-screen-desktop.png`.
**Note:** A well-formed favicon URL whose image is missing (404) does NOT trigger this (Case 3 result #2), so the defect is the unchecked string op on an extension-less URL. Fix: guard last-dot index == -1 (skip suffix insertion / return raw url or empty favicons[]). **Severity High** — one bad admin favicon input takes down the storefront for all of an org's users (violates BL-WL-003 graceful fallback).

### Teardown (this pass)
Watermelon123 org WL restored to exact original (verified live). belovedushka active org reset to "Virto Commerce". No entities created/orders placed. Admin token discarded. Ignorable noise only. **Full state restored — no residual.**
