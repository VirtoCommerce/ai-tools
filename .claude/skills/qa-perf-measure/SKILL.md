---
name: qa-perf-measure
description: "[QA Method] Measure backend work per request on a DEPLOYED environment and prove whether a change moved it: dependency calls by type (search/SQL/cache/HTTP) via an App Insights operation_Id join, N+1 detection by input-size scaling, and paired positive/negative controls so a null result is trustworthy. Counts transfer between environments; latency does not. Measure-and-report only."
argument-hint: "<ticket-key> | <surface> [--ab <before-env>:<after-env>] [--scale] [--load]"
disable-model-invocation: true
---

# /qa-perf-measure — Measuring Backend Work on a Deployed Environment (methodology)

How to answer, with evidence a reviewer can recompute: **does this request do more backend work than it
needs to, and did a change actually reduce it?** Applies to any request-serving surface — GraphQL xAPI,
REST, Admin API — and any dependency type: search (Elasticsearch), SQL, cache, outbound HTTP.

The command file (`commands/qa-perf-measure.md`) is the terminal entry; this skill holds the instrument
routing, the validity rules, and the report contract. The concrete recipe — KQL, fixture filter,
confound catalogue, worked examples — is
[`../../knowledge/execution/es-call-ab-method.md`](../../knowledge/execution/es-call-ab-method.md).

**Measure-and-report only.** Ends at a report + a recommendation. Never files a tracker item, never
transitions one, never opens a PR — a human decides what the numbers mean for the release.

## What you can actually measure

The first value of this skill is telling you which questions are answerable **before** you spend a day
on one that isn't.

| Measurable | Instrument | Transfers across envs? |
|---|---|---|
| **Dependency calls per request**, split by type | App Insights `requests ⋈ dependencies` on `operation_Id` | **Yes** — the number that transfers |
| **N+1 presence** — does the count follow input size? | vary the input, watch whether the count scales | Yes |
| **Redundancy** — are calls duplicated within one request? | paired positive/negative controls (below) | Yes |
| **Exception count for a specific type** | `exceptions` filtered by type | Yes |
| Server-side **request duration** | App Insights `duration` | **No** — catalogue size, DB tier, index size differ |
| **Throughput + p95 per operation** under sustained load | `vc-perf` k6 L2 | Same env only |
| **Where the milliseconds go** (CPU, allocation, per-SQL) | L3 `dotnet-trace` — **local only**, via `/qa-local-env` | n/a |

**Not measurable this way — say so rather than guessing:**
- *What* the remaining calls are. App Insights records the dependency **URL, not the request body**, so
  identifying which distinct call shapes survive needs source reading or a local L3 trace.
- Cross-environment latency.
- A call-count change via **L1 BenchmarkDotNet** — it mocks the very I/O you are counting.

## Instrument routing — pick before you measure

Each layer produces a confident number that answers a *different* question; picking wrong is the most
expensive mistake available here.

| Question | Instrument | Not this |
|---|---|---|
| Did the change reduce **call counts**? | App Insights `operation_Id` join | L1 — mocks the I/O being counted |
| How does it behave under **sustained load**? | k6 L2, fixed arrival rate | one-shot repeats — measures cache warming |
| **Where** do the milliseconds go? | L3 `dotnet-trace`, local host only | anything against a remote deployment |
| Is a code path's **allocation/time envelope** worse? | L1 `/vc-perf:perf-benchmark` | App Insights — too coarse |

## Usage
```
/qa-perf-measure <ticket-key> --ab vcptcore-qa:vcst-qa   # A/B: pre-change build vs changed build
/qa-perf-measure <ticket-key>                            # temporal A/B on one env across its own deploy
/qa-perf-measure "product listing page" --scale           # characterize: N+1 hunt, no A/B needed
/qa-perf-measure <ticket-key> --load                      # add the k6 throughput/p95 arm (one env)
```

## Supporting files
- [`../../knowledge/execution/es-call-ab-method.md`](../../knowledge/execution/es-call-ab-method.md) —
  the recipe: env confirmation, fixture filter, the KQL + its gotchas, the confounds, worked examples.
- `.claude/knowledge/execution/performance-thresholds.md` — latency budgets. A **count** has no
  threshold; do not invent one.
