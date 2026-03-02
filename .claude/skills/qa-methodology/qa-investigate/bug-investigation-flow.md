# Bug Investigation Flow

> Shared reference for all QA agents. Read when investigating a suspected bug, reproducing a reported issue, or performing root cause analysis.
> Bug report **templates** are in `.claude/skills/qa-methodology/qa-defect/defect-report-templates.md`. This file covers the investigation **process** before the report. For the full defect lifecycle (triage, classification, verification), see `.claude/skills/qa-methodology/qa-defect/defect-lifecycle-workflow.md`.

---

## 1. Investigation Phases

```
BUG REPORTED / SUSPECTED
        │
   ┌────▼─────┐      ┌──────────┐     ┌───────────┐     ┌────────────┐     ┌──────────────┐
   │ REPRODUCE │────►│ ISOLATE  │────►│  GATHER   │────►│ IDENTIFY   │────►│ DOCUMENT &   │
   │           │     │  LAYER   │     │ EVIDENCE  │     │ ROOT CAUSE │     │  HAND OFF    │
   └───────────┘     └──────────┘     └───────────┘     └────────────┘     └──────────────┘
    Confirm it's       Frontend?        Screenshots,      Pattern match      Bug report or
    real & get STR     Backend?         console, network,  against known     handoff to
                       Infra?           HAR, DOM state     VC patterns       another agent
```

**Key rule:** Never file a bug you cannot reproduce. If you can't reproduce after exhausting the checklist in Section 2, document the failed reproduction attempt and escalate.

---

## 2. Structured Reproduction Strategy

### From Vague Report to Deterministic STR

1. **Clarify the symptom** — What was seen vs. what was expected? Get the exact page URL and user action.
2. **Identify minimum path** — Shortest sequence of actions that triggers the bug.
3. **Test variables** — Systematically change one variable at a time:
   - User role (admin, customer, guest)
   - Browser (Chrome, Firefox, Edge)
   - Viewport (desktop 1920px, tablet 768px, mobile 375px)
   - Store / language / currency
   - Cart state (empty, with items, mixed pickup/delivery)
   - Authentication state (fresh login vs. long-lived session)
4. **Confirm consistency** — Reproduce 3 consecutive times. If intermittent, note rate (X/10).
5. **Record the STR** — Numbered steps that anyone can follow to trigger the bug.

### Cannot Reproduce? Try This

| Situation | What to Try |
|---|---|
| Works on Chrome | Test Firefox, Edge — check for browser-specific CSS/JS |
| Works for admin user | Test with customer role, different org, guest user |
| Works on desktop | Test mobile viewport (375px), tablet (768px) |
| Works with fresh cart | Test with items in cart, saved-for-later items, mixed pickup/delivery |
| Works after fresh login | Test with stale session, expired token, incognito |
| Only fails sometimes | Check for race conditions, stale cache, ES index lag (wait 5s, retry) |
| Works on QA, fails on staging | Compare platform/module versions at `BACK_URL/#!/workspace/systeminfo` |

---

## 3. Root Cause Isolation — Decision Tree

**Start at the network tab. The API response tells you which layer owns the bug.**

```
1. CHECK NETWORK TAB (browser_network_requests)
   │
   ├─ GraphQL/API returns ERROR (4xx, 5xx, errors[])
   │  └─► Backend issue → go to step 3
   │
   ├─ GraphQL/API returns CORRECT DATA but UI shows wrong
   │  └─► Frontend issue → go to step 2
   │
   ├─ No API call made at all
   │  └─► Frontend logic bug (routing, state management, event handler)
   │
   └─ API call hangs / times out
      └─► Infrastructure issue → go to step 4
```

### Step 2: Frontend Layer (Vue/TypeScript)

| Symptom | Check | Tool |
|---|---|---|
| Console errors | JS runtime error — check component lifecycle, imports | `browser_console_messages` |
| DOM has correct data, displays wrong | CSS/template issue — inspect computed styles | `browser_snapshot` |
| Component state stale | Vue reactivity issue — store mutation not triggering render | `browser_evaluate` |
| Works in one browser only | Browser-specific CSS/JS — compare across MCP servers | Playwright multi-server |

### Step 3: Backend Layer

**3a. GraphQL xAPI:**
- `errors[]` in response → Read `error.extensions.code` for specific error type
- Null field that should have data → Resolver bug or missing data in underlying module
- Authorization denied (403) → Permission/scope/org issue (see Pattern P3)
- Tool: `browser_network_requests` → inspect response body JSON

