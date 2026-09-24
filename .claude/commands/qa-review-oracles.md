---
description: "Audit a shared QA oracle against docs + live + source code, auto-apply confirmed changes, and reconcile test-case citations. Two axes: bl (business-logic.md invariants) and ecl (e-commerce-edge-cases-library.md sections). Gated by a 3-source evidence bar (not human approval); unconfirmed items route to the proposals file."
argument-hint: "[bl|ecl|all] <scope> [--dry-run]"

---

# /qa-review-oracles — Oracle Triangulation Review & Auto-Apply

Keep the QA pipeline's shared oracles grounded in reality. For each in-scope entry, gather evidence from three independent axes — **docs** (VirtoOZ), **live** (playwright), **source code** (GitHub MCP) — assign a verdict, and **auto-apply confirmed changes**. Then reconcile the test-case citations that point at whatever changed. Fans the triangulation out across **up to 3 parallel `ba-system-analyzer` agents** (one browser slot each, each doing its own live axis), then applies confirmed edits from a **single serialized writer** (`qa-testing-expert` is reserved for a sequential deep-dive on a hard live repro). The methodology lives in the [`/qa-review-oracles` skill](../skills/qa-review-oracles/SKILL.md) — this command is the terminal entry.

**`/qa-review-bl` is a retained alias for `/qa-review-oracles bl`** (kept because `/qa-test-lifecycle` Phase 4c auto-runs it).

## Usage
```
/qa-review-oracles all                      # Both oracles (large — batch internally)
/qa-review-oracles bl domain cart           # BL-CART-* invariants
/qa-review-oracles bl BL-CART-010           # A single invariant
/qa-review-oracles bl diff                  # BLs whose Source anchor changed / promoted since last audit
/qa-review-oracles ecl all                  # Every ECL section
/qa-review-oracles ecl chapter 14           # One chapter (§14.x — VC-specific patterns)
/qa-review-oracles ecl ECL-13.3             # A single section
/qa-review-oracles ecl diff                 # Sections touched since the last audit
/qa-review-oracles bl domain cart --dry-run # Triangulate + verdict, write NOTHING
```

---

## Axis selection

| Axis | Oracle | Deterministic core | Suite citation column | Criteria file |
|---|---|---|---|---|
| **`bl`** | `.claude/knowledge/oracles/business-logic.md` | `bl:audit:collect` / `bl:lint` | `Business_Rule` | [bl-audit-criteria.md](../skills/qa-review-oracles/bl-audit-criteria.md) |
| **`ecl`** | `.claude/knowledge/oracles/e-commerce-edge-cases-library.md` | `ecl:audit:collect` / `ecl:lint` | `Edge_Case_Refs` | [ecl-audit-criteria.md](../skills/qa-review-oracles/ecl-audit-criteria.md) |

Omitting the axis means `all` (run `bl` then `ecl`; they touch different files, so they do not race — but do not interleave their single-writer applies).

## Pipeline: Collect → Triangulate → Verdict → Apply → Reconcile → Gate → Report

### Step 1 — Parse axis + scope

- **`bl`**: `all` · `domain <name>` (`cart` → `BL-CART`, `checkout` → `BL-CHK`, `b2b` → `BL-B2B`, `pricing` → `BL-PRICE`, …) · `BL-<ID>` · `diff` (Source anchor changed on GitHub, or a recent `Amended:`/`Promoted:` stamp with no audit trail).
- **`ecl`**: `all` · `chapter <n>` (§`<n>`.x) · `ECL-<n>.<m>` · `diff` (sections touched since the last audit).

`--dry-run` computes verdicts + the intended diff but writes nothing — no oracle edit, no report, no proposals.

### Step 2 — Collect the deterministic inventory

```
npm run bl:audit:collect -- --filter=<prefix>    # BL: invariants + fields + coverage + structural findings
npm run ecl:audit:collect                        # ECL: sections + citing cases + structural findings
```
(`scripts/knowledge/lint-bl.ts` — BLL-001..005 structural; BLC-002 dangling suite→oracle citation; BLC-004 uncovered invariant; BLC-005 unparsable suite. `scripts/knowledge/lint-ecl.ts` — ECLL-001 duplicate section; ECLL-002/003 Appendix D coherence; ECLL-004 padded spelling; ECLC-001 dangling citation; ECLC-002 uncited section; ECLC-003 unparsable suite.)

