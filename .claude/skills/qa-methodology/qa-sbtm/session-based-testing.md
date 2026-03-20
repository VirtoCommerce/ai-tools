# Session-Based Exploratory Testing (SBTM) — Complete Reference

This document provides the full SBTM framework for Virto Commerce QA exploratory testing. It covers session structure, charter creation, CRISP and SFDPOT heuristics, exploration tours, session notes, debrief process, coverage tracking, learning loops, and ready-to-use VC-specific charters.

---

## 1. SBTM Framework Overview

Session-Based Test Management (SBTM) structures exploratory testing into time-boxed, chartered sessions that produce measurable artifacts. Each session follows a fixed structure:

| Phase | Duration | Activities |
|-------|----------|------------|
| Setup | 5 min | Read charter, open test environment, prepare browser tools, set up evidence capture |
| Explore | 20 min | Execute exploration guided by charter + heuristics, log findings in real-time |
| Document | 5 min | Organize notes, take final screenshots, classify all findings |
| Debrief | 5 min | Review coverage, count findings, identify follow-ups, update tracking |

**Total: 35 minutes per session** (30 active + 5 debrief)

### Key Principles

- **One charter per session** — Maintain focus on a single mission. If you discover something outside scope, note it for a future charter.
- **Real-time note-taking** — Log observations as they happen. Memory-based notes after a session miss details and timestamps.
- **Time-boxing enforced** — Stop exploring when time expires. Incomplete coverage is documented, not extended silently.
- **Every session produces artifacts** — Charter, session notes, and findings summary are mandatory outputs. No session is "just looking around."

---

## 2. Charter Creation

### Charter Template

```
## Exploratory Session Charter
- **Charter ID:** EXP-{YYYY-MM-DD}-{NNN}
- **Type:** [Feature | Risk | Workflow | Edge-Case]
- **Mission:** Explore [target area] to discover [what we're looking for]
- **Focus Area:** [specific module/page/flow]
- **Heuristic:** [CRISP | SFDPOT | both]
- **Tour:** [Feature | Complexity | Claims | Scenario | Data]
- **Time Box:** 30 minutes
- **Risk Level:** [from /qa-risk assessment]
- **Environment:** [QA URL]
```

### Charter Types

| Type | When to Use | VC Example |
|------|-------------|------------|
| **Feature** | Testing a specific feature for the first time | "Explore the new configurable products selection UI to discover usability issues and edge cases" |
| **Risk** | Targeting a high-risk area identified by /qa-risk | "Explore the payment flow after Skyflow gateway update to discover regression in card processing" |
| **Workflow** | Testing a complete user journey end-to-end | "Explore the B2B procurement workflow (quote request, approval, order) to discover workflow breaks" |
| **Edge-Case** | Hunting for boundary conditions and unusual inputs | "Explore cart operations with extreme quantities, special characters in notes, and concurrent modifications" |

### Charter Writing Guidelines

- **Mission must be specific:** "Explore checkout" is too vague. "Explore checkout with multi-address shipping and applied promotion code to discover calculation errors" is actionable.
- **Include what you are looking for:** "to discover usability issues", "to discover data integrity problems", "to discover security gaps".
- **Reference risk level:** If /qa-risk flagged this area as High, state it. This justifies the session and sets expectations.

---

## 3. CRISP Heuristic

CRISP evaluates quality attributes: Consistency, Reliability, Integrity, Security, Performance. Use 6 sub-questions per dimension to guide exploration.

### Consistency

1. Do similar actions produce similar results across the application?
2. Are error messages consistent in format and language?
3. Does behavior match between desktop and mobile viewports?
4. Are naming conventions consistent (labels, buttons, URLs)?
5. Does the feature work the same across browsers (Chrome, Edge, Firefox)?
6. Are date/number/currency formats consistent with locale settings?

### Reliability

