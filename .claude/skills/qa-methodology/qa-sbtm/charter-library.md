# Exploratory Charter Library

Ready-to-use charters for common Virto Commerce exploratory scenarios. Each follows the SBTM charter template from `session-based-testing.md` § 2 and includes 8–10 starter test ideas.

To use: copy the charter, fill in `{YYYY-MM-DD}`, set the Risk Level from `/qa-risk`, replace placeholder env vars with `{{FRONT_URL}}` / `{{BACK_URL}}` from `.env`. Resolve test data per the [live-discovery decision tree](../../../agents/knowledge/live-discovery.md) — `@td(ALIAS.field)` for specific assertion targets, `live-discover` for "any product / any address" navigation, `random-data` for unique throwaway inputs. Project-wide policy in [`.claude/rules/test-data.md`](../../../rules/test-data.md) — never hardcode IDs/SKUs/prices.

| # | Charter | Domain | Risk | Recommended persona |
|---|---------|--------|------|---------------------|
| [A](#charter-a--checkout-edge-cases) | Checkout Edge Cases | Storefront | Critical | Impatient Buyer |
| [B](#charter-b--b2b-procurement-workflow) | B2B Procurement Workflow | Storefront | High | B2B Procurement Officer |
| [C](#charter-c--admin-panel-resilience) | Admin Panel Resilience | Admin SPA | High | Session-Corrupted User |
| [D](#charter-d--api-edge-cases) | API Edge Cases | GraphQL + REST | High | Malicious User |
| [E](#charter-e--feature-flag-lifecycle) | Feature Flag Lifecycle | Cross-cutting | High | — |
| [F](#charter-f--performance--resource-stress) | Performance & Resource Stress | Cross-cutting | High | Impatient Buyer |
| [G](#charter-g--accessibility-exploratory) | Accessibility Exploratory | Storefront | Medium-High | Screen-Reader User |
| [H](#charter-h--i18n--localization) | i18n / Localization | Storefront | Medium | — |
| [I](#charter-i--mobile-gesture-specific) | Mobile Gesture-Specific | Storefront | Medium-High | Impatient Buyer |
| [J](#charter-j--search-relevance--quality) | Search Relevance & Quality | Storefront | High | — |
| [K](#charter-k--cache--state-drift) | Cache & State Drift | Cross-cutting | High | Session-Corrupted User |

---

## Charter A — Checkout Edge Cases

```
## Exploratory Session Charter
- Charter ID: EXP-{YYYY-MM-DD}-CHK
- Type: Edge-Case
- Mission: Explore checkout flow boundary conditions and error recovery
  to discover payment failures, calculation errors, and state corruption
- Focus Area: Cart -> Shipping -> Payment -> Confirmation
- Heuristic: CRISP (Reliability + Integrity focus) + FAILURE-F (Flow)
- Tour: Complexity Tour + Saboteur Tour
- Persona: Impatient Buyer (alt: Session-Corrupted User)
- Time Box: 30 minutes
- Risk Level: Critical (revenue path)
- Environment: {{FRONT_URL}}
```

**Test ideas:**
- Expired session mid-payment (let session timeout, then click "Pay")
- Back button after payment submit (does it double-charge? cross-ref §4.1 in `modern-web-attack-surface.md`)
- Duplicate payment click (rapid double-click on submit)
- Network timeout during payment processing (throttle to offline mid-request)
- Address validation edge cases (PO Box, APO/FPO, very long address lines)
- Coupon code at boundary (apply max discount, apply expired code, apply code twice)
- Cart modification during checkout (open second tab, remove item, return to payment)
- Zero-quantity line item (modify quantity to 0 via URL parameter or API)
- Switch payment processor mid-flow (CyberSource embedded vs Skyflow redirect vs Datatrans modal — different flows per `feedback_payment_flow_learnings`)
- Place order with stale cart (sale ended, price changed between cart view and confirm)

---

## Charter B — B2B Procurement Workflow

```
## Exploratory Session Charter
- Charter ID: EXP-{YYYY-MM-DD}-B2B
- Type: Workflow
- Mission: Explore the B2B-specific procurement journey for workflow
  integrity to discover approval chain breaks and role-based access issues
- Focus Area: Catalog -> Quote Request -> Approval -> Order -> Fulfillment
- Heuristic: SFDPOT (Function + Operations focus) + FAILURE-U (User scenarios)
- Tour: Scenario Tour + Soap Opera Testing
- Persona: B2B Procurement Officer
- Time Box: 30 minutes
- Risk Level: High (core B2B differentiator)
- Environment: {{FRONT_URL}}
```

**Test ideas:**
- Multi-level approval chain (request quote as buyer, approve as manager, confirm as admin)
- Rejected quote re-submission (reject, modify quantities, re-submit — does history persist?)
- Partial fulfillment (fulfill 3 of 5 items — order status, inventory update, buyer notification)
- Order modification after approval (can buyer change quantities post-approval?)
- Role-based visibility (buyer sees own quotes only, manager sees team quotes, admin sees all)
- Organization switching mid-flow (start quote in Org A, switch to Org B — cart state?)
- Approval timeout (what happens if approver never acts?)
- Concurrent approvals (two managers approve the same quote simultaneously)
- B2B line-item consolidation: add same product twice — verify single line item with summed qty per `reference_b2b_lineitem_consolidation`
- Contract-pricing override: order an item with a negotiated price — verify contract wins over catalog price

---

## Charter C — Admin Panel Resilience

```
## Exploratory Session Charter
- Charter ID: EXP-{YYYY-MM-DD}-ADM
- Type: Risk
- Mission: Explore Admin SPA under stress conditions and unusual inputs
  to discover data corruption, UI crashes, and error handling gaps
- Focus Area: Product management, order management, user management
- Heuristic: CRISP (Security + Reliability focus) + FAILURE-I (Inputs)
- Tour: Data Tour + Obsessive-Compulsive Tour
- Persona: Session-Corrupted User (alt: Malicious User)
- Time Box: 30 minutes
- Risk Level: High (admin operations affect all customers)
- Environment: {{BACK_URL}}
```

**Test ideas:**
- Bulk operations with 100+ items (select all, bulk delete, bulk price change)
- Concurrent admin edits (two browser tabs editing the same product simultaneously — §2.4 in `modern-web-attack-surface.md`)
- Very long field values (product name with 500 characters, description with 10,000 characters)
- Special characters in all text fields (Unicode, angle brackets, SQL keywords, null bytes)
- Rapid pagination (click next page repeatedly without waiting for load)
- Filter combinations (apply 5+ filters simultaneously, then clear one at a time)
- Export of large datasets (export 10,000 products to CSV — timeout? memory?)
- Unsaved changes navigation (edit product, navigate away without saving — warning?)
- Role-change reflection: change a user's role in Admin → verify storefront permissions update without re-login (cross-ref `feedback_admin_permissions_via_roles`)
- Stale admin-SPA cache after deploy: open after a backend module update — verify version banner or auto-reload (cross-ref `feedback_mcp_browser_cache`)

---

## Charter D — API Edge Cases

```
## Exploratory Session Charter
- Charter ID: EXP-{YYYY-MM-DD}-API
- Type: Edge-Case
- Mission: Explore GraphQL xAPI and REST API boundary conditions
  to discover input validation gaps, error handling issues, and data leaks
- Focus Area: xCart, xCatalog, xOrder mutations and queries
- Heuristic: SFDPOT (Data + Time focus) + FAILURE-A (Authorization)
- Tour: Data Tour + Antagonistic Tour
- Persona: Malicious User
- Time Box: 30 minutes
- Risk Level: High (API serves all frontend clients)
- Environment: {{FRONT_URL}}/graphql and {{BACK_URL}}/api
```

**Test ideas:**
- Malformed GraphQL queries (missing closing braces, invalid field names, syntax errors)
- Missing required fields in mutations (submit addToCart without productId)
- Extra unknown fields in requests (does API reject or silently ignore?)
- Deeply nested queries (10+ levels of nested objects — performance? stack overflow?)
- Pagination boundaries (page 0, page -1, page MAX_INT, pageSize 0, pageSize 10000)
- Empty arrays in mutations (submit order with empty lineItems array)
- Null values in required mutation fields (explicitly pass null for required fields)
- Expired auth tokens (use token from 25 hours ago — error message? status code?)
- Rate limiting behavior (send 100 requests in 1 second — does rate limit engage?)
- Mixed valid/invalid items in batch operations (bulk add 5 products, 2 with invalid SKUs)
- IDOR: query someone else's cart by ID; create xQuote against an org you don't belong to
- Field-name typo silent acceptance: `POST /api/catalog/products/configurations` with `configurationSections` instead of `sections` (cross-ref `reference_configurations_post_body`)
- `addItem` async settle: verify `data.addItem.items[]` empty response is handled correctly downstream (cross-ref `reference_additem_async_settle`)

---

## Charter E — Feature Flag Lifecycle

```
## Exploratory Session Charter
- Charter ID: EXP-{YYYY-MM-DD}-FLAG
- Type: Feature
- Mission: Explore feature flags (store settings, module toggles, date-bounded promotions)
  to discover state inconsistencies, boundary failures, and combination conflicts
- Focus Area: Store settings, Admin feature toggles, Promotion/coupon validity windows
- Heuristic: SFDPOT (Time + Operations focus), Feature Flags sub-dimension
- Tour: Feature Tour + Claims Tour
- Time Box: 30 minutes
- Risk Level: High (flag misconfiguration silently disables revenue-critical features)
- Environment: {{BACK_URL}} (Admin SPA) + {{FRONT_URL}} (Storefront)
```

**Test ideas — On/Off State:**
- Disable a storefront feature in Admin (e.g., "Coupons enabled") → verify storefront hides the section AND the API returns no data
- Enable the same feature → verify it reappears without a page reload requirement
- Toggle a flag mid-session: user is on the coupons page; admin disables coupons; user refreshes — what happens?
- Disable a module-level flag for one store only; verify second store is unaffected
- Check for cache effects: toggle flag, immediately navigate to storefront — stale data visible?

**Test ideas — Start Date / End Date Boundaries:**
- Create a promotion with `start_date = T+1 day` → confirm it is NOT visible or applicable today
- Set system clock (or use a dated coupon code) to exactly `T+0 00:00:00` → confirm activation at exact boundary
- Set `end_date = today 23:59:59` → verify feature is active at 23:59:58 and inactive at 00:00:00 next day
- Create a promotion with `start_date == end_date` (single-day window) → does it activate and expire correctly?
- Create a promotion with `start_date > end_date` (inverted) → how does Admin validate it? How does storefront handle it?
- Verify timezone interpretation: if Admin timezone is UTC+3 and server is UTC, confirm which clock controls activation
- Apply a coupon code for a not-yet-started promotion → expected: "promo not yet active" error, not "invalid code"
- Apply a coupon code one day after `end_date` → expected: "promo expired" error distinguishable from "invalid code"

**Test ideas — Flag Combinations:**
- Two promotions active simultaneously, both applying to the same cart item — which discount wins? (BestRewardPromotionPolicy prefers coupon-backed per `project_promotion_engine`)
- A store-level "Promotions enabled = off" flag vs. an individual promotion that is "active" — which takes precedence?
- B2B org-specific pricing flag off + storefront promotion flag on — what price does the cart show?
- Disable a parent module flag (Marketing) — verify all child toggles (Coupons, Loyalty, Banners) are also inactive
- A/B test flag for new checkout design + feature flag for new payment method — test all four combinations

---

## Charter F — Performance & Resource Stress

```
## Exploratory Session Charter
- Charter ID: EXP-{YYYY-MM-DD}-PERF
- Type: Risk
- Mission: Explore performance under realistic stress to discover memory leaks,
  long tasks, render-blocking operations, and resource exhaustion failures
- Focus Area: Catalog listing, PDP, cart, search results
- Heuristic: CRISP (Performance focus) + Whittaker Obsessive-Compulsive Tour
- Tour: Complexity + Obsessive-Compulsive
- Persona: Impatient Buyer
- Time Box: 30 minutes
- Risk Level: High (performance regressions cause conversion loss)
- Environment: {{FRONT_URL}}, browser DevTools Performance panel
```

**Test ideas:**
- Open a category page with 100+ products, scroll to the bottom; check for layout shifts (CLS) and slow image loads
- Add 50 items to cart one at a time; track main-thread time per add via `performance_start_trace`
- Open and close the same modal 50 times; take heap snapshots before and after (§7.1 in `modern-web-attack-surface.md`)
- Run a Lighthouse audit on the homepage, PDP, cart, checkout (`mcp__Chrome_DevTools__lighthouse_audit`)
- Stress search: type rapid characters in the search box (`a`, `ab`, `abc`...); verify debounce holds and only one in-flight request
- Long-form description PDPs: load a product with 5000-word description; check render time and scroll smoothness
- Apply 10 filters simultaneously on catalog; measure response time
- Capture a performance trace during checkout end-to-end (`performance_analyze_insight`); identify any long tasks
- Watch console + network during a 5-minute idle on the cart page; check for polling that escalates or leaks
- Test the catalog with B2B virtual catalog root (`fc596540864a41bf8ab78734ee7353a3` per `feedback_storefront_virtual_catalog_link`); confirm faceted-search response under load

---

## Charter G — Accessibility Exploratory

```
## Exploratory Session Charter
- Charter ID: EXP-{YYYY-MM-DD}-A11Y
- Type: Feature
- Mission: Explore accessibility beyond automated axe-core checks; find issues
  that programmatic tools miss (focus order, ARIA misuse, live-region noise)
- Focus Area: Critical paths — sign-in, PDP, cart, checkout, account dashboard
- Heuristic: HICCUPPS-F (Standards) + Whittaker Tourist Tour
- Tour: Tourist + Garbage Collector
- Persona: Screen-Reader User
- Time Box: 30 minutes
- Risk Level: Medium-High (legal/regulatory exposure)
- Environment: {{FRONT_URL}}, theme=Coffee (only theme that passes WCAG per `feedback_a11y_coffee_only`)
```

**Test ideas:**
- Tab through every page in the critical path; record the focus order; flag any element that gets focus but shouldn't, or vice versa
- Run a screen reader (NVDA on Windows or DevTools accessibility tree); listen to the entire sign-in flow
- Open every modal, popover, and dialog; verify focus moves in on open and out on close; press Esc to verify it closes cleanly
- Submit a form with an invalid field; verify the error is announced to AT users and focus moves to the first error
- Check icon-only buttons for accessible names (cart icon, search icon, account icon, language switcher)
- Verify color contrast on dynamic states (hover, focus, disabled, error) — not just default
- Check live regions: add to cart, apply coupon, remove from cart — does the AT announce?
- Test reduced-motion: enable `prefers-reduced-motion` (§5.3 in `modern-web-attack-surface.md`); verify carousels still work
- Check `lang` attribute on `<html>` and on any switched-language content
- Run axe-core via `/qa-accessibility` skill for the same pages; compare findings with what you found manually

---

## Charter H — i18n / Localization

```
## Exploratory Session Charter
- Charter ID: EXP-{YYYY-MM-DD}-I18N
- Type: Feature
- Mission: Explore localization (language, currency, region) for layout breaks,
  truncation, RTL issues, and locale-formatting bugs
- Focus Area: Storefront in all supported languages and currencies
- Heuristic: CRISP (Consistency) + FAILURE-L (Language/locale)
- Tour: Feature Tour
- Time Box: 30 minutes
- Risk Level: Medium (depends on configured locales for the store)
- Environment: {{FRONT_URL}} with all enabled languages + currencies
```

**Test ideas:**
- Switch language mid-cart; verify cart contents survive and re-label correctly
- Switch currency mid-cart; verify line totals re-convert (or refuse to switch — both can be correct, depends on BL)
- Long-word locales: German compound words (e.g., `Geschwindigkeitsbegrenzung`); verify nav doesn't wrap to 4 lines
- RTL locales (Arabic, Hebrew): verify mirrored layout, correct direction of carousel arrows, correct order of breadcrumbs
- Locale-specific number formats: `1.234,56` (German), `1,234.56` (US), `1 234,56` (French)
- Locale-specific date formats: `DD/MM/YYYY` vs `MM/DD/YYYY` vs ISO; verify forms accept the locale format
- Timezone-sensitive features: schedule a promotion in user timezone vs server timezone; verify activation per `Charter E` boundaries
- Currency display: test currencies with no decimal places (JPY, KRW); test currencies with 3 decimals (KWD); verify rounding policy
- Missing translation fallback: switch to a language where a string is untranslated; verify English fallback (not `[missing.key]`)
- Print a checkout confirmation in a non-default locale; verify print stylesheet handles RTL correctly (§5.5 in `modern-web-attack-surface.md`)

---

## Charter I — Mobile Gesture-Specific

```
## Exploratory Session Charter
- Charter ID: EXP-{YYYY-MM-DD}-MOB
- Type: Feature
- Mission: Explore mobile-specific gestures, viewport behavior, and touch UX
  to discover gesture conflicts, viewport overflow, and touch-target issues
- Focus Area: Storefront at 375px viewport
- Heuristic: SFDPOT (Platform focus) + Whittaker Supermodel Tour
- Tour: Supermodel + Scenario
- Persona: Impatient Buyer
- Time Box: 30 minutes
- Risk Level: Medium-High (mobile revenue share)
- Environment: {{FRONT_URL}} resized to 375x812 (iPhone 13), then 768x1024 (iPad)
```

**Test ideas:**
- Verify hamburger menu enumerates all top-nav items + any controls that were in the desktop header (cross-ref `feedback_mobile_hamburger_inventory`)
- Touch targets: every tappable element must be ≥44x44 px (WCAG 2.5.5)
- Pinch-zoom: verify viewport allows zoom (no `user-scalable=no`)
- Swipe gestures on PDP image carousel: swipe left/right; verify it doesn't trigger nav drawer
- Swipe gestures on category filters: verify they don't conflict with horizontal scroll of facet chips
- Pull-to-refresh: verify it doesn't trigger inside scrollable modals
- Orientation change: rotate landscape mid-checkout; verify form state preserved
- Soft-keyboard overlay: focus a field at the bottom of a form; verify the field stays visible above the keyboard
- Mobile autofill: trigger browser autofill for address; verify all fields populate correctly (§5.1)
- Browser back gesture (iOS edge swipe): verify it doesn't accidentally trigger during a horizontal-scroll interaction

---

## Charter J — Search Relevance & Quality

```
## Exploratory Session Charter
- Charter ID: EXP-{YYYY-MM-DD}-SEARCH
- Type: Feature
- Mission: Explore search beyond happy-path queries to discover relevance gaps,
  facet inconsistencies, and result-set anomalies
- Focus Area: Storefront search ({{FRONT_URL}}/search?q=) + facets + auto-suggest
- Heuristic: HICCUPPS-F (User expectations) + CRISP (Consistency)
- Tour: Data Tour + Tourist Tour
- Time Box: 30 minutes
- Risk Level: High (search drives discovery; relevance impacts conversion)
- Environment: {{FRONT_URL}}, current product catalog
```

**Test ideas:**
- Misspelled queries: search "laptp" — does fuzzy match return "laptop" products?
- Synonyms: "PC" vs "computer" vs "desktop" — do they return overlapping result sets?
- Empty query: hit search with `?q=` (empty); does it show all products, a prompt, or an error?
- Single-character query: `?q=a` — does it return everything starting with 'a', or rate-limit too-short queries?
- Numeric query: `?q=2024` — does it search SKUs, names, descriptions, or all?
- Special characters: `?q=<script>alert(1)</script>` — XSS probe and graceful handling
- Long query: 500-character search term — performance and graceful handling
- Multi-language query: search in a non-default language — does it work or fail silently?
- Result sort: sort by Price ascending then descending; verify pagination doesn't lose the sort
- Facet combinations: apply 3 facets (Brand + Price range + In-stock); remove one — verify result count and other facets update
- Auto-suggest: type 3 characters; verify suggestions appear and clicking one navigates correctly
- No results: search for `?q=zzzzzzz`; verify a helpful empty state, not a blank page
- Pagination beyond results: navigate to page 999 of a 5-page result set
- B2B virtual catalog scoping: verify search results are scoped to the user's virtual catalog (per `feedback_storefront_virtual_catalog_link`)

---

## Charter K — Cache & State Drift

```
## Exploratory Session Charter
- Charter ID: EXP-{YYYY-MM-DD}-CACHE
- Type: Risk
- Mission: Explore cache layers (Apollo, ServiceWorker, HTTP, localStorage)
  for staleness, corruption, and recovery failures
- Focus Area: Cross-cutting — wherever state is stored client-side
- Heuristic: SFDPOT (Operations + Time focus) + Saboteur Tour
- Tour: Saboteur + Bad Neighborhood
- Persona: Session-Corrupted User
- Time Box: 30 minutes
- Risk Level: High (cache bugs are silent and persistent)
- Environment: {{FRONT_URL}} + DevTools
```

**Test ideas:**
- After a deploy, force-refresh and verify the build version updates (DevTools → Application → Service Workers → Update on reload)
- Modify localStorage `cartId` to a random GUID; reload; verify graceful recovery (§3.2 in `modern-web-attack-surface.md`)
- Delete the auth cookie without logging out; verify the next action redirects cleanly
- Apollo cache after `addItem`: verify cart query refetches and updates UI (cross-ref `reference_additem_async_settle`)
- Two tabs with the same cart: edit in Tab A, observe Tab B's state on next action; verify reconciliation or stale-state warning
- Sign out in Tab A; verify Tab B detects within 1 minute (or on next user action)
- After a backend module redeploy (e.g., hotfix), confirm admin SPA shows the new version without hard refresh
- Apollo error after a successful mutation: simulate a `500` response to a follow-up query; verify the mutation's optimistic UI doesn't roll back to a wrong state
- Test ApolloError on cart shipment for a legacy-cart user; verify it's recognized as stale-data, not a code bug (cross-ref `feedback_apollo_cart_shipment_stale_data`)
- ServiceWorker self-update: deploy a new build mid-session; verify the next navigation prompts an update or hot-swaps

---

## See also

- [session-based-testing.md](session-based-testing.md) — Core SBTM framework, charter template, debrief process
- [adversarial-heuristics.md](adversarial-heuristics.md) — Whittaker tours, FAILURE, Soap Opera, HICCUPPS-F referenced by these charters
- [personas.md](personas.md) — Personas referenced in each charter
- [modern-web-attack-surface.md](modern-web-attack-surface.md) — Probe library used by Charters F, G, K
- [../../../agents/knowledge/vc-bug-catalog.md](../../../agents/knowledge/vc-bug-catalog.md) — VC historical bugs; many charters reference specific entries
- [../../../rules/test-data.md](../../../rules/test-data.md) — `@td()` resolver policy; charters must resolve test data, not hardcode
- [../../../agents/knowledge/live-discovery.md](../../../agents/knowledge/live-discovery.md) — Decision tree + JS recipes for `live-discover` / `random-data` / `@td()`; required reading when a charter needs runtime data resolution
