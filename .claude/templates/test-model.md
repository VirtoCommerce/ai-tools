# Test Model template — `/qa-test` Step 1e

Fill-in shape for the durable Test Model written to `reports/ba/test-models/<TICKET>-<date>.md`
(`.claude/rules/reports.md` category 3; 80–160 lines, cap 220).

**The methodology — why Part 0 is derived first, the eight rules the scenario table must satisfy, the
ten-clause gate, and the worked references — lives in
[`.claude/skills/qa-test/test-model.md`](../skills/qa-test/test-model.md). Read that before filling this
in.** This file is the shape only, so it can be copied without carrying the argument with it.

```
TEST MODEL — <ticket-key>
Ticket:      <ticket-key> | Type: Bug/Story/Task/Technical task/Sub-task/Epic | Status role: fix-ready/not-fixed/testable | Flow: feature-test | Priority: P0/P1/P2 | Path: FULL | Changed: Backend / Frontend / Both
Context:     [FULL: ba-system-analyzer | FAST/inline]
Affected surface: [module(s)/repo(s), layer(s), code sites]
Ticket signals: [load-bearing facts from COMMENTS + ATTACHMENTS — real repro, PO/dev clarifications, "fixed in build X"/reopen notes, prior QA findings; screenshot expected-vs-actual, design mockup ref, log/HAR repro]   (from 1a)
Epic context: [parent Epic + goal; this story's position in the E2E flow; Done siblings = integration seams to cover; In-progress siblings = dependencies/blockers]   (from 1a; "none" if no parent)
Domains:     [Cart, Payment, ...]
Flows & boundaries: [cart ↔ checkout, ...]
Risk areas:  [VC-* pain points / historical failures]
AC traceability: [N atomic conditions — story ACs + gap-ACs, each w/ Impl verdict]   (from 1d)
DoD (optional — only when the ticket declares one): [Definition-of-Done items, each marked confirmed-now / confirm-at-5b]   (from 1d)
--- Part 0 — VALUE CHAIN (derived FIRST; /qa-test-design test-design-techniques.md §1a, FLOW) ---
Value chain:  [one line per link, in the user's words: trigger → effect → persisted state → user-visible surface → what it unlocks]
Chain diagrams: [Mermaid, in the file. `flowchart` ALWAYS (the journey: primary path + alternate/error branches);
                 + `sequenceDiagram` when the chain crosses layers or any part is async (job/queue/webhook/settlement);
                 + `stateDiagram-v2` when the entity has a lifecycle, or an effect is expected to REVERSE (cancel/refund/expire/revoke)]
Variants:     [the kinds of the thing — goal types / processors / product kinds / role kinds. Different code paths through the SAME link, so they are matrix ROWS, not input partitions. DERIVE THEM FROM THE LAYER THAT BRANCHES on the thing under test — and where several layers branch differently, take the UNION, not whichever layer you read first]
Mechanism coverage matrix: [columns = chain links, rows = variants — BOTH derived from Part 0, never by reading your own scenario table back. A matrix filled from the scenario list fills completely by construction, so a mechanism with no scenario has no row to be uncovered in. Map scenarios in AFTER the axes exist; re-derive after any rewrite of the table, since renumbering drops rows silently]
Mechanism coverage matrix: [variants × chain links; every cell holds a scenario # or `GAP` / `WAIVED + reason`. No blank cells — a blank is a hole nobody can see, a GAP is a decision someone can argue with]
Reverse edges: [per forward effect that moves money/points/stock/entitlement: what moves it back → covered by # | ABSENT IN PRODUCT (a finding to report, never a blank)]
Fixture lifecycle: [any state that is TERMINAL once reached (a completed mission, a consumed coupon, a shipped order) — a case that must observe an ADVANCE needs a per-run fixture, not a shared one, or it passes once and never again]
--- Parts 1–5 — FAULT MODEL (built per link, on top of Part 0) ---
Condition space: [factor → value classes, one line per factor; + constraints (infeasible combos); raw cells = N]
Reduction:       [technique + WHAT was collapsed and WHY — name the dropped factor and what subsumes it; N → M]
Test scenarios (M rows — one per surviving cell)   ← authored from in Step 3
  | # | Cell (factor values) | Defect hypothesis — what breaks here, and why it plausibly would | Archetype | Technique | Oracle | P |
Probes carried in: [vc-bug-catalog VC-*-NNN whose Detection probe hits this surface → scenario # | N/A + reason]   (filled in Step 2)
Archetype sweep:  [archetypes in scope for these domains → covered by # | WAIVED + reason]                        (filled in Step 2)
UIP sweep (UI only): [UIP-BACK/DEEP/REFRESH/TABS/EXPIRE/STORAGE/NET/INPUT/VIEW/DATA → covered by # | WAIVED + reason]  (filled in Step 2)
Business Rules: [BL-CART-001, BL-PAY-003, ...]   (filled in Step 2)
Edge cases:  [ECL-* patterns]                    (filled in Step 2)
Docs grounding: [VirtoOZ / VC-doc refs]
Agents to dispatch: [list]
```

## Companion: the authoring plan

Step `1e-plan` emits the `Test scenarios` rows as one **authoring plan JSON per target suite** so the
design decision is machine-checked before any case is written. Shape: the `Plan` interface at the top of
[`scripts/test-cases/scaffold-rows.ts`](../../scripts/test-cases/scaffold-rows.ts); gate and rationale in
[`.claude/skills/qa-test/authoring.md`](../skills/qa-test/authoring.md).

```json
{
  "suite": "regression/suites/<layer>/<module>/<NNN>-<name>.csv",
  "ticket": "<ticket-key>",
  "idPrefix": "<PREFIX>",
  "defaults": { "layer": "admin|api|graphql|storefront|e2e", "priority": "High", "section": "<Suite > Domain > Sub-area>" },
  "cases": [
    {
      "title": "<Subject> — <action/scenario>",
      "link": "<which chain link this row crosses or guards>",
      "priority": "Critical",
      "archetype": "<one token from vc-bug-catalog §Defect archetypes>",
      "technique": "<one token from qa-test-design §0>",
      "bl": ["BL-..."],
      "ecl": ["ECL-..."],
      "data": ["key={{VAR}}", "key=@td(ALIAS.field)"],
      "observable": "<the value this case READS>",
      "defect": "<the failure a CUSTOMER would see>",
      "plausible": "mechanism: <what in this code makes it likely> | VC-*-NNN | VCST-NNNN"
    }
  ],
  "sweeps": [{ "kind": "state-stress|uip|toggle|date-range", "surface": "<what is being swept>", "waive": { "<key>": "<reason>" } }]
}
```
