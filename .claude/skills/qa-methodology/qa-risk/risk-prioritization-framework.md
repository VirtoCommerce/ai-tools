# Risk-Based Test Prioritization Framework

Reference document for `/qa-risk` skill. Provides the complete risk assessment methodology, scoring matrices, allocation tables, and templates for the Virto Commerce B2B e-commerce platform.

---

## 1. Risk Matrix (5x5)

### Likelihood Scale

| Score | Label | Description | VC Example |
|-------|-------|-------------|------------|
| 1 | Rare | Stable code, no recent changes, well-established module | Core platform healthcheck endpoint |
| 2 | Unlikely | Minor changes, well-tested area, low complexity | Localization string update, tooltip text fix |
| 3 | Possible | Moderate changes, some complexity, partial test coverage | New facet filter added to catalog search |
| 4 | Likely | Significant changes, complex logic, cross-module dependencies | Payment gateway integration update, BOPIS flow rework |
| 5 | Almost Certain | Major refactor, new feature, untested area, first release | New configurable products module, new checkout flow |

### Impact Scale

| Score | Label | Description | VC Example |
|-------|-------|-------------|------------|
| 1 | Negligible | Cosmetic issue, no functional impact, single element | Tooltip text incorrect, icon alignment off by 1px |
| 2 | Minor | Workaround exists, affects small user group, non-critical path | Sort order incorrect on admin list view, breadcrumb link wrong |
| 3 | Moderate | Feature degraded, no workaround for subset of users | Search returns incomplete results, BOPIS map fails to load in Firefox |
| 4 | Major | Key feature broken, revenue at risk, wide user impact | Cart cannot proceed to checkout, bulk order import fails silently |
| 5 | Catastrophic | Data loss, security breach, full outage, financial damage | Payment double-charging customers, order data corruption, auth bypass |

### 5x5 Risk Matrix

Risk Score = Likelihood x Impact. Read the table as Impact (rows) against Likelihood (columns).

|                    | 1 Rare | 2 Unlikely | 3 Possible | 4 Likely | 5 Almost Certain |
|--------------------|--------|------------|------------|----------|------------------|
| **5 Catastrophic** | 5 Med  | 10 High    | 15 High    | 20 Crit  | 25 Crit          |
| **4 Major**        | 4 Low  | 8 Med      | 12 High    | 16 Crit  | 20 Crit          |
| **3 Moderate**     | 3 Low  | 6 Med      | 9 Med      | 12 High  | 15 High          |
| **2 Minor**        | 2 Low  | 4 Low      | 6 Med      | 8 Med    | 10 High          |
| **1 Negligible**   | 1 Low  | 2 Low      | 3 Low      | 4 Low    | 5 Med            |

### Risk Level Thresholds

| Score Range | Risk Level | Color Zone | Priority Mapping |
|-------------|------------|------------|------------------|
| 1-4         | Low        | Green      | P3               |
| 5-9         | Medium     | Yellow     | P2               |
| 10-15       | High       | Orange     | P1               |
| 16-25       | Critical   | Red        | P0               |

---

## 2. Severity / Priority Classification

### Severity (Technical Impact)

Severity measures the technical impact of a defect on the system.

| Severity | Definition | VC Examples |
|----------|------------|-------------|
| Critical | System crash, data loss, security breach, payment failure, complete feature unavailability | Orders table corruption after CSV import; payment gateway charges card but creates no order; authentication bypass via API |
| High | Major feature broken, no workaround available, significant user group affected | Cannot complete checkout with any payment method; catalog search returns zero results; admin cannot create new products |
| Medium | Feature partially broken, workaround exists, subset of users affected | Faceted search misses results for one category but manual URL filter works; BOPIS map loads but geolocation fails — manual address entry works |
| Low | Cosmetic issue, minor inconvenience, negligible functional impact | Button alignment off by 2px on tablet; date format shows US format instead of EU in Norwegian locale; hover state missing on secondary CTA |

### Priority (Business Urgency)

Priority measures the business urgency of fixing the defect.

| Priority | Definition | Action Required | VC Examples |
|----------|------------|-----------------|-------------|
| P0 | Fix immediately, blocks release, revenue/security at risk | Stop current work, hotfix deploy | Checkout flow broken in production; PCI compliance vulnerability discovered; payment double-charging |
| P1 | Fix this sprint, key feature degraded | Schedule within current sprint | B2B approval workflow skips approval step; inventory sync shows wrong counts; order export missing fields |
| P2 | Fix next sprint, non-critical, workaround available | Add to next sprint backlog | Admin sort order resets after page navigation; email notification uses wrong template for one store |
| P3 | Backlog, cosmetic, nice-to-have improvement | Prioritize when capacity allows | Inconsistent icon size in admin sidebar; tooltip appears 200ms too slow; footer link color slightly off-brand |