```
npm run oracles:rank -- --axis=bl                # Value column: business + product + the gate, per entry/candidate
npm run oracles:rank -- --axis=bl --candidates   # dangling cited ids only
npm run oracles:rank -- --axis=ecl --tier=T3     # the low end of the queue
```
**Scope the run from the head of that queue, not from file order** — order is business value →
product value → score → demand, so what the business pays most for and the product leans on hardest
is audited first. The queue is input, never a verdict:
everything in it still has to clear the evidence bar.

> **A dangling citation is a MISSING-or-REMAP candidate, and the cluster size decides which.** Many cases reaching for the same absent id usually means the *oracle* is missing content the authors expected — **ADD** at that exact id (which retroactively makes every existing citation true). A handful whose subject is already covered elsewhere is a mis-citation — **REMAP**, and hand the CSV write to `/qa-review-tests --fix`. Never invent an entry purely to turn the gate green.

### Step 3 — Triangulate in parallel (fan-out), then apply single-writer (fan-in)

The triangulation is read-only and per-entry, so **run it in parallel** — but the apply is a shared-file write, so it is **serialized to a single writer**.

**3a — Fan-out (parallel, read-only):** split the in-scope entries into disjoint batches (by domain/chapter, then chunk) and dispatch **up to 3 `ba-system-analyzer` agents concurrently** — one Agent-tool call per batch, all in a single message. This matches the 3-slot browser pool ([agents.md](../rules/agents.md): batch browser work in groups of 3). Each parallel agent:
- gets its **own isolated browser slot** — distinct servers across the batch (`playwright-firefox` / `playwright-chrome` / `playwright-edge`); never share a session;
- uses a **distinct test/org user** if the live axis needs auth (a shared org cart contaminates — `feedback_concurrent_runners_distinct_org_users_taskstop`);
- gathers all three axes (docs `/vc-docs` + source GitHub MCP — no browser; live observation on its assigned slot), assigns a verdict (CONFIRMED / DRIFT / MISSING / DUPLICATE / CONTRADICTORY / UNGROUNDED / STALE-RETIRE), and **returns the verdict + evidence tuple + the proposed edit** — it does **NOT** write the oracle itself.

**3b — Fan-in (single writer, serialized):** the orchestrator collects all batches' verdicts, then applies edits **sequentially, one entry at a time, in one process** — concurrent writes to the same file race and corrupt it. Auto-apply CONFIRMED/DRIFT/MISSING/DUPLICATE (body-only, `Amended:` + `Source:` stamp, env-agnostic; MISSING reads the current max id fresh before each insert so parallel-discovered entries can't collide). Unconfirmed → the axis's proposals file.

**3c — The value gate (growth only): valuable for the BUSINESS *and* for the PRODUCT.** A confirmed verdict is necessary, not sufficient. A **MISSING** entry — the only verdict that makes the oracle bigger — must clear both axes. Re-score it with the severity tag the triangulation just assigned (ECL: with the `BL-*` invariant the pattern endangers linked in its row) and read the gate verbatim:
```
npm run oracles:rank -- --explain=BL-L10N-001 --severity=P1-ux
```

| Business value = what a violation costs | Promotes | Value label |
|---|---|---|
| `high` — `P0-revenue` / `P0-security` | **at any demand** (uncited means untested, not unimportant) | `high` / `qualified` |
| `medium` — `P1-data` / `P1-ux` | only at product `medium`+ (≥3 citing cases, or ≥1 with cross-domain reach / predominantly-`[OBSERVED]` rows) | `qualified` |
| `low` — `P2-ux` | **never** — demand cannot buy a cosmetic rule into a file whose purpose is judging PASS/FAIL | `low` |
| `unknown` — no severity tag (BL) / no linked invariant (ECL) | **never** — declaring the cost is the price of entry | `undeclared` |

`APPLY` ⇒ insert. `HOLD` ⇒ do not write it; record it in the audit report's **Held** section (id, both axes, citing cases, which half is missing). `EXCLUDED` ⇒ never promote — name the redirect and move the citations at Step 4. A **correction to an entry that already exists** (CONFIRMED / DRIFT / DUPLICATE) applies whatever its value: holding a known-false rule back is strictly worse than carrying a low-value true one.

