# Component audit — every skill, agent, command, rule and script

**Date:** 2026-09-07 · **Companion to** [`agentic-system-audit-2026-09-07.md`](agentic-system-audit-2026-09-07.md)
(which covers token economics). This one gives a **verdict per component**.

---

## 0. The reframe that should drive every decision

Size is not the problem. **Loading tier** is.

| tier | chars | % surface | cost |
|---|---:|---:|---|
| **ALWAYS loaded** (`CLAUDE.md` + 7 rules + harness menus) | 432,499 | **9.9%** | **72–76% of every run** — re-paid on each of ~41 dispatches |
| on invoke: command body | 504,759 | 11.5% | once, only if invoked |
| on invoke: `SKILL.md` body | 560,968 | 12.8% | once, only if invoked |
| on dispatch: agent definition | 361,894 | 8.3% | per dispatch |
| **only if explicitly read**: skill supporting files | 1,246,813 | 28.4% | ~free |
| **only if explicitly read**: `knowledge/` | 1,275,587 | 29.1% | ~free |

**57.5% of the corpus already costs nothing.** The redesign is therefore **re-tiering, not mass
deletion** — move content down a tier, and delete only what is provably dead.

---

## 1. The unifying law

> **Every contradiction found in this audit sits in a fact that was RESTATED instead of CITED.**

The counter-proof is in the same tree: the three facts stated **once** and cited elsewhere —
*who may transition a ticket*, *who may write a CSV*, and every agent's `model:` value — have
**zero drift**. So does `reports.md`'s size-cap table (14 files cite it; 2,412 chars of restatement).
Every drifted fact was paraphrased into a second home.

Restatement measured beyond the single source of truth:
`@td()` 101 KB / 97 files · FAST-vs-FULL 32 KB / 20 · firefox-cannot-click 25 KB / 67 ·
G0–G7 23 KB / 44 · no-auto-merge 16 KB / 29 · **report caps 2.4 KB / 14 ← the one done right.**

---

## 2. Defects that are not about tokens

These are correctness and safety bugs found while measuring. Fix these regardless of the redesign.

| # | Defect | Evidence |
|---|---|---|
| **D1** | **Seven commands are defined twice and `.claude/` is the stale side in every case.** Which one loads depends on whether `vc-fix` is installed at user level; nothing declares a winner. | `qa-bug` 27,171 vs **43,811** · `qa-fix` 22,813 vs 34,896 · `qa-verify-fix` 25,201 vs 32,594 · `qa-env-check` 8,287 vs 13,802 · `project-init` 8,808 vs 13,681 · `vc-self-check` 3,474 vs 5,605 · `qa-monitoring` 6,107 vs 7,056. **None identical.** `qa-bug` is the most-run command in the repo (179 runs). |
| **D2** | **Write-capable commands are model-invocable with no guard.** | `/qa-bug` files tracker tickets and auto-triggers on any sentence containing "bug"; **`/qa-review-oracles` + `/qa-review-bl` auto-apply edits to `business-logic.md` and the ECL** (7 write-signals). Set `disable-model-invocation: true` on all three. |
| **D3** | **The distributed oracle is missing 81 `BL-*` invariants**, including all of `BL-A11Y-001..004`. | plugin 145 ids vs `.claude` 226; plugin frozen 2026-08-10, CRLF vs LF. Only 5 of 99 mirrored paths have a parity gate. |
| **D4** | **`npm run map:refresh` corrupts its own artifact in a fresh clone.** | Run here it rewrote **every prior-BA date to today** (2026-07-28, 2026-06-08 → 2026-09-07), set `reports/tickets/` from **27 runs → 0**, and flipped LF→CRLF. The map's entire premise is *"a dated document is a HYPOTHESIS… every entry carries its own date"* — the generator destroys exactly that. `map:check` reporting DRIFT is the **generator** being non-deterministic (filesystem mtime + presence of `reports/`), not the map being stale. **Do not wire `map:check` to CI until the generator reads git dates.** |
| **D5** | **`ui-ux-expert` asserts a false gate.** Lines 155 and 338 call `critical-ui-scope.md` *"regression-enforced"* and say it *"gates the build"*; line 157 of the same file says *"Canonical regression suite: NONE"* (suite `048b` deleted 2026-07-25, all 197 cells `GAP`). | Delete the claim; it is wrong, not merely stale. |
| **D6** | **The interactive-UI agent is pinned to the lane that cannot click.** `rules/agents.md` line 96 assigns `qa-testing-expert` to `playwright-firefox`, 23 lines below the line-73 box saying firefox `browser_click` fails on this storefront and the Admin SPA (confirmed 6×). | Same table then queues `ba-system-analyzer` behind it on the same lane. |
| **D7** | **The `vs. DESIGN` axis has two owners and neither can run it.** `rules/agents.md` gives it to `ui-ux-expert` *and* lists `qa-testing-expert` doing "Claude Design spec comparison"; `mcp-browsers.md` states a **subagent does not inherit `DesignSync`**. | The orchestrator must read the spec and pass it in as data. |
| **D8** | **`rules/agents.md` line 3 documents the previous layout** — "17 agents … at the plugin root". They are at `.claude/agents/`; `plugin.json` was deliberately deleted. | |
| **D9** | **The documented CI schedule does not exist.** `rules/regression.md` describes "daily smoke 6 AM" and "weekly full regression, $80 budget". | **The `cron:` lines are commented out in all of `regression.yml`, `suite-audit.yml`, `monitor.yml`, `auto-fix.yml`, `full-cycle.yml`.** Only `unit-tests.yml` auto-triggers. `full-cycle.yml` also ends in `\|\| true`, so even a manual run cannot report red. |
| **D10** | Lockfile drift: `package.json` is **0.8.1**, committed `package-lock.json` says **0.7.1**. | Fix with the project's own npm — an older npm also strips `libc` metadata from 4 optional deps. |
| **D11** | `skills/README.md` says 40 skills; there are **41**. `project-init/REDESIGN.md` (7.7 KB) has zero references. | |