### Severity-Priority Interaction

Not all Critical severity defects are P0 priority. Context determines urgency.

| Scenario | Severity | Priority | Rationale |
|----------|----------|----------|-----------|
| Payment double-charging in production | Critical | P0 | Active revenue loss and customer trust damage |
| Data corruption on rarely-used admin bulk import | Critical | P1 | Severe technical impact but limited blast radius, workaround exists (single-item import) |
| Checkout broken only in Firefox on Linux | High | P2 | Major feature broken but affects a small subset of the user base |
| Tooltip text wrong on storefront header | Low | P3 | Cosmetic, no functional impact, minimal user disruption |
| Login page unresponsive during peak traffic | High | P0 | Blocks all users from accessing the platform, even though it is intermittent |

---

## 3. Product Risk Categories

Five risk domains specific to Virto Commerce B2B e-commerce, with module and regression suite mappings.

| Category | Scope | Key Modules | Regression Suites | Default Minimum Risk |
|----------|-------|-------------|-------------------|---------------------|
| Revenue | Checkout, payment processing, cart operations, pricing rules, promotions | Cart, Checkout, Payment (Skyflow, CyberSource, Authorize.Net, Datatrance), Pricing, Marketing | 04, 06, 19, 20, 23 | Medium |
| Data Integrity | Orders, inventory, customer data, import/export, catalog data | Orders, Inventory, Contacts, CSV Import/Export, Catalog | 20, 21, 22, 29, 16 | Medium |
| Security | Authentication, authorization, RBAC, PCI compliance, input validation | Identity, Security, Platform Core | 02, 08, 17 | Medium |
| User Experience | Navigation, search, catalog browsing, responsive layout, accessibility | Catalog, Search, CMS, Frontend Themes, Localization | 03, 09, 10, 11, 12, 13, 35, 36 | Low |
| Platform Stability | REST APIs, GraphQL xAPI, background jobs, search indexing, infrastructure | Platform API, GraphQL, Elastic Search, Assets, Notifications | 14, 15, 26, 27, 24, 34 | Low |

### Cross-Category Dependencies

Some changes affect multiple risk categories. Common cross-cutting concerns:

| Change Type | Primary Category | Secondary Categories |
|-------------|-----------------|---------------------|
| Payment gateway update | Revenue | Security, Platform Stability |
| Catalog schema change | User Experience | Data Integrity, Platform Stability |
| Authentication refactor | Security | Revenue (checkout auth), User Experience (login flow) |
| Search index rebuild | Platform Stability | User Experience (search results), Revenue (product discovery) |
| Multi-store configuration | Platform Stability | Revenue (pricing per store), User Experience (theme per store) |

---

## 4. Risk-Based Test Selection

Five-step process for mapping changes to test effort.

### Step 1: Identify Changes

Sources to check:
- JIRA tickets in the sprint scope (via Atlassian MCP)
- Git diff between current and previous release tag
- Deployment notes and changelog
- Infrastructure change tickets (Elastic, Redis, CDN updates)
- Dependency updates (NuGet packages, npm modules)

### Step 2: Map Changes to Modules and Suites

Use the module-to-suite mapping in `agents/knowledge/module-suite-map.md` to identify which regression suites cover each changed module. If a change spans multiple modules, include all affected suites.

### Step 3: Score Risk

For each change item:
1. Determine Likelihood (1-5) using the Likelihood Scale above
2. Determine Impact (1-5) using the Impact Scale above
3. Calculate Risk Score = Likelihood x Impact
4. Look up the Risk Level from the 5x5 matrix

### Step 4: Rank by Risk Score

Sort all items by Risk Score descending. Items with the same score are ordered by:
1. Revenue category first
2. Security category second
3. Data Integrity third
4. Higher Impact score breaks remaining ties

### Step 5: Allocate Test Depth

Apply the Test Depth Allocation Table (Section 5) to assign testing activities proportional to risk level and available time budget.

---

## 5. Test Depth Allocation Table

| Risk Level | Test Depth | Activities | Time Budget | Suite Selection |
|------------|-----------|------------|-------------|-----------------|
| Critical (16-25) | Full + Exploratory | All test cases (P0-P3) from primary suite + 2 exploratory sessions + cross-browser (Chrome, Firefox, Edge) + HAR capture + API trace | 40% | Full primary suite + smoke of all adjacent suites |
| High (10-15) | Critical Paths | P0 + P1 test cases from primary suite + 1 exploratory session + primary browser only + HAR capture | 30% | Primary suite full + smoke subset of adjacent suites |
| Medium (5-9) | Smoke + Targeted | P0 test cases only + spot checks on changed areas + primary browser only | 20% | Smoke subset of primary suite only |
| Low (1-4) | Visual Check | Quick visual scan of affected pages, no formal test execution, confirm no obvious regressions | 10% | Skip formal execution or brief visual walkthrough |

