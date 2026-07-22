---
name: qa-review-bl
description: "[QA Method] Triangulate each BL invariant against docs + live + source code, auto-apply confirmed changes to business-logic.md, and reconcile test-case coverage. Delegates the live axis to qa-testing-expert; runs the triangulation via ba-system-analyzer."
argument-hint: "all | domain <name> | BL-<ID> | diff [--dry-run]"
disable-model-invocation: true
---

# /qa-review-bl — BL Invariant Triangulation Review & Auto-Apply

Audit the Business Logic oracle (`.claude/knowledge/oracles/business-logic.md`) against reality. For each in-scope `BL-*` invariant, gather evidence from **three independent axes** — **docs** (VirtoOZ MCP via `/vc-docs`), **live** (playwright via `qa-testing-expert`), **source code** (GitHub MCP on VirtoCommerce repos) — assign a verdict, and **auto-apply confirmed changes** to the oracle. Then reconcile test-case `Business_Rule` coverage so cases follow the corrected invariants.

> This is the mechanism that keeps the oracle honest. The oracle is the shared contract the whole QA pipeline judges against (violations auto-flag bugs, tests map assertions to `{BL}`, fixes must "preserve BL-*"), so drift here is high-blast-radius. **Auto-apply is gated by a strict evidence bar, not by a human** (see Rules): a change lands only when all three axes produced concrete, agreeing evidence.

## Usage
```
/qa-review-bl all                    # Audit every invariant (large — batch by domain)
/qa-review-bl domain cart            # Audit one domain (BL-CART-*)
/qa-review-bl BL-CART-010            # Audit a single invariant
/qa-review-bl diff                   # Audit invariants whose Source anchor changed, or promoted since last audit
/qa-review-bl domain cart --dry-run  # Triangulate + verdict, but write NOTHING (preview)
```

## Supporting Files

- **bl-audit-criteria.md** — the evidence bar per axis, which VirtoOZ tool / which repo to use per domain, the verdict decision table, and the edit-safety rules.

## Verdict taxonomy (per BL)

| Verdict | Meaning | Action |
|---------|---------|--------|
| **CONFIRMED** | 3 axes agree; Rule text is accurate | No Rule change; auto-apply a missing/refreshed `Source:` or `Verify:` only |
| **DRIFT** | 3 axes agree with each other but the Rule/Verify text is stale | Auto-apply corrected Rule/Verify + `Amended:` stamp |
| **MISSING** | Behavior is documented **and** coded **and** live, but no BL exists | Auto-apply a new `BL-<DOMAIN>-<NNN>` (next free ID; body only) |
| **CONTRADICTORY** | Axes disagree (e.g. docs say X, live shows Y) | **NOT confirmed** → `reports/ba/bl-proposals-<date>.md` for human |
| **UNGROUNDED** | ≥1 axis produced no evidence | **NOT confirmed** → proposals file |
| **STALE/RETIRE** | Behavior removed everywhere | Draft a retire proposal → proposals file (retiring is destructive; stays human-gated) |

> **"Confirmed" = CONFIRMED / DRIFT / MISSING with unanimous, evidenced triangulation.** Everything else routes to the proposals file. That is not a human gate on confirmed items — it is the definition of "not confirmed."

## Execution

### Step 0: Load references + collect the deterministic inventory

1. Read **bl-audit-criteria.md** (this folder) and the oracle `business-logic.md`.
2. Run the deterministic parser/linter — it is the single source for structure + coverage:
   ```
   npm run bl:audit:collect                       # JSON: every invariant + fields + coverage + structural findings
   npm run bl:audit:collect -- --filter=BL-CART   # one domain
   ```
   `scripts/knowledge/lint-bl.ts` parses all 149 invariants into structured fields, flags structural issues (**BLL-001** dup ID, **BLL-002** bad severity tag, **BLL-003** missing required field, **BLL-004** misfiled prefix, **BLL-005** sequence gaps), and cross-references `regression/suites/**` (**BLC-002** a suite cites a BL absent from the oracle; **BLC-004** an invariant no test case covers). Use its `invariants[]` as the work-list and its `findings[]` to seed the audit (a BLC-002 is a candidate rename/MISSING; a BLC-004 is a coverage gap for Step 4).

### Step 1: Triangulate each in-scope invariant (ba-system-analyzer)

Dispatch **ba-system-analyzer** to gather all three evidence axes for each invariant (see bl-audit-criteria.md for the per-domain source map). For every BL, capture concrete evidence, never a bare opinion:

- **Docs axis** — `/vc-docs` (VirtoOZ MCP). Pick the topic-scoped tool by domain (e.g. `StorefrontUserGuide`/`StorefrontDeveloperGuide` for cart/checkout UX, `PlatformDeveloperGuide` for platform/admin, `*SourceCode` for "where is this implemented"). Capture a **quote + doc reference**.
- **Source axis** — GitHub MCP `search_code` / `get_file_contents` on `org:VirtoCommerce` (read-only; QA never clones). Capture a **`file:line` anchor** and the relevant code shape.
- **Live axis** — delegate to **qa-testing-expert** (playwright-firefox) to OBSERVE the behavior via the real UI/API. Capture an **`{OBSERVED}` result + screenshot**. Honors the REAL-USER rule — no `browser_evaluate`/`run_code_unsafe` bypass.