1. Does the feature work correctly on first attempt?
2. Does it work correctly on repeated attempts (10+ times)?
3. Does it recover gracefully from interruptions (network loss, back button)?
4. Are results deterministic (same input produces same output every time)?
5. Does it handle concurrent users without data corruption?
6. Does it work after extended idle time (session timeout boundary)?

### Integrity

1. Is data saved correctly and completely (no silent truncation)?
2. Are calculations accurate (prices, taxes, totals, discounts)?
3. Are foreign key relationships maintained (delete parent — what happens to children)?
4. Does the audit trail capture all changes accurately?
5. Are validation rules enforced consistently (client + server)?
6. Does the API return the same data as the UI displays?

### Security

1. Can unauthorized users access this feature (try without login, with wrong role)?
2. Are inputs sanitized (XSS, SQL injection, path traversal)?
3. Is sensitive data masked/encrypted in transit and at rest?
4. Does the session expire correctly after timeout?
5. Can CSRF attacks succeed (try form submission from external page)?
6. Are authorization checks server-side (not just UI hidden)?

### Performance

1. Does the page load within acceptable time (<3s for initial, <1s for subsequent)?
2. Does it handle large datasets gracefully (1000+ items, pagination)?
3. Does it remain responsive during heavy operations (import, bulk edit)?
4. Are images and assets optimized (lazy loading, compression)?
5. Does search/filter respond within 2 seconds?
6. Are there memory leaks during extended use (watch browser DevTools)?

---

## 4. SFDPOT Heuristic

SFDPOT evaluates system dimensions: Structure, Function, Data, Platform, Operations, Time. Use 5 sub-questions per dimension.

### Structure

1. What are the components of this feature and how do they connect?
2. Are all UI elements properly aligned, sized, and spaced?
3. Does the DOM structure follow accessibility standards (semantic HTML)?
4. Are API endpoints structured consistently (RESTful conventions)?
5. Does the component hierarchy match expected Atomic Design patterns?

### Function

1. Does every button, link, and control perform its intended action?
2. Do all CRUD operations work (Create, Read, Update, Delete)?
3. Do filters, sorts, and pagination work correctly together?
4. Do validation rules fire on all required fields?
5. Do success/error states display appropriate feedback?

### Data

1. What happens with empty data (no products, no orders, empty cart)?
2. What happens with maximum data (cart with 100 items, order with 50 line items)?
3. Are special characters handled (Unicode, RTL, emoji, HTML entities)?
4. What happens with null/undefined values in API responses?
5. Does data persist correctly across page refreshes and navigation?

### Platform

1. Does the feature work on all supported browsers?
2. Does it work on mobile viewports (375px, 768px)?
3. Does it work with slow network conditions (3G throttle)?
4. Does it work with JavaScript disabled (graceful degradation)?
5. Does it interact correctly with browser extensions (ad blockers, password managers)?

### Operations

1. What happens during deployment (feature availability during update)?
2. Can the feature be monitored (logging, health checks, alerts)?
3. What happens when dependent services are down (search, payment, CDN)?
4. Are error conditions logged with enough detail for debugging?
5. Does the feature respect configuration settings (store, language, currency)?

### Time

1. Does behavior change based on time of day (timezone-sensitive operations)?
2. What happens at date boundaries (month-end, year-end, daylight saving)?
3. How does the feature handle expired data (promotions, coupons, sessions)?
4. Are timestamps consistent across client and server?
5. Does performance degrade over time (data accumulation, log growth)?

### Feature Flags (extended Time sub-dimension)

Feature flags control feature availability by state (on/off), date range, or audience. Treat each flag as a separate dimension — test the full lifecycle, not just the "enabled" path.

**On/Off state transitions:**
1. Is the feature completely hidden (not just disabled) when the flag is off?
2. Does toggling the flag take effect immediately or require a cache flush / deployment?
3. Does a user mid-session see a behavior change if the flag is toggled while they are active?
4. Are all flag dependents consistent — UI, API, and admin all reflect the same flag state?
5. Can a flag be turned off per store while remaining on globally (store-level override)?
6. Is there a fallback/default state when the flag configuration is missing or corrupted?

