# Agent A/B — the same task with and without the knowledge base

A synthetic best-case bench: every real task needs exactly one fact an active, well-attested entry
already holds. It shows the ceiling of what the base buys, not its average. The control tasks
(`C*`) are questions the base holds nothing on and show what asking costs when it does not pay.

```bash
node scripts/kb/bench/agent-ab/run.mjs                      # demo set, 3 runs, both arms
node scripts/kb/bench/agent-ab/run.mjs --tasks all --runs 3 --parallel 3
node scripts/kb/bench/agent-ab/run.mjs --tasks T1-promo-stack,C1-punchout --runs 1
```

Output: `<tmp>/kb-ab/<stamp>/` (`--out` moves it): one `.jsonl` transcript and one `.json` row per
run, plus `summary.json` and `summary.md`.

## How the arms differ, and why nothing else does

| | `kb` | `nokb` |
|---|---|---|
| working folder | fresh empty folder | fresh empty folder |
| MCP servers | `kb` only (`--strict-mcp-config`) | none |
| `CLAUDE.md` | one rule: ask the base before asserting platform behaviour | none |
| tools | Bash, file tools, WebFetch/WebSearch, `kb_ask`/`kb_show` | the same, minus `kb_*` |
| environment | same URLs, same credential env vars | same |

**Why an empty folder rather than this repo:** much of the base is restated here
(`.claude/knowledge/oracles/business-logic.md` is generated from it, and suites and bug reports quote
it), so an agent without the base would grep its way to the answer and the bench would measure grep.
A run whose `nokb` transcript touches `vc-knowledge` or `business-logic.md` is flagged `contaminated`.

`KB_ENABLED=0` is set for every run: reads work, while captures and logs from bench sessions never
reach the public base. Only the variables listed in `PASS_THROUGH` reach the agent; tracker,
GitHub and cloud tokens do not.

## Metrics

| metric | from | why |
|---|---|---|
| correctness (0–2 → mean/2) | judge model against the task's rubric | the point: a cheap wrong answer is worse than an expensive right one |
| false claims | judge | a wrong assertion or a bug that is not a bug, the costliest outcome in QA |
| pass-all | every run scored 2 | consistency: a base should cut variance as well as cost |
| tool calls, of which ToolSearch | stream-json `tool_use` | effort; ToolSearch is the cost of loading deferred `kb` tools |
| dead ends | `is_error` results + HTTP 4xx/5xx or GraphQL `errors` in results | stumbling: wrong endpoint, wrong auth, wrong shape |
| env calls / env writes | tool inputs naming the env hosts; PUT/PATCH/DELETE/mutation | load on, and dirt left in, the shared QA environment |
| tokens (input + cache + output), cost USD | the `result` event | what the run cost |
| time | `duration_ms` of the `result` event | how long a person waits |
| kb asks | `kb_ask` calls (kb arm) | whether the agent used the base at all |

Medians per cell, except correctness and false claims. Report **cost per correct answer** for the
headline (`costUsd / correctness`): it folds the speed-up and the accuracy into one number.

## Writing a task that discriminates

Measured on the first pilot (2026-10-01, `T3`, one run per arm): a prompt that said "validate it on a
real order" made BOTH arms do the live work, and the `kb` arm, holding the answer already, still
created an order to re-check it: same score, 1.7× the cost. So a task:

- never invites live validation unless running something is the task itself (`T6`);
- asks for a concrete, checkable claim (an exact field, value, status, verdict), never "explain";
- is wrong under the obvious assumption: a cautious generic answer must not score 2 by accident.

## Caveats that belong on the slide

- Best case by construction: tasks were chosen where the base holds the answer and retrieval was
  checked beforehand (`npm run kb -- ask`, 2026-10-01).
- A judge model grades the answers. Spot-check a few transcripts by hand before quoting a number.
- `T5` rests on a single-observation entry (trust 1); keep it out of headline numbers if trust is
  the story.
- Three runs per cell is a demo sample, not a statistic; say "in our runs", not "always".
- Both arms run on the live QA environment: a `nokb` agent may create `AGENT-TEST-` entities or
  lock `LOCKOUT_TEST_EMAIL` while it investigates. That cost is part of what is measured.
