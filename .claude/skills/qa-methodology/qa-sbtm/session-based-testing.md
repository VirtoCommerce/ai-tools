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

## 10. Ready-to-Use Charters

VC-specific charter templates live in a dedicated file. The library covers 11 scenarios (Checkout Edge Cases, B2B Procurement, Admin Resilience, API Edge Cases, Feature Flag Lifecycle, Performance & Resource Stress, Accessibility Exploratory, i18n / Localization, Mobile Gesture-Specific, Search Relevance, Cache & State Drift). See [charter-library.md](charter-library.md).

---

## 11. Adversarial Heuristics — When CRISP/SFDPOT Aren't Enough

CRISP and SFDPOT (sections 3–4) are **quality-attribute** heuristics — they ask *"does it work well?"*. When you need to ask *"how do I break it?"*, three additional reference packs apply:

- [adversarial-heuristics.md](adversarial-heuristics.md) — Whittaker's 10 tours (Garbage Collector, Bad Neighborhood, Couch Potato, Antagonistic, Saboteur, Obsessive-Compulsive, Supermodel, Lonely Businessman, All-Nighter, Tourist), FAILURE mnemonic, Soap Opera Testing template + 2 VC examples, HICCUPPS-F oracles
- [personas.md](personas.md) — Persona-driven exploration: 6 personas (Impatient Buyer, Screen-Reader User, Malicious User, Slow-Network User, B2B Procurement Officer, Session-Corrupted User) with mindset + starter test ideas
- [modern-web-attack-surface.md](modern-web-attack-surface.md) — Browser-specific probes: DevTools-as-attack-tool, multi-tab state collisions, storage/cache drift, history/router races, browser-feature attack surface, network/performance probes

Use the **VC bug catalog** as a "Familiar Problems" oracle and to seed Bad Neighborhood Tours: [../../agents/knowledge/vc-bug-catalog.md](../../agents/knowledge/vc-bug-catalog.md).

### Combining heuristic layers in a 30-minute session

| Layer | Pick one from |
|-------|----------------|
| Charter | [charter-library.md](charter-library.md) (or write a custom one using § 2) |
| Quality heuristic | CRISP or SFDPOT (§§ 3–4) |
| Attack heuristic | One Whittaker tour + one FAILURE letter |
| Persona | One persona from [personas.md](personas.md) (optional but recommended) |
| Probes | 3–5 probes from [modern-web-attack-surface.md](modern-web-attack-surface.md) if relevant |

Trying to use all layers at once dilutes focus. Pick a charter and one item from each remaining row.
