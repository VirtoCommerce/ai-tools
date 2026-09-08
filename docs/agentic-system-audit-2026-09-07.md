# Agentic system audit — token economics & redesign

**Date:** 2026-09-07 · **Scope:** the whole prompt surface (`CLAUDE.md`, `.claude/`, `plugins/`)
**Method:** direct measurement of the repo at `0cb3078`, plus four parallel evidence agents.
Every number below is measured, not estimated from memory. Reproduce with the commands in §7.

---

## 1. The finding in two lines

**Cost:** the system pays **432,499 chars (~113,800 tokens) of always-loaded instructions on every turn
*and re-pays it on every subagent dispatch*.** A FULL `/qa-test` run makes ~41 dispatches; a
`full` regression makes ~125. That preamble is therefore **72–76% of every run's token cost**,
and it is byte-identical every time.

**Reality:** that corpus documents a system larger than the one that runs. **13 of 31 commands
have no evidence of ever running, 76 of 135 suites (2,134 cases) have never executed, 1% of test
cases have ever caught a bug, and 0 of the 8 declared CI drift gates are wired into any workflow**
(§4b). 4.25 MB of instructions support 22 recorded regression runs.

| | chars | tokens |
|---|---:|---:|
| `CLAUDE.md` | 110,154 | 28,988 |
| `.claude/rules/regression.md` | 80,625 | 21,217 |
| `.claude/rules/skills-commands.md` | 64,548 | 16,986 |
| `.claude/rules/test-data.md` | 41,411 | 10,898 |
| `.claude/rules/reports.md` | 40,876 | 10,757 |
| `.claude/rules/quality-gates.md` | 20,291 | 5,340 |
| `.claude/rules/agents.md` | 19,927 | 5,244 |
| `.claude/rules/mcp-browsers.md` | 11,635 | 3,062 |
| harness menu (41 skill + 31 cmd + 17 agent frontmatter) | 43,032 | 11,324 |
| **total always-loaded** | **432,499** | **~113,816** |

---

## 2. Why it keeps growing: the ratchet

Net line churn in `.claude/` + `CLAUDE.md`:

| week | added | deleted | net |
|---|---:|---:|---:|
| 2026-W33 | +58,950 | **-0** | +58,950 |
| 2026-W34 | +59,033 | **-1** | +59,032 |
| 2026-W35 | +3,457 | -1,088 | +2,369 |
| 2026-W36 | +14,760 | -2,379 | +12,381 |

`CLAUDE.md` went **36,825 → 110,154 chars in four weeks (3.0×)**. `.claude` markdown went
3.39 MB → 4.31 MB. **Nothing is ever removed.** This is the root cause; every other finding is
a symptom. The system has no mechanism that makes deletion anyone's job.

Structural signal: **prose:code ratio is 1.1 : 1** — 6.30 MB of instructions against 5.99 MB of code.

---

## 3. Where the always-loaded budget actually goes

`CLAUDE.md` by section:

| section | chars | share |
|---|---:|---:|
| `## Detailed References` | **87,013** | **79%** |
| `## Project Overview` | 16,157 | 15% |
| `## Repository Structure` | 2,163 | 2% |
| `## Essential Rules` | **1,261** | **1%** |
| everything else | 3,560 | 3% |

The section named *"Detailed References"* is 48 lines that each **name a canonical file and then
inline its contents anyway**. Its longest single bullet is **30,459 chars (~8,000 tokens) on one
line**. Seven bullets about `/qa-test` internals total 65,262 chars.

Those destinations already exist and are **richer than the summary**:
`.claude/skills/qa-test/` holds **254,125 chars** across 11 files
(`authoring.md` 35,369 · `modes.md` 30,925 · `exploratory-lane.md` 17,767 · `coverage-triage.md`
17,175 · `visual-axis.md` 17,091 · `close-out.md` 16,540 · `test-model.md` 16,030 ·
`contract-refresh.md` 13,471 · `axes.md` 12,718 …).

The section that *should* be always-loaded — `## Essential Rules` — is **1,261 chars**. The
ratio is inverted 69 : 1.

---

## 4. Verified defects

### 4.1 Transcribed counts are already stale — the system violates its own GOLDEN RULE

`.claude/rules/test-data.md` §GOLDEN RULE: *"If a value has a source of truth, read it from
there. Never transcribe it into our code… A transcribed constant is correct exactly once."*
The always-loaded set breaks this at least 14 times:

