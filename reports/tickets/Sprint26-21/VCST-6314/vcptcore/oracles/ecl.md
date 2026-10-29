# ECL edge cases — extract (10 of 54)

> Verbatim slice of `.claude\knowledge\oracles\e-commerce-edge-cases-library.md`, produced by `npm run ecl:extract -- --chapter 7,12,13,15`.
> **This is a SUBSET.** Sections outside the filter are not shown and are not absent — if the
> task turns out to touch another chapter, extract that too rather than concluding no edge case
> applies. The `ECL-N.M` ids are the citation contract `Edge_Case_Refs` uses; cite them, do not
> renumber. A pattern's `[OBSERVED]` / `[THEORETICAL]` status is part of the row — an observed
> pattern has been seen in this product, a theoretical one has not.

**Included:** ECL-7.1, ECL-7.2, ECL-7.3, ECL-7.4, ECL-12.1, ECL-12.2, ECL-13.1, ECL-13.2, ECL-13.3, ECL-15.1

---

### 7.1 Browser & Device Issues

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Mobile viewport checkout misalignment** | Payment button hidden below fold; user thinks button doesn't exist | Low-Medium | Abandonment | [OBSERVED] |
| **Autocomplete overwrites form fields** | Browser autocomplete fills in wrong address; user doesn't notice | Low-Medium | Wrong shipping address | [OBSERVED] |
| **JavaScript disabled** | The storefront is a single-page application whose entry document ships an empty mount element and a module script with no `noscript` fallback, so with JS disabled or blocked the page renders nothing at all — there is no form to submit and no message explaining why | Low | Blank page, no diagnosable error | [OBSERVED] |
| **Cached page stale data** | User back-buttons to checkout page; sees old prices/inventory | Low-Medium | Checkout with stale state | [OBSERVED] |
| **Third-party script blocking** | Ad blocker or privacy tool blocks payment script | Low-Medium | Silent payment failure | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27) — §7.1. **Row 3** only: the old description ("form submits but nothing happens", "404 or confusing error") is a server-rendered-form symptom that cannot arise on this platform. The storefront entry document mounts an empty element and loads a module script with no `noscript` fallback, and the served HTML confirms no `noscript` element is present, so the JS-disabled symptom is a blank page rather than a broken submit. Rows 1, 2, 4 and 5 confirmed unchanged; note that row 1 is mitigated for the checkout CTA specifically by a sticky bottom bar that duplicates the order button at narrow widths, and that row 2's mechanism is anchored in the address form declaring no `autocomplete` attribute on its text inputs.

---

### 7.2 Form Input Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Paste into form field triggers validation twice** | Paste + change event fires validation before user expects | Low | Confusing error states | [OBSERVED] |
| **Special characters silently truncated rather than rejected** | Name and address fields validate on length only — no character-class regex exists — so apostrophes, hyphens and diacritics are accepted verbatim, and the real risk is a long name being cut at the field's max length with no warning that the stored value differs from what was typed | Low | Wrong name on the order/shipment | [OBSERVED] |
| **Numeric field accepts leading zeros** | User types "01234" for house number; system treats as octal | Low | Address validation issue | [THEORETICAL] |
| **Required field validation off-screen** | Error message for required field not visible; user thinks form is complete | Low-Medium | Stuck on checkout | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27) — §7.2. **Row 2** only: "rejected by regex" has no code path — the shared UI-kit input declares no `pattern` attribute and every form field rule is length-and-required only, and a name containing both an apostrophe and a diacritic was accepted verbatim live. The reachable failure shape is silent max-length truncation, so the description and Impact were rewritten to name it. Rows 3 and 4 confirmed unchanged (numeric coercion applies only to explicitly numeric inputs, so a leading zero in a postal code is preserved as text; required fields are marked and gate submission, which is what makes an off-screen error reachable on a long form at narrow widths). **Row 1 was NOT confirmed** and is recorded in `reports/ba/ecl-proposals-2026-08-27.md`: its described double-validation-on-paste has no code path here, but absence of a mechanism is not evidence the pattern never occurred, so its `[OBSERVED]` marker is a status question for a human rather than an auto-apply.

