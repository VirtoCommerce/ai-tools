---
name: kb-report
description: "[KB] Read the knowledge base's own logs and render the report — what agents asked, what the base could not answer, which answers were useless, and the §15 acceptance verdict. Run it before deciding what to build for the base next, and to judge a check wave."
argument-hint: "[--days 30] [--sessions a,b,c] [--base <locator>] [--json] [--no-network]"

---

# /kb-report — what agents asked this base, and what it could not answer

```bash
npm run kb:report
```

It reads the base's `log/` subtree over the network, analyses it locally, and writes a
self-contained HTML file **outside the repository tree** (the session scratchpad; `--out` moves it).
It **writes nothing to the base** and nothing into the working tree — `git status` cleanliness is
load-bearing for `/qa-fix` and every review flow.

**Run it before proposing any change to the base's design.** The whole point of shipping the logs
first is that the next thing to build comes from what agents actually asked, not from what anybody
predicted they would ask.

## What it answers, in the order the panels appear

Misses first, because **the miss list is the work queue**.

| # | panel | what a row means, and what to do with it |
|---|---|---|
| — | **§15 acceptance verdict** | Three thresholds, judged against this window. Above panel 1 because it is the gate. See below. |
| 1a | **Near misses** | The best candidate each miss *rejected*, sorted by coverage descending — the floor's own error bar. See below. |
| 1 | **Misses** | A question asked and not answered, ranked by repeat count. Asked three times and never answered is the highest-value entry nobody has written — go find out, then `kb_capture`. `unreachable` asks are counted **separately and are not misses**: the base was not read, so they say nothing about coverage. |
| 2 | **Unhelpful answers** | The miss the miss list cannot see. See below — this is the panel that decides ranking. |
| 3 | **Questions asked** | Everything asked, answered or not, by frequency and by session. What agents actually want, which cannot be guessed in advance, only observed. |
| 4 | **Entries used / never used** | A never-served entry is either unfindable or worthless. The log **names the candidates; it does not decide which** — and an entry written yesterday cannot have been used last month, so read it against the window. Not a retirement list. |
| 5 | **Confirmations and disputes** | Where a fact was seen to hold again, and where it did not. **A disputed entry with several confirmations is the single most decision-worthy row in the report.** One dissent against four confirmations is a flag, not a deletion. |
| 6 | **Refused captures** | Each one is a **ranking miss that did not become a duplicate**: the agent looked, did not find it, went and found out, and only the write caught the duplicate. A rising count is the identity guard working *and* a direct measure of how often `ask` fails to find what the base holds. |

## Panel 1a — near misses, the floor's own error bar

The admissibility floor (`rank.mjs`) returns nothing when no candidate carries an anchor or clears
**≥ 2 overlapping words AND ≥ 50% of the question**. When it refuses, the miss line records the best
candidate it turned away — `nearMiss: {id, score, coverage}`. This panel is the reader for it.

> **Sorted by coverage DESCENDING, not by repeat count, because the top of the list is the error
> bar on the floor itself.** §14.4 cut at 0.50 with the nearest surviving BAD hit at **0.45** — one
> word, in an eleven-token question, below the line. **Anything at or above 0.45 is a row a human
> must read.**

Two different things a row can mean, and **the log cannot tell you which** — that is the reading:

- **the floor refused a question it should have answered** — re-cut the bottom of the band, which is
  §14.4's own stated remedy (the band is `(0.45, 0.80]`, and 0.50 is its floor, not its middle); or
- **an entry is phrased unlike the way anyone asks** — rewrite its `subject`, and change nothing
  else. A candidate that near-misses on *several different questions* rolls up into the **repeats**
  line and is almost always this case. It is otherwise invisible: never returned, never counted,
  never suspected.

Two things the panel derives rather than asserts. A miss that scored **nothing at all** carries no
`nearMiss` and is counted apart — the base is nowhere near the subject, which is not a floor
problem. And a candidate whose coverage *already* cleared 50% can only have been stopped by the
word count, so it is labelled `word count` rather than `coverage`; everything else is the default,
because that direction is provable and the other is not.

## Panel 2 — the number that decides ranking

A miss is honest: the base says it holds nothing. The dangerous case is the opposite —
`state: "answer"`, three ids returned, and not one of them any use. That never appears as a miss.

> **An `ask` is UNHELPFUL when the same session later `capture`s a fact whose anchors appear in
> none of that ask's `matched` rows.** The base answered; the agent went and found out anyway.

Three things the panel deliberately does **not** do, each of which would inflate the rate:

- A capture **before** the ask, or in **another session**, is not evidence about that ask.
- A capture whose entry is **not in the index snapshot** is reported **undecidable**, never
  unhelpful — counting it would make the rate a function of push timing.
- An ask with **no matches** is a miss, and belongs to panel 1.

The denominator is asks **followed by a capture in the same session**, not all asks: an ask nobody
captured against is not evidence either way, and putting it in the denominator would let the rate
fall simply because the base got quieter. **Above ~15% is the trigger for ranking work beyond token
overlap** — the panel measures it and decides nothing.

## The §15 acceptance verdict — three thresholds, declared in the code

PLAN §15 is the gate before shipping to teammates, and the first quality evidence that is not
self-selected. Its three thresholds are **constants in `report-analyse.mjs`, not flags**: a
threshold you can pass on the command line is a threshold you can move after seeing the result,
which is exactly what §15.3 forbids.