**Start date / End date boundaries:**
1. Is the feature inactive **one second before** the start date (boundary — off at `T-1s`)?
2. Does the feature activate **exactly at** the start date — not a day early, not a day late?
3. Is the timezone used for evaluation consistent — server UTC, store timezone, or user local?
4. Is the feature deactivated **exactly at** the end date, or does it remain active through end-of-day?
5. What happens when `start_date == end_date` (same day window — valid or degenerate case)?
6. What happens when `start_date > end_date` (inverted range — error, ignored, or always-off)?
7. Does the UI show a countdown or "coming soon" state before start, or just disappear?
8. After the end date passes, is the feature hidden, shown as expired, or accessible via direct URL?

**Flag combinations (multi-flag interactions):**
1. When two flags control overlapping functionality, which takes precedence?
2. Does disabling a parent feature flag also disable all child/dependent flags?
3. Can a user be in conflicting flag groups simultaneously (A/B test + org-level flag)?

---

## 5. Exploration Patterns (Tours)

Tours provide a systematic strategy for navigating the feature space. Select the tour that best matches your charter mission.

| Tour | Strategy | VC Application |
|------|----------|----------------|
| **Feature Tour** | Visit every feature/function in the area systematically | Walk through every button, link, and control in the Catalog admin page — list/grid view, filters, bulk actions, detail panel, media upload |
| **Complexity Tour** | Focus on the most complex, interconnected parts | Checkout flow with configurable product + B2B invoice payment + multi-address shipping + applied promotion — maximum complexity path |
| **Claims Tour** | Test every claim made in requirements/documentation | Verify all acceptance criteria from VCST tickets — "user can add up to 999 items" means test 999 items |
| **Scenario Tour** | Follow realistic user stories end-to-end | B2B buyer: browse catalog, add to cart, request quote, get approval, place order, track shipment, request return |
| **Data Tour** | Focus on data creation, modification, and deletion | Create product, update all fields, add variants, set prices, assign inventory, publish, unpublish, delete, verify cleanup |

### Tour Selection Guide

- **New feature, first time testing:** Feature Tour (broad coverage)
- **High-risk area after change:** Complexity Tour (stress the hardest paths)
- **Post-sprint, verifying stories:** Claims Tour (validate requirements)
- **End-to-end workflow validation:** Scenario Tour (realistic user journeys)
- **Data migration or import/export testing:** Data Tour (CRUD lifecycle)

---

## 6. Session Notes Template

Use this template during every exploratory session. Copy it into your session artifact and fill in as you explore.

```markdown
## Exploratory Session Notes
- **Charter:** [reference charter ID and mission]
- **Tester:** [agent name]
- **Date:** YYYY-MM-DD HH:MM
- **Duration:** [actual time spent]
- **Environment:** [URL, browser, viewport]

### Exploration Log
| Time | Action | Observation | Finding Type |
|------|--------|-------------|--------------|
| HH:MM | [what was done] | [what was observed] | [Bug/Question/Observation/Risk] |

### Findings Summary

#### Bugs Found
| # | Description | Severity | Steps to Reproduce | Evidence |
|---|-------------|----------|---------------------|----------|

#### Questions
| # | Question | Context | Who Can Answer |
|---|----------|---------|----------------|

#### Observations
| # | Observation | Impact | Recommendation |
|---|-------------|--------|----------------|

#### Risks Identified
| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|

### Coverage Assessment
- **Charter coverage:** [what % of the charter mission was covered]
- **Areas explored:** [list]
- **Areas NOT explored:** [list with reason — time ran out, blocked, descoped]
- **Confidence level:** [Low/Medium/High — how confident are we in the tested area]
```

### Notes Guidelines

