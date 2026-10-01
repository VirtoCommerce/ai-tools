---
name: qa-review-oracles
description: "[QA Method] Keep the shared oracles true and reconcile test-case citations. bl: sync the bl/<slug>.yaml rules from human sources (AC, docs, Jira resolutions) and re-run SUSPECT checks. ecl: triangulate e-commerce-edge-cases-library.md against docs + live + source and auto-apply confirmed changes. Runs via ba-system-analyzer."
argument-hint: "[bl|ecl|all] <scope> [--dry-run]"
disable-model-invocation: true
---

# /qa-review-oracles — Oracle Review: BL sync, ECL triangulation

Keep the QA pipeline's **shared oracles** true, then reconcile the test-case citations that point at what changed. The two axes now differ in **method** (BL 2.0, `docs/bug-detection-requirements.md` §7.3a):

- **`bl`** — **sync, not triangulation.** A rule changes only from a **human source** (ticket AC, a docs page, a Jira bug resolution); a run that contradicts a rule makes it `SUSPECT` and files a bug; `SUSPECT` rules are resolved from the Jira decision or a re-run of their check. Code + live agreeing never edits a rule. Records live in `bl/<slug>.yaml`; `business-logic.md` is their render. Rules: **bl-audit-criteria.md**.
- **`ecl`** — **three-axis triangulation** (docs via `/vc-docs`, live via playwright, source via GitHub MCP), verdict, auto-apply what is confirmed. Rules: **ecl-audit-criteria.md**.

Shared once, here: the single writer, the stable-ID contract, the deterministic lint core, the value gate on growth, and the citation reconciliation into `regression/suites/**`.

## Usage
```
/qa-review-oracles all                      # both oracles, full scope (large — batch)
/qa-review-oracles bl domain cart           # BL-CART-* rules
/qa-review-oracles bl BL-CART-010           # a single rule
/qa-review-oracles bl suspect               # every SUSPECT rule: resolve from Jira, re-run checks
/qa-review-oracles bl inferred              # INFERRED rules: look for a human source
/qa-review-oracles bl diff                  # rules whose tickets got a resolution or whose code_ref changed
/qa-review-oracles ecl all                  # every ECL section
/qa-review-oracles ecl chapter 14           # one chapter (§14.x — the VC-specific patterns)
/qa-review-oracles ecl ECL-13.3             # a single section
/qa-review-oracles ecl diff                 # sections touched since the last audit
/qa-review-oracles bl domain cart --dry-run # compute operations, write NOTHING (preview)
```
Omitting the axis means `all`. **`/qa-review-bl` is a retained alias** for `/qa-review-oracles bl` — `/qa-test-lifecycle` Phase 4c invokes it by name, which is why the alias is model-invocable and this skill is not.

## Supporting Files

- **bl-audit-criteria.md** — BL axis: what may change a record (human sources only), the operations (SYNC / SYNC-UPDATE / NEW / MARK-SUSPECT / RESOLVE / RE-RUN / RETIRE), where to find the source per domain, how to write a YAML record, and the value gate.
- **The value model** — `scripts/knowledge/oracle-significance.ts` (the two value axes + the gate) driven by `npm run oracles:rank` (`scripts/knowledge/rank-oracles.ts`). The evidence bar answers *is this TRUE?*; this answers *is this WORTH CARRYING?*, on **two axes an entry must satisfy together** — **business** (what a violation costs) and **product** (how much of the tested product leans on it). It sets the audit ORDER (Step 0), the promotion RULE (Step 3), and the **Value** column the proposals file and the audit report carry. Per-axis signals: bl-audit-criteria §6, ecl-audit-criteria §9.
- **ecl-audit-criteria.md** — ECL axis: the same, adapted to pattern rows — chapter→evidence-source map, the generic-vs-VC-specific table shapes, the **never-renumber** ID contract, Appendix D coherence, and when a dangling citation means ADD-a-section vs REMAP-the-citation.