| threshold | source | how it is judged |
|---|---|---|
| unhelpful-answer rate **≤ 15%** | §11's existing trigger, reused | panel 2's rate, over its decidable denominator |
| **no** miss whose `nearMiss` coverage **≥ 0.45** | §15.3 | panel 1a's in-band rows |
| **≥ 1** capture following a miss | §15.3, via the `after` field | a `capture` whose `after` points at an `ask` logged `miss`, in the same session |

> ### `NOT ENOUGH DATA` is a real verdict and is not a soft pass.
>
> §14.1's mistake was a comfortable number with nothing behind it — *zero misses in 39 asks* read as
> perfect coverage and was the absence of a floor. So **an absence only becomes a PASS once at least
> 20 observations stand behind it**, derived once from the rule of three: with zero events in `n`
> trials the 95% upper bound on the true rate is ~`3/n`, and only at `n ≥ 20` does that fall under
> the 15% trigger. **Every row prints the n it judged, beside the value.** On a small window all
> three rows will say NOT ENOUGH DATA — that is the correct output, not a failure.
>
> A **presence** needs no such floor: one capture following a miss proves exit 1 is not a dead end,
> whatever `n` is.

**The near-miss row never FAILs on its own.** §15.3's second threshold is a conjunction — a
machine-checkable part (coverage ≥ 0.45) and a human part (*"turns out, on reading, to have been
answerable"*). The script owns the first and **flags the rows**; a reader owns the second. A window
with in-band rows therefore reports `NOT ENOUGH DATA` naming them, never `FAIL`: a FAIL there would
be the script claiming a judgement it has no way to make.

## Scoping to a check wave, not a date range

```bash
npm run kb:report -- --sessions local_d4,local_26
```

**A wave is a named set of sessions, not a time window** (§15.1: the wave runs interleaved with
other traffic). `--sessions` therefore **replaces** the day filter and searches the **whole** log
tree — `--days` does not apply and is not consulted. This matters beyond convenience: §7's day
folder is the day a file was **pushed**, so a wave session's log can land outside any window a
reader would think to pass, and a session that pushed twice has two files. Selection is on the
file's session suffix, which is exact — a swept queue file keeps its **original** session id.

A named session with no log file in the base gets its own header note. **That is not "it asked
nothing"** — it pushed nothing, or its queue has not been swept yet.

## Reading it honestly

- **An empty panel is not a good result.** Each one says *why* it is empty, and "nobody confirmed
  anything" is not "everything holds" — it is "nobody checked".
- **A banner means the base was not read.** The report renders from cache behind it, naming the
  failure and the newest record it holds; anything after that timestamp is missing from every panel.
  A banner with an **empty cache** means nothing was read at all, and every panel then says so
  rather than reading as "no activity". That confusion — `unreachable` presented as `miss` — is the
  one output this report must not produce.
- **The header's notes are load-bearing.** A truncated git tree, dropped malformed lines, or an
  `index.json` that failed to load each make specific panels unreliable, and each is printed there.
- **Synthetic lines are excluded from every panel, and the header says how many.** A benchmark,
  demo or acceptance run marks itself with `KB_SYNTHETIC=1`, so it still exercises the real queue,
  server and push without entering the demand panels. This is not cosmetic: before it existed, one
  latency benchmark supplied **30 of the base's 39 recorded asks**, so panel 3's top six rows were
  a stopwatch and every other denominator was four times real demand. If you are timing the tool,
  set the variable; if a header note says a window is mostly synthetic, the panels below describe
  what is left, not what happened.

## Running a benchmark against the base

```bash
KB_SYNTHETIC=1 npm run kb -- ask "…"     # or set it on whatever spawns the MCP server
```

Everything is recorded exactly as it would be otherwise — same lines, same fields, same flush —
plus `"synthetic": true`. Nothing is suppressed, so the run is still auditable and its latency is
still in the file; it simply is not counted as somebody wanting to know something.

## Flags

| flag | |
|---|---|
| `--days N` | window, in `log/YYYY-MM-DD/` day folders. Default 30. Above **200 files it refuses** and says so rather than hanging — narrow the window. |
| `--sessions a,b,c` | scope to named sessions across the **whole** log tree. Replaces `--days`, which keeps its default and its meaning when this flag is absent. The shape §15's check wave needs. |
| `--base <url>` | read another base. Defaults to `KB_BASE`, then the declared default. |
| `--out <file>` | where the HTML lands. Never put it in the repository tree. |
| `--json` | the analysis as JSON, no HTML — for piping into something else. |
| `--no-network` | render from cache only: the unreachable path, on demand. |

**Exit codes**, and the distinction is the same one `kb ask` makes: `0` rendered from the live base ·
`1` rendered **from cache** behind a banner · `2` refused (base not enumerable, or window too wide) ·
`3` nothing read and no cache. `1` and `3` are separate because *stale* and *nothing* are opposite
problems.

## Not an MCP tool, and that is deliberate

This is an **operator** verb, like `push` and `stat`. An agent in the middle of a task has no use
for a 30-day analysis of everyone's questions, and exposing it would put a multi-second network
fan-out behind a tool an agent might reach for by accident. The agent-facing verbs are `kb_ask`,
`kb_show`, `kb_capture`, `kb_confirm` and `kb_dispute`.

## Where the pieces are

`scripts/kb/report.mjs` (the CLI) · `scripts/kb/core/report-fetch.mjs` (the network and the cache) ·
`scripts/kb/core/report-analyse.mjs` (the panels, the §15 thresholds and the verdict — pure, no network) ·
`scripts/kb/core/report-render.mjs` (the HTML). Tests: `scripts/unit/kb-report.test.mjs`, which
pins panel 2's arithmetic against the real instance in the published log, and holds
`NOT ENOUGH DATA` apart from `PASS` on every row of the verdict.
