---
name: qa-review-oracles
description: "[QA Method] Triangulate an oracle against docs + live + source code, auto-apply confirmed changes, and reconcile test-case citations. Two axes: bl (business-logic.md invariants) and ecl (e-commerce-edge-cases-library.md sections). Delegates the live axis to qa-testing-expert; runs triangulation via ba-system-analyzer."
argument-hint: "[bl|ecl|all] <scope> [--dry-run]"
disable-model-invocation: true
---

# /qa-review-oracles — Oracle Triangulation Review & Auto-Apply

Keep the QA pipeline's **shared oracles** grounded in reality. For each in-scope entry, gather evidence from **three independent axes** — **docs** (VirtoOZ MCP via `/vc-docs`), **live** (playwright via `qa-testing-expert`), **source code** (GitHub MCP on VirtoCommerce repos) — assign a verdict, **auto-apply confirmed changes**, and reconcile the test-case citations that point at what changed.

> **Why one skill, two axes.** The oracles differ in *content shape* but are identical in *mechanism*: same writer, same three axes, same evidence bar, same auto-apply-vs-proposals split, same stable-ID contract, same deterministic lint core, same citation cross-reference into `regression/suites/**`. That machinery is the bulk of the work and lives here once. What is genuinely per-oracle — the evidence bar's domain source map, the entry schema, the edit-safety rules — lives in the two criteria files below and nowhere else.

## Usage
```
/qa-review-oracles all                      # both oracles, full scope (large — batch)
/qa-review-oracles bl domain cart           # BL-CART-* invariants
/qa-review-oracles bl BL-CART-010           # a single invariant
/qa-review-oracles bl diff                  # BLs whose Source anchor changed / promoted since last audit
/qa-review-oracles ecl all                  # every ECL section
/qa-review-oracles ecl chapter 14           # one chapter (§14.x — the VC-specific patterns)
/qa-review-oracles ecl ECL-13.3             # a single section
/qa-review-oracles ecl diff                 # sections touched since the last audit
/qa-review-oracles bl domain cart --dry-run # triangulate + verdict, write NOTHING (preview)
```
Omitting the axis means `all`. **`/qa-review-bl` is a retained alias** for `/qa-review-oracles bl` — it is referenced from `/qa-test-lifecycle` Phase 4c, `/ba-analyze`, `.claude/rules/*`, and the agent definitions, so it keeps working rather than silently breaking Phase 4c.

## Supporting Files

- **bl-audit-criteria.md** — BL axis: the evidence bar per axis (incl. the §1a `docs: N/A` allowance), which VirtoOZ tool / which repo to use per domain, the verdict decision table, and the edit-safety rules.
- **ecl-audit-criteria.md** — ECL axis: the same, adapted to pattern rows — chapter→evidence-source map, the generic-vs-VC-specific table shapes, the **never-renumber** ID contract, Appendix D coherence, and when a dangling citation means ADD-a-section vs REMAP-the-citation.

## Axis contract — what differs, and only this

| | **`bl`** | **`ecl`** |
|---|---|---|
| Oracle file | `knowledge/oracles/business-logic.md` | `knowledge/oracles/e-commerce-edge-cases-library.md` |
| Entry unit | `### BL-<DOMAIN>-<NNN>` invariant with a fixed field schema (Rule / Verify / Violation signal / Agents) + severity tag | `### <n>.<m>` section containing pattern **rows** in a pipe table (Pattern / Description / Frequency / Impact / BL ref) |
| ID contract | `BL-<DOMAIN>-<NNN>`; next free NNN per domain; retired IDs not reused | `ECL-<n>.<m>`; **never renumber a surviving section**; a retired number is never reused; a new section takes the next free one in its chapter |
| Deterministic core | `npm run bl:audit:collect` (`scripts/knowledge/lint-bl.ts`) | `npm run ecl:audit:collect` (`scripts/knowledge/lint-ecl.ts`) |
| Citation column in suites | `Business_Rule` | `Edge_Case_Refs` |
| Dangling-citation rule | **BLC-002** | **ECLC-001** |
| Uncovered-entry rule | **BLC-004** | **ECLC-002** |
| Unparsable-suite rule | **BLC-005** | **ECLC-003** |
| Proposals file | `reports/ba/bl-proposals-<date>.md` | `reports/ba/ecl-proposals-<date>.md` |
| Audit report | `reports/knowledge/BL-AUDIT-<date>.md` | `reports/knowledge/ECL-AUDIT-<date>.md` |