---

### 7.3 Loading States & Race Conditions

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Double-click checkout button** | User sees slow load, clicks "Place Order" twice | Medium | Duplicate order | [OBSERVED] |
| **Loading spinner doesn't disable button** | User clicks button during loading; multiple requests sent | Low-Medium | Duplicate order/payment | [OBSERVED] |
| **Modal doesn't prevent interaction** | User clicks element behind loading modal; unexpected action triggered | Low | Confusing behavior | [OBSERVED] |

### 7.4 Mobile & Responsive Layout Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Above-the-fold element hidden at narrow widths** | A logo, CTA, or nav control that renders correctly on desktop is clipped, overlapped, or pushed off-screen at or below the narrowest declared breakpoint in the storefront's breakpoint scale (`BREAKPOINTS.xs` in the UI-kit constants — do not transcribe the value, read it from there; common device widths sit below it). Some flows mitigate this with a sticky bar that re-pins the primary CTA, so a test must confirm the specific control, not the page | Medium | Branding/functional element invisible to mobile users | [OBSERVED] |
| **Hamburger menu content not fully enumerated by testing** | The mobile nav collapses into a hamburger menu whose contents differ from the desktop mega-menu (fewer/reordered items), and a test pass that only checks the desktop nav misses regressions in the collapsed version | Medium | Broken/incomplete mobile navigation ships undetected | [OBSERVED] |
| **Cross-browser rendering divergence on mobile** | The same responsive layout renders correctly in one mobile browser engine (e.g. Safari iOS) but breaks in another (e.g. Chrome Android) — vendor-prefixed CSS, viewport unit handling, or safe-area-inset differences | Low-Medium | Browser-specific mobile bugs missed by a single-engine test pass | [OBSERVED] |
| **Orientation change loses in-progress state** | Rotating the device between portrait and landscape mid-flow (e.g. mid-checkout form fill) resets scroll position, collapses an expanded section, or drops unsaved input | Low | Frustration, potential data loss on a long form | [THEORETICAL] |
| **Touch/hover-only interaction has no mobile equivalent** | A desktop interaction that depends on `:hover` (a tooltip, a reveal-on-hover swatch) has no tap-triggered equivalent on touch devices, making the information or control unreachable on mobile | Low-Medium | Feature effectively missing on mobile despite existing in the DOM | [OBSERVED] |

---

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27) — §7.4. **Row 1** only, on two counts. It hardcoded a pixel width, which the repo's GOLDEN RULE forbids in a file other skills read — the storefront declares its breakpoint scale in the UI-kit constants (narrowest `xs`), and a transcribed number goes stale silently at the next redesign; the row now points at that source instead. It also omitted that the checkout CTA specifically is re-pinned by a sticky bar at narrow widths, which was observed live and which makes a page-level "is it visible" assertion pass while a control-level regression hides. Rows 2, 4 and 5 confirmed unchanged: the mobile navigation is a separate component tree with its own menu set (observed to differ materially from the desktop header), the layout re-flows on viewport change, and the collapsed nav provides tap-expandable equivalents for the desktop hover mega-menu. **Row 3 was NOT confirmed** — an engine-divergence claim is impossible to observe from a single-engine lane, and WebKit is unsupported on this platform's harness at all, so it is recorded in the proposals file with a recommendation that it be marked as covered by manual/device-cloud verification rather than left looking unaudited.

---

