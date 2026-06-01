# Scenario Discovery — Finding What We Haven't Tested

**Exploratory testing's primary job is to discover scenarios our existing coverage misses.** Running known patterns against known soft spots is *re-validation* (still useful, but not the point). This file collects techniques specifically aimed at gap-finding.

Use this as the **default lens** for `/qa-exploratory`. The other files in this skill — `adversarial-heuristics.md`, `personas.md`, `modern-web-attack-surface.md`, `charter-library.md` — and the [vc-bug-catalog](../../../agents/knowledge/vc-bug-catalog.md) act as **filters**: they help you spot familiar problems faster and avoid re-discovering known ones, freeing attention for genuinely new scenarios.

---

## The discovery contract

Every exploratory session ends with at least one **net-new scenario** — something that:

1. Is not covered by any CSV suite in [`regression/suites/`](../../../../regression/suites/)
2. Is not in the [VC bug catalog](../../../agents/knowledge/vc-bug-catalog.md) or ECL
3. The charter author would not have predicted before the session

If you can't name a net-new scenario at debrief, the session **was not exploratory** — it was re-validation. Both are valid uses of time, but call the session what it is and update the coverage matrix honestly.

---

## 1. Coverage-Diff Hunting

The fastest way to find gaps: compare what *exists in the product* against what's *tested*.

### 1.1 Suite vs codebase

**Probe:** Pick a module (e.g., `vc-module-marketing`). Open the [module-suite-map](../../../agents/knowledge/module-suite-map.md) to find its suite(s). Open the suite CSV(s). Then scan the module's GitHub source via `mcp__github__search_code` for handlers, endpoints, or commands that don't appear in the suite.

**Output:** A list of code-level features with no corresponding test. Each is a discovery candidate.

### 1.2 Suite vs spec / Confluence

**Probe:** Open a Confluence page describing a feature (e.g., "B2B approval workflow"). Walk the spec; for every behavior described, search the regression suite for an assertion against that behavior. Behaviors with no assertion = candidates.

### 1.3 Suite vs production logs

**Probe:** Open the Azure App Insights failures dashboard for vcst-qa and vcst-qa-storefront (URLs in `MEMORY.md` § Azure Application Insights). Look at error patterns over the last 14 days. For each recurring error, search the regression suite for a test that would have caught it. If none exists → discovery candidate.

### 1.4 Suite vs JIRA bug history

**Probe:** Search JIRA for closed bugs in the last 90 days. For each, ask: "Is there now a regression test that would catch this bug if it returned?". Gaps here are high-leverage discovery candidates (a re-occurrence is plausible).

---

## 2. Feature-Pair Matrix

Most regression tests are scoped to **one feature**. Production users hit **combinations**. The combinatorial space is vast; most cells are untested.

### How to use

1. Pick 8–12 features that touch each other (Cart, Checkout, Promotion, Coupon, B2B Org Switch, Configurable Product, Variant, BOPIS, Loyalty Points, Multi-tenant Store, Currency Switch, Language Switch)
2. Draw an N×N matrix
3. For each cell `(A, B)`, ask: "Has anyone deliberately tested A and B *interacting*?"
4. Empty cells are discovery candidates. Pick the most plausible (highest user likelihood × highest blast radius)

### Example pairs that often go untested

- Configurable Product × B2B Org Switch (does the configuration survive an org switch?)
- Loyalty Points × Currency Switch (do PTS values survive USD→EUR?)
- Coupon × Variant (does a "20% off SKU-X" coupon apply when the user picks a variant of SKU-X?)
- BOPIS × Cart Merge on Sign-In (anonymous BOPIS cart → sign in with a saved-cart user)
- Multi-tab × Approval workflow (manager rejects in Tab A while buyer modifies in Tab B)

Each cell gets one session.

---

## 3. User-Flow Edge Enumeration

Happy paths are well-covered. The branches off the happy path are not.

### How to use

1. Draw the feature's happy-path flow as a graph (5–10 nodes)
2. At every node, enumerate the *non-happy-path* edges: every button the user could click that's *not* the next happy step (Cancel, Back, Edit, switch to a related page, open a help link, log out, switch language)
3. Each unexplored edge is a candidate scenario

### Example: checkout edges

