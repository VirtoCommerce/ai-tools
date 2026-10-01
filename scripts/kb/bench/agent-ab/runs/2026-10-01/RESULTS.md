# Agent A/B, 2026-10-01: the same task with and without the knowledge base

Model `sonnet` (`claude-sonnet-5`) for agents and judge, environment `vcst` (vcst-qa), base
`VirtoCommerce/vc-knowledge@main` (318 entries) read with `KB_ENABLED=0`. Method:
[`../../README.md`](../../README.md). Best case by construction: every real task needs one fact the
base already holds.

Raw stream-json transcripts are NOT here (the repo is public; they hold the environment's own
responses). They were parked in the gitignored `results/kb-ab/2026-10-01/` of the machine that ran
them. Everything here went through `archive.mjs` (credential and identity values -> `{{VAR}}`,
emails -> `{{EMAIL}}`, JWT/bearer tokens redacted) and `agent-log-toolkit` `scrub-scan` (clean).

## Headline (demo set, rule v2 "ask one short question")

Per task, 3 runs per arm, medians. `without -> with`.

| task | right (score 2) | wrong claims | steps | cost | time |
|---|---|---|---|---|---|
| T1 promotions stack | 2/3 -> 2/3 | 1 -> 1 | 21 -> 3 | $0.71 -> $0.13 | 4.1 -> 0.7 min |
| T4 "lost" order discount | 3/3 -> 3/3 | 0 -> 0 | 11 -> 2 | $0.39 -> $0.11 | 4.8 -> 0.7 min |
| T6 working API script | 2/3 -> 3/3 | 0 -> 0 | 52 -> 34 | $1.36 -> $0.86 | 8.1 -> 4.8 min |
| T7 sign-in lockout | 0/3 -> 0/2 (both partial) | 3 -> 0 | 43 -> 4.5 | $1.21 -> $0.26 | 6.6 -> 1.1 min |
| T8 colleague's return | 2/3 -> 3/3 | 0 -> 0 | 58 -> 5 | $1.81 -> $0.18 | 9.7 -> 1.1 min |
| C1 control (not in base) | 3/3 -> 3/3 | 0 -> 0 | 19 -> 22 | $0.54 -> $0.54 | 2.9 -> 2.5 min |

Totals over the five real tasks (`tools/totals.cjs`): tasks right in every run 1/5 -> 3/5; wrong
claims 4 -> 1; cost per right answer $1.70 -> $0.46; all runs 101 -> 28 min; environment writes
(heuristic) 40 -> 5; evidence score 0.97 -> 0.93 (both arms cite sources; not a base advantage).

## Series, in the order they ran

| folder | what | counts? |
|---|---|---|
| `00-pilot-control` | first plumbing run, C1 | no: judge parser bug |
| `01-pilot-T3` | T3, prompt said "validate on a real order" | no: both arms experimented live, kb arm re-checked an answer it held (1.7x the cost) -> prompts rewritten |
| `02-T1-first-prompt` | T1 with "write the expected result of a regression test" | no: stopped after 1 run; the kb run created promotions and an order (80 calls, 29 writes, $3.04) -> preamble made the env read-only |
| `03-T1-long-question` | T1, rule v1 | yes, as the FINDING: all 3 kb runs asked one 60-70 word question, 25% word coverage, the ranker's 50% floor refused KB-5ADBFB34, agents guessed wrong (0/3). Its nokb runs are the T1 baseline |
| `04-T1-short-VOID-example-leak` | T1, rule v2, first wording | **void**: the rule's example question was nearly the T1 question and agents copied it |
| `05-T1-short-question` | T1, rule v2 with an off-topic example | yes (kb arm only; the rule does not touch nokb) |
| `06-T4`, `07-T6`, `08-T7`, `09-T8`, `10-C1-control` | the demo set, both arms, rule v2 | yes, with the notes below |

## Corrections made during the batch

- **T6 rubric.** "Not a search under /api/catalog/products" made the judge score the working
  `POST /api/catalog/search/products` as wrong (two nokb runs at 0). Clarified, all T6 rows
  rejudged (`--rejudge-all`). The table uses the rejudged scores.
- **T1 03 nokb.1** judge output was unreadable; rejudged to 2.
- **T7 kb.3 excluded** by the operator: two short questions missed KB-8646A9CB ("how many failed
  sign-in attempts lock a storefront account" -> holds nothing), the agent investigated live,
  started a 15-minute wait as a background command and ended its turn, so `-p` ended the session
  with no answer. The preamble now forbids background waits (added between tasks).
- **T7 environment reset.** Before every T7 run the lockout account is unlocked and signed into
  once (`POST /unlock` clears `lockoutEnd`, not `accessFailedCount`), and the run refuses to start
  unless both read back clean.

## What the runs found about the base itself

1. **Retrieval is the weak link, not the knowledge.** Long questions fail the 50% coverage floor
   (T1, 03); even short ones miss on synonyms ("lock" vs "lockout", "multiple ... together"). The
   v2 rule is a bench-side workaround; the fix belongs in `kb_ask` itself (tool description and/or
   ranking).
2. **KB-8646A9CB is right; KB-0407F36E is not.** Two of three nokb agents concluded "locked after 3
   attempts" from `"count":3` in the token endpoint's 400 body. Measured with
   `tools/lock-threshold.mjs` from a clean state: attempts 1-4 `login_failed` (accessFailedCount
   1->4), attempt 5 `user_is_temporary_locked_out`, lockoutEnd +15 min, `count` 3 on every reply.
   So `count` is not a running failed-attempt counter, as KB-0407F36E suggests: a dispute
   candidate, not yet filed.
3. **Two coupon entries contradict each other** (KB-001183CF case-insensitive vs KB-35F20D97
   case-sensitive), found while choosing tasks; not yet disputed.
4. **An agent with the base sometimes re-checks a well-attested answer live anyway** (T8 kb.1: 40
   steps, still correct). The rule asks it not to; compliance is not perfect.

## Reproduce

```bash
node scripts/kb/bench/agent-ab/run.mjs --tasks T8-returns-colleague --runs 3 --kb-rule v2
node scripts/kb/bench/agent-ab/run.mjs --tasks T6-api-navigation --rejudge <out-dir> --rejudge-all
node scripts/kb/bench/agent-ab/runs/2026-10-01/tools/totals.cjs
```

The demo deck's source (Slides artifact) is in [`../../deck/`](../../deck/).