Everything below applies to **both** axes unless a row above says otherwise.

## Verdict taxonomy

| Verdict | Meaning | Action |
|---------|---------|--------|
| **CONFIRMED** | 3 axes agree; the entry text is accurate | No body change; auto-apply a missing/refreshed `Source:` / provenance only |
| **DRIFT** | 3 axes agree with each other but the entry text is stale | Auto-apply the corrected text + `Amended:` stamp |
| **MISSING** | Behavior is documented **and** coded **and** live, but no entry exists | Auto-apply a new entry at the next free ID (body only) |
| **DUPLICATE** | Two entries carry the same signal | Merge into the survivor, delete the loser, **report both IDs** |
| **CONTRADICTORY** | Axes disagree (docs say X, live shows Y) | **NOT confirmed** → proposals file |
| **UNGROUNDED** | ≥1 *applicable* axis produced no evidence, or was unverifiable this run | **NOT confirmed** → proposals file |
| **STALE/RETIRE** | Behavior removed everywhere | Draft a retire proposal → proposals file (retiring is destructive; stays human-gated) |

> **"Confirmed" = CONFIRMED / DRIFT / MISSING / DUPLICATE where every *applicable* axis is evidenced and the axes agree.** Everything else routes to the proposals file. That is not a human gate on confirmed items — it is the definition of "not confirmed."
>
> **Applicable-axes waiver (structurally-unavailable axis).** The bar is docs + live + source when all three *can* exist. An axis that is **structurally unavailable** — most importantly **no docs for a brand-new / undocumented / pre-GA module** — is **waived (N/A)**, not scored as UNGROUNDED. The bar then becomes the axes that CAN be verified, and **at least two must remain and agree** (a lone surviving axis never canonicalizes). Waiving is only for a *structurally* absent axis (the doc/feature does not exist yet), never for an axis you simply didn't check. Every waived axis is stamped `N/A (<reason>)`. A candidate whose applicable axes **contradict** (commonly **deploy lag** — a merged fix not on the pinned artifact) or that has an **unverifiable** applicable axis is **held as a draft with a re-audit trigger**, not applied — a *not-yet*, not a failure.
>
> **Deletion needs positive evidence.** RETIRE/DUPLICATE require evidence the thing is *dead or redundant*, never mere absence of proof it is alive. An entry you could not reach evidence for is CONFIRMED-by-default and left alone.

## Execution

### Step 0: Load references + collect the deterministic inventory

1. Read the axis's criteria file (**bl-audit-criteria.md** / **ecl-audit-criteria.md**) and the oracle itself.
2. Run the axis's deterministic core — it is the single source for structure + citation coverage, and its **findings seed the audit**:
   ```
   npm run bl:audit:collect                        # BL: invariants + fields + coverage + structural findings
   npm run bl:audit:collect -- --filter=BL-CART    # one domain
   npm run ecl:audit:collect                       # ECL: sections + citing cases + structural findings
   ```
   A **dangling citation** (BLC-002 / ECLC-001) is a MISSING-or-REMAP candidate — see the judgment rule below. An **uncovered entry** (BLC-004 / ECLC-002) is a coverage gap for Step 4. An **unparsable suite** (BLC-005 / ECLC-003) invalidates both readings for the entries it cites and must be reported, never treated as clean.

> **A dangling citation means ADD or REMAP — and the cluster size tells you which.** When many cases reach for the same non-existent ID, the likely story is that the **oracle is missing content the authors expected to find**, not that every author independently mis-cited. Read the citing cases and decide per cluster: **ADD** the entry at that exact ID when the content belongs and the number is free — this retroactively makes every existing citation true, the cheapest correct fix — or **REMAP** when an existing entry already covers it. Worked example (2026-08-06): 24 layout-stability cases citing `ECL-1.4`–`1.8` and 20 smoke cases citing `ECL-10.4`–`10.8` were ADDs; a lone `ECL-13.4` was a REMAP onto a newly-added `ECL-6.4`. **This skill never edits a CSV** — remapping is handed to `/qa-review-tests --fix` at Step 4.

### Step 1: Triangulate each in-scope entry — PARALLEL fan-out (ba-system-analyzer)