- Fill the Exploration Log in real-time, not after the session
- Every row in the log should have a timestamp (even approximate to the minute)
- Finding Type must be one of: Bug, Question, Observation, Risk
- Bugs require Steps to Reproduce and Evidence (screenshot reference at minimum)
- Questions should identify who can answer (dev team, product owner, DevOps)

---

## 7. Debrief Process

Every session ends with a structured debrief. This is not optional — it converts raw exploration into actionable outcomes.

### Findings Classification

| Finding Type | Count | Action |
|--------------|-------|--------|
| Bug | [n] | File bug report per /qa-evidence standards, add to JIRA |
| Question | [n] | Route to product owner or dev team |
| Observation | [n] | Document for knowledge sharing |
| Risk | [n] | Add to risk register, potentially create new charter |

### Coverage Assessment Questions

Answer these four questions at the end of every session:

1. **Did we cover the entire charter mission?** If not, what was missed and why?
2. **Were there areas that felt undertested?** Trust your instinct — if something felt fragile but you did not have time to dig deeper, note it.
3. **Did we discover anything that changes our risk assessment?** New information may raise or lower the risk level for this area.
4. **Should we schedule a follow-up session?** If yes, what should its charter be?

### Debrief Output

The debrief produces three things:
1. Updated Findings Summary table (from session notes)
2. Coverage Assessment answers (the four questions above)
3. Follow-up action items (bugs to file, charters to create, questions to route)

---

## 8. Coverage Tracking

Maintain an area-by-session matrix to visualize exploratory coverage across the application. Update after every session.

### Coverage Matrix Format

| Area / Feature | Session 1 | Session 2 | Session 3 | Coverage |
|----------------|-----------|-----------|-----------|----------|
| Catalog browsing | EXP-001 (Feature) | EXP-005 (Data) | — | Medium |
| Checkout flow | EXP-002 (Risk) | EXP-003 (Complexity) | EXP-008 (Edge-Case) | High |
| Admin CRUD | EXP-004 (Feature) | — | — | Low |
| B2B workflow | — | — | — | None |
| Payment processing | EXP-006 (Risk) | EXP-009 (Edge-Case) | — | Medium |
| Search and filtering | EXP-007 (Feature) | — | — | Low |

### Coverage Levels

| Level | Definition | Action |
|-------|------------|--------|
| **None** | No exploratory sessions conducted for this area | Schedule session immediately if area is Medium+ risk |
| **Low** | 1 session, single tour/heuristic applied | Schedule additional session with different tour or heuristic |
| **Medium** | 2 sessions, different perspectives applied | Acceptable for Medium-risk areas; High-risk areas need more |
| **High** | 3+ sessions, multiple tours and heuristics applied | Sufficient for release confidence |

### Using the Matrix

- Before a release, review the matrix. Any "None" or "Low" in a High-risk area is a release blocker.
- After filing a production bug, check the matrix — was that area adequately covered? If not, the matrix exposed a gap.
- When planning sprint testing, use the matrix to balance scripted tests (regression suites) with exploratory coverage.

---

## 9. Learning Loops

Exploratory testing generates knowledge that improves future testing. This cycle ensures findings feed back into the process.

### The Improvement Cycle

```
Bug Found --> Risk Register Update --> Charter Reprioritization
     ^                                          |
     |                                          v
Coverage Check <-- Session Execution <-- New Charter Created
```

### Loop Steps

1. **Bug found during session** — Update risk register via `/qa-risk` (increase likelihood for affected module).
2. **Risk register updated** — Review and reprioritize upcoming charters (high-risk areas get more sessions).
3. **Charter adjusted** — Execute new session targeting the risk with appropriate heuristic and tour.
4. **Coverage gap identified** — Schedule session for uncovered area, prioritized by risk level.
5. **Pattern recognized** — Add to error guessing heuristics in `/qa-test-design` (e.g., "payment forms often fail with special characters in cardholder name").
6. **Escape found (production bug in area we tested)** — Analyze session notes: what did we miss and why? Improve heuristic sub-questions or add new tour pattern.

