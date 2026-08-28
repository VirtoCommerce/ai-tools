# Test-Model Effectiveness — Where Our Bugs Are vs Where Our Tests Are

**Scope:** the `/qa-test` Step 1e Test Model and the suite corpus it feeds.
**Method:** keyword classification over `regression/suites/**` (4,243 cases) and `reports/bugs/**` (128 reports), plus `.claude/knowledge/oracles/vc-bug-catalog.md` (55 entries). Re-derivable — see §7.
**Date:** 2026-08-27

## Executive summary

Every gate in the `/qa-test` pipeline asks *"is this condition represented?"* and none asks *"would this
scenario fail if the bug were present?"*, so the suite has been optimised for acceptance-criteria coverage
rather than defect yield. The measured consequence is an order-of-magnitude mismatch: cross-org scope
leakage is 32% of our bug reports and 0.8% of our cases, concurrency 16% and 0.4%, and only ~12% of all
4,243 cases are negative or adversarial at all. The `vc-bug-catalog` — the one oracle that records how this
product has actually broken — was cited by 3 test cases against 4,562 `BL-*` citations, because it was read
subtractively ("what not to re-discover") and never generatively. The fix is to make the Test Model a
**fault model**: every scenario row now names the defect it would catch, the failure shape it probes, the
technique that derived it, and where its oracle comes from. Because that model is terminal-only, the
enforcement sits one step downstream, in the single appender that writes to `regression/suites/`.

## 1. The gap

Both sides are keyword heuristics over different corpora, so treat the figures as **directional, not
precise** — the argument rests on the order of magnitude, not the decimal.

| Failure shape | % of 128 bug reports | % of 4,243 cases | External corroboration |
|---|---|---|---|
| `SCOPE` — cross-org / permission-scope leak | **32%** | **0.8%** (35) | OWASP API Security Top 10 **#1** (BOLA) |
| `STALE` — cache / index / projection lag | 27% | 2.0% (86) | application-level caching studies |
| `MONEY` — currency, culture, rounding | 21% | 3.2% (134) | — |
| `RACE` — concurrency on read-then-write | 16% | **0.4%** (17) | ACIDRain (SIGMOD 2017): 22 vulnerabilities across 12 e-commerce apps |
| `REPLAY` — idempotency / duplicated effect | 2% | **0.2%** (10) | Stripe / Adyen idempotency-key contract |

**Only ~12% of cases (510 / 4,243) carry a negative or adversarial title.** The corpus is overwhelmingly
confirmatory while the bug corpus is overwhelmingly negative-path.

The two lowest-covered shapes are the two that conventional case design *cannot* reach: `RACE` needs a
parallel execution shape no sequential case has, and `SCOPE` passes every positive-path test by
construction — asserting "org A's user sees org A's order" tests nothing; only the negative cell does.

## 2. The catalog was not a defect oracle

Tagging all 55 `vc-bug-catalog` entries by failure shape produced:

| | count |
|---|---|
| `CONVENTION` — environment, API, fixture or tooling facts | 29 |
| `BY-DESIGN` — intentional behaviour; filing it is the bug | 14 |
| **Actual product failure shapes** | **12** |

So the "Familiar Problems" oracle is ~78% *not about problems*. That, not neglect, explains the 7 citations:
there was little in it to cite as a test scenario. Worse, the shapes topping the bug corpus — `SCOPE`,
`REPLAY`, `LIFECYCLE`, `FALLBACK` — have **zero** catalog entries. The file records what surprised us while
operating the system, not what broke in the product.

This is worth keeping visible: it means the catalog's value is now split in two, and both halves are real.
The 43 non-defect entries are genuine false-positive guards (they stop us filing by-design behaviour); the
12 defect entries are scenario seeds. Conflating them is what made the file look useless to test authoring.

## 3. What the external evidence supports

**Provenance caveat:** the sandbox proxy blocked full-text fetches from `nist.gov`, `arxiv.org` and
`dl.acm.org`, so figures below came from search-result extraction. Directions and mechanisms are
well-replicated; **verify any specific number against the primary source before quoting it externally.**
This document deliberately states mechanisms rather than pinning contested percentages.

- **Interaction rule** — across six fault datasets, one parameter accounts for roughly two-thirds of
  failures and two parameters for the large majority; no failure required more than 4–6.
  ⇒ *cover pairs, not single values; `t=2` default, `t=3` ceiling.*
  Kuhn, Wallace & Gallo, IEEE TSE 30(6), 2004; NIST SP 800-142.
- **Coverage is not effectiveness** — across 31,000 suites over 5 systems, correlation is weak once suite
  size is controlled. ⇒ *never gate on a coverage percentage; our `ac_coverage_pct` is exactly this trap.*
  Inozemtseva & Holmes, ICSE 2014.
- **Assertions are** — assertion count and coverage correlate strongly with fault detection.
  ⇒ *grade assertions, not cases; ban unfalsifiable predicates.* Zhang & Mesbah, ESEC/FSE 2015.
  We have a live example: `050a` `CAT-GQL-131` asserts `sortings[0].name is non-null OR is null`.
- **Misguidance effect** — prompting a model with the buggy implementation makes it assert the erroneous
  behaviour as correct *and* suppresses bug-exposing tests; substituting a behavioural specification
  reverses both. ⇒ *the oracle comes from the spec; `{OBSERVED}` is a baseline, never an oracle.*
  This is the single most important rule for an agentic QA system that reads the live app. arXiv 2607.22883.
