# Run 04 — conditions

Written before the run, as run 03's were. That page proved its worth: the one condition nobody had
planned — an allow-list with a single browser tool in it — was reconstructable afterwards only
because it had been written down while it was still visible.

Brief: `RUN-BRIEF-unprompted.md`. Task: `TASK-run-04.md`.

## The one number this run is for

Runs 01–03 all did the same thing, and run 03 did it most starkly:

```
call    5   kb capture --help
calls 7–10  kb deliver ×4          ← every question it ever asked
calls 11–265                       ← 255 calls of work, no contact either way
calls 266–269 kb capture ×4        ← four entries in 39 seconds, KB_PHASE=report
call  312     kb capture ×1
```

**Consulted in the first 3%, written in the last 17%, nothing in between.** Writing from the report
means writing from memory, so anything a run learned and then superseded was never written at all.

So: **when is the base touched, and how much of the work happens between the first touch and the
last?** Two numbers out of the tool log, and they do not depend on anyone's judgement. Everything
built since run 03 exists to move them.

## What changed since run 03, and why each is here

Five changes. That is a lot of variables for one run, and it is deliberate: none of them is being
measured against the others, and all of them are aimed at the same number. If it does not move,
none of them worked; if it does, the next run separates them.

| change | what it is meant to do |
|---|---|
| **the loop** (`02ae7ab`) | the base keeps every question until something is written back; one line under every `kb` command says what is open; `kb demand` lists it |
| **the arrival hook** (`570252c`) | a PostToolUse hook offers entries anchored on a coordinate the run just touched — the base arrives instead of being visited |
| **retrieval** (`e5e7717`) | BM25+'s per-term floor to 0 and the medium words out of the content terms; 2 of 3 buried rows now served, 0 of 23 lost |
| **scalar anchors gone** (`41fa4c7`) | 64 entries no longer claim to be about `String`; also closes a pointer to `gql-type-string`, which never existed |
| **the brief** (`bc1ad13`) | the loop described; "served is not answered" stated; the closing report now asks *when* the base was touched |

## What is the same as run 03

Unprompted brief — the base is described, and the run is not told to consult it. Same deployment,
`vcptcore_stable`. Same task shape: real QA work on the B2B storefront and the Admin SPA, task in a
file rather than in chat.

## Fixed before the run rather than during it

Run 03 met a permission classifier with `browser_snapshot` as the only allowed browser tool, filled
the sign-in form correctly and was refused the submit. `.claude/settings.local.json` now allows the
fourteen interaction tools. `browser_network_request` (singular) is still deliberately excluded: it
is the tool that returned a sign-in POST body in plaintext during run 02.

## The arrival hook's expected hit rate, so it is not read as a result afterwards

Replayed over the three archived tool logs, counting only entries that existed before each run: 9
of run 01's 83 calls, 1 of run 02's 172, 2 of run 03's 319. It pays where work touches routes.

Run 04's task is deliberately placed where the base has something to offer: two entries are anchored
on `/company/members`, both written by run 03. **This is not a fair test of the hook in general** —
it is a test of whether an entry that does arrive gets read and acted on, which has never been
observed and is the more useful question. The general hit rate stays what
`measurements/kb-arrival-2026-09/` says it is.

## Two things to read afterwards that are not the headline number

**Did anything get confirmed?** No run has ever confirmed an entry it was served without being
prompted. The task lands on states that `KB-4B889114` makes a claim about, so the opportunity is
there and unforced.

**Did the demand list end empty, and how?** Three ways close a row and all three are legitimate.
A run that drops rows with reasons is doing the right thing; a run that leaves them open has told
us what this base cannot answer, which is also worth having.