| claim (in docs) | measured reality | source of truth |
|---|---|---|
| 126 suites | **135** | `config/test-suites.json` |
| 4,155 test cases | **4,487** | sum of manifest `testCount` |
| 37 selection groups | **38** | manifest |
| `full` = 119 suites | **125** (135 − 10 excludes) | manifest |
| 918 / 4,243 Critical | **973 / 4,487** | CSV recount |
| 1,961 Frontend cases | **2,121** | CSV recount |
| `history.json` 108 rows | **112** | the file |
| `reports/exploratory/` = 1 session | **9** | `ls` |
| vc-fix 0.8.6 / vc-perf 0.2.6 | **0.8.7 / 0.2.7** | `plugin.json` |

Counts of commands (31), skills (41) and agents (17) are currently correct — but by hand, not by
construction, so they are one commit from being wrong.

### 4.2 `skills-commands.md` (64,548 chars) is a duplicate of a menu the harness provides free

The harness already injects every command and skill description from its own frontmatter
(14,459 + 18,098 chars). `skills-commands.md` is a **hand-written second copy**, and it has
already drifted — `/qa-status` frontmatter and its table row say different things.

**This file is deletable outright with no replacement.** ~17K tokens × 41 dispatches =
**~697K tokens saved per FULL `/qa-test` run**.
(A generated fallback was prototyped anyway: 64,548 → 11,105 chars, −82.8%.)

### 4.3 The distributed plugin ships an oracle missing 81 invariants — a correctness bug

| | `plugins/vc-fix/` | `.claude/` |
|---|---:|---:|
| `business-logic.md` size | 168,534 | 386,721 |
| distinct `BL-*` ids | **145** | **226** |
| last commit | **2026-08-10** | 2026-09-04 |
| line endings | **CRLF** | LF |

**81 invariants are missing from the copy customers run**, including the entire
`BL-A11Y-001..004` family that `CLAUDE.md` describes as a new mandatory blocking axis. The
CRLF/LF split means any future `diff` reads as 100% changed and hides the drift.

Of 99 paths present in both trees: 35 byte-identical (580 KB), 64 drifted (1.22 MB), of which
**24 pairs at ≥20% drift (518 KB) are genuine forks — two answers to one question.**
Only **5 files** have a parity gate (`scripts/unit/mirror-parity.test.mjs`, correctly wired into
`.github/workflows/unit-tests.yml`). The other **94 pairs are governed by prose alone.**

### 4.4 Restatement, not copy-paste — which is why no tool catches it

Verbatim overlap across `.claude` is only ~56 KB. The corpus **paraphrases** instead, so byte-diff
tooling is blind to it. Measured restatement beyond the single source of truth:

| fact | SSOT | files restating it | chars beyond SSOT |
|---|---|---:|---:|
| never-hardcode / `@td()` | `rules/test-data.md` | 97 | 101,082 |
| FAST-vs-FULL path | `knowledge/execution/ticket-routing.md` | 20 | 31,999 |
| firefox-cannot-click | `rules/agents.md` | 67 | 25,205 |
| gate ladder G0–G7 | `rules/quality-gates.md` | 44 | 22,978 |
| no-auto-merge triple guard | `rules/quality-gates.md` | 29 | 16,185 |
| report size caps | `rules/reports.md` | 14 | **2,412** |

**Report size caps is the counter-example done right** — those 14 files *cite* `rules/reports.md`
instead of restating it. That is the pattern the other five should follow.

Agent definitions are near-clones of each other despite `shared-instructions.md` existing to
prevent it: `fullstack-backend` ↔ `fullstack-frontend` 34% verbatim, the two reviewers 46%.

### 4.5 The command↔skill split added surface instead of replacing it

`/qa-test` = 54,161 (command) + 254,138 (skill tree) = **308 KB for one command**, with only 3.0%
verbatim overlap — the command kept every gate criterion, so the skill is pure addition. The
stated rationale (1,044 lines was too big) was met by making the total ~3× larger.

And the split is absent where size is worst: **`commands/qa-test-lifecycle.md` is 66,449 chars —
the largest file in `.claude/commands/` — with no backing skill and 0% overlap with the skills it
claims to reuse.** `qa-test.md` and `qa-test-lifecycle.md` share **0 of 8,177 8-grams** while
documenting an explicitly shared Step-3 pipeline: two independent accounts of one mechanism.

---

## 4b. The decisive finding: declared capability vastly exceeds exercised capability