### Test Depth Details

**Full + Exploratory (Critical):**
- Execute every test case in the assigned regression suite CSV
- Run 2 structured exploratory sessions (30 min each) focusing on edge cases and error paths
- Test across Chrome, Firefox, and Edge (desktop viewport 1920x1080)
- Capture HAR files for all browser sessions
- Monitor console for errors and warnings throughout
- Verify API responses for all backend interactions

**Critical Paths (High):**
- Execute P0 and P1 test cases from the regression suite CSV
- Run 1 structured exploratory session (20 min) on the changed area
- Test on Chrome only (primary browser)
- Capture HAR file for the session
- Spot-check console for errors on key flows

**Smoke + Targeted (Medium):**
- Execute only P0 test cases (smoke-level coverage)
- Targeted manual checks on the specific changed functionality
- Chrome only, no exploratory session
- Note any anomalies but do not deep-dive unless a blocker is found

**Visual Check (Low):**
- Navigate to affected pages, confirm they load correctly
- Verify no visual regressions or broken layouts
- No formal test case execution
- Document only if a defect is found

---

## 6. Dynamic Prioritization Triggers

Events that require re-running the risk assessment for affected modules.

### Trigger 1: Production Bug in Same Module

- **Trigger:** A bug is reported in production affecting a module currently in test scope
- **Action:** Re-score the module, increasing Likelihood by +1 (minimum 3)
- **Risk Adjustment:** Likelihood +1 for the affected module and directly dependent modules
- **Example:** Production bug in checkout address validation → increase Likelihood for Suite 04 (Cart & Checkout) from 3 to 4, also re-check Suite 05 (BOPIS) which shares address components

### Trigger 2: Hotfix Deployed to Production

- **Trigger:** A hotfix is deployed to production during the test cycle
- **Action:** Re-score all modules affected by the hotfix, re-test the fixed area
- **Risk Adjustment:** Likelihood +1 for hotfixed module, +1 for any module sharing code paths
- **Example:** Hotfix for payment timeout handling → re-score Suite 06 (Payment), also bump Suite 04 (Cart & Checkout) since checkout calls payment service

### Trigger 3: Module Dependency Update

- **Trigger:** A NuGet package or npm module used by the platform is updated
- **Action:** Identify all VC modules consuming the dependency, check downstream impact
- **Risk Adjustment:** Likelihood +1 for all consuming modules; if the dependency is security-related, also Impact +1
- **Example:** Elasticsearch client library updated → re-score Suite 26 (Search & Indexing), Suite 03 (Catalog & Search), Suite 14 (Platform API)

### Trigger 4: Infrastructure Change

- **Trigger:** Change to Elasticsearch cluster, Redis cache, CDN configuration, or hosting environment
- **Action:** Re-score Platform Stability category, run infrastructure smoke tests
- **Risk Adjustment:** Platform Stability Likelihood +1 across all affected suites
- **Example:** Redis cache cluster migration → re-score all suites that rely on caching (most frontend suites, pricing, inventory)

### Trigger 5: Scope Change Mid-Sprint

- **Trigger:** New tickets added to or removed from the sprint scope after risk assessment was completed
- **Action:** Run full risk assessment for new items, remove dropped items, re-calculate time budget allocation
- **Risk Adjustment:** New items scored from scratch; existing items unchanged unless dependencies shift
- **Example:** Late addition of a BOPIS feature enhancement → score the new work, adjust time allocation away from Low-risk items if time is constrained

### Trigger 6: Test Escape Found

- **Trigger:** A bug is found in a later phase (UAT, staging, production) that should have been caught during the current test cycle
- **Action:** Increase Impact by +1 for the area where the escape occurred, review test coverage for gaps
- **Risk Adjustment:** Impact +1 for the affected area; if a pattern emerges (multiple escapes in same module), also Likelihood +1
- **Example:** UAT finds that bulk order CSV import silently drops rows with special characters → increase Impact for Suite 29 (CSV Export Import) from 3 to 4, review test data adequacy

---

## 7. Risk Mitigation Strategies

### Time-Constrained Test Strategies