## Axis contract — what differs, and only this

| | **`bl`** | **`ecl`** |
|---|---|---|
| Method | sync from human sources + `SUSPECT` re-check (bl-audit-criteria §1) | three-axis triangulation + verdict (below) |
| Oracle file | `knowledge/oracles/bl/<slug>.yaml` (rendered to `business-logic.md` by `npm run bl:render`; never edit the md) | `knowledge/oracles/e-commerce-edge-cases-library.md` |
| Entry unit | a YAML record (`templates/bl.schema.json`): rule, priority, trust, source, check, status | `### <n>.<m>` section containing pattern **rows** in a pipe table (Pattern / Description / Frequency / Impact / BL ref) |
| ID contract | `BL-<DOMAIN>-<NNN>`; next free NNN per domain; retired IDs not reused | `ECL-<n>.<m>`; **never renumber a surviving section**; a retired number is never reused; a new section takes the next free one in its chapter |
| Deterministic core | `npm run bl:audit:collect` (`scripts/knowledge/lint-bl.ts`) + `npm run bl:convert:check` | `npm run ecl:audit:collect` (`scripts/knowledge/lint-ecl.ts`) |
| Citation column in suites | `Business_Rule` | `Edge_Case_Refs` |
| Dangling-citation rule | **BLC-002** | **ECLC-001** |
| Uncovered-entry rule | **BLC-004** | **ECLC-002** |
| Unparsable-suite rule | **BLC-005** | **ECLC-003** |
| Business value (what a violation costs) | the entry's own **severity tag** (`P0-*` high · `P1-*` medium · `P2-ux` low · absent unknown) | the severity of the **`BL-*` invariant the section declares** — its own `BL Invariant` column where it has one (chapter 14 only), else its **Appendix D** row; declares none ⇒ `unknown` (never proxied from prose or `Frequency`, and an Appendix D cell opening with an em dash declares nothing) |
| Product value (what leans on it) | citing-case demand + a `BL-CROSS` level | citing-case demand + `[OBSERVED]` share + a High-`Frequency` level (exposure, not cost) |
| Promotion queue | `npm run oracles:rank -- --axis=bl` | `npm run oracles:rank -- --axis=ecl` |
| Proposals file | **none** | `reports/ba/ecl-proposals-<date>.md` |
| Audit report | `reports/knowledge/BL-AUDIT-<date>.md` | `reports/knowledge/ECL-AUDIT-<date>.md` |

Everything below applies to **both** axes unless a row above says otherwise.

## Verdict taxonomy — ECL axis

The `bl` axis does not use these verdicts: it applies the operations in **bl-audit-criteria.md §1**.

| Verdict | Meaning | Action |
|---------|---------|--------|
| **CONFIRMED** | 3 axes agree; the entry text is accurate | No body change; auto-apply a missing/refreshed `Source:` / provenance only |
| **DRIFT** | 3 axes agree with each other but the entry text is stale | Auto-apply the corrected text + `Amended:` stamp |
| **MISSING** | Behavior is documented **and** coded **and** live, but no entry exists | Auto-apply a new entry at the next free ID (body only) |
| **DUPLICATE** | Two entries carry the same signal | Merge into the survivor, delete the loser, **report both IDs** |
| **CONTRADICTORY** | Axes disagree (docs say X, live shows Y) | **NOT confirmed** → not applied |
| **UNGROUNDED** | ≥1 *applicable* axis produced no evidence, or was unverifiable this run | **NOT confirmed** → not applied |
| **STALE/RETIRE** | Behavior removed everywhere | Never auto-applied (retiring is destructive) |