The audit above treats bloat as a cost problem. Usage evidence reconstructed from git
(804 report files ever added; HEAD deleted the reports tree) shows it is also a **reality problem.**

| surface | declared | evidenced as ever run |
|---|---:|---:|
| commands | 31 | **18** — 13 have zero artifact evidence; **3 provably never-run** (`/qa-triage-results`, `/qa-coverage-generation`, `/vc-self-check`); **6 more ran exactly once** |
| skills | 41 | 17 (1:1 with an evidenced command). **24 produce no artifact at all** |
| regression suites | 135 | **59** — **76 suites / 2,134 cases have NEVER executed**; 36 of the 59 ran once |
| test cases | 4,487 | ≤**1,483 (33%)** ever observed green |
| drift gates | 8 "CI gates" | **0 wired into any workflow**; 3 currently RED (`selectors:check` exit 1, `tokens:check` exit 2, `map:check` reports drift) |
| npm scripts | 219 | 56 referenced by nothing (incl. all 18 `seed:*:teardown`) |

**The whole prompt surface is 4.25 MB for a system with 22 recorded regression runs and 27
recorded `/qa-test` runs.**

Three findings deserve separate mention because they invalidate load-bearing claims:

- **`tc:yield`, run live: 46 of 4,429 cases (1%) have ever caught a bug**, and **131 of 161 bug
  reports (81%) name no case at all.** `CLAUDE.md` says "36 of 4,185" — the real ratio is worse.
- **The headless CI pipelines have never completed a run.** `history-ci-runs.json` is absent
  (daily 6am smoke + weekly $80 full regression), `reports/suite-audit/` is empty (the weekday
  25-week rotation), `.seen-fingerprints.json` absent (monitoring dedup).
- **Every derived axis documented at 500+ words in `CLAUDE.md` fires in ≤11% of runs.** Across 27
  `summary.json`: `visual` present 3×, `contract` 3×, `coverage_triage` 3× (1 null), `test_data` 2×,
  `discovery` 1×, `status_transitions` 2×, `timing` 2×, `release` 2 present / **0 non-null**.
  The `tc:scaffold` sweeps are the same shape: `Probe:` stamps in the corpus = **0**;
  `Archetype:`/`Technique:` on 120/154 of 4,487 rows (**3%**).

Also dangling: **`/vc-feedback` is referenced 23 times and has no command file** in `.claude/`;
`npm run plugin:install` is cited by `/qa-onboarding` and does not exist; `/storybook-test` has
7 refs and no file.

**Interpretation.** The instruction corpus is not documenting a system that exists — it is
specifying one that was designed. The gap between the two is where the tokens are going. Prose is
being written faster than capability is being exercised, and nothing in the loop closes that gap:
there is no gate that fails when a documented mechanism has never run.

---

## 5. Runtime cost model

Per-dispatch floor = 113,816 (always-loaded) + agent definition + `shared-instructions.md`
(28,404 chars) ≈ **105–115K tokens before a single oracle byte is read.**

| run | dispatches | ~total tokens | preamble share |
|---|---:|---:|---:|
| `/qa-test` FAST | ~25 | ~3.3M | 74% |
| `/qa-test` FULL | ~41 | ~5.5M | 72% |
| `/qa-test` FULL `--iterate 2` | ~68 | ~9M | 72% |
| `/qa-regression full` | **125** | **~16M** | 76% |
| `/qa-fix` | 4–10 | 0.6–1.3M | — |
| `/qa-test --epic` (5 stories) | ~205 | ~28M | 72% |

Genuinely novel content on a FULL run: **≈15%.**

**Top cost decisions:**

1. **The 113,816-token preamble is re-paid per dispatch.** Nothing scopes it: a `test-runner-agent`
   executing 12 CSV rows loads all of `regression.md`, `reports.md`, `skills-commands.md`,
   `test-data.md` and `CLAUDE.md`.
2. **`/qa-regression full` dispatches one agent per suite × 125.** The 3-lane cap is a *browser*
   constraint that has been applied to *dispatches*; nothing batches suites.
3. **Step 5r/C2 costs ~24 runner dispatches (~3.08M tokens) on both paths** — 93% of a FAST run —
   for a sweep whose findings are provenance-excluded from the verdict by the pipeline's own rules.
4. **`business-logic.md` (96,680 tokens) is read unscoped ~41× per run.** It *is* section-navigable
   (24 `## Domain N:` headings, ~4K tokens each) and there is **no extractor** among the 219 npm
   scripts. A single-domain ticket needing ~4K of BL text has a 12–24× overhead available.
