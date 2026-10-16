# `/qa-report` — the decisions taken while building it (VCST-5675)

Why the skill is shaped the way it is. The plan itself is
[`../superpowers/plans/2026-10-05-qa-report-skill.md`](../superpowers/plans/2026-10-05-qa-report-skill.md);
this file is the record of every call made **against** that plan while executing it, so a later
maintainer can see which parts were argued and which were simply transcribed.

Built 2026-10-12 → 2026-10-15 on `claude/qa-tooling/qa-report`, one subagent per task with a review and
fix loop per task, then a whole-branch review. Each ruling below names what it would cost to be wrong,
because that is the cheapest thing to check when revisiting one.

---

## The amendment that came before execution

**D7 — every comment OPENS with prose.** The plan's four templates were label strips end to end
(`**Cases** 21/23 passed · **AC coverage** 100%`). That is a form, not a report: it says what the
numbers were and never what happened — the same failure the old `QA Complete — [X] cases, [Y] passed`
block was replaced to fix. So each template declares a `lede_max` beside its `budget` and carries a
required `{{LEDE}}` of one to three sentences, written by the caller because no machine record can
supply it. `requireLede` runs after `applyExtras` and before the budget fit, so a missing or over-long
lede is exit 2 naming the flag rather than surfacing later as a budget failure; `fitBudget` collapses
only the lists named in `trim`, so the prose is structurally untrimmable.

Rejected: deriving the sentence from the counts (the label strip again, with worse grammar), and making
the lede optional (an optional prose slot is an empty one by the second week).

**The contract was verified from the CLI rather than by a test**, because this repo's unit tests are
temporary and a deleted test locks nothing. Five runs against a real `summary.json`: no lede ⇒ exit 2
naming `--lede`; 321 chars against `lede_max` 320 ⇒ exit 2 naming **`lede_max`, not a budget error**,
which is what proves the ordering; exactly 320 ⇒ exit 0; an untrimmable 2 000-char line ⇒ exit 3 with
no mention of the lede; `--lede` beats `--extra.lede`.

---

## Rulings against the plan

| # | Ruling | Why | Cost if wrong |
|---|---|---|---|
| **T2-1** | A suite that evaluated nothing reports `NOT_RUN`, not `PASS` | The plan's own ternary gave `PASS` to a suite with `testCases: []` and to one whose cases were all skipped — a green row nobody earned, posted to a shared ticket. The plan already forbids reporting a partial count instead of an error; a false green is that one step further on | One extra result string a template must tolerate |
| **T2-1a** | Spell it `NOT_RUN`, not `NOT RUN` | The page shell already declares `data-s = PASS \| FAIL \| BLOCKED \| NOT_RUN`. Caught mid-round, before the commit | — |
| **T2-2** | A non-string issue entry is never `JSON.stringify`d | Those objects carry free-text `notes` with account emails — the privacy class the design excludes. A constraint violation is not graded on diff size | A terser issues line for an unexpected shape |
| **T3-1** | Fill the page's three slots in ONE pass | Sequential `.replace` let a substituted value be re-scanned, so a ticket containing `{{BODY}}` left the real slot unfilled. "A value can never fill another slot" is binding and is not graded on reachability | None — one pass is strictly safer |
| **T3-2** | Confine an embedded image to the image root | `resolve()` escaped the root, so a `../` entry embedded any `.png` on disk into a page published org-wide. Same class as the notes leak | A legitimate image outside the ticket folder is refused, and the error names it |
| **T5-1** | A shipped skill cites only sections that exist in a **plugin-only** install | `vc-fix` ships to clients self-contained. Its `tracker-ops.md` is truncated (no §5a–§5d) and it carries no `reports-policy.md`, so the new SKILL.md pointed clients at rules they cannot open. **No gate catches this** — `context:check` walks `CLAUDE.md` + the repo-root `.claude/` and never descends into `plugins/` | Two short rules live in `reference.md` as well as upstream |
| **T6-1** | `defect-lifecycle-workflow.md` 3.4/3.5 keep their hand-typed blocks | They are status-transition notes, not run results: no machine record behind them and no `qa-report` kind that could render them. The one-home rule is about comments that report a RUN | Two blocks stay uncentralised until a `comment-status` kind exists |
| **T7-1** | Convert `qa-lead-orchestrator`'s `Complete:` one-liner, though the brief never named it | A verbatim-shaped copy of the result comment, already stale (missing the AC/DoD, `Not filed` and `Release note` lines), sitting in the prompt of the one agent that posts the comment — the worst possible place for a stale copy | A line in an agent prompt becomes a pointer; agent prompts are re-paid per dispatch, so it is a net saving |
| **T7-2** | Every caller carries the `/plugin update` + **stop the report step** fallback | Two call sites inherited the gap from the plan's own text. A caller that cannot reach the skill and is not told to stop is a caller that hand-types the comment — the one outcome this work exists to prevent. Paid for in the two shrink-only files by cutting adjacent prose | A few words of filler gone from two long files |
| **T7-3** | Regenerate the roster, never hand-edit it | `.claude/skills/README.md` is generated and headed "do not hand-edit". A hand edit that matches today diverges the moment the generator changes | None — the generator emitted exactly the same bytes |
| **T8-1** | Quote the front-matter `trim` list; teach `parseTemplate` to strip a matching quote pair | The plan wrote a bare YAML flow list, which the committed `plugin-frontmatter.test.mjs` guard rejects — correctly, because a component whose frontmatter fails to parse loads with EMPTY metadata, silently. Both halves are needed: quoting alone would make `trim` a string and silently disable trimming | Four quoted strings and three lines of parser; no-ops if a real YAML parser is ever adopted |
| **F-3** | Restore "ask the operator" before publishing a page | Moving the publish gate into `reference.md` silently dropped the consent, while the old copy still asserted it — the two contradicted. Publishing uploads a run's evidence to an external host, and `--confirmed` means consent to POST THE COMMENT, never to publish | One extra prompt per native-project run |
| **F-5** | More than four screenshots degrades; it does not refuse | The page's embed cap threw, so a routine three-pair UI fix produced **no comment and no page at all**. The first four embed, the rest are referenced | A published page shows the spilled shots as links, not inline images (see Known limits) |

