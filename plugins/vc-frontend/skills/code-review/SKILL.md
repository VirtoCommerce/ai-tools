---
name: code-review
description: "Use when asked to review a branch, a pull request or local commits in vc-frontend or a theme fork, when the review should be as deep as the change is risky, or when someone asks how risky a change is, what it can break, or who consumes the code it touches."
argument-hint: "[PR number | --base <ref>] [--lenses a,b,c] [--yes]"
---

# code-review — review as deep as the change is risky

A one-line change in a page used once and a one-line change in `VcPopover` are different reviews: the
popover is re-exported to Module Federation plugins, restyled by forks and rendered in a dozen places.
This skill measures that first (a script, not an opinion), proposes review lenses that fit, runs the
ones the user picks, and reports only findings that survive a refutation pass.

| Tier | Typical change | Default lenses | Human approval to suggest |
|---|---|---|---|
| R0 | tests, stories, docs, locales, version bump | trivial (one cheap pass; tests if tests changed) | as usual |
| R1 | a page or module component with ≤2 consumers | correctness, conventions, ui | one reviewer |
| R2 | shared code, core, router, global styles, a changed design token; >2 consumers; exported from a `shared/*/index.ts` | + consumers, architecture, design | one reviewer who reads the consumer list |
| R3 | ui-kit, core-api / federation, cart, checkout, payment, company, auth, build, CI, `v-html`, a removed token | + security, commerce, ui-kit, as zones demand | two reviewers |

Any tier adds `styles` when a changed line is a class binding, a `<style>` block, a stylesheet or a
design token, and `ui-kit` when a kit file changed. A change of more than 400 lines or 20 non-trivial
files goes one tier up.

## 1. Get the change into a checkout

The script reads `HEAD` and the module graph from the working tree, so HEAD must be the change.

- **Current branch:** `git fetch origin` first, so the base is fresh.
- **A PR number:** never switch the user's branch. `git fetch origin pull/<N>/head`, then
  `git worktree add --detach .claude/worktrees/code-review-<N> FETCH_HEAD` and work there; its base is the
  PR's base branch (`gh pr view <N> --json baseRefName`). Remove the worktree at the end.

## 2. Classify

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/code-review/classify.mjs" --base origin/<base> --out <scratch>/classification.json
```

It prints a Markdown summary and writes the full result to `--out`; read the JSON for the details
you need (`jq` or `node -e` on the file), not whole. If `CLAUDE_PLUGIN_ROOT` is empty, resolve
`classify.mjs` against this file's directory. It needs the repository's own `dependency-cruiser`
(`.dependency-cruiser.cjs` plus `node_modules`) and takes from about 20 seconds to about a minute
on a very large change. Without it the script still classifies by paths and says so in `warnings`:
tell the user fan-out is unknown.

**When `huge.on` is true, follow [Huge changes](#huge-changes) instead of steps 3–5.**

Show the user the tier, the reason for it, and the table of non-R0 files with their consumers and
what makes them visible outside the repository. When `tokens` is not empty, list each changed or
removed token with its users and the kit components among them.

The script sees what paths and the module graph show:
- the zone a path is in (checkout is R3 even with no other consumer);
- the code that uses a file, including critical flows that render it from outside their zone (the
  address form inside the company address modal is `used by the company flow`);
- design tokens: which `--vc-*` / `--color-*` tokens and preset keys the diff defines, changes or
  removes, and who reads them;
- styling lines (class bindings, `<style>`, stylesheets) in any file.

It cannot see what the code does.

**Then classify by meaning: your judgment, on top of the script's.** The script pre-selects, per file,
the questions in [risk-questions.md](risk-questions.md) whose signals match its path or changed
lines (`questions`); a one-line change usually gets a handful. Answer those from the file's diff, plus
any other question the diff plainly calls for. A yes raises a file below R3 to at least the
question's floor, and for any file it becomes a focus handed to the lenses. Put each raise in the risk
summary with the question id and the line that answered it. **You may raise a tier, never lower it**:
lowering is the user's call.

If the repository has its own .claude/review/risk-questions.md, answer its questions too. A
hotfix or revert that this review would have missed is a new question for that file.

## 3. [PAUSE] Propose the lenses

Present the `lenses` list from the script with its reasons, recommended ones first, and add any lens
your own reading of the diff calls for, with the reason. Ask which to run (one multi-select question
per group of up to four lenses; mark recommended options). Skip the pause only when the user passed
`--yes` or `--lenses`.

What each lens checks, and what it must not report: [lenses.md](lenses.md).

## 4. Run the lenses

One subagent per lens, all in parallel. Give each one this brief, filled in:

1. The repository path, the base and head SHAs, and the command for the diff:
   `git diff <merge-base>..HEAD -- <files>`.
2. The files in scope for the lens, with their tier and reasons from the script, and the risk
   questions answered yes for them.
3. The lens section from `lenses.md`, verbatim, including its "Not a finding" list.
4. For `consumers`: each changed file's consumer list and its "visible outside" notes.
   For `conventions`: the rule files the script matched, and the repository's `CLAUDE.md`.
   For `styles`: the files with styling lines, the `tokens` list, and the repository's style rules
   (`styles.md`, `designs-and-presets.md`, `ui-kit.md` in `.claude/rules/`, if they exist).
   For `ui-kit`: the kit files, their consumers and facade exposure, and `ui-kit.md` /
   `ui-kit-internals.md` if they exist.
5. The rules every lens follows:
   - Static review only: read files, `git diff`, `git show`, `git grep`. Never run tests, type checks,
     linters, builds, `yarn`, `npx` or a dev server. A claim that needs a run goes under
     `## Needs a run` with the exact command.
   - Report a defect in the changed lines, or one the change causes elsewhere. Not code the change
     left alone, not conformance to a ticket, not "add a test" on its own.
   - Every finding carries: file:line; the concrete path that triggers it (a route, a click, a prop
     value, the caller that breaks); why it is wrong; severity; proof (`traced` — followed through
     the code — or `suspected`).
   - Severity follows blast radius: shared or public code that others build on is `high`; the same
     flaw contained in one page is `medium` or `low`.
   - For anything under `client-app/ui-kit` or exported through `core-api`, judge reachability from
     the public API (props, emits, slots, CSS custom properties), not from consumers in this
     repository: forks and plugins are consumers too.