> **"Confirmed" = CONFIRMED / DRIFT / MISSING / DUPLICATE where every *applicable* axis is evidenced and the axes agree.** Everything else is not applied: it goes to the audit report (ECL: also its proposals file).
>
> **Applicable-axes waiver (structurally-unavailable axis).** The bar is docs + live + source when all three *can* exist. An axis that is **structurally unavailable** — most importantly **no docs for a brand-new / undocumented / pre-GA module** — is **waived (N/A)**, not scored as UNGROUNDED. The bar then becomes the axes that CAN be verified, and **at least two must remain and agree** (a lone surviving axis never canonicalizes). Waiving is only for a *structurally* absent axis (the doc/feature does not exist yet), never for an axis you simply didn't check. Every waived axis is stamped `N/A (<reason>)`. A candidate whose applicable axes **contradict** (commonly **deploy lag** — a merged fix not on the pinned artifact) or that has an **unverifiable** applicable axis is **held as a draft with a re-audit trigger**, not applied — a *not-yet*, not a failure.
>
> **Two independent gates.** Truth (the verdict, or for BL the human source) is necessary, not sufficient: a **new** entry must ALSO clear the **significance bar** (Step 3, `oracle-significance.ts`), because that is the only change that makes an oracle bigger. A true-but-low-value candidate is **HELD** (audit report, not written); a **correction to an existing entry** applies at any tier — a known-false rule is worse than a low-value true one.
>
> **Deletion needs positive evidence.** RETIRE/DUPLICATE require evidence the thing is *dead or redundant*, never mere absence of proof it is alive. An entry you could not reach evidence for is CONFIRMED-by-default and left alone.

## Execution

### Step 0: Load references + collect the deterministic inventory

1. Read the axis's criteria file and the in-scope entries (BL: `npm run bl:extract -- --domain <d>`; ECL: the library).
2. Run the axis's deterministic core — it is the single source for structure + citation coverage, and its **findings seed the audit**:
   ```
   npm run bl:audit:collect                        # BL: invariants + fields + coverage + structural findings
   npm run bl:audit:collect -- --filter=BL-CART    # one domain
   npm run ecl:audit:collect                       # ECL: sections + citing cases + structural findings
   ```
   A **dangling citation** (BLC-002 / ECLC-001) is a MISSING-or-REMAP candidate — see the judgment rule below. An **uncovered entry** (BLC-004 / ECLC-002) is a coverage gap for Step 4. An **unparsable suite** (BLC-005 / ECLC-003) invalidates both readings for the entries it cites and must be reported, never treated as clean.

3. Rank the axis, and **scope the run from the head of the queue** rather than in file order:
   ```
   npm run oracles:rank -- --axis=bl                # Value + business + product + the gate, per entry/candidate
   npm run oracles:rank -- --axis=bl --candidates   # dangling cited ids only
   npm run oracles:rank -- --axis=ecl --tier=T3     # the low end of the queue
   ```
   Order is **business value → product value → score → demand**, so what the business pays most for
   and the product leans on hardest is audited first, and the budget is never spent walking the file
   top-to-bottom. The queue is **input, not verdict**: everything in it still has to clear the
   evidence bar below.

> **A dangling citation means ADD or REMAP — and the cluster size tells you which.** When many cases reach for the same non-existent ID, the likely story is that the **oracle is missing content the authors expected to find**, not that every author independently mis-cited. Read the citing cases and decide per cluster: **ADD** the entry at that exact ID when the content belongs and the number is free — this retroactively makes every existing citation true, the cheapest correct fix — or **REMAP** when an existing entry already covers it. **This skill never edits a CSV** — remapping is handed to `/qa-review-tests --fix` at Step 4.

### Step 1: Gather evidence per entry — PARALLEL fan-out (ba-system-analyzer)

**BL:** per record, the batch agent reads the tickets in its `source` and `suspect_reason` (Jira: AC, resolutions) and the docs (VirtoOZ), runs its `check` on its own slot (RE-RUN, criteria §1a), and returns **one operation + the proposed YAML change**. **ECL:** the three-axis triangulation below.

