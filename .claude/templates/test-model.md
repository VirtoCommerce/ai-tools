# Test Model template — `/qa-test` Step 1e

Fill-in shape for the durable Test Model written to `reports/ba/test-models/<TICKET>-<date>.md`
(`.claude/rules/reports.md` category 3). **The line cap is the `reports-policy.md` §2 row — read it
there, never from here:** the number was transcribed into this file once as 220 and was stale from the
day §2 raised it.

**The methodology — why Part 0 is derived first, the eight rules the scenario table must satisfy, when
Part 0r role scenarios are required, the gate, and the worked references — lives in
[`.claude/skills/qa-test/test-model.md`](../skills/qa-test/test-model.md). Read that before filling this
in.** This file is the shape only, so it can be copied without carrying the argument with it.

```
TEST MODEL — <ticket-key>
Ticket:      <ticket-key> | Type: Bug/Story/Task/Technical task/Sub-task/Epic | Status role: fix-ready/not-fixed/testable | Flow: feature-test | Priority: P0/P1/P2 | Path: FULL | Changed: Backend / Frontend / Both
Context:     [FULL: ba-system-analyzer | FAST/inline]
Prior model: [reports/ba/test-models/<PREDECESSOR>-<date>.md — the newest model for THIS surface, whose
             Part 0 is carried forward below (chain, diagrams, variants, reverse edges), with any
             correction recorded as drift against it | none — first model for this surface]
Domain map:  [.claude/knowledge/domain/<name>.md @ rev N (generated YYYY-MM-DD) | ABSENT]
             ABSENT is a valid value and blocks nothing — but then Chain position below reads
             "unverified", so the omission is recorded rather than invisible (gate clauses 11/11b).
Chain position: [this ticket's chain as a SLICE of the domain chain — the links it TOUCHES and,
             explicitly, the links it DOES NOT. "L1, L4-L6 of L1-L9; does not touch L2-L3, L7-L9."
             Naming what you did not cover is contradictable; "the matrix is complete" is not.
             | "unverified — no domain map"]
Affected surface: [module(s)/repo(s), layer(s), code sites — every one must resolve to a surface the
             domain map enumerates, or be reported as a surface the map is MISSING (clause 11b)]
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
Mechanism coverage matrix: [variants × chain links. AXES: columns = chain links, rows = variants — BOTH derived from Part 0, never by reading your own scenario table back (a matrix filled from the scenario list fills completely by construction, so a mechanism with no scenario has no row to be uncovered in); map scenarios in AFTER the axes exist, and re-derive after any rewrite of the table, since renumbering drops rows silently. CELLS: every one holds a scenario # or `GAP` / `WAIVED + reason` — no blank cells, because a blank is a hole nobody can see and a GAP is a decision someone can argue with]
Reverse edges: [per forward effect that moves money/points/stock/entitlement: what moves it back → covered by # | ABSENT IN PRODUCT (a finding to report, never a blank)]
Fixture lifecycle: [any state that is TERMINAL once reached (a completed mission, a consumed coupon, a shipped order) — a case that must observe an ADVANCE needs a per-run fixture, not a shared one, or it passes once and never again]
--- Part 0r — ROLE SCENARIOS (REQUIRED when the matrix carries >1 ROLE variant; omit entirely otherwise) ---
Roles in scope: [role → @td(ALIAS.field) fixture alias | FIXTURE-GAP: <what is missing, routed to 3a>. An actor
              whose domain-map verdict is UNVERIFIED yields {HYPOTHESIS} expectations — inherit it, never launder it]
BSC-<n> — <scenario name, in the customer's words>
  Role: <role>  ·  Situation: <one line — the real circumstance that puts this role here>
  | # | Action | Sees | Can do | Expected |
  Outcome:     [the business result, one line]
  Not allowed: [the refusals this scenario proves — each becomes its own case in Step 3, asserted at the
                SERVER with this role's own token, not merely as an absent button]
              (repeat per scenario; actions only — no selectors, no steps, no evidence paths)
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
