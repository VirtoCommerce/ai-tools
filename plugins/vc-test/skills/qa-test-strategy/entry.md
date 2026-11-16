# Entry — how `/vc-test:qa-test-strategy` is entered

Moved from SKILL.md §Who chooses, unchanged. Read when the skill is entered from `/qa-test` or standalone; a vc-test run enters through `briefs/strategy.md`.

**From `/qa-test` (in this repository: `.claude/commands/qa-test.md`):** it counts the round at its Stage 0 (step 1's local-evidence
half) and runs this skill inline after its Stage-1 join with the bundle it already has. Here, run step 1's **second** count
(the bundle's `signals[]` verdict comments — a fourth round ⇒ the same STOP), then steps 2 onward — never a second
`/preflight` or `/vc-test:ticket-context`. A same-build re-run picks up the approved round instead of rewriting it (D7). The approved file's path is what it passes to
`/qa-test-model --strategy`.

**Standalone:** `npm run run:use -- <KEY>` binds the env and the run folder
([`run-dir.mjs`](../../scripts/lib/run-dir.mjs)), then procedure step 1 (Round) **first**, from local evidence only —
the run folders it lists and `git log --all`, never its own tracker fetch; a fourth round ⇒ STOP with the
escalation and nothing else runs (D6: no context, no strategy, no browser). The QA verdict comments are counted
once the bundle exists, from its `signals[]`; a fourth round found there ⇒ the same STOP. Then `/preflight ticket --ticket <KEY>`
(no `--expect`: deployment is the bundle's) for the sprint, env health and kb hits →
`/vc-test:ticket-context <KEY> --domain <slug> --kb-hits <ids>` → steps 2 onward → approval → STOP. A `/vc-test:ticket-context` STOP is this skill's STOP, quoted verbatim.
`--domain` absent ⇒ resolve it **before** `/vc-test:ticket-context`, as
`/qa-test` (in this repository) Stage 0 item 8 does: it is fixed when that runs (its
cache key; `known` reads it from `prepare.json`). None resolves ⇒ run without one; F2 and F5 then fire on
doubt, which is correct. A later run on the same build reuses the approved file.