- `plugins/vc-perf/skills/perf-loadtest/SKILL.md` — the k6 L2 harness for `--load`. **Requires the separate
  `vc-perf` plugin** (not enabled by default — see §Agent delegation); the core measurement does not.

---

## Phase 0 — Frame the question, then establish the builds

1. **Decide which question you are answering** (routing table above). "Is this slow?" and "does this do
   redundant work?" are different measurements with different instruments and different verdicts.
2. **If A/B: confirm both sides are the builds you think they are.** Live version comes from the login
   page, never `/health`, which lies during a restart
   (`reference_platform_live_version_from_login_page`). The pin of record is
   `vc-deploy-dev@<env-branch>` → `backend/packages.json`.
3. **Temporal A/B on one env: read the deploy boundary in UTC and guard-band it.** Misreading a
   `merged_at` `Z` timestamp as a local offset shifted one cut by three hours and counted pre-change
   traffic as "after" — three published claims had to be withdrawn. A deploy is not instantaneous.

> **Prefer a controlled measurement over observational traffic.** Real traffic across a deploy looks
> convincing and is usually a different *workload* on each side. One observational arm agreed in
> direction but its magnitudes were unusable: SQL per request also fell 78%, which a search-only change
> cannot cause — which is how we knew the two windows were not comparable.

## Phase 1 — Drive identical work

- **Same request text straight to the backend on both sides.** Never drive two storefronts: theme
  versions differ per env, so the query text differs, so the resolution graph differs. A runner-native
  CSV case (`scripts/graphql/graphql-runner.ts --case <csv>:<ID>`) with byte-identical `[GQL-OP]` blocks
  guarantees it (`feedback_use_canonical_graphql_runner`).
- **Hold the input *shape* fixed** — same collection size, same page size, same quantity. Entities
  necessarily differ between environments; shape is what a count comparison needs.
- **Verify the fixture actually exercises the path.** A precondition that silently fails leaves you
  measuring an empty code path with a plausible number. `addItem` no-ops with no error on zero stock or
  MOQ > 1; discover with the four-condition filter and pin the ids (reference §2).
- **Your own discovery queries warm what you are about to measure.** A first replication read 1
  search/request across the board and looked like "already at the floor" — the targets had been
  enumerated minutes earlier. Discover, then measure *different* targets; or measure first.
- **Pick an auth role that exists on both envs** — a missing per-env password variant silently costs you
  an arm (`feedback_agents_read_env_creds`).

## Phase 2 — Count, with a control that can fail

Query and KQL gotchas: reference §3. Non-obvious requirements:

- **`leftouter` + `coalesce`** — otherwise a zero-dependency request vanishes instead of counting as `0`.
- **Always carry `totalDeps`.** If the total moves as much as the slice you changed, something else is
  moving. This row is what stops a change being credited with an unrelated win.
- **Report per-request rows, not just an average.** At small n the distribution *is* the finding, and a
  reader must be able to recompute your median.
- **Ship a paired positive and negative control in the same telemetry window** (reference §7). Without
  them, "the count did not move" is indistinguishable from "the instrument was blind":

  | Control | Shape | Must show |
  |---|---|---|
  | **positive** | N byte-identical calls in ONE request | BEFORE `N`, AFTER `1` — the mechanism fires |
  | **negative** | N calls differing in one argument | `N` on **both** — the key is complete, no over-collapse |

- **Prove the mechanism within ONE env before crossing environments.** Hold build, request text and page
  size fixed and vary only the input property under study. A cross-catalogue cell can always be argued
  with; a within-env contrast cannot (reference §8.3).
- **Sampling is asymmetric between a busy env and an idle one.** Budget 3–4× the request volume on the
  traffic-carrying side and read `itemCount` per row rather than assuming parity.

## Phase 3 — Read the residual: which lever applies

Vary the input size; the answer dictates the fix, and the two readings recommend opposite engineering
decisions:

| Observation | Meaning | Lever |
|---|---|---|
| count **scales** with input size | N+1 — one call per element | batch into one by-ids load |
| count **flat, > 1** | a fixed set of *distinct* call shapes | make them byte-identical so a request-scoped dedup collapses them, or cache across requests |
| count **flat, = 1** | at the floor for this request | only a cross-request cache goes lower |

