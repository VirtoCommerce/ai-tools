---
description: "Audit BL invariants against docs + live + source code, auto-apply confirmed changes to business-logic.md, and reconcile test-case coverage. Gated by a 3-source evidence bar (not human approval); unconfirmed items route to the proposals file."
argument-hint: "all | domain <name> | BL-<ID> | diff [--dry-run]"
disable-model-invocation: true
---

# /qa-review-bl — BL Invariant Triangulation Review & Auto-Apply

Keep the Business Logic oracle (`.claude/knowledge/oracles/business-logic.md`) grounded in reality. For each in-scope `BL-*` invariant, gather evidence from three independent axes — **docs** (VirtoOZ), **live** (playwright), **source code** (GitHub MCP) — assign a verdict, and **auto-apply confirmed changes**. Then reconcile test-case `Business_Rule` coverage. Delegates the triangulation to `ba-system-analyzer` and the live axis to `qa-testing-expert`. The methodology lives in the [`/qa-review-bl` skill](../skills/qa-review-bl/SKILL.md) — this command is the terminal entry.

## Usage
```
/qa-review-bl all                    # Every invariant (batch by domain internally)
/qa-review-bl domain cart            # One domain (BL-CART-*)
/qa-review-bl BL-CART-010            # A single invariant
/qa-review-bl diff                   # Invariants whose Source anchor changed / promoted since last audit
/qa-review-bl domain cart --dry-run  # Triangulate + verdict, write NOTHING
```

---

## Pipeline: Collect → Triangulate → Verdict → Apply → Reconcile → Report

### Step 1 — Parse scope

Classify the argument into the work-list of invariants:
- `all` — every `### BL-*` entry (batch by domain; this is large).
- `domain <name>` — resolve `<name>` to a domain prefix (`cart` → `BL-CART`, `checkout` → `BL-CHK`, `b2b` → `BL-B2B`, `pricing` → `BL-PRICE`, …).
- `BL-<ID>` — one invariant.
- `diff` — invariants whose `Source:` file changed on GitHub since last audit, or that carry a recent `Amended:`/`Promoted:` stamp with no audit trail.

`--dry-run` computes verdicts + the intended diff but writes nothing (no oracle edit, no report, no proposals).

### Step 2 — Collect the deterministic inventory

Run the parser/linter and use its output as the work-list + seed findings:
```
npm run bl:audit:collect -- --filter=<prefix>    # JSON inventory + structural + coverage findings
```
(`scripts/knowledge/lint-bl.ts` — BLL-001..005 structural; BLC-002 suite→oracle false-traceability; BLC-004 uncovered invariant.)

### Step 3 — Dispatch ba-system-analyzer (triangulation + verdict + apply)

Use the **Agent tool** with `subagent_type: ba-system-analyzer`. Per invariant it gathers all three evidence axes (docs `/vc-docs`, source GitHub MCP, live via `qa-testing-expert`), assigns a verdict (CONFIRMED / DRIFT / MISSING / CONTRADICTORY / UNGROUNDED / STALE-RETIRE), and — for confirmed items only — auto-applies a body-only edit to `business-logic.md` with an `Amended:` + `Source:` stamp. Unconfirmed items go to `reports/ba/bl-proposals-<date>.md`. Full rules: [SKILL.md](../skills/qa-review-bl/SKILL.md) + [bl-audit-criteria.md](../skills/qa-review-bl/bl-audit-criteria.md).

### Step 4 — Reconcile test-case coverage

- BLC-002 + any ID renamed/added this run → `/qa-review-tests suite <ID>` on affected suites, apply `Business_Rule` remap via `/qa-review-tests --fix` (asks before writing).
- BLC-004 uncovered invariants → note as a coverage gap for `/qa-test-lifecycle` Phase 3.

### Step 5 — Report

Write `reports/knowledge/BL-AUDIT-<date>.md` (verdict table + Applied + Not-applied + coverage reconciliation), per [.claude/rules/reports.md](../rules/reports.md).

---

## Rules

- **Auto-apply is gated by a 3-source evidence bar, never by silence.** A change lands only as CONFIRMED/DRIFT/MISSING with concrete, agreeing docs + source + live evidence. Missing/conflicting axis ⇒ not confirmed ⇒ proposals file.
- **Body-only edits.** Never rewrite the Severity-Tags meta table (`feedback_bl_promotion_table_separately`).
- **Env-agnostic** entries — no env names/URLs/slugs (`feedback_bl_oracle_env_agnostic`).
- **Retiring an invariant is always a human proposal**, never auto-applied.
- **REAL-USER rule** on the live axis — no `browser_evaluate`/`run_code_unsafe` bypass.
- Delegate execution to `ba-system-analyzer` via the **Agent tool**; this command is the orchestration shell. Max 3 concurrent browser agents; schedule firefox off the QA firefox slot (per [agents.md](../rules/agents.md)).
- `--dry-run` writes nothing — use it to preview a domain before applying.