---

## 3. Commands (31)

| verdict | n | commands |
|---|---:|---|
| **KEEP-AS-IS** | 9 | `qa-review-oracles` `qa-triage-results` `qa-hotfix` `qa-hotfix-check` `qa-perf-measure` `qa-seed-data` `qa-status` `qa-deploy-pr` `qa-review-bl` |
| **TRIM** (~48 KB) | 9 | `qa-test` −12 K · `qa-fix` −8 K · `qa-test-plan` −7 K · `qa-bug` −6 K · `qa-verify-fix` −6 K · `qa-local-env` −4 K · `qa-sitemap` −4 K · `qa-env-check` −3 K · `qa-monitoring` −1 K |
| **SPLIT-TO-SKILL** (~85 KB) | 5 | `qa-test-lifecycle` −40 K · `qa-regression` −14 K · `qa-exploratory` −12 K (→ existing `qa-sbtm`) · `qa-design` −10 K · `ba-analyze` −9 K |
| **MERGE** | 4 | `qa-coverage-generation`→`qa-coverage-gap` · `qa-smoke`→`qa-regression smoke` · `ba-stories`→`ba-analyze stories` · `qa-bundle-check`→`qa-hotfix --check` |
| **DEMOTE-TO-DOCS** | 1 | `qa-onboarding` → `docs/onboarding.md` (both targets already exist) |
| **DELETE** | 3 | `code-review-full` (duplicates the harness's own `/code-review`, `/security-review`, `/simplify`; 0 runs) · `project-init` and `vc-self-check` **from `.claude/` only** — the plugin copies are canonical |

**The structural correlation: 6 of the 8 commands that carry methodology inline have no backing
skill.** A command with nowhere to put methodology grows one. Genuine shells (`qa-deploy-pr`,
`qa-perf-measure`, `qa-review-oracles`, `qa-triage-results`, `qa-bundle-check`) are all ≤13 KB,
all have a skill, and all cite rather than restate — that is the target shape.

## 4. Skills (41)

| verdict | n | skills |
|---|---:|---|
| **KEEP-AS-IS** | 29 | incl. all 6 developer skills (a clean reproduce/fix × dotnet/vue/shell matrix, each named as a specific gate owner) and `vc-docs` (7 KB, 50 referrers — the best leverage-per-byte in the tree) |
| **TRIM** (~110 KB) | 5 | `qa-sbtm` −55 K · `qa-investigate` −25 K · `qa-api` −13 K · `qa-storybook` −9 K · `project-init` −7.7 K |
| **DEMOTE-TO-DOCS** | 5 | `qa-checklist` · `qa-postman` · `qa-coverage-gap` · `qa-plan` · `qa-risk` |
| **MERGE** | 1 | `qa-evidence` → `rules/reports.md` (its `output-paths.md` is a **second, diverging** report policy) |
| **DELETE** | 1 | `qa-process` (30 KB ISTQB essay, zero inbound references) |

**Correction to the obvious hypothesis.** The "methodology cluster" is *not* dead weight: three of
its documents are read at real decision points (`qa-metrics/quality-gates.md` — 47 referrers, the 5e
gate; `qa-test-design` §1a FLOW — mandatory at `/qa-test` 1e; `qa-defect/defect-lifecycle-workflow.md`
— `/qa-fix` G0). **The wrappers are the waste, not the content.** Readers cite files *by path*, so
merging skills would rename 60+ call sites for nothing. Drop the dead wrappers; leave the reference
docs where readers already point.

`qa-test`'s 14-file / 254 KB tree has **zero orphans** — all 13 supporting files are cited by the
command. It is the one skill where the file count is justified.

*Marker for "a docs folder wearing a skill wrapper": a supporting file cited by exactly one
"Supporting Files" bullet and by nothing procedural.*

## 5. Agents (17)

All 17 have a caller — there are no orphan agents.

| verdict | detail |
|---|---|
| **MERGE 4 → 2** | `fullstack-backend` + `fullstack-frontend` → **`fullstack-dev`** (~9 K); `backend-reviewer` + `frontend-reviewer` → **`fix-reviewer`** (~5 K). They are 34% and 46% verbatim clones, `repo-router.ts` already returns `kind` as **data**, and every stack-specific instruction already lives in a skill. Saves ~24 KB and removes the drift risk that 46% verbatim guarantees. |
| **MERGE 3 → 2** | `qa-testing-expert` → `qa-frontend-expert` (25% verbatim). Its only differentiator is *occupying a third browser lane* — a dispatch parameter, not an identity — and that lane is firefox (D6). |
| **TRIM 9** | Largest: `ui-ux-expert` −27 K, `ba-doc-writer` −24 K (it **forked** `virto-doc-style.md` rather than citing it — only 632 chars verbatim), `ba-system-analyzer`, `qa-lead-orchestrator`, `test-management-specialist`, `regression-orchestrator`, `ba-story-writer`, `ba-api-specialist`, `test-data-engineer`. |
| **KEEP clean** | `test-runner-agent` — 0 shared chars with `regression-orchestrator`, a real substitution contract. The one agent needing no change. |
| **model:** | **opus 9 → 5.** Demote `ui-ux-expert` (its judgement is `axe` + `getBoundingClientRect` + `verify-design-spec.ts` output against a fixed rubric) and both reviewers (a checklist against a written gate ladder). Justified: `fullstack-*` (code synthesis), `test-data-engineer` (the §SECOND RULE falsifiability judgement), `qa-backend/frontend-expert` (open-ended triage). Orchestrators are already sonnet — correct. |

## 6. Rules (7) — always-loaded 279 KB → ~10 KB

| file | now | verdict | always-need | archaeology |
|---|---:|---|---:|---:|
| `skills-commands.md` | 64,548 | **DELETE** — the harness renders this menu from frontmatter already | ~0% | — |
| `regression.md` | 80,625 | **SPLIT** → 12 K index + 4 on-demand files | ~12% | ~45% |
| `test-data.md` | 41,411 | **TRIM → 10 K**, demote | ~20% | ~35% |
| `reports.md` | 40,876 | **TRIM → 10 K**, demote | ~25% | ~35% |
| `quality-gates.md` | 20,291 | **KEEP as SSOT**, load only for `/qa-fix` | ~5% | ~10% |
| `agents.md` | 19,927 | **TRIM → 7 K** — the ONE always-loaded file | ~35% | ~25% |
| `mcp-browsers.md` | 11,635 | **MERGE** into `agents.md` (+3 K) | ~30% | ~15% |

## 7. Scripts and CI — the healthiest layer, and the cheapest win

**The script layer is sound.** Only 3 of 306 files are unreferenced. `scripts/` ↔ `ci/` share **zero
basenames** and 20 real imports — a genuine shared-lib split, not copy-paste.

**The whole offline gate set runs in 11.8 s; `npm test` is 53 s / 2,663 tests / 0 failures.**

| gate | wall | now | verdict |
|---|---:|---|---|
| `suites:lint` | 3.3 s | exit 0 | **WIRE-TO-CI** — best-designed gate here; its baseline-ratchet is the pattern to copy |
| `bl:lint` · `ecl:lint` | 1.4 s ea | exit 0 | **WIRE-TO-CI** |
| `suites:executability:check` · `scope:validate` | 1.8 / 1.3 s | exit 0 | **WIRE-TO-CI** |
| `td:validate` | 1.4 s | **exit 1** — one malformed `@td(ADDR_NY.*)` in `042-smoke-tests.csv` | **FIX-THEN-WIRE** (one-line fix) |
| `map:check` | 0.7 s | **exit 1 — DRIFT** | **FIX THE GENERATOR FIRST** (D4) |
| `selectors:check` | 3.0 s | **exit 1 — real drift** | **WIRE SCHEDULED-ONLY** — it tracks an external HEAD; as a PR gate it blocks unrelated PRs |
| `tokens:check` | 0.5 s | **exit 2 — source unreachable** | **FIX-THEN-WIRE** — repoint at the `vc-frontend` clone `selectors:check` already reaches (unpkg is proxy-blocked) |
| `schema:check` · `sitemap:check` · `releases:check` | — | env-dependent | **REMOVE from the gate list** — liveness probes, not drift gates. `schema:check` renders nothing and must never be cited as one. |

**The context-budget gate proposed in the companion audit does not need building — it exists.**
`npm run qa-test:doclint` runs in **260 ms**, already lints *prose* for dead `npm run` references,
missing `§` anchors and count-vs-table mismatch with a baseline ratchet, and its current findings
**are this audit's findings** (including `model:lint` not existing). It is scoped to
`.claude/{commands,skills}/qa-test` — **point it at `.claude/**` + `CLAUDE.md` and it becomes the
anti-drift gate for the whole corpus.**

Two more cheap builds displace the most prose per line of code: a `reports:lint` (~120 LOC) for the
§2 caps / §3 sections / open-and-fixed-duplicate rules, and `tracker:verify-comment` (~40 LOC) for
the §5.0 screenshot assertions — a check that has failed in production twice (VCST-5281, VCST-5733).

**`seed:*` sprawl is in the npm layer, not the code.** 33 teardown aliases look dead to grep because
`seed-bootstrap.mjs` dispatches 22 of them **by file path**, not by `npm run`. Keep the files; cull
~31 aliases (219 → 188 scripts) with zero behaviour change.

---

## 8. Do this in order

1. **Resolve the seven forked commands** (D1) and set `disable-model-invocation` on the three
   write-capable ones (D2). Safety, one afternoon.
2. **Re-sync the plugin oracle** (D3) — normalise CRLF→LF first, then extend
   `mirror-parity.test.mjs` from 5 files to all 99 shared paths, or stop calling it a mirror.
3. **Delete `rules/skills-commands.md`** (64,548 chars, zero replacement needed).
4. **Replace `CLAUDE.md ## Detailed References`** with a pointer table (−85,500).
5. **Re-tier the remaining rules** per §6 — always-loaded 432 K → ~55 K.
6. **Wire `gates.yml`**: `gates-offline` (11.8 s, blocking on PR) + `gates-external` (scheduled,
   advisory). Fix `td:validate` and the `map:refresh` generator first.
7. **Extend `qa-test:doclint` to `.claude/**` + `CLAUDE.md`** — this is the ratchet that stops §2 of
   the companion audit from recurring.
8. Then the component merges: agents 17 → 14, commands 31 → 26, skills 41 → 35.