5. **Four (up to eight) verifier dispatches × ~124K tokens to re-run four sub-2-second
   deterministic scripts** (`suites:review`, `td:validate`, `tc:scope`, `compute-metrics`). The
   judgment half is real; the re-derivation half is the most expensive way in the pipeline to
   recompute machine-checkable evidence.

**The team already knows the fix and applied it once.** `authoring.md` §3b compiles a per-layer
"authoring pack" so N batches don't each re-read the same oracles, and states the reason verbatim:
*"4× the dominant token cost for zero extra information."* **It is applied at 1 step out of 18.**

---

## 6. Redesign

> **Measured tier split (see the component audit §0):** the always-loaded set is only **9.9%** of the
> corpus yet costs 72–76% of every run, while **57.5%** (skill supporting files + `knowledge/`) already
> costs nothing unless explicitly read. The redesign is therefore **re-tiering, not mass deletion.**

### Principle: three tiers, and only tier 1 is always-loaded

| tier | what | budget | loaded |
|---|---|---:|---|
| **1 — Constitution** | rules that are catastrophic *and* unprompted *and* task-independent | **≤15K chars** | always |
| **2 — Working knowledge** | how to do task X | unbounded | when X is invoked |
| **3 — Archaeology** | why we chose this, incidents, tombstones, measured evidence | unbounded | **never** at inference time |

Tier 1 is roughly: the shared-tree git prohibition · no-auto-merge · client-code containment ·
never-hardcode (the rule, not the essay) · the env loader · critical revenue flows · a ~1,500-char
router table saying *which file to read for which task*. That is ~9,500 chars of existing text plus
a router — **≤15K against today's 432K.**

### Sequenced actions, highest yield first

| # | action | chars removed from always-set | risk |
|---|---|---:|---|
| 1 | Delete `rules/skills-commands.md` — the harness already provides that menu | **64,548** | none |
| 2 | Replace `CLAUDE.md ## Detailed References` with a ~1,500-char pointer table | **85,500** | low — destinations exist and are richer |
| 3 | Move `mcp-browsers.md` + `quality-gates.md` out of always-load into `/qa-design` and `/qa-fix` | **31,926** | low |
| 4 | Strip archaeology from `regression.md` into `docs/decisions/` | **~68,000** | low |
| 5 | Split `test-data.md` and `reports.md`: rule stays, enforcement tables and incidents move | **~55,000** | low |
| 6 | Generate every count at read time (`suites:lint` already prints them) | ~4,000 | none — fixes 14 stale numbers |
| 7 | Retire the 3 provably never-run commands and the 24 artifact-less skills, or demote them to `docs/` until something invokes them | frees ~1.2 MB of tier-2/3 surface | low — nothing calls them |
| | **total (tier 1)** | **~309,000 (71%)** | |

Target always-loaded: **~55K chars / ~14.5K tokens.**

**Leverage — this is why order matters.** Saving 99,342 tokens per dispatch:

| run | preamble now | after | saved |
|---|---:|---:|---:|
| `/qa-test` FULL (41) | 4.67M | 0.59M | **4.07M** |
| `/qa-regression full` (125) | 14.2M | 1.81M | **12.4M** |
| `/qa-test --epic` ×5 (205) | 23.3M | 2.97M | **20.4M** |

At one full regression + five smoke + three FULL `/qa-test` per week: **≈27.1M tokens/week.**

### Then the runtime fixes

7. **Extract BL/ECL by domain.** Add `npm run bl:extract -- --domain <d>`; brief agents with the
   extracted text, not the path. ~41 unscoped reads → ~41 scoped ones.
8. **Generalise the §3b authoring pack to every fan-out** — Step 4, the verifiers, C1/C2 runners,
   `1c ‖ 1d`. Add "already supplied, do not re-read" to agent definitions.
9. **Batch `/qa-regression`**: one dispatch per *lane*, not per *suite*. 125 → ~3–8.
10. **Make 5r/C2 opt-in** (`--release-sweep`), like `--visual`/`--contract` already are.
11. **Demote the verifier's re-derivation half to a script diff**; keep the judgment half.

### And close the ratchet — otherwise this all grows back

12. **A CI budget gate.** `npm run context:check` fails if the always-loaded set exceeds its cap.
    This is the same ratchet pattern the repo already uses successfully for `CSV_LINT_BASELINE`,
    `XREF_BASELINE` and `suites:executability:check`. Without it, §2's curve simply resumes.