### Budget rulings

| # | Ruling | Why |
|---|---|---|
| **F-1** | The `**Attached:**` line sits OUTSIDE the budget, and that is documented rather than fixed | It is a tracker-side artifact of the upload, not report content. The budget exists to stop a comment burying a ticket under derived prose; one filename does not. Reserving headroom for a line whose length depends on a filename is worse than the problem |
| **F-2** | `fix` budget 1200 → 1600 | Two before/after pairs in the wiki dialect exited 3 at 1205/1200, and a two-row table is the ordinary case — `/qa-verify-fix` asks for one row per RED→GREEN pair. A budget a normal run cannot meet is a tripwire, not a budget. `BEFORE_AFTER` is trimmable, so raising it keeps list collapse as the safety net instead of letting exit 3 do a trimmer's job |

---

## Known limits, accepted deliberately

- **Spilled screenshots on a published page render as broken images.** `ref` mode emits relative paths,
  which do not resolve on an Artifact. Strictly better than the refusal it replaced; the narrower fix is
  to list the spilled filenames as text.
- **`applyExtras` checks that an entry is an object, not that its fields exist.** `{item}` with no
  `reason` still renders an empty cell at exit 0.
- **The regression comment renders near its ceiling** (1497/1500 measured). Both of that template's
  lists are trimmable, so overflow degrades to `+N more` rather than exit 3 — but do not add a fixed
  line to that template without measuring.
- **`.claude/commands/qa-regression.md` has single-digit headroom** against its shrink-only
  `BUDGET-004` baseline. The next edit there must be net-negative.
- **The round-delta comment for `/qa-test --iterate` is NOT centralised** — it reports a run, so the
  one-home rule would cover it, but giving `--iterate` its own kind is a feature rather than a fix.
  Recorded in `reference.md` and beside the block so it reads as a decision, not an oversight.
- **No machine record holds the account a run signed in as.** The `test` comment's "Signed in as" row
  defaults to `not recorded`; the caller supplies it with `--set AS_USER=`.

## Open at hand-off

- The `test` budget is **1900 provisionally**. The retuned comment measures 1862, so 1500 no longer
  fits. The alternative to raising it is compressing the machine-written `Environment` and `Artifact`
  strings in the header — the cheaper cut, and it improves readability too.
- `vc-fix` is at **0.10.0 with no tag**. Per `../release-process.md` the `vc-fix--v0.10.0` tag follows
  the bump, after merge; until then callers on an installed plugin get the refusal path.

## A finding this work surfaced but did not fix

`plugins/vc-fix/knowledge/execution/tracker-ops.md` is a **truncated** copy of the repo's — missing
§5a–§5d, which plugin commands already cite — and `context:check` never descends into `plugins/`, so
nothing catches a dangling citation there. Recorded in
[`../repo-findings-backlog.md`](../repo-findings-backlog.md) with a suggestion to widen the gate's walk.