### 12.1 Currency & Localization

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Cart amount changes on currency switch — re-resolution, not conversion** | The amount for an item already in the cart can differ from what the shopper saw when adding it, because the selected currency is a stored preference (local storage → contact preference → store default, applied via a full reload) and changing it re-resolves every line against that currency's own price list. The platform does NOT convert by exchange rate (`BL-PRICE-005`), so there is no FX-drift bug to hunt; a currency with no covering price list yields no price at all rather than a converted one | Low-Medium | Unexpected amount, or no price at all | [OBSERVED] |
| **Language doesn't match locale** | User in France sees English site; address validation expects English format | Low | UX friction | [OBSERVED] |
| **Missing currency symbol** | Price displays as "50" without "$"; user in another currency confused | Low | Confusion | [OBSERVED] |

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). **Row 1** was **DRIFT**, and of a kind worth naming: it described an exchange-rate conversion between add-to-cart and checkout, a mechanism this platform does not implement — and in doing so it contradicted `BL-PRICE-005`, the very invariant Appendix D maps this section to, whose Rule states prices are NOT converted by exchange rate and whose *violation signal* is precisely "prices appear to be exchange-rate conversions". The oracle was therefore describing a violation as the expected pattern, and disagreeing with itself across two files. Rewritten to the real mechanism: currency is a stored shopper preference applied via a reload, and changing an existing cart's currency re-resolves each line against that currency's own price list. The pattern **name** had to change too, since "conversion timing" is what an agent reads. Rows 2 and 3 CONFIRMED unchanged. **Source:** a price entity carries a price-list id and a currency with no rate field; the storefront currency composable resolves saved-preference → contact → store default and reloads; a dedicated cart-currency mutation returns the whole re-resolved cart; the language composable reads a pinned locale, a URL segment or the store default, with no browser-language or geo detection. **Live:** the header offers several currencies each with its own symbol and 15+ languages with the store default active. **Not evidence either way:** the tested environment has no product price list for one of the offered currencies, which is a seed-data gap and the documented correct behaviour for an uncovered currency.

---

### 12.2 International Shipping & Taxes

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Shipping to restricted country** | User ships to country under trade sanctions; order placed but can't ship | Low-High | Legal issue | [THEORETICAL] |
| **VAT/GST calculation error** | International order charged wrong tax percentage | Low | Audit issue | [OBSERVED] |
| **Customs duty not disclosed** | User shocked by duty fee upon delivery | Low-Medium | Customer complaints | [THEORETICAL] |

---

### 13.1 Order Fulfillment Issues

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Partial order fulfillment not communicated** | User ordered 5 items; 3 ship today, 2 ship later; user unaware | Low-Medium | Support tickets, confusion | [OBSERVED] |
| **Backorder handling unclear** | System accepts backorder but shipping date estimate is wrong | Low-Medium | Customer frustration | [OBSERVED] |
| **Order cancellation after partial ship** | User cancels order; one unit already shipped; system in inconsistent state | Low | Logistics chaos | [OBSERVED] |

### 13.2 Subscription & Recurring Billing

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Subscription renewal fails silently** | Card declines at renewal; user not notified; account suspended without warning | Medium | Service interruption, support burden | [OBSERVED] |
| **Cancel subscription still charges** | User cancels but next billing date still occurs | Low-Medium | Refund needed | [OBSERVED] |
| **Proration calculation wrong** | User cancels mid-month; proration calculation doesn't match what user expects | Low | Billing dispute | [OBSERVED] |

### 13.3 Loyalty & Points Edge Cases

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Points not credited after purchase** | User completes purchase; loyalty points never appear | Low-Medium | Support tickets | [OBSERVED] |
| **Points never expire — there is no expiry mechanism** | Points are a running balance carried on each operation-log row (Earned / Redeemed only): no per-point validity date, no expired operation type, no expiry sweep, and the balance read applies no date filter. A program's own activation period bounds the PROGRAM, not the points it already awarded. So any expiry policy stated in terms and conditions is unenforceable by the platform and the balance accrues without bound. Do not test for "redeeming an expired point" — that state is unrepresentable | Low | Stated expiry policy unenforceable; unbounded points liability | [OBSERVED] |
| **Double-counting bonus points** | Two accrual paths can post against one order: more than one active program matching it, and a retried background job re-processing it. Dedup is keyed on (object type, object id, operation type), so an Earned and a Redeemed legitimately coexist on one order while a second Earned must not. Referral bonuses are not modelled by the platform — reward rules are fixed points or a percentage of order value — so the real vectors are concurrent programs and job retries (see `BL-LOY-007`) | Low | System error | [OBSERVED] |