### Learning Actions by Finding Type

| Finding | Learning Action |
|---------|-----------------|
| Bug in checkout calculations | Add "calculation accuracy" as mandatory check in all financial charters |
| Flaky behavior under load | Add "concurrent operations" sub-question to Reliability heuristic |
| Missing validation on API | Add "client vs server validation parity" to Claims tour checklist |
| UI inconsistency across browsers | Add specific browser combination to Platform heuristic checks |
| Production escape in area marked "High coverage" | Review session notes — likely a heuristic gap, not a coverage gap |

---

## 10. VC-Specific Ready-to-Use Charters

These four charters are pre-built for common Virto Commerce exploratory scenarios. Agents can use them immediately without modification.

### Charter A: Checkout Edge Cases

```
## Exploratory Session Charter
- **Charter ID:** EXP-{YYYY-MM-DD}-CHK
- **Type:** Edge-Case
- **Mission:** Explore checkout flow boundary conditions and error recovery
  to discover payment failures, calculation errors, and state corruption
- **Focus Area:** Cart -> Shipping -> Payment -> Confirmation
- **Heuristic:** CRISP (Reliability + Integrity focus)
- **Tour:** Complexity
- **Time Box:** 30 minutes
- **Risk Level:** Critical (revenue path)
- **Environment:** FRONT_URL from .env
```

**Test Ideas:**
- Expired session mid-payment (let session timeout, then click "Pay")
- Back button after payment submit (does it double-charge?)
- Duplicate payment click (rapid double-click on submit)
- Network timeout during payment processing (throttle to offline mid-request)
- Address validation edge cases (PO Box, APO/FPO, very long address lines)
- Coupon code at boundary (apply max discount, apply expired code, apply code twice)
- Cart modification during checkout (open second tab, remove item, return to payment)
- Zero-quantity line item (modify quantity to 0 via URL parameter or API)

### Charter B: B2B Procurement Workflow

```
## Exploratory Session Charter
- **Charter ID:** EXP-{YYYY-MM-DD}-B2B
- **Type:** Workflow
- **Mission:** Explore the B2B-specific procurement journey for workflow
  integrity to discover approval chain breaks and role-based access issues
- **Focus Area:** Catalog -> Quote Request -> Approval -> Order -> Fulfillment
- **Heuristic:** SFDPOT (Function + Operations focus)
- **Tour:** Scenario
- **Time Box:** 30 minutes
- **Risk Level:** High (core B2B differentiator)
- **Environment:** FRONT_URL from .env
```

**Test Ideas:**
- Multi-level approval chain (request quote as buyer, approve as manager, confirm as admin)
- Rejected quote re-submission (reject, modify quantities, re-submit — does history persist?)
- Partial fulfillment (fulfill 3 of 5 items — order status, inventory update, buyer notification)
- Order modification after approval (can buyer change quantities post-approval?)
- Role-based visibility (buyer sees own quotes only, manager sees team quotes, admin sees all)
- Organization switching mid-flow (start quote in Org A, switch to Org B — cart state?)
- Approval timeout (what happens if approver never acts?)
- Concurrent approvals (two managers approve the same quote simultaneously)

### Charter C: Admin Panel Resilience

```
## Exploratory Session Charter
- **Charter ID:** EXP-{YYYY-MM-DD}-ADM
- **Type:** Risk
- **Mission:** Explore Admin SPA under stress conditions and unusual inputs
  to discover data corruption, UI crashes, and error handling gaps
- **Focus Area:** Product management, order management, user management
- **Heuristic:** CRISP (Security + Reliability focus)
- **Tour:** Data
- **Time Box:** 30 minutes
- **Risk Level:** High (admin operations affect all customers)
- **Environment:** BACK_URL from .env
```