| Available Time | Strategy | What to Test | What to Skip |
|----------------|----------|--------------|--------------|
| Less than 1 hour | Emergency smoke | Suite 01 only (12 P0 tests): login, search, cart, checkout, payment | All other suites, exploratory, cross-browser, admin |
| 1-4 hours | Critical path sweep | Suite 01 + suites for changed modules (P0 and P1 cases only) + 1 quick exploratory pass on highest-risk area | P2 and P3 cases, cross-browser, full admin regression |
| 4-8 hours | Sprint regression | All sprint-scope suites (26 suites, P0 and P1 cases) + 1 exploratory session on top 3 risk items + primary browser | Full cross-browser matrix, P3 cases, performance testing |
| Full day or more | Comprehensive | All 99 suites (all priority levels) + 2 exploratory sessions + cross-browser (Chrome, Firefox, Edge) + performance spot checks | Nothing skipped — full coverage target |

### When Time Is Insufficient for Risk Level

If the available time does not allow adequate coverage for a Critical or High risk item:

1. **Escalate** to the QA Lead or Product Owner immediately
2. **Document** the risk acceptance (use template below)
3. **Propose mitigation:** feature flag, phased rollout, enhanced monitoring
4. **Never silently skip** a Critical risk item — the decision to accept the risk must be explicit and recorded

### Risk Acceptance Documentation Template

Use this template when a conscious decision is made to accept risk by reducing or skipping test coverage.

```
## Risk Acceptance Record
- **Date:** YYYY-MM-DD
- **Decision Maker:** [name/role]
- **Item:** [feature/module being under-tested or skipped]
- **Risk Level:** [score and classification, e.g., "20 — Critical"]
- **Accepted Risk:** [what is NOT being tested and why]
- **Mitigation:** [monitoring plan, feature flags, rollback plan, phased rollout]
- **Expiry:** [when this acceptance expires — next sprint/release/specific date]
- **Review Trigger:** [what event would invalidate this acceptance]
```

Example:

```
## Risk Acceptance Record
- **Date:** 2026-03-02
- **Decision Maker:** QA Lead
- **Item:** Datatrance payment integration — new OTP flow
- **Risk Level:** 20 — Critical (Likelihood 4 x Impact 5)
- **Accepted Risk:** Cross-browser testing skipped (only Chrome tested), no exploratory session conducted
- **Mitigation:** Feature flag enabled for 10% rollout; production monitoring on payment error rates; rollback plan documented
- **Expiry:** 2026-03-16 (next sprint release)
- **Review Trigger:** Any payment failure rate increase above 0.5% or customer-reported payment issue
```

---

## 8. Risk Register Template

Use this template to document the risk assessment results for a sprint, release, or feature.

### Header

```
# Risk Register — [Sprint XX / Release X.X / Feature Name]
- **Assessment Date:** YYYY-MM-DD
- **Assessor:** [agent or person]
- **Scope:** [what is being assessed]
- **Risk Appetite:** [maximum accepted risk level without escalation, e.g., "High — all Critical items require explicit sign-off"]
```

### Register Table

| # | Feature / Module | Risk Category | Likelihood (1-5) | Impact (1-5) | Score | Level | Test Depth | Regression Suite | Mitigation | Owner |
|---|-----------------|---------------|-------------------|--------------|-------|-------|------------|-----------------|------------|-------|
| 1 | Checkout Payment Integration | Revenue | 4 | 5 | 20 | Critical | Full + Exploratory | 04, 06 | Cross-browser, HAR capture, manual payment verification | qa-frontend-expert |
| 2 | Catalog Search Reindex | Platform Stability | 3 | 4 | 12 | High | Critical Paths | 03, 26 | Monitor index lag, verify result completeness for top 50 queries | qa-backend-expert |
| 3 | Admin User Role Update | Security | 2 | 3 | 6 | Medium | Smoke + Targeted | 17 | Verify RBAC for 3 key roles (admin, manager, buyer) | qa-backend-expert |
| 4 | Localization String Updates | User Experience | 2 | 1 | 2 | Low | Visual Check | 10 | Spot-check 3 languages (EN, DE, NO) on 2 key pages | qa-frontend-expert |
| 5 | CSV Import Performance Fix | Data Integrity | 3 | 4 | 12 | High | Critical Paths | 29 | Test with 1K, 10K, 50K row files; verify row counts post-import | qa-backend-expert |

### Summary

```
- **Total items assessed:** [count]
- **Critical:** [count] — require full regression + exploratory
- **High:** [count] — require critical path coverage
- **Medium:** [count] — require smoke + targeted checks
- **Low:** [count] — visual check or skip
- **Recommended suite selection:** [smoke / critical / sprint / full]
- **Estimated test time:** [hours]
- **Items above risk appetite:** [list any items requiring escalation]
```