**3b. REST API:**
- 4xx → Client request issue (auth token, params, payload format)
- 5xx → Server-side exception — check platform logs
- 200 but wrong data → Business logic bug in module
- Tool: Postman `runCollection` or `browser_evaluate` with `fetch()`

**3c. Module / Configuration:**
- Feature broken after update → Module version compatibility (see Pattern P1)
- Setting not taking effect → Cache invalidation needed, or platform restart
- Background job not running → Check Hangfire dashboard at `BACK_URL/hangfire`

### Step 4: Infrastructure / Environment

- Timeout → Elasticsearch down, database connection pool exhausted, or DNS issue
- Stale data → Index not rebuilt after data change (see Pattern P2)
- Intermittent failures → Load balancer, cert expiry, or resource contention

---

## 4. Debugging Techniques by MCP Tool

| Symptom | Tool | Technique |
|---|---|---|
| UI renders wrong | `browser_snapshot` | Compare DOM structure against expected; look for missing/extra elements |
| Console error | `browser_console_messages` | Filter by `error`; correlate timestamp with the user action that triggered it |
| API returns error | `browser_network_requests` | Find the request → inspect response body for `errors[]` array with codes |
| Slow page load | `browser_network_requests` | Sort by duration; find requests >500ms; check payload sizes |
| Payment iframe issue | `browser_evaluate` | Decode iframe `name`/`src` attributes (Base64); inspect SDK config objects for `[object Object]` |
| Admin SPA Angular error | Chrome DevTools `list_console_messages` | Filter for Angular zone errors, unhandled promise rejections |
| Data mismatch front vs back | Compare `browser_network_requests` (storefront) vs Postman (direct API call) | If responses differ → frontend is transforming or caching data |
| GraphQL returns partial data | `browser_evaluate` with introspection query | Check if field was removed/renamed in schema update |

---

## 5. Environment & Data Isolation

Before filing: confirm the bug is a real defect, not environment- or data-specific.

### Environment Isolation
- [ ] Reproduced on QA environment (primary)
- [ ] Platform version checked at `BACK_URL/#!/workspace/systeminfo`
- [ ] Module versions noted (mismatch between environments?)

### Browser Isolation
- [ ] Tested in Chrome (primary) AND at least one of: Firefox, Edge
- [ ] If browser-specific → note which browsers affected vs. unaffected
- [ ] Mobile viewport tested (375px) if it's a UI bug

### User & Data Isolation
- [ ] Tested with primary user (`USER_EMAIL`)
- [ ] Tested with secondary user (`USER2_EMAIL`) — same result?
- [ ] Tested with admin role — same result?
- [ ] If org-scoped → tested with user in a different organization
- [ ] If cart-related → tested with empty cart AND cart with items

### Data Freshness
- [ ] Elasticsearch index current? (Admin > Search Index > check last rebuild timestamp)
- [ ] Data recently modified? (stale cache possible — wait 30s, retry)
- [ ] Background jobs running? (`BACK_URL/hangfire` — check Failed and Scheduled tabs)

---

## 6. Cross-Layer Investigation Pattern

When the storefront displays incorrect data:

1. **CAPTURE** what the frontend shows → screenshot + `browser_snapshot`
2. **INSPECT** the GraphQL response → `browser_network_requests` → find the query → read response body
3. **COMPARE:** Does the GraphQL response match what the UI shows?
   - **YES, response is also wrong** → Bug is in the backend (GraphQL resolver or underlying module)
   - **NO, response is correct but UI is wrong** → Bug is in the frontend (Vue component, store, or template)
4. **If backend:** Call the REST API directly (Postman or `browser_evaluate` with `fetch`)
   - REST correct, GraphQL wrong → Bug in xAPI resolver layer
   - REST also wrong → Bug in module business logic or data
5. **If data issue:** Check the entity in Admin SPA
   - Admin shows correct data → Backend read-path bug (query/filter/cache)
   - Admin shows wrong data too → Data corruption or import bug

**Example: "Wrong price on product page"**
→ Check GraphQL `SearchProducts` response → `price` field correct?
→ If correct: Vue component is formatting/displaying wrong (frontend)
→ If wrong: Check REST `/api/pricing/pricelists` → price correct there?
→ If REST correct: xCatalog resolver not joining pricing data (xAPI bug)
→ If REST wrong: Check pricelist assignment & tier pricing in Admin (module/config)