Triangulation is read-only and per-entry, so **run it in parallel**. Split the in-scope entries into disjoint batches (by domain/chapter, then chunk) and dispatch **up to 3 `ba-system-analyzer` agents concurrently** (one Agent-tool call per batch, all in a single message — matches the 3-slot browser pool, `.claude/rules/agents.md`). Each parallel agent gets its **own isolated browser slot** (`playwright-firefox` / `playwright-chrome` / `playwright-edge` — never shared) and a **distinct test/org user** if the live axis needs auth (a shared org cart contaminates — `feedback_concurrent_runners_distinct_org_users_taskstop`). A parallel agent **gathers evidence + assigns a verdict + returns the proposed edit only — it does NOT write the oracle** (that is the serialized Step 3).

Each agent captures the three axes with concrete evidence, never a bare opinion (per-domain/chapter source map is in the criteria file):

- **Docs axis** — `/vc-docs` (VirtoOZ MCP), topic-scoped tool by domain (`StorefrontUserGuide`/`StorefrontDeveloperGuide` for cart/checkout UX, `PlatformDeveloperGuide` for platform/admin, `*SourceCode` for "where is this implemented"). Capture a **quote + doc reference**.
- **Source axis** — GitHub MCP `search_code` / `get_file_contents` on `org:VirtoCommerce` (read-only; QA never clones). Capture a **`file:line` anchor** and the relevant code shape.
- **Live axis** — OBSERVE the behavior via the real UI/API. Capture an **`{OBSERVED}` result + screenshot**. Honors the REAL-USER rule — no `browser_evaluate` / `run_code_unsafe` bypass.
  > **In parallel mode (the default) each batch agent does its OWN live observation on its assigned slot — do NOT sub-delegate to `qa-testing-expert`.** Three batch agents already occupy the three browser slots; a sub-delegated fourth blows the cap. `qa-testing-expert` is reserved for a *sequential* single-entry deep-dive after the batches finish. (Only in a single-batch run is delegating the live axis to `qa-testing-expert` on `playwright-firefox` the right call.)
  > **If an axis's tooling fails mid-run — GitHub API rate limit, MCP timeout — degrade explicitly, don't silently drop it.** Accepted fallback for the source axis: reuse the `file:line` already recorded in a related entry's `Source:` field and say you did, then lean on the live axis for reachability. That is a **two-axis** result under the applicable-axes waiver, and the outstanding anchor must be named in the report. A tooling failure is never the same as "no evidence exists".

### Step 2: Assign a verdict

Apply the taxonomy above using the decision table in the axis's criteria file, including the applicable-axes waiver and the deletion bar.

### Step 3: Apply policy — SINGLE-WRITER fan-in

Collect the verdicts from all parallel agents, then apply **serially, one entry at a time, in this one orchestrator process**. Concurrent writes to an oracle race and corrupt the file — the parallel agents returned proposed edits, they did not write. For MISSING, re-read the current max ID immediately before each insert so two parallel-discovered entries can't claim the same one.

- **CONFIRMED / DRIFT / MISSING / DUPLICATE (evidenced, agreeing)** → **auto-apply**:
  - Edit the **entry body only** — never rewrite a meta/summary table as a side effect (BL: the Severity-Tags table; ECL: **Appendix D is updated deliberately, as its own coherent edit**, never incidentally).
  - Stamp `Amended: <date> (auto-applied, triangulated — <BL|ECL>-AUDIT-<date>)` and refresh the `Source:` anchor.
  - For MISSING, assign the next free ID under the correct heading; **never renumber survivors**.
  - Keep evidence **env-agnostic** — no env names, URLs or slugs; say "the environment".
- **CONTRADICTORY / UNGROUNDED / STALE-RETIRE** → the axis's proposals file for human decision. Do NOT edit the oracle.
- `--dry-run` → compute verdicts + the intended diff, write NOTHING.

### Step 4: Reconcile test-case citations

Feed the audit back into the test-case review flow:
- **Dangling / renamed / newly-added IDs** → run `/qa-review-tests suite <ID> --fix` (or `file <path> --fix`) on the affected suites so the `Business_Rule` / `Edge_Case_Refs` cells follow. **`test-management-specialist` owns that write**; this skill never edits a CSV.
- **Uncovered entries** → note as a coverage gap for `/qa-test-lifecycle` Phase 3 (generation). Do not fabricate cases here.