**Test Ideas:**
- Bulk operations with 100+ items (select all, bulk delete, bulk price change)
- Concurrent admin edits (two browser tabs editing the same product simultaneously)
- Very long field values (product name with 500 characters, description with 10,000 characters)
- Special characters in all text fields (Unicode, angle brackets, SQL keywords, null bytes)
- Rapid pagination (click next page repeatedly without waiting for load)
- Filter combinations (apply 5+ filters simultaneously, then clear one at a time)
- Export of large datasets (export 10,000 products to CSV — timeout? memory?)
- Unsaved changes navigation (edit product, navigate away without saving — warning?)

### Charter D: API Edge Cases

```
## Exploratory Session Charter
- **Charter ID:** EXP-{YYYY-MM-DD}-API
- **Type:** Edge-Case
- **Mission:** Explore GraphQL xAPI and REST API boundary conditions
  to discover input validation gaps, error handling issues, and data leaks
- **Focus Area:** xCart, xCatalog, xOrder mutations and queries
- **Heuristic:** SFDPOT (Data + Time focus)
- **Tour:** Data
- **Time Box:** 30 minutes
- **Risk Level:** High (API serves all frontend clients)
- **Environment:** FRONT_URL/graphql and BACK_URL/api
```

**Test Ideas:**
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

### Charter E: Feature Flag Lifecycle

```
## Exploratory Session Charter
- **Charter ID:** EXP-{YYYY-MM-DD}-FLAG
- **Type:** Feature
- **Mission:** Explore feature flags (store settings, module toggles, date-bounded promotions)
  to discover state inconsistencies, boundary failures, and combination conflicts
- **Focus Area:** Store settings, Admin feature toggles, Promotion/coupon validity windows
- **Heuristic:** SFDPOT (Time + Operations focus), Feature Flags sub-dimension
- **Tour:** Feature + Claims
- **Time Box:** 30 minutes
- **Risk Level:** High (flag misconfiguration silently disables revenue-critical features)
- **Environment:** BACK_URL (Admin SPA) + FRONT_URL (Storefront)
```

**Test Ideas — On/Off State:**
- Disable a storefront feature in Admin (e.g., "Coupons enabled") → verify storefront hides the section AND the API returns no data
- Enable the same feature → verify it reappears without a page reload requirement
- Toggle a flag mid-session: user is on the coupons page; admin disables coupons; user refreshes — what happens?
- Disable a module-level flag for one store only; verify second store is unaffected
- Check for cache effects: toggle flag, immediately navigate to storefront — stale data visible?

**Test Ideas — Start Date / End Date Boundaries:**
- Create a promotion with `start_date = T+1 day` → confirm it is NOT visible or applicable today
- Set system clock (or use a dated coupon code) to exactly `T+0 00:00:00` → confirm activation at exact boundary
- Set `end_date = today 23:59:59` → verify feature is active at 23:59:58 and inactive at 00:00:00 next day
- Create a promotion with `start_date == end_date` (single-day window) → does it activate and expire correctly?
- Create a promotion with `start_date > end_date` (inverted) → how does Admin validate it? How does storefront handle it?
- Verify timezone interpretation: if Admin timezone is UTC+3 and server is UTC, confirm which clock controls activation
- Apply a coupon code for a not-yet-started promotion → expected: "promo not yet active" error, not "invalid code"
- Apply a coupon code one day after `end_date` → expected: "promo expired" error distinguishable from "invalid code"

**Test Ideas — Flag Combinations:**
- Two promotions active simultaneously, both applying to the same cart item — which discount wins?
- A store-level "Promotions enabled = off" flag vs. an individual promotion that is "active" — which takes precedence?
- B2B org-specific pricing flag off + storefront promotion flag on — what price does the cart show?
- Disable a parent module flag (Marketing) — verify all child toggles (Coupons, Loyalty, Banners) are also inactive
- A/B test flag for new checkout design + feature flag for new payment method — test all four combinations (both on, both off, A on/B off, A off/B on)