- **Fault-model-first** — Meta's ACH generates mutants representing a fault class, then tests guaranteed to
  kill them; engineers accepted 73% of the resulting tests. ⇒ *author from a fault model, not a feature
  description.* Foster et al., FSE 2025.
- **Exploratory ≈ scripted on effectiveness, ~6× cheaper** once design effort is counted, and scripted
  produced *more* false positives. ⇒ *a scripted case earns its keep by repeatability, not by first-run
  bug-finding — which is exactly why a known failure shape deserves a regression case even though
  exploration already found it once.* Itkonen & Mäntylä, EMSE 2014.
- **Flakiness destroys measurability** — you cannot attribute a failure in a noisy suite. Our own corpus
  runs **19.9% BLOCKED**, rising to **28.6%** on suites of 81+ cases. Any effectiveness metric is
  downstream of fixing that.

## 4. Folklore our own data does not support

- *"Higher coverage means better tests."* Contradicted once suite size is controlled.
- *"EP + BVA catch ~60% of defects."* This sat in `qa-test-design/SKILL.md` with no attribution and no
  source supports it. **Removed** — replaced with the structural reason (a boundary is where a decision
  changes, and the decision table is what tells you where the boundaries are).
- *"Scripted cases find more bugs than exploratory."* No measured effectiveness difference.
- *"Our suite covers the critical flows."* It covers the *acceptance criteria* of those flows. §1 is what
  coverage of their failure modes looks like.

## 5. What changed

| Change | File |
|---|---|
| Closed archetype vocabulary (12 defect shapes + `BY-DESIGN` / `CONVENTION`), `Archetype:` on all 55 entries, and the two-reading-directions note | `.claude/knowledge/oracles/vc-bug-catalog.md` |
| Step 1e is a fault model: `Condition space` → `Reduction` (`N → M`, naming dropped factors) → scenario matrix (**cell · defect hypothesis · archetype · technique · oracle**) → `Probes carried in` → `Archetype sweep`; gate rewritten so every clause is contradictable | `.claude/commands/qa-test.md` |
| Catalog wired **generatively** into Step 2 — each `Detection probe` is a scenario candidate or an explicit `N/A + reason` | `.claude/commands/qa-test.md` |
| `/qa-test-design` wired in (it was referenced nowhere by `/qa-test`); technique tokens `EP·BVA·DT·ST·PW·CT·EG`; interaction rule + `t` ceiling; unattributed 60% removed | `.claude/skills/qa-test-design/` |
| **Deterministic gate:** a new suite row must stamp `Archetype:<TOKEN>` · `Technique:<TOKEN>` in `References`; vocabularies read at run time from the markdown that owns them; unreadable source ⇒ non-zero exit | `scripts/test-cases/append-test-cases-to-suite.ts` |
| `**Found by:**` grammar + `**Archetype:**` on bug reports — the future join between a bug and the case that caught it | `.claude/commands/qa-bug.md` |

**Why the gate lives in the appender.** The Test Model is terminal-only by `.claude/rules/reports.md` §1 —
nothing is written, so no linter can ever read it. The appender is the single door into
`regression/suites/`, and it sees only *new* rows: the ~4,200 legacy cases are untouched, the corpus cannot
turn red, and there is no `--warn-only` path that would quietly retire the rule. No CSV column was added —
the stamps ride the free-text `References` column beside the existing `Synced:` / `Audited:` / `Promoted:`
stamps, and 34 rows already carried organic `Technique:` stamps, so this formalises a convention rather
than inventing one.

**The gate's honest limit.** A script can check that a stamp exists and is in-vocabulary. It cannot check
that the hypothesis is *real* — an author can stamp `Archetype:SCOPE` on a happy path. Only §6 falsifies it.

## 6. What we still cannot answer

**"Has this test case ever caught a bug?" is not computable.** `history.json` is suite-granular with no case
IDs; its `bugs_found` field is populated in 0 of 109 rows; and ~8 of 128 bug reports name a case, in prose,
with no parser. The `**Found by:**` grammar shipped now so attributable data starts accumulating; the parser
and the derived `bugs_found` are the agreed follow-up, along with corpus linters (`TC-002` out-of-vocabulary
token, `TC-003` file-level unstamped tally, `TC-004` a case group whose rows all probe one shape).

Until then the archetype gap in §1 is the best available proxy, and it is a *design-time* signal: it says
where we have not looked, not where bugs are. Those are different claims and this document does not
conflate them.

## 7. Reproducing these numbers

Nothing here is transcribed into a tracked file — archetype frequency is derived at read time, per
`.claude/rules/test-data.md` §GOLDEN RULE, because a stored count is wrong by the next commit and wrong
silently. To re-derive: classify `Title`/`Steps`/`Assertions`/`Cross_Layer_Checks` across
`regression/suites/**` and the first 3,000 chars of each `reports/bugs/**/*.md` against the same shape
patterns, and read the `Archetype:` fields out of `vc-bug-catalog.md`. Expect the split to move as the
`**Found by:**` and `Archetype:` conventions fill in — that drift is the point, not a defect.

**Known bias:** the bug-side classifier reads whole reports and the case-side classifier reads four columns,
so the two rates are not strictly comparable in level. The gap survives that bias by an order of magnitude,
which is why the conclusion holds while the individual percentages should not be quoted as precise.