A request-scoped dedup does nothing for an N+1 whose calls each carry a different key — naming the
category correctly is the whole point of this phase.

## Phase 4 — Report and STOP

- Write `reports/performance/{topic}-investigation-<date>.md` — report category 10, target 40–80 lines,
  cap 120 (`.claude/rules/reports.md`). Ticket-scoped work may land as a category-6 per-ticket report
  instead.
- **Counts cross-env; latency from one env only.** State what you are **not** claiming — an unclaimed
  metric is a disclosed boundary, not a gap.
- **"Counts moved, p95 didn't" is a valid result.** Removing calls to a component that is not the
  bottleneck reduces work without moving user-visible latency — that redirects the next investigation
  rather than ending it. Likewise a well-controlled **null** result ("no redundancy here to remove") is
  a finding worth publishing, *provided* the positive control fired in the same window.
- **STOP.** Present the numbers and a recommendation. Do not file a tracker item, transition one, or
  open a PR.

## Rules

- **Never hardcode a threshold or baseline.** A call count has no budget in `performance-thresholds.md`;
  inventing one manufactures phantom regressions (`feedback_never_hardcode_in_scripts`).
- **Warm vs warm — a *latency* rule.** When reporting duration, discard the first request of every cell;
  cold start dominates by two orders of magnitude (1613 ms / 75 SQL vs 20 ms / 3 SQL on the same build).
  **Never apply it to a count** — that discards the discriminating observation and manufactures a false
  floor (reference §4.1–4.2, §8.1).
- **Repeated identical requests are not independent samples** — they measure cache warming. For a *count*,
  the cold request is the discriminating one, so **rotate targets and keep every row**; for steady state
  use sustained k6 traffic.
- **Every figure re-traceable to the query that produced it** — cite the window and the arm.
- **State what you did not measure.** A number whose confounds you have not addressed costs more than
  no number (`feedback_verify_payload_bugs_second_source`).
- **Deliverables carry the finding, not the story of getting there** — audit trail goes in
  `summary.json` (`feedback_no_self_referential_commentary_in_deliverables`).
- Read-only on App Insights and the code host; agents must not write to external systems
  (`feedback_subagent_external_writes`).

## Agent delegation

| Situation | Agent | Notes |
|---|---|---|
| Run the runner case / k6 arm, query App Insights | `qa-backend-expert` | `playwright-edge` if a UI check is needed at all |
| Rank what to optimize next from the artifacts | `perf-analyst` — **`vc-perf` only** | read-only; consumes L1/L2/L3 outputs. **Optional, see below** |
| Confirm a symptom is user-visible | `qa-frontend-expert` | `playwright-chrome` |

> **`vc-perf` is a separate plugin and is not enabled by default.** `perf-analyst`, the k6 L2 harness
> (`--load`) and the L3 `dotnet-trace` path all live in `plugins/vc-perf/` — a distinct `vc-tools`
> marketplace plugin, absent from `enabledPlugins` in the tracked `.claude/settings.json` and not one of the
> 19 project agents in `.claude/rules/agents.md`. **Everything this skill's core measurement needs
> (Phases 0–4, App Insights counts, N+1 detection, the controls) works without it.** If it is not installed:
> `--load` and L3 attribution are **unavailable — say so rather than substituting one-shot repeats, which
> measure cache warming**; and ranking is done inline by `qa-backend-expert` from the same artifacts. To
> enable it: `/plugin install vc-perf@vc-tools`, then restart Claude Code (plugin agents bind at session
> start).

## Cross-references
- Command: `commands/qa-perf-measure.md`
- Recipe: `.claude/knowledge/execution/es-call-ab-method.md`
- Local L3 attribution: `/qa-local-env` + `plugins/vc-perf/skills/perf-trace/SKILL.md`
- Latency budgets: `.claude/knowledge/execution/performance-thresholds.md`, `BL-GQL-002`
- App Insights wiring + the same KQL gotchas: `.claude/skills/qa-monitoring/SKILL.md`
- Reports policy (category 10): `.claude/rules/reports.md`
- Worked example: `reports/tickets/Sprint26-15/VCST-5637/measurement-report.md`