Happy path: Cart → Shipping → Payment → Confirmation.

Non-happy edges at "Shipping" alone:
- Click "Edit Cart" (return to cart with the shipping form half-filled)
- Click the company-name link in header (org switch mid-checkout)
- Click "Save address" without checking out
- Browser Back (do you keep the address you typed?)
- Open help docs in a new tab (does the cart timeout while you read?)
- Switch shipping option after typing an address (does the address survive?)
- Change quantity in the cart sidebar mini-view from the shipping page

Each of those is a candidate. Most are likely uncovered.

---

## 4. Surprise-Seeking Time

The first 10 minutes of every session: **no goal, no charter checklist, just look around with the question "what does the app do that I didn't expect?"**.

### Rules

- Write down every "huh, that's weird" observation, even minor ones
- Don't filter or explain it away during the 10 minutes — that's debrief work
- Don't fix the bug in your head — just record it
- At the end of 10 minutes, pick the most surprising observation and pursue it for the rest of the session

### What surprise-seeking finds

- Stale data you didn't know was there
- A button that exists but doesn't do what its label implies
- A page that loads but has no visible content
- A counter that's off by one
- A modal that opens but takes 3 seconds for the content to render
- An animation that runs every time you scroll past a section
- A localization key that says `account.profile.label` instead of "Profile"
- A console error nobody mentioned in the last sprint

If none of these surprise you, you've stopped looking. Slow down.

---

## 5. Boundary-of-Features Hunting

Where two features touch, ownership is ambiguous and coverage is thin. **Hunt the seams.**

### Examples

- **Cart + Promotion** — when does the promotion apply, when does it un-apply, what happens during a re-pricing event?
- **Login + Org Switch** — what cart state survives sign-in? What survives org switch? Where do these flows interfere?
- **Search + Facets + Saved List** — adding a search result to a saved list while the facets are active
- **PDP + Variant + Inventory** — selecting a variant whose inventory just dropped
- **Checkout + Address Book + Country Switch** — saved addresses for one country, switch country mid-checkout
- **Quote + Inventory + Time** — a quote that takes 5 days to approve, then the items go out of stock during that window

For each seam, design a scenario that crosses both features simultaneously. If both features are tested in isolation but not together, the seam is the discovery candidate.

---

## 6. Galumphing — Purposefully Inefficient Paths

Find a goal. Then accomplish it the **worst plausible way**. The rare paths are the under-tested ones.

### Example: "Add a product to the cart"

- Happy path: PDP → Add to Cart
- Galumph 1: Search → click result → "Add to wishlist" → Wishlist → "Add to cart" from wishlist
- Galumph 2: Past order → "Reorder" → modify quantity → checkout, then back to cart
- Galumph 3: Direct URL to `/cart/add?productId=X&qty=1` (does this work?)
- Galumph 4: Quick-order pad with SKU lookup
- Galumph 5: Import from CSV (B2B)
- Galumph 6: Bot/API call from DevTools console

Each galumph is a candidate scenario. Most are rare in user behavior but high-leverage when they break (because no automated test exercises them).

---

## 7. Hostile Interview

Sit with the feature for 5 minutes and answer this question without filtering:

> **"What could go wrong here that nobody on the team has thought of?"**

Write down at least 5 answers, no matter how absurd. Then test the most plausible 2.

### Rules

- No self-censorship in the 5 minutes. "What if the user has 17 tabs open?" counts. "What if it's leap year?" counts.
- The point is to break out of the "happy path + obvious edge cases" anchor
- The team has already thought of the obvious. You're looking for what they *haven't* thought of.

---

## 8. Production-Error Mining

The richest source of "scenarios we don't cover" is production itself — real users hit combinations we never imagined.

### Process

1. Open Azure App Insights for vcst-qa-storefront (URL in `MEMORY.md` § Azure)
2. Filter by Failures in the last 14 days, group by exception type
3. For each error pattern (>5 occurrences), pull a sample stack trace and request payload
4. Reconstruct the user's path: "what was the user doing when this fired?"
5. Search the regression suite for a test that would have caught this. If none, the path = discovery candidate.

This is the closest exploratory testing gets to a guaranteed return — these are scenarios that *demonstrably matter*.