---

## 7. Common Root Cause Patterns in Virto Commerce

### P1: Module Version Incompatibility
**Symptom:** Feature returns NOT_IMPLEMENTED, 500, or missing methods after platform update.
**Cause:** Module compiled against older platform API running on newer runtime.
**Check:** `BACK_URL/#!/workspace/systeminfo` — compare module version era.

### P2: Stale Elasticsearch Index
**Symptom:** Search returns outdated results, missing products, wrong facet counts.
**Cause:** Index not rebuilt after catalog/pricing/inventory changes.
**Check:** Admin > Search Index > last rebuild timestamp. Rebuild and retest.

### P3: Authorization Scope — Orphaned Organization
**Symptom:** 403 Forbidden on cart, wishlist, or saved-for-later for specific users.
**Cause:** Entity references a deleted organization; xAPI auth checks org membership and fails.
**Check:** Inspect entity's `organizationId` via REST API. Verify org exists via `/api/members/{id}`.

### P4: SDK/Integration Serialization
**Symptom:** Payment iframe shows ERROR state, integration fails silently.
**Cause:** JavaScript object passed where string expected → `[object Object]` in encoded config.
**Check:** Decode iframe `name`/`src` (Base64), look for `[object Object]` or `undefined`.

### P5: Pre-Authentication API Call
**Symptom:** 401 error in console on page load, before user logs in.
**Cause:** Module registers an API call during SPA bootstrap, before auth token is available.
**Check:** Network tab on fresh page load (before login) — any 401s?

### P6: External Resource URL Assumption
**Symptom:** 404 errors for images/assets that should exist.
**Cause:** Internal CDN conventions (e.g., size suffixes like `_md`) applied to external URLs.
**Check:** Compare failing URL pattern with the original asset URL. Is the host external?

### P7: Duplicate GraphQL Queries
**Symptom:** Page slow, same query fired multiple times on single navigation.
**Cause:** Vue component re-rendering triggers duplicate fetches; no cache policy set.
**Check:** Network tab → filter by GraphQL → look for identical operation names with same variables.

### P8: Hangfire Job Failure
**Symptom:** Expected background processing not happening (emails not sent, index not updated).
**Cause:** Job failed silently, stuck in retry queue, or scheduler not running.
**Check:** `BACK_URL/hangfire` — check Failed, Scheduled, and Recurring tabs.

---

## 8. Flaky vs. Real Bug

| Signal | Likely Flaky | Likely Real Bug |
|---|---|---|
| Reproduction rate | < 30% (1-2 / 10 attempts) | > 70% (7+ / 10 attempts) |
| Timing sensitivity | Fails only on first attempt after deploy | Fails consistently regardless of timing |
| Environment | Fails on one env, passes on another (same version) | Fails on all envs with same version |
| Data dependency | Fails only with specific test user/org | Fails with multiple users and fresh data |
| Browser | Fails in one browser only | Fails across all browsers |
| After retry | Passes on immediate retry | Fails on every retry |

**When likely flaky:** Check for race conditions (API timing, animation), test data pollution from prior runs, ES index lag (wait 5s and retry), environment warmup (first request after deploy).

**When genuinely intermittent:** Document exact conditions, note reproduction rate in bug report (e.g., "3/10 attempts"), tag with "intermittent" label in JIRA.

---

## 9. Investigation Handoff Protocol

When your investigation reveals the bug is in another agent's domain, hand off with full context.

### Frontend Agent → Backend Agent
- GraphQL operation name + variables that produce the error
- Full response body (especially `errors[]` array)
- Whether the REST API also returns wrong data (if tested)
- Module version from systeminfo

### Backend Agent → Frontend Agent
- Confirmation that API returns correct data (with example response)
- The specific field/value the frontend should display
- Whether there was a recent API schema change

### Any Agent → qa-lead-orchestrator (Escalation)
- Current investigation status (which layers tested, what was found)
- Blocking reason (why you cannot continue)
- Recommended next agent and what they should check

### Handoff Message Format
```
@[target-agent]: Investigation handoff — [symptom summary]
- Tested layers: [what you checked]
- Findings: [what you found — URLs, response codes, error messages]
- Root cause hypothesis: [your best guess + evidence]
- What to check next: [specific action for receiving agent]
- Evidence: [path to screenshots, HAR, network captures]
```