### Step 5: Re-run the gate, then write the audit report

Re-run the axis's lint (`npm run bl:lint` / `npm run ecl:lint`) — **it is the acceptance check for your own edits**, and its High count belongs in the report. Then write the audit report (`.claude/rules/reports.md` — knowledge-maintenance artifact, target 15–40 / cap ~100 lines): per-entry verdict table with 3-axis evidence refs · **Applied** (one line before→after each; the full diff is in `git diff`) · **Not applied** (link the proposals file) · citation reconciliation summary · the gate's before/after counts.

## Rules

- **Auto-apply is gated by evidence, never by silence.** A change lands ONLY as CONFIRMED/DRIFT/MISSING/DUPLICATE with concrete, agreeing evidence from every applicable axis. No evidence on an applicable axis ⇒ not confirmed ⇒ proposals file. (This deliberately replaces the former "never auto-edit business-logic.md / human per-entry approval" rule: safety comes from the evidence bar, not a human gate.)
- **Parallel fan-out, single-writer fan-in.** Triangulate in parallel (≤3 browser agents, disjoint batches, isolated sessions); apply from **one** serialized writer.
- **IDs are a citation contract.** ~65 test cases point at ECL section numbers and hundreds at BL IDs. **Never renumber a surviving entry**, never reuse a retired ID. Renumbering silently repoints every citation that was correct.
- **Body-only edits.** Never rewrite a meta table as a side effect (`feedback_bl_promotion_table_separately`).
- **Env-agnostic** (`feedback_bl_oracle_env_agnostic`) and data-agnostic — no hardcoded IDs/SKUs/prices/emails/URLs in any applied entry, even inside an evidence note.
- **Never edit a CSV from this skill.** Citation remaps are `/qa-review-tests --fix`'s write, under `test-management-specialist`.
- **Reversible.** Every applied edit is recorded in the audit report and lives in a git-tracked file; keep edits minimal and per-entry so one can be reverted alone.
- **Retiring is destructive** → always a human proposal, never auto-applied.
- **P0-security invariants** clear the *same* evidence bar — but given blast radius, if the live axis cannot safely be observed (e.g. a real privilege-escalation probe), treat the axis as absent ⇒ UNGROUNDED ⇒ proposals file.

## Agent Delegation

| Situation | Agent | Browser |
|-----------|-------|---------|
| Triangulation batch (docs + source + live + verdict) — **up to 3 in parallel** | **ba-system-analyzer** ×N | one distinct slot each: `playwright-firefox` / `playwright-chrome` / `playwright-edge` |
| A single complex/high-risk live repro the batch agent can't safely observe | **qa-testing-expert** | its own slot (sequential, not a 4th concurrent browser) |
| Apply to the oracle (Step 3) | the **orchestrator** (this skill) — single writer, serialized | — |
| Test-case citation remap (Step 4) | **test-management-specialist** via `/qa-review-tests --fix` | — |

**Concurrency cap: 3 browser agents total** (`.claude/rules/agents.md`). In parallel mode each batch agent does its **own** live observation on its assigned slot — it does NOT additionally sub-delegate the live axis to `qa-testing-expert` (that would exceed the cap). Reserve `qa-testing-expert` for a follow-up single-entry deep-dive, run sequentially. Each parallel agent uses a **distinct browser session + distinct test user**; never share.

## Integration with Other Skills

- **`/qa-review-tests`** — the downstream reconciliation (Step 4). Its **Dimension 6** is the judgment twin of this skill's BLC-002/ECLC-001: the lints prove a citation *exists*; Dimension 6 proves it is *right* (a loyalty case citing `ECL-13.2` "Subscription & Recurring Billing" resolves fine, so no gate can object). Its **Dimension 11** (`--triangulate`) is the same three-axis mechanism applied to test-case assertions — deliberately NOT folded in here, because its write target is CSVs, not an oracle.
- **`/qa-test-lifecycle`** — runs the `bl` axis as its always-on BL-audit phase (**4c**), scoped to the `BL-*` a run surfaced; its Phase 6 G6 gate reads the audit outcome.
- **`/ba-analyze`** — the other producer of oracle candidates; unconfirmed items from both flows share the proposals files.