---

## 9. Charter-from-Gap Protocol

Every gap discovered in a session becomes a charter for the next session.

### Format

```
## Discovered gap
- **From session:** EXP-{prior-charter-id}
- **Scenario:** [1-line description of the uncovered scenario]
- **Why it matters:** [user likelihood × blast radius]
- **Next charter mission:** Explore [this scenario] to discover [what we expect to find]
```

Add to the SBTM coverage matrix in `session-based-testing.md` § 8 with status `Discovered, not yet explored`. Pick from this queue first for the next session.

---

## 10. The Debrief Rule

The standard SBTM debrief (`session-based-testing.md` § 7) asks four questions about coverage. Add a fifth — and answer it FIRST:

> **What net-new scenario did this session uncover that no existing test covers?**

If the answer is "none", the session is not exploratory; it's re-validation. Both are valid uses of time, but log them honestly:

| Session type | Marker |
|--------------|--------|
| Exploratory — found new scenario | `[EXP]` |
| Re-validation — confirmed known coverage works | `[VAL]` |
| Mixed | `[EXP+VAL]` |

A 3-month look-back on the coverage matrix should show mostly `[EXP]` — if it's mostly `[VAL]`, the team has stopped exploring.

---

## When to use which technique

| Situation | Lead technique |
|-----------|----------------|
| New feature being released | User-flow edge enumeration + surprise-seeking time |
| Feature integration risk | Feature-pair matrix |
| Regression suite feels stale | Coverage-diff hunting (suite vs codebase) |
| Production keeps escaping bugs | Production-error mining |
| Stuck — nothing feels worth testing | Hostile interview + galumphing |
| Sprint demo of feature A and B | Boundary-of-features hunting at the A/B seam |
| No specific risk, just allocated session time | Surprise-seeking + charter-from-gap |

---

## Test data during discovery sessions

Discovery sessions hit a moving target: catalogs drift, orgs get reseeded, cart IDs change. Hardcoding values during exploration causes false negatives (404 on a known ID) that mask the real discovery. Use the decision tree in [live-discovery.md](../../../agents/knowledge/live-discovery.md):

- **Need any product / address / cart / coupon for navigation** → `live-discover` (e.g., galumphing § 6, feature-pair matrix § 2 — pick *any* product matching a shape, not a specific GUID)
- **Need a unique input (registration email, org name, comment)** → `random-data` (most surprise-seeking probes need throwaway inputs)
- **Need a specific known entity for assertion** → `@td(ALIAS.field)` (only when the discovery candidate involves a specific known fixture, e.g., CFG_LAPTOP)
- **When a discovered gap becomes a follow-up test case** (§ 9 Charter-from-Gap), the new test case MUST use this decision tree — never hardcode the GUID or path you found during the session

Cross-ref: [../../../rules/test-data.md](../../../rules/test-data.md) is the project-wide policy.

---

## See also

- [session-based-testing.md](session-based-testing.md) — Core SBTM framework; add a `[EXP]/[VAL]` marker to every coverage-matrix row
- [adversarial-heuristics.md](adversarial-heuristics.md) — Apply these as a *filter* (familiar-problems oracle) during discovery sessions, not as the primary checklist
- [personas.md](personas.md) — Persona lens helps surface scenarios a different user type would hit
- [charter-library.md](charter-library.md) — Pre-built charters; use as starting points, then galumph or hostile-interview to discover what they miss
- [../../../agents/knowledge/vc-bug-catalog.md](../../../agents/knowledge/vc-bug-catalog.md) — Read first to AVOID re-discovering known patterns
- [../../../agents/knowledge/live-discovery.md](../../../agents/knowledge/live-discovery.md) — Decision tree + JS recipes for resolving test data at runtime (`live-discover` / `random-data` / `@td()`); essential for galumphing, feature-pair matrix, and any session that needs to pick "any product / any address"
- [../../../agents/knowledge/module-suite-map.md](../../../agents/knowledge/module-suite-map.md) — Source for coverage-diff hunting (§ 1.1)
- [../../testing/qa-coverage-gap/SKILL.md](../../testing/qa-coverage-gap/SKILL.md) — Programmatic coverage-gap analysis (complementary to manual exploratory discovery)