13. **Extend `mirror-parity.test.mjs` from 5 files to all 99 shared paths** (or delete the mirror
    and resolve the plugin against one copy). Normalise CRLF→LF first, then re-sync
    `business-logic.md` — 81 missing invariants is shipping broken judgment to customers.
14. **A deletion budget.** Every PR adding to tier 1 names what leaves it. W33/W34 at `-0` and `-1`
    deletions is the number to move.

---

## 7. Reproduce

```bash
# always-loaded size
wc -c CLAUDE.md .claude/rules/*.md

# CLAUDE.md by section
awk '/^## /{if(s)printf "%8d  %s\n",c,s; s=$0; c=0; next}{c+=length($0)+1}
     END{if(s)printf "%8d  %s\n",c,s}' CLAUDE.md | sort -rn

# the ratchet
git log --format='%ad' --date=format:'%Y-W%V' --numstat -- .claude CLAUDE.md | awk '
  /^2026-W/{w=$0;next} /^[0-9]/{a[w]+=$1;d[w]+=$2}
  END{for(k in a) printf "%s +%d -%d\n",k,a[k],d[k]}' | sort

# stale counts
node -e "const m=require('./config/test-suites.json');
  console.log('suites',m.suites.length,'cases',m.suites.reduce((s,x)=>s+(x.testCount||0),0))"

# the oracle fork
grep -oE 'BL-[A-Z0-9]+-[0-9]+' plugins/vc-fix/knowledge/oracles/business-logic.md | sort -u | wc -l
grep -oE 'BL-[A-Z0-9]+-[0-9]+' .claude/knowledge/oracles/business-logic.md | sort -u | wc -l
```

## 8. External validation (2026-09-08)

The redesign in §6 was checked against outside evidence by an adversarial web-research run
(24 sources fetched, 60 claims extracted, 25 verified by three independent votes each) plus two
in-session measurements. **Ten claims survived 3–0, four were refuted, and the caching and
subagent-inheritance claims went unverified by the web** when the run hit a spend limit mid-verify
(32 of 106 verifier agents failed; synthesis did not run). What follows uses only the surviving
claims, states each refutation as a limit on what this document may assert, and fills the two
unverified angles from the API reference and from this session's own transcripts.

### 8.1 Confirmed 3–0 — and which §6 recommendation each one grounds

All ten survivors are primary Anthropic sources. Quotes are verbatim.

| # | Verified claim (source) | Grounds |
|---|---|---|
| 1 | *"CLAUDE.md is loaded every session, so only include things that apply broadly. For domain knowledge or workflows that are only relevant sometimes, use skills instead."* — code.claude.com/docs/en/best-practices | §6 tier model; Action 1 (delete `## Detailed References`) |
| 2 | *"Keep it concise. For each line, ask: Would removing this cause Claude to make mistakes? If not, cut it. Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"* — same | §4.4: bloat is a **quality** defect, not only a cost |
| 3 | *"LLM performance degrades as context fills… Claude may start forgetting earlier instructions or making more mistakes. The context window is the most important resource to manage."* — same | §5 cost model's quality column |
| 4 | *"as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases"* (context rot) — anthropic.com/engineering/effective-context-engineering-for-ai-agents | §3: 114K tokens before the task begins |
| 5 | *"good context engineering means finding the smallest possible set of high-signal tokens that maximize the likelihood of some desired outcome"* — same | §6 Principle |
| 6 | Three-level progressive disclosure with **per-level costs**: metadata *"~100 tokens per Skill"* always; SKILL.md body *"Under 5k tokens"* on trigger; resources *"None until accessed"* — platform.claude.com/…/agent-skills/overview | §3 reframe (57.5% of the corpus is already in the free tier) |
| 7 | *"Reference files, data, or documentation don't consume context tokens until actually read"* — …/agent-skills/best-practices | Action 2 (move rules into skill support files) |
| 8 | *"The context window is a public good… every token competes with conversation history and other context."* — same | §4.4 restatement finding |
| 9 | Subagents *"run in their own context with their own set of allowed tools… report back summaries"* — code.claude.com best-practices | §5: each dispatch is a fresh window that re-pays the preamble |
| 10 | Subagent *"returns only a condensed, distilled summary of its work (often 1,000–2,000 tokens)"* — engineering blog | §6 runtime fix: verifier/authoring fan-out is the right shape; the payload they inherit is the defect |