---

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27) — §13.3. **Row 2** was **DRIFT** and is the sharper of the two: it asserted, as `[OBSERVED]`, that expired points can still be redeemed — but this platform has no point-expiry mechanism of any kind, so "an expired point" is not a representable state and the stated failure mode cannot occur. The reachable risk is the inverse and is now what the row says: points never lapse, so a stated expiry policy is unenforceable and the balance is an unbounded liability. This is a DRIFT and **not** a RETIRE: the exposure underneath is real and the section number is a citation contract, so retiring would delete a live risk and orphan the citations, while leaving it sent testers after a redemption-gate bug that cannot exist. **Row 3** was DRIFT in its example only: referral bonuses are not modelled here (reward rules are fixed points or a percentage of order value), and the row was materially less precise than `BL-LOY-007`, the invariant it depends on — restated to the platform's two real double-accrual vectors, concurrent matching programs and background-job retries. Row 1 CONFIRMED unchanged. **Source:** the loyalty operation log carries only user, program, object, operation type (earned/redeemed), amount and balance — no validity date and no expired type; the balance read returns the running balance from the latest row with no date filter; a program's start/end dates bound the program, not awarded points; no expiry service exists in the module's service set; and the accrual dedup gate is keyed on object type, object id and operation type. **Docs:** the loyalty guide describes accrual, redemption, balance and a pay-with-points method, and is silent on expiry and on referral rewards. **Live:** the points-history surface exposes operation, type, date, amount and a balance with no expiry column, and earns more than a month old still count toward the balance. No points were spent, reset or manipulated to establish this.

---

### 15.1 Screen Reader Interaction Patterns

| Pattern | Description | Frequency | Impact | Status |
|---------|-------------|-----------|--------|--------|
| **Modal open/close not announced** | A modal dialog gains focus visually but a screen reader user gets no announcement that a dialog opened, what it contains, or that closing it returned focus to the triggering control | Medium | Screen-reader users lose context, may not know a modal is present | [OBSERVED] |
| **List semantics not exposed** | A visually list-like structure (product grid, filter options) is not marked up with list/listitem roles, so a screen reader announces it as an undifferentiated block of text | Medium | Screen-reader users can't navigate item-by-item or get a count | [OBSERVED] |
| **Form field lacks a programmatically associated label** | An input is visually adjacent to its label text but the two aren't associated via `<label for>`/`aria-labelledby`, so a screen reader announces the field with no name | High | Screen-reader users can't tell what a field is for | [OBSERVED] |
| **Validation error not announced at the point of failure** | A field-level validation error appears visually (red text/border) but isn't associated to the field via `aria-describedby` or announced via a live region, so a screen-reader user submits again with no idea what's wrong | High | Screen-reader users are stuck in a silent failure loop | [OBSERVED] |
| **Interactive control has no accessible name** | An icon-only button (cart, search, close) has no `aria-label`/visible text, so a screen reader announces only "button" | Medium | Screen-reader users can't identify the control's purpose | [OBSERVED] |

---

**Amended:** 2026-08-27 (auto-applied, triangulated — ECL-AUDIT-2026-08-27). No pattern row changed. The **chapter-15 intro note** was **DRIFT**: it stated that `business-logic.md` carries no `BL-A11Y` domain and that this chapter therefore stands without a BL citation. That domain exists as Domain 21 — `BL-A11Y-001` … `-004`, all `[P1-data]`; `BL-A11Y-004`'s own severity rationale already quotes this section by name, and the covering suite's cases already cite `BL-A11Y-002`/`-004`. The cross-reference was live in one direction and denied in the other. Appendix D's row was corrected in the same edit, and the one genuinely uncovered area — structural semantics under WCAG 1.3.1, which row 2 concerns and which no `BL-A11Y-*` rule states — is now named as a gap rather than hidden inside a blanket denial. **Source:** the UI kit's dialog component renders its root as a plain container with a focus-trap keydown handler and no dialog role, `aria-modal` or accessible name; the input component, by contrast, wires both label association and `aria-describedby` correctly, so rows 3–4 are consumer-side risks rather than kit defects. **Live:** on the storefront the product grid exposed no list semantics, and field-level validation errors appeared as elements carrying no alert role.

---

