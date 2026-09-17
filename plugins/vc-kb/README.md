# vc-kb-lab — the workbench for the knowledge base

This directory holds the **tool**. The base itself — the entries — lives in a separate
repository, `vc-knowledge`. Code here, data there.

```
bin/kb.mjs   the six verbs and the supporting commands
src/         the tool: where each plane lives (planes.mjs), env layers, sources, the granularity
             rule, entries, index, resolver, the capture door, consolidation, delivery, gates
measurements/ what was measured here, with the script that reproduces it
vendor/      MiniSearch 7.1.2, and agent-log — the measurement logger, vendored. Neither is
             fetched at runtime; see vendor/agent-log/README.md for what diverges from its
             canonical copy and why
test/        72 tests
.env.*       environments. .env.local holds the secrets and is NOT committed
```

## Why this directory is deliberately bare

There is no `CLAUDE.md` here, no `.claude/knowledge`, no skills and no agents, and this is not
tidiness. Building the base inside the QA repository has already failed once: the ADR records that
the attempt *"produced an implementation the model then defended, aimed at QA because it found a
QA repository, and shaped around the oracle formats that happened to sit beside it."* One of that
repository's auto-loaded knowledge files was measured producing a confident false negative.

It is also never a git worktree of that repository. A worktree's `.git` is a file pointing at the
main repo, so a session resolves the project to the main repo and inherits its project memory —
injected rather than fetched, and therefore invisible in any tool log.

## Why the code is versioned separately from the base

The base promises that `kb check` regenerates the corpus and byte-compares it. What regenerates it
is this code. Unversioned, that promise has no fixed referent: the comparison would keep passing
while quietly being about a different corpus, and nobody could tell a change in the platform's
contract from a change in the extractor.

## The six verbs

One page, so that every agent writing to the base records the same shape. Without an explicit
operation list each one invents its own and the corpus drifts apart — which is the failure this
list exists to prevent, not a hypothetical.

```
kb ask         "<question>"                   resolve across both planes; the §9.5 answer contract
kb deliver     "<question>" [--json]          the consumer form: a citable block, or an explicit MISS
kb capture     --subject … --question … --claim … --anchor … --scope … --deployment …
kb consolidate [--apply]                      group by shared coordinate; merge where scope agrees
kb dispute     <id> --deployment … --note …   record an observation that contradicts an entry
kb retire      <id> --reason …                withdraw an entry; the id stays, the entry leaves the index
```

`kb confirm <id> --deployment <env>` supports `capture`: a repeat observation raises the count and
writes no second entry.

**`ask` and `deliver` are not the same verb.** `ask` renders everything a reader needs to judge an
entry. `deliver` returns what a consumer actually injects — short, citation-first, trust stated
inline rather than in a field a caller might drop, and a MISS that is impossible to mistake for an
answer. An empty block would read as "the base had nothing to say", which is indistinguishable from
"the base was not consulted" and from "the base is down", and those call for three different
behaviours.

`kb capture` **is itself the first consumer**: before writing, it delivers the question back and
prints what the base already says. The fingerprint gate catches a fact already held under the same
coordinates; it cannot catch one recorded against different coordinates — three of the fifteen
duplicate pairs in the dedup measurement shared none — so the writer is shown the near misses.
Shown, not blocked: wording similarity was measured and does not separate a duplicate from a
distinct fact, so it may inform a person and must never decide on its own.

## Supporting commands

```
kb extract --env <name>    regenerate the derived plane in vc-knowledge from that deployment
kb check   --env <name>    regenerate in memory and byte-compare; a difference fails
kb validate                gate the corpus on disk; needs no deployment; green on an empty corpus
                           prints NOTICES on a pass too: anchors nothing can raise, said once per surface
kb reindex                 rebuild the captured index and catalog from the entries on disk
kb stat                    what the corpus currently holds, on both planes
```

## Getting the base

    kb sync

One clone per machine, at `~/.claude/vc-knowledge`, and every project on that machine reads it.
There is no install hook in Claude Code — nothing fires when a plugin is added — so this is a verb
you run once rather than something that happens to you.

It is staged: the clone lands in a temporary sibling, is checked for `kb.json` there, and only then
is moved into place by a single rename. A fetch that fails leaves **nothing** behind, because a
half-finished corpus is the one shape the answer contract cannot survive — it would be real but
incomplete, and `ask` would report coverage misses for entries that exist. An existing checkout is
fast-forwarded in place, never replaced: entries captured during a run are written straight into it.

**Where the base is.** Four places, in this order:

```
--base <dir>                       one invocation
KB_BASE=<dir>                      this shell, and every hook in it
knowledgeBase.path                 project-profile.json — an OVERRIDE, for a base of your own
~/.claude/vc-knowledge             the managed checkout, what `kb sync` writes
```

Nothing is searched for. The tool does not look for a `vc-knowledge` next to itself or above
itself — two earlier versions did, and both could answer confidently out of a corpus nobody had
named. The fourth entry is a default, but it is **checked** like every other candidate: no
`kb.json`, no base, and `kb` says where it looked and exits 2. It never carries on against a
directory that is not there, because "the base holds nothing about your question" and "no base was
read at all" are different answers that demand opposite reactions — one says go find out and write
it down, the other says go fix the install.

`kb stat` names the base it used, **how it was chosen**, and **how old its content is**. All three
matter: two bases on one machine is the failure to watch for, and a month-stale base answers
plausibly, which is worse than not answering at all.

## The journal

With `VC_MEASURE_OUT` set, the door records itself. Two files, because a consultation and a write
are different events:

```
kb-log-<session>.jsonl    one line per invocation, every verb, the writes included
questions-<session>.csv   one row per consultation, added through vendor/agent-log/log-row.mjs
```

The CSV is the file the step-0 demand measurement already reads. (The joiner that consumed it,
`reconcile.mjs`, stayed in vc-kb-lab — see `PORT.md`.) Which is the point: what an agent
consulted, what it did afterwards, and what it never wrote down are the same three questions the
demand instrument was built to ask, and the base is now one more source it can attribute an answer
to — `backed_by` gained `KB-DERIVED`, `KB-EXPERIENTIAL` and `KB-MISS`.

The door fills only the half of a row it can know. `add` records the question and where the caller
is about to look; `mark` records what came back and whether it held, and `held`, `found_elsewhere`,
`used` and `applied` are judgments about work the door never sees. A row nobody closes stays
`(pending)` and `log-row check` reports it — which is itself the signal that a question was
consulted and its outcome never recorded.

Two things are required and never defaulted, both for the same reason — a column that always
carries its default cannot tell "it was not recorded" from "it was always this":

* **a phase**, via `--phase <phase>` or `KB_PHASE`. Without one the invocation is still logged and
  the question row is not, with a line saying so.
* **the hook**, whose log supplies the call-count stamp. Without it the verb log is still written
  and the question row is not: an unstamped row is exactly the unverifiable row the toolkit exists
  to prevent.

Turning it off is not setting `VC_MEASURE_OUT`. The journal never throws and never changes an exit
code — an instrument able to fail the call it is recording would corrupt the work it measures.

### Running a measured session

The ground-truth half is `vendor/agent-log/tool-log.mjs`, wired as a `PostToolUse` hook in
`.claude/settings.json` with no matcher: an independent record of what a session did is only
independent if it records everything, and a filter there would silently shrink the denominator of
every coverage number computed from it. Both halves land in `MEASUREMENT/`, which is gitignored —
it holds the question text an agent typed and the targets it addressed, so it goes through
`scrub-scan.mjs` before any of it is published, and what gets committed is the analysis in
`measurements/`.

**One run per directory.** `log-row` refuses to guess which of several logs in a folder belongs to
this session, because picking the newest is how a row is filed under another session's id. So
before starting a run, move the previous one aside:

```
mv MEASUREMENT MEASUREMENT-archive/run-07     # then start the session
```

Forgetting is safe in the direction that matters: the door refuses and says so on stderr, rather
than attributing this run's questions to the last one. (The joiner that reads an archived run,
`reconcile.mjs`, is measurement apparatus and stayed in vc-kb-lab — `PORT.md` says why.)

Secrets are redacted at write time, keyed on the VALUE read from `.env.local` rather than on a
name like `password` — `PW='...'` has no keyword to key on. Verified against all 32 secret-bearing
keys in the live env file: none reached the log.

Exit codes carry the distinctions that matter:

| code | meaning |
|---|---|
| 0 | did what it said |
| 1 | a coverage MISS, or a gate that failed |
| 3 | **degraded**: a pinned source was unreachable, or the base could not be read. Never a pass |
| 4 | a capture **refused** because the base already holds this fact — the message names it |

## Environments

Layered `.env.defaults` → `.env.${TEST_ENV}` → `.env.local`, later wins, with `KEY_<ENV_UPPER>`
promoted to `KEY`. There is no `.env.test-env`, so `TEST_ENV` must be given explicitly — guessing
an environment is how a run reports facts about a deployment nobody named.

| env | what it is |
|---|---|
| `vcptcore_stable` | **the reference.** Stable bundle v14, platform `3.1007.26` |
| `localhost` | the local stack; a developer's module mix, matching no shipped release |