Use the session's model for R2–R3 lenses and a cheaper one for R1. For R3, a second opinion from
another model family is optional: offer it, never block on it.

## 5. Refute before reporting

Give every finding to a fresh subagent whose only job is to disprove it from the code: does the path
really reach this line, does a guard elsewhere already handle it, did the behaviour exist before
this change (`git show <merge-base>:<file>`). Keep a finding only if it survives with a concrete
trigger. Merge duplicates across lenses into one finding listing every lens that found it.

## 6. [PAUSE] Offer the visual check

When `visual.recommended` is true (a design token, global styles, a preset, a design or a styled kit
component changed), a static review cannot see the result. Offer, with the reasons from `visual.why`:

1. `visual.command` lists the Storybook stories the change can move (`ALL` for global styles and
   tokens).
2. The same procedure as `merge-upstream`'s [visual check](../merge-upstream/visual.md), with the
   merge-base as "base" and HEAD as "head": build Storybook for both, shoot them with
   `visual/snap.mjs --only <affected.json>` once per design, preset and dark setting (`--globals`),
   compare with `visual/diff.mjs`, and re-shoot the changed stories with `--repeat 3` before trusting
   a diff. `visual/setup.mjs` installs what they need once per machine.

Run it only on the user's yes; it takes minutes. Otherwise put the stories and the toolbar settings
to check by hand into the report.

## 7. Report

In this order, nothing else:

1. **Risk:** tier, the reasons that set it, any tier you raised and why.
2. **Findings**, most severe first. Each: severity, `file:line`, what breaks and for whom, the
   trigger path, proof, lenses that found it. Say plainly when there are none.
3. **For the human reviewer:** the consumers and external surfaces to check by eye, what the lenses
   could not verify statically (`## Needs a run` items), and the approval to suggest for the tier.
4. **Lenses run** and lenses skipped.

Post nothing to GitHub unless the user asks.

## Huge changes

Past a certain size one agent per lens cannot read the change, and a review that read a sample
looks the same as one that read everything. The script switches `huge.on` when the non-trivial part
of the change crosses its thresholds (`huge.reason`). Then:

With `--yes` nobody answers the pauses: show the split, take the default depth per cluster, and go
on.

1. **Say so first, and offer a split.** Show the `clusters` table as the proposed split into
   separate PRs, highest tier first. If the user splits, stop here.
2. **Set the mechanical part aside, and explain it.** `mechanicalGroups` holds the files that need
   no file-by-file reading: the same edit repeated across many files, generated files, pure renames,
   whitespace-only changes. For each group:
   - review the representative of a repeated edit once, against its before → after sample. Ask
     how the edit was made: a script or codemod the PR names can be trusted once; an edit an agent
     made file by file gets three representatives, because agents vary where scripts do not. A
     `shape` group (same edit, different names) gets one representative per distinct name pattern;
   - check that generated files have a source change in this diff (a `.graphql`, `package.json`,
     a facade export); a generated change with no source is a finding;
   - `outliers` repeat the edit and also change something else: they stay in the normal review,
     because a hand-edited codemod is where it usually breaks.

   Turn the groups into a short review guide: what each group did, how many files, why it is safe
   to skip, what was checked instead. Give it to every lens agent (so none of them re-reads those
   files) and put it in the report for the people who review next.
3. **[PAUSE] Agree the depth per cluster** with the user, by the cluster's tier: R3 clusters get the
   lenses their zone calls for, R2 clusters get correctness and consumers, R1 clusters one
   correctness pass, R0 clusters the `trivial` pass. The user may raise or lower any cluster.
4. **Review cluster by cluster:** one agent per cluster and lens, never more than a handful at once,
   each given only its cluster's files (a review unit holds at most about twenty), plus the review
   guide from step 2. Every agent also flags hunks that do not fit the PR's stated purpose: in a
   large change, the unrelated edit is the one nobody reads. Then refute (step 5) as usual.
5. **Report coverage before findings:** for every cluster, what was reviewed deeply, what got one
   pass, and what was only listed, with the files no agent read named. Nothing that was not read
   may be reported as reviewed, and a review with unread files is never called clean: "no findings
   in what was read".

Review the clusters in the script's `order`: ui-kit, core and the facade first, pages last, the
riskiest first within a layer. People and agents find fewer defects in the last files they read.

## Common mistakes

- Choosing depth from diff size: a one-line ui-kit fix is R3, a 300-line page rewrite may be R1.
- Skipping R0. Tests rewritten to pass and removed locale keys hide there; the `trivial` pass is
  cheap.
- Reviewing a huge change as if it were small: lenses that sampled it report "no findings" with the
  same confidence as lenses that read it.
- Treating "no consumer in this repository" as "no consumer": ui-kit, `core-api` and
  `shared/*/index.ts` exports have consumers in forks and plugins.
- Reporting what a lens could only suspect. `suspected` findings that fail refutation are dropped,
  not downgraded to a footnote.
- Running the test suite to "verify". CI does that; the review is static.
- Treating a token or preset change as local because few files name it: Tailwind utilities, kit
  states and every design and dark preset read it too.
