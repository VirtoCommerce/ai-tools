# Regression orchestrator — batching, continuous refill, sub-agent mapping

> Cited by `.claude/agents/regression-orchestrator.md` Step 3 and Rules & Constraints. Read the Step 3 section before the first dispatch of a lane whose queue has more than one suite; read the mapping table only when the manifest's `agent` field is missing. Moved verbatim from the agent on 2026-10-30 (VCST-6423).

## Step 3 — batching the short tail and continuous refill

**Batch the short tail before you dispatch (bounded, never unbounded).**

`npm run regression:plan -- <selection>` prints, per lane, what batching costs and saves on THIS
selection. Group the lane's queue with the same rule the plan prices (`ci/lib/suite-batching.ts`,
`batchSuites`): fill a session up to **60 cases**, never past it; a suite bigger than that goes alone
and is never split; only suites with the SAME affinity (`REQUIRES` / `NOT ON`) share a session; an
`EXCLUSIVE <group>` suite is its own batch — **never two of one group in flight at once**.

Each dispatch then carries a `{{SUITE_BATCH}}` of one or more suites. **A batch of one is the normal
case** — nothing changes for a long suite.

**A suite whose results file is missing after its batch returns is re-dispatched ALONE.** The runner
writes each suite's file as that suite finishes, so a mid-batch death loses only the in-flight suite —
re-dispatching the whole batch would re-run work that already has results, and dropping the suite
would silently lose coverage.

**Then dispatch by keeping every slot busy:**

1. Fill all free slots from the head of the lane's dispatch order (longest batch first).
2. **The moment ONE suite finishes, immediately dispatch the next suite that the freed slot can
   accept.** Do not wait for the others.
3. If the freed slot cannot accept the head of the queue (a `NOT ON`/`REQUIRES` constraint), take
   the first suite in the queue that it *can* accept, and leave the head for a slot that can.
4. Repeat until the lane's queue is empty.

Run the three lanes concurrently — a fastpath suite must never wait on a browser slot.

### Sub-Agent → Suite Type Mapping

| Sub-Agent Type | Suite Types |
|---|---|
| `qa-testing-expert` | Smoke, Payment, Analytics, Accessibility, Localization, Performance, Compatibility |
| `qa-frontend-expert` | Auth, Catalog, Cart, BOPIS, B2C, White Labeling, Configurable Products |
| `qa-backend-expert` | Security, Platform API, GraphQL, Admin modules |