### 8.2 Refuted — what this document therefore does NOT claim

Each refutation was a real quote stretched past its source. They bound the redesign as much as the confirmations do.

- **No official CLAUDE.md size number exists.** The only verified numeric limit is for **SKILL.md bodies**: *"Keep SKILL.md body under 500 lines"* / *"Under 5k tokens"*. A claim transferring that to CLAUDE.md was refuted 0–3. The §6 target of ~55K chars for the always-loaded set is this audit's engineering judgement, not a vendor figure.
- **Just-in-time loading is not "preferred over pre-loading."** The mechanism (*"maintains lightweight identifiers… dynamically load data into context at runtime"*) is real; the same article recommends a **hybrid**. So §6 keeps a genuinely always-loaded tier 1 rather than lazy-loading everything.
- **"Install many Skills without context penalty" is contradicted by its own page** — the ~100-tokens-per-skill line. This matches the measured 43,032-char menu floor in §3: the 41+31+17 frontmatter descriptions are a real, if small, always-cost, and verbose descriptions are the one part of the skill tier worth trimming.
- **The "right altitude" quote** (*"hardcode complex, brittle logic in their prompts… creates fragility and increases maintenance complexity over time"*) is verbatim, but a broader inference drawn from it was refuted. It is cited here only for what it says: the 30,459-char `/qa-test` bullet is that failure mode by construction.

### 8.3 Unverified by the web — filled from two other sources

**Subagent inheritance (angle 2) — settled empirically, in this session.** Every subagent this
audit dispatched carried the full always-loaded set: the four audit agents each contain CLAUDE.md
line 1, `test-data.md`'s GOLDEN RULE heading and `quality-gates.md`'s title, and **106 of 106**
web-research agents — whose only job was to search anthropic.com — carried the same 114K-token
Virto QA preamble. On the research run's own aggregate (15,972,437 subagent tokens, 74 agents
completed) that preamble is **≈8.4M tokens, ≈53% of the spend**, paid by agents to whom none of it
applied. This is the §5 cost model observed live, on work unrelated to QA. It also answers the
harness-mechanics questions the web could not: in this harness, project instructions are inherited
by dispatched agents; scoping them is not a per-agent switch, it is a matter of what sits in the
always-loaded tier.

**Prompt caching (angle 3) — from the API reference, not the web.** Caching is a **prefix match**:
any byte change anywhere in the prefix invalidates everything after it (render order
`tools → system → messages`). Default TTL is 5 minutes, 1 hour is opt-in; a cache write costs
≈1.25× and a read ≈0.1× of the input price; the minimum cacheable prefix is model-dependent
(512–4,096 tokens). Two consequences for §6, both conservative:

1. **Caching changes the bill, not the window.** A cached 114K-token preamble still occupies
   114K tokens of the subagent's context and still counts against claims 3–5 above. Caching does
   not mitigate context rot; only removing tokens does. The §6 re-tiering is therefore not made
   optional by a good cache-hit rate.
2. **Whether the preamble even caches across dispatches is unverified.** Each agent type has a
   different definition ahead of the project instructions in the prefix, and the 5-minute default
   TTL is short against a 40-minute pipeline. This audit makes no saving claim from caching; a
   future measurement should read `usage.cache_read_input_tokens` on a real `/qa-test` run.

### 8.4 One benchmark the corpus can be held to today

Against the single verified numeric rule — SKILL.md *"under 500 lines"* and *"under 5k tokens"* —
the 41 skills score **0 / 41 over 500 lines** but **11 / 41 over ~5k tokens** (`qa-review-tests`
≈11.2K, `qa-test-cases-generator` ≈11.2K, `qa-seed-data` ≈8.7K, `qa-design` ≈8.0K, `vc-self-check`,
`project-init`, `qa-local-env`, `qa-review-oracles`, `qa-hotfix-check`, `qa-test`, `qa-hotfix`). The
two limits disagree because lines here are long — the same pathology as CLAUDE.md's 30,459-char line
— so the token form is the one to gate on, and it belongs in the §6 context-budget CI check.

### 8.5 Net effect on the redesign

Nothing in §6 is reversed. Two things are sharpened: the always-loaded target is presented as a
judgement rather than a vendor number, and caching is explicitly ruled out as a substitute for
re-tiering. One thing is added: an 11-skill SKILL.md-body trim list under a verified 5k-token rule.
