# What this directory is, and what was left behind

`kb` — the knowledge base tool. Built and measured in
[VirtoCommerce/vc-kb-lab](https://github.com/VirtoCommerce/vc-kb-lab), ported here under
[VCST-5961](https://virtocommerce.atlassian.net/browse/VCST-5961).

It reads and writes a base: [VirtoCommerce/vc-knowledge](https://github.com/VirtoCommerce/vc-knowledge)
— 590 derived entries projected out of a running deployment, 74 written by hand, 3 flows.

**This is not yet a plugin.** The layout is plugin-shaped so that packaging is one manifest entry
rather than a restructure, but there is no `.claude-plugin/plugin.json` here and nothing has been
added to `.claude-plugin/marketplace.json`. Packaging is VCST-5966, deliberately last: the
unresolved question is how a customer install obtains an 8 MB knowledge repository, and with no
real consumer yet any answer to that is a guess.

## Running it

    node plugins/vc-kb/bin/kb.mjs --help
    node plugins/vc-kb/bin/kb.mjs ask "which endpoint lists the payment methods a store has enabled"

Zero runtime dependencies, Node ≥ 20, no install step.

## Where the base is

`--base <dir>` → `KB_BASE` → a `vc-knowledge` checkout sitting beside this repository.

There is no fallback constant. A base that cannot be found is REPORTED and the door exits 2 — it
never carries on against a directory that is not there, because the answer contract has to keep
"nothing is known about this" and "nothing was read at all" apart. See `src/base.mjs`; the
reasoning is at the top of the file.

**A directory named by a person and found not to be a base stops the search.** It does not fall
through to the sibling. That rule cost a real mistake to learn: the first version fell through,
and a probe deliberately pointed at a bogus `KB_BASE` answered confidently out of the real corpus.
`test/base.test.mjs` pins it.

## What came across

| | |
|---|---|
| `bin/kb.mjs` | the door — 17 verbs |
| `src/` (23 files) | resolver, write path, extractor. `base.mjs` is new, written for this port |
| `test/` (14 files) | **171 assertions**, and the only thing that says the port broke nothing |
| `vendor/minisearch.js` | the index |
| `vendor/agent-log/` (7 files) | `log-row` (the journal hands question rows to it), `tool-log` (the journal reads its call counts, and two tests drive it), `scrub-scan` / `scrub-apply` (secrets in artifacts at rest), and their 73 assertions |
| `hooks/arrive.mjs` | **ported, NOT wired** — see below |

## What did not, and why

**`measurements/` — 99 files.** Stays public in vc-kb-lab and is referenced by link. It is the
evidence behind every constant in here (the relevance floor, the BM25 `d`, the tokenizer's split
class, the granularity rule) and it belongs next to the thing it measured, not copied into a
consumer.

**`reconcile.mjs`, `merge-runs.mjs`, `memory-guard.mjs`, `make-reference-capture.mjs`.**
Measurement apparatus. `reconcile` joins a question log to a tool log, and in this repository the
tool log is not the ground truth — `plugins/vc-fix/hooks/session-telemetry.mjs` already
reconstructs richer spans from the transcript. The session report (VCST-5964) joins the journal to
THOSE, so the old joiner would have been a second answer to a question that already has one.

**`docs/HISTORY.md` and the commit archives.** In vc-kb-lab.

**The ADR.** It is not in this repository's `main` and never was — `docs/adr/adr-knowledge-base-v3.md`
exists only on the unmerged branch `claude/kb-v3-adr`. Nothing was removed; that branch simply is
not merged, and the ADR's home is vc-kb-lab. Where the ADR and a measurement disagreed, the
measurement won, and the divergence is recorded at the point of code rather than in a document.

**Every `.env.*`,** and the lab's own `.claude/settings.json`, which hardcodes lab paths.

## `hooks/arrive.mjs` is here but unwired, on purpose

It is the mechanism that makes the base ARRIVE — a `PostToolUse` hook that looks at what the agent
just touched, matches it against the coordinates entries are anchored on, and hands back what it
finds. Replayed over three archived runs, counting only entries that existed BEFORE each run, it
fires **9 times in 83 tool calls, 1 in 172, and 2 in 319.**

The ceiling is set by what entries are ANCHORED on, not by the hook. The derived plane is anchored
on GraphQL type and field names, which never appear in a browser URL, so 590 entries contribute
almost nothing; only route-anchored entries fire, and there were two. It gets better only if
captures start carrying the coordinates agents actually travel — Admin SPA routes, page paths —
which is capture-time discipline rather than code.

Wiring a hook that runs on every tool call to buy ~1% is not a trade worth making blind. Re-measure
after the comparison in VCST-5965, then decide.

## Gates

    node --test plugins/vc-kb/test/*.test.mjs                  # 171
    node plugins/vc-kb/vendor/agent-log/test-log-row.mjs       # 45
    node plugins/vc-kb/vendor/agent-log/test-tool-log.mjs      # 28
    node plugins/vc-kb/bin/kb.mjs validate                     # gates the corpus, needs no deployment

`kb check` is the derived plane's byte gate — it regenerates from a live pinned deployment and
byte-compares. It needs credentials and a reachable environment, so it is not part of the default
suite, and an extractor that could not reach a deployment reports SKIPPED, never PASS.

## Two things a reader should know before using it

**`kb ask` and `kb how` WRITE.** They append to the demand loop, which is how the base learns what
people needed and did not find. That is correct for real work and a trap for idle probing — point a
probe at a copy with `--base`, or it becomes somebody's recorded demand.

**Sixteen entries are served and unconfirmed,** and one known retrieval gap returns a confident
wrong answer for a question about editing a live promotion. `kb demand` lists the open loop.