Evidence gathering is read-only and per-entry, so **run it in parallel**. Split the in-scope entries into disjoint batches (by domain/chapter, then chunk) and dispatch **up to 3 `ba-system-analyzer` agents concurrently** (one Agent-tool call per batch, all in a single message — matches the 3-slot browser pool, `.claude/rules/agents.md`). Each parallel agent gets its **own isolated browser slot** (`playwright-firefox` / `playwright-chrome` / `playwright-edge` — never shared) and a **distinct test/org user** if the live axis needs auth (a shared org cart contaminates). A parallel agent **gathers evidence + assigns a verdict + returns the proposed edit only — it does NOT write the oracle** (that is the serialized Step 3).

ECL: each agent captures the three axes with concrete evidence, never a bare opinion (per-domain/chapter source map is in the criteria file):

- **Docs axis** — `/vc-docs` (VirtoOZ MCP), topic-scoped tool by domain (`StorefrontUserGuide`/`StorefrontDeveloperGuide` for cart/checkout UX, `PlatformDeveloperGuide` for platform/admin, `*SourceCode` for "where is this implemented"). Capture a **quote + doc reference**.
- **Source axis** — GitHub MCP `search_code` / `get_file_contents` on `org:VirtoCommerce` (read-only; QA never clones). Capture a **`file:line` anchor** and the relevant code shape.
- **Live axis** — OBSERVE the behavior via the real UI/API. Capture an **`{OBSERVED}` result + screenshot**. Honors the REAL-USER rule — no `browser_evaluate` / `run_code_unsafe` bypass.
  > **In parallel mode (the default) each batch agent does its OWN live observation on its assigned slot — do NOT sub-delegate to `qa-testing-expert`.** Three batch agents already occupy the three browser slots; a sub-delegated fourth blows the cap. `qa-testing-expert` is reserved for a *sequential* single-entry deep-dive after the batches finish. (Only in a single-batch run is delegating the live axis to `qa-testing-expert` on `playwright-firefox` the right call.)
  > **If an axis's tooling fails mid-run — GitHub API rate limit, MCP timeout — degrade explicitly, don't silently drop it.** Accepted fallback for the source axis: reuse the `file:line` already recorded in a related entry's `Source:` field and say you did, then lean on the live axis for reachability. That is a **two-axis** result under the applicable-axes waiver, and the outstanding anchor must be named in the report. A tooling failure is never the same as "no evidence exists".

### Step 2: Assign a verdict (ECL) or an operation (BL)

ECL: the taxonomy above, the criteria file's decision table, the waiver and the deletion bar. BL: one operation per record, bl-audit-criteria §1.

### Step 3: Apply policy — SINGLE-WRITER fan-in

Collect the verdicts from all parallel agents, then apply **serially, one entry at a time, in this one orchestrator process**. Concurrent writes to an oracle race and corrupt the file — the parallel agents returned proposed edits, they did not write. For MISSING, re-read the current max ID immediately before each insert so two parallel-discovered entries can't claim the same one.

