---
description: "Audit BL invariants against docs + live + source code, auto-apply confirmed changes to business-logic.md, and reconcile test-case coverage. Gated by a 3-source evidence bar (not human approval); unconfirmed items route to the proposals file."
argument-hint: "all | domain <name> | BL-<ID> | diff [--dry-run]"
disable-model-invocation: true
---

# /qa-review-bl — BL Invariant Triangulation Review & Auto-Apply

Keep the Business Logic oracle (`.claude/knowledge/oracles/business-logic.md`) grounded in reality. For each in-scope `BL-*` invariant, gather evidence from three independent axes — **docs** (VirtoOZ), **live** (playwright), **source code** (GitHub MCP) — assign a verdict, and **auto-apply confirmed changes**. Then reconcile test-case `Business_Rule` coverage. Fans out the triangulation across **up to 3 parallel `ba-system-analyzer` agents** (one browser slot each, each doing its own live axis), then applies confirmed edits from a **single serialized writer** (`qa-testing-expert` is reserved for a sequential deep-dive on a hard live repro). The methodology lives in the [`/qa-review-bl` skill](../skills/qa-review-bl/SKILL.md) — this command is the terminal entry.

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

### Step 3 — Triangulate in parallel (fan-out), then apply single-writer (fan-in)

The triangulation is read-only and per-invariant, so **run it in parallel** — but the apply is a shared-file write, so it is **serialized to a single writer**.

**3a — Fan-out (parallel, read-only):** split the in-scope invariants into disjoint batches (by domain, then chunk) and dispatch **up to 3 `ba-system-analyzer` agents concurrently** — one Agent-tool call per batch, all in a single message. This matches the 3-slot browser pool ([agents.md](../rules/agents.md): batch browser work in groups of 3). Each parallel agent:
- gets its **own isolated browser slot** — assign distinct servers across the batch (`playwright-firefox` / `playwright-chrome` / `playwright-edge`); never share a browser session between parallel agents;
- if the live axis needs an authenticated session, use a **distinct test/org user per agent** (a shared org cart contaminates — memory `feedback_concurrent_runners_distinct_org_users_taskstop`);
- gathers all three axes for each invariant in its batch (docs `/vc-docs` + source GitHub MCP — no browser; live observation on its assigned browser), assigns a verdict (CONFIRMED / DRIFT / MISSING / CONTRADICTORY / UNGROUNDED / STALE-RETIRE), and **returns the verdict + evidence tuple + the proposed edit** — it does **NOT** write to `business-logic.md` itself.

**3b — Fan-in (single writer, serialized):** the command (orchestrator) collects all batches' verdicts, then applies edits to `business-logic.md` **sequentially, one entry at a time, in one process** — because concurrent writes to the same file race and corrupt it. Auto-apply CONFIRMED/DRIFT/MISSING (body-only, `Amended:` + `Source:` stamp, env-agnostic; MISSING gets the next free ID read fresh before each insert so parallel-discovered new invariants don't collide). Unconfirmed → `reports/ba/bl-proposals-<date>.md`.

Full rules: [SKILL.md](../skills/qa-review-bl/SKILL.md) + [bl-audit-criteria.md](../skills/qa-review-bl/bl-audit-criteria.md).

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
- **Parallel fan-out, single-writer fan-in.** Dispatch up to 3 `ba-system-analyzer` agents concurrently (disjoint invariant batches, one isolated browser slot + distinct test user each) for the read-only triangulation; then apply edits to `business-logic.md` from **one serialized writer** (this command). Parallel agents return proposed edits — they never write the oracle (concurrent writes corrupt it). Max 3 concurrent browser agents (per [agents.md](../rules/agents.md)).
- `--dry-run` writes nothing — use it to preview a domain before applying.
