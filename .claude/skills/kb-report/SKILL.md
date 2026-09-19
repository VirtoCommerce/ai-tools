---
name: kb-report
description: "[KB] Read the knowledge base's own logs and render the six-panel report — what agents asked, what the base could not answer, and which answers were useless. Run it before deciding what to build for the base next."
argument-hint: "[--days 30] [--base <locator>] [--json] [--no-network]"

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
| 1 | **Misses** | A question asked and not answered, ranked by repeat count. Asked three times and never answered is the highest-value entry nobody has written — go find out, then `kb_capture`. `unreachable` asks are counted **separately and are not misses**: the base was not read, so they say nothing about coverage. |
| 2 | **Unhelpful answers** | The miss the miss list cannot see. See below — this is the panel that decides ranking. |
| 3 | **Questions asked** | Everything asked, answered or not, by frequency and by session. What agents actually want, which cannot be guessed in advance, only observed. |
| 4 | **Entries used / never used** | A never-served entry is either unfindable or worthless. The log **names the candidates; it does not decide which** — and an entry written yesterday cannot have been used last month, so read it against the window. Not a retirement list. |
| 5 | **Confirmations and disputes** | Where a fact was seen to hold again, and where it did not. **A disputed entry with several confirmations is the single most decision-worthy row in the report.** One dissent against four confirmations is a flag, not a deletion. |
| 6 | **Refused captures** | Each one is a **ranking miss that did not become a duplicate**: the agent looked, did not find it, went and found out, and only the write caught the duplicate. A rising count is the identity guard working *and* a direct measure of how often `ask` fails to find what the base holds. |

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

## Flags

| flag | |
|---|---|
| `--days N` | window, in `log/YYYY-MM-DD/` day folders. Default 30. Above **200 files it refuses** and says so rather than hanging — narrow the window. |
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
`scripts/kb/core/report-analyse.mjs` (the six panels — pure, no network) ·
`scripts/kb/core/report-render.mjs` (the HTML). Tests: `scripts/unit/kb-report.test.mjs`, which
pins panel 2's arithmetic against the real instance in the published log.