### Step 2: Assign a verdict

Apply the taxonomy above using the decision table in bl-audit-criteria.md. A verdict of CONFIRMED/DRIFT/MISSING **requires** an evidence tuple from all three axes that agree; any missing or conflicting axis ⇒ UNGROUNDED / CONTRADICTORY.

### Step 3: Apply policy

- **CONFIRMED / DRIFT / MISSING (unanimous, evidenced)** → **auto-apply** to `business-logic.md`:
  - Edit the **entry body only** — never rewrite the meta Severity-Tags table (a separate edit if ever needed).
  - Stamp `- **Amended:** <date> (auto-applied, triangulated — BL-AUDIT-<date>)` and refresh `- **Source:**` (`file:line` + docs ref).
  - For MISSING, assign the next free `BL-<DOMAIN>-<NNN>` (read the oracle for the max), place under the correct `## Domain` heading, keep evidence env-agnostic (no env names/URLs/slugs — say "the environment").
- **CONTRADICTORY / UNGROUNDED / STALE-RETIRE** → write to `reports/ba/bl-proposals-<date>.md` (the existing draft format) for human decision. Do NOT edit the oracle.
- `--dry-run` → compute verdicts + the intended diff, write NOTHING.

### Step 4: Reconcile test-case coverage

Feed the audit back into the test-cases review flow (this is the "review BL with the test-cases review flow" tie-in):
- **BLC-002** (a suite cites a BL that doesn't resolve) and any ID renamed/added this run → run `/qa-review-tests suite <ID>` on the affected suites and apply the `Business_Rule` remap via `/qa-review-tests --fix` (which asks before writing CSVs).
- **BLC-004** (an invariant no case covers) → note as a coverage gap for `/qa-test-lifecycle` Phase 3 (generation). Do not fabricate cases here.

### Step 5: Write the audit report

Write `reports/knowledge/BL-AUDIT-<date>.md` (see `.claude/rules/reports.md` — knowledge-maintenance artifact, monitoring-summary size discipline, target 15–40 / cap ~100 lines):
- Per-BL verdict table (BL-ID, verdict, 3-axis evidence refs, action taken).
- **Applied** section: the entries auto-edited/added, with a one-line before→after each (full diff is in `git diff`).
- **Not applied** section: CONTRADICTORY/UNGROUNDED/RETIRE items → link to the proposals file.
- Coverage reconciliation summary (BLC-002 remaps, BLC-004 gaps).

## Rules

- **Auto-apply is gated by evidence, never by silence.** A change lands ONLY as CONFIRMED/DRIFT/MISSING with concrete, agreeing evidence from all three axes. No evidence on an axis ⇒ not confirmed ⇒ proposals file. (This deliberately replaces the former "never auto-edit business-logic.md / human per-entry approval" rule; see the memory update in the design.)
- **Body-only edits.** Never rewrite the Severity-Tags meta table as a side effect (`feedback_bl_promotion_table_separately`).
- **Env-agnostic** (`feedback_bl_oracle_env_agnostic`). No env names, URLs, or slugs in any applied entry — even in a `Source:`/evidence note.
- **Reversible.** Every applied edit is recorded in the BL-AUDIT report and lives in a git-tracked file; keep edits minimal and per-entry so a single one can be reverted.
- **Retiring is destructive** → always a human proposal, never auto-applied.
- **P0-security invariants** clear the *same* evidence bar as any other — but given blast radius, if the live axis cannot safely be observed (e.g. a real privilege-escalation probe), treat the axis as absent ⇒ UNGROUNDED ⇒ proposals file.

## Agent Delegation

| Situation | Agent | Browser |
|-----------|-------|---------|
| Triangulation (docs + source + verdict + apply) | **ba-system-analyzer** | playwright-firefox (own live checks) |
| Live behavior confirmation (the `{OBSERVED}` axis) | **qa-testing-expert** | playwright-firefox |
| Test-case `Business_Rule` remap (Step 4) | **test-management-specialist** via `/qa-review-tests --fix` | — |

Schedule ba-system-analyzer's firefox NOT in parallel with a QA firefox session (max 3 concurrent browser agents; see `.claude/rules/agents.md`).

## Integration with Other Skills

- **`/qa-review-tests`** — the downstream reconciliation (Step 4). BL-002/BL-004 there are the judgment twins of this skill's BLC-002/BLC-004.
- **`/qa-test-lifecycle`** — runs this skill as its **BL-audit phase** (replacing the old draft-only `--update-bl` step); its Phase 6 G6 gate reads the audit outcome.
- **`/ba-analyze`** — the other producer of BL candidates; unconfirmed items from both flows share `reports/ba/bl-proposals-<date>.md`.