- **MISSING (ECL) / NEW (BL) — a new entry** → apply only when it is valuable **for the business AND for the
  product**. Re-score the candidate with the severity tag the triangulation just assigned (for ECL,
  with the `BL-*` invariant the pattern endangers linked in its row) and read the gate verbatim —
  ```
  npm run oracles:rank -- --explain=BL-L10N-001 --severity=P1-ux
  ```

  | Business (what a violation costs) | Promotes when | Value label |
  |---|---|---|
  | `high` — `P0-revenue` / `P0-security` | **always** — uncited means untested, not unimportant, and the oracle is what test authoring reads | `high` (product `medium`+) / `qualified` |
  | `medium` — `P1-data` / `P1-ux` | product value is `medium`+ (≥3 citing cases, or ≥1 with cross-domain reach / predominantly-`[OBSERVED]` rows) | `qualified` |
  | `low` — `P2-ux` | **never.** Demand cannot buy a cosmetic rule into a file whose purpose is judging PASS/FAIL | `low` |
  | `unknown` — no tag (BL) / no linked invariant (ECL) | **never.** Declaring what a violation costs is the price of entry | `undeclared` |

  `APPLY` ⇒ insert it. `HOLD` ⇒ **do not write it**; record it in the audit report's *Held* section
  with both axes and its demand, so the decision is re-derivable and the entry can be promoted later
  once the missing half is established. `EXCLUDED` ⇒ never promote: name the redirect
  (`performance-thresholds.md` / `browser-quirks.md` / the owning domain's own invariant) and hand
  the citations to Step 4 so traceability MOVES rather than being destroyed.
- **A correction to an existing entry** (ECL CONFIRMED / DRIFT / DUPLICATE; BL SYNC / SYNC-UPDATE / MARK-SUSPECT / RESOLVE) → **auto-apply whatever its
  value** (the gate governs growth, never correction).
- **BL edits** follow bl-audit-criteria §3: the YAML record only, then `npm run bl:render` and `npm run bl:convert:check`.
- **ECL edits:**
  - Edit the **entry body only** — **Appendix D is updated deliberately, as its own coherent edit**, never incidentally.
  - Stamp `Amended: <date> (auto-applied, triangulated — ECL-AUDIT-<date>)` and refresh the `Source:` anchor.
  - For MISSING, assign the next free ID under the correct heading; **never renumber survivors**.
  - Keep evidence **env-agnostic** — no env names, URLs or slugs; say "the environment".
- **ECL CONTRADICTORY / UNGROUNDED / STALE-RETIRE, BL RETIRE** → audit report (ECL: also its proposals file). Do NOT edit the oracle.
- `--dry-run` → compute verdicts + the intended diff, write NOTHING.

### Step 4: Reconcile test-case citations

Feed the audit back into the test-case review flow:
- **Dangling / renamed / newly-added IDs** → run `/qa-review-tests suite <ID> --fix` (or `file <path> --fix`) on the affected suites so the `Business_Rule` / `Edge_Case_Refs` cells follow. **`test-management-specialist` owns that write**; this skill never edits a CSV.
- **Uncovered entries** → note as a coverage gap for `/qa-test-lifecycle` Phase 3 (generation). Do not fabricate cases here.

### Step 5: Re-run the gate, then write the audit report

Re-run the axis's gates (`npm run bl:convert:check` + `npm run bl:lint` / `npm run ecl:lint`) — **it is the acceptance check for your own edits**, and its High count belongs in the report. Then write the audit report (`.claude/rules/reports.md` — knowledge-maintenance artifact, target 15–40 / cap ~100 lines): per-entry verdict (ECL) or operation (BL) table with evidence refs and a **Value** column (`business · product → label`, from `oracles:rank`) · **Applied** (one line before→after each; the full diff is in `git diff`) · **Held** (confirmed but not valuable enough — id, both axes, citing-case count, and which half is missing) · **Excluded** (non-invariant class + the redirect) · **Not applied** (link the proposals file) · citation reconciliation summary · the gate's before/after counts.

## Rules

- **A change is gated by evidence, never by silence.** ECL: only CONFIRMED/DRIFT/MISSING/DUPLICATE with agreeing evidence from every applicable axis. BL: only a human source changes what a rule says; code + live agreeing never does.
- **Truth and value are separate gates, in that order.** Evidence decides whether an entry is real;
  value decides whether a real one is worth carrying — and value has **two axes an entry must satisfy
  together**, business and product. The value gate NEVER promotes an unconfirmed entry, and it NEVER
  blocks a correction to an existing one — it bounds growth only.
- **No entry enters an oracle without a declared business value.** A BL invariant declares it with
  its severity tag; an ECL pattern declares it by naming the `BL-*` invariant it endangers. Undeclared
  is not a formality — an entry nobody can price is one no downstream skill can weigh either.
- **Rank before you scope, and carry the Value column.** Auditing in file order spends the budget
  where the value is not. The queue is deterministic (`oracle-significance.ts`), so a promotion
  decision is re-derivable rather than argued from memory. The **Value** column is mandatory in the
  audit report (and an ECL proposals file) — and **derived there, never stored in the oracle**: product
  value moves with every suite edit, so a number transcribed into an oracle would be wrong
  by the next commit and wrong silently (`.claude/rules/test-data.md` §GOLDEN RULE).
- **Never infer a value signal from prose.** Only closed vocabularies score — the BL severity, the ECL
  `Frequency`/`Status` columns. An unreadable cell contributes ZERO; it is never guessed.
- **Parallel fan-out, single-writer fan-in.** Triangulate in parallel (≤3 browser agents, disjoint batches, isolated sessions); apply from **one** serialized writer.
- **IDs are a citation contract.** ~65 test cases point at ECL section numbers and hundreds at BL IDs. **Never renumber a surviving entry**, never reuse a retired ID. Renumbering silently repoints every citation that was correct.
- **Body-only edits.** Never rewrite a meta table as a side effect.
- **Env-agnostic** and data-agnostic — no hardcoded IDs/SKUs/prices/emails/URLs in any applied entry, even inside an evidence note.
- **Never edit a CSV from this skill.** Citation remaps are `/qa-review-tests --fix`'s write, under `test-management-specialist`.
- **Reversible.** Every applied edit is recorded in the audit report and lives in a git-tracked file; keep edits minimal and per-entry so one can be reverted alone.
- **Retiring is destructive** → never auto-applied.
- **P0-security invariants** clear the *same* evidence bar — but given blast radius, if the live axis cannot safely be observed (e.g. a real privilege-escalation probe), treat the axis as absent ⇒ UNGROUNDED ⇒ not applied.

## Agent Delegation

| Situation | Agent | Browser |
|-----------|-------|---------|
| Evidence batch (ECL: triangulation; BL: sources + check re-runs) — **up to 3 in parallel** | **ba-system-analyzer** ×N | one distinct slot each: `playwright-firefox` / `playwright-chrome` / `playwright-edge` |
| A single complex/high-risk live repro the batch agent can't safely observe | **qa-testing-expert** | its own slot (sequential, not a 4th concurrent browser) |
| Apply to the oracle (Step 3) | the **orchestrator** (this skill) — single writer, serialized | — |
| Test-case citation remap (Step 4) | **test-management-specialist** via `/qa-review-tests --fix` | — |

**Concurrency cap: 3 browser agents total** (`.claude/rules/agents.md`). In parallel mode each batch agent does its **own** live observation on its assigned slot — it does NOT additionally sub-delegate the live axis to `qa-testing-expert` (that would exceed the cap). Reserve `qa-testing-expert` for a follow-up single-entry deep-dive, run sequentially. Each parallel agent uses a **distinct browser session + distinct test user**; never share.

## Integration with Other Skills

- **`/qa-review-tests`** — the downstream reconciliation (Step 4). Its **Dimension 6** is the judgment twin of this skill's BLC-002/ECLC-001: the lints prove a citation *exists*; Dimension 6 proves it is *right* (a loyalty case citing `ECL-13.2` "Subscription & Recurring Billing" resolves fine, so no gate can object). Its **Dimension 11** (`--triangulate`) is the same three-axis mechanism applied to test-case assertions — deliberately NOT folded in here, because its write target is CSVs, not an oracle.
- **`/qa-test-lifecycle`** — runs the `bl` axis as Phase **4c**, scoped to the `BL-*` a run contradicted or surfaced (MARK-SUSPECT, RESOLVE, SYNC from the ticket's AC); its Phase 6 G6 gate reads the outcome.
- **`/ba-analyze`** — the other producer of BL candidates; neither flow writes a proposals file.