Full rules: [SKILL.md](../skills/qa-review-oracles/SKILL.md) + the axis's criteria file.

### Step 4 — Reconcile test-case citations

- Dangling / renamed / newly-added ids → `/qa-review-tests suite <ID> --fix` (or `file <path> --fix`) on the affected suites. **`test-management-specialist` owns that write — this command never edits a CSV.**
- Uncovered entries (BLC-004 / ECLC-002) → note as a coverage gap for `/qa-test-lifecycle` Phase 3. Do not fabricate cases here.

### Step 5 — Re-run the gate, then report

Re-run the axis's lint (`npm run bl:lint` / `npm run ecl:lint`) — **it is the acceptance check for this run's own edits**; a run that raises the High count has broken something. Then write `reports/knowledge/BL-AUDIT-<date>.md` or `ECL-AUDIT-<date>.md` (verdict table with a **Value** column — `business · product → label`, from `oracles:rank` — + Applied + **Held** (confirmed but not valuable enough, with which axis is missing) + **Excluded** (non-invariant class + redirect) + Not-applied + citation reconciliation + the gate's before/after counts), per [.claude/rules/reports.md](../rules/reports.md).

---

## Rules

- **Auto-apply is gated by a 3-source evidence bar, never by silence.** A change lands only as CONFIRMED/DRIFT/MISSING/DUPLICATE with concrete, agreeing docs + source + live evidence. Missing/conflicting applicable axis ⇒ not confirmed ⇒ proposals file.
- **Truth and value are two gates, in that order.** Evidence decides whether an entry is real; value (`scripts/knowledge/oracle-significance.ts`, `npm run oracles:rank`) decides whether a real one is worth carrying — on **two axes it must satisfy together**, business and product. It never promotes an unconfirmed entry and never blocks a correction to an existing one — it bounds GROWTH only. **A `low` entry is not a delete list**: low value is not positive evidence the entry is dead.
- **No entry enters an oracle without a declared business value** — a severity tag (BL) or the `BL-*` invariant the pattern endangers (ECL). An entry nobody can price is one no downstream skill can weigh.
- **The Value column is derived at decision time, never stored in the oracle.** Product value moves with every suite edit, so a transcribed number would be wrong by the next commit and wrong silently (`.claude/rules/test-data.md` §GOLDEN RULE). It belongs in the proposals file and the audit report — snapshots of one decision at one date.
- **Never infer a value signal from prose.** Only closed vocabularies score — the BL severity tag, the ECL `Frequency`/`Status` columns. An unreadable cell contributes zero and caps the tier; it is never guessed.
- **IDs are a citation contract — never renumber a surviving entry, never reuse a retired id.** Renumbering silently repoints every citation that was correct, and no gate can detect it because the new refs still resolve.
- **Deletion needs positive evidence** that the thing is dead or redundant — never mere absence of proof it is alive. This bites hardest on `ecl`, where "I could not reproduce it" is the *normal* state for an edge case.
- **Body-only edits.** Never rewrite a meta table as a side effect (`feedback_bl_promotion_table_separately`); ECL's Appendix D is updated deliberately, as its own edit.
- **Env- and data-agnostic** entries — no env names/URLs/slugs/SKUs/prices (`feedback_bl_oracle_env_agnostic`).
- **Never edit a CSV from this command** — citation remaps go through `/qa-review-tests --fix`.
- **Retiring an entry is always a human proposal**, never auto-applied.
- **REAL-USER rule** on the live axis — no `browser_evaluate`/`run_code_unsafe` bypass.
- **Parallel fan-out, single-writer fan-in.** Up to 3 `ba-system-analyzer` agents concurrently (disjoint batches, one isolated browser slot + distinct test user each) for the read-only triangulation; then apply from **one serialized writer** (this command). Max 3 concurrent browser agents ([agents.md](../rules/agents.md)).
- `--dry-run` writes nothing — use it to preview a domain or chapter before applying.
- **The lints prove a citation EXISTS; they cannot prove it is RIGHT.** A ref resolving to a real-but-wrong entry passes every gate — that is `/qa-review-tests` **Dimension 6**'s judgment call. Never read a green lint as evidence the citations are correct.
