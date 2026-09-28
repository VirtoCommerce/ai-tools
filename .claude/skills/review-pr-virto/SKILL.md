---
name: review-pr-virto
description: Use when asked to review a pull request in a VirtoCommerce platform or vc-module-* GitHub repository ("review PR 123 in vc-module-cart", "look at this x-api PR", "run a review on this PR") — code that ships as NuGet packages to downstream projects the reviewer cannot see.
---

# Review a VirtoCommerce PR

A fixed recipe for reviewing a PR in `VirtoCommerce/vc-platform` or a `VirtoCommerce/vc-module-*`
repository, so each run gathers the same evidence, verifies every finding against the code, and
delivers one consolidated, severity-ranked review.

**The one fact that shapes everything below:** these repositories ship NuGet packages. Downstream
projects subclass their services, override their `protected virtual` seams, register overrides of
their models, and query their GraphQL schema — and none of that code is visible from the PR. So
**backward compatibility of the public and virtual surface outranks internal logic**: an internal bug
hits one flow and is usually caught by a test; a silent break of the surface hits every consumer on
their next package bump.

## Inputs

- `<repo>` — the repository name, e.g. `vc-module-cart`
- `<pr>` — the PR number
- `<clone>` — the path of the user's local clone of `<repo>`

If any is missing, ask. If there is no local clone, offer to clone it (you will need one for the
worktree and for code navigation).

`<scratch>` below means a scratch directory outside every repository, e.g. one made with
`mktemp -d`. Helpers write nothing anywhere else.

## Orchestration model

The lead session is the **orchestrator**. Its job is the bird's-eye view: the PR's intent, the
invariants in play, the verdict in progress, and the final synthesis. Token-heavy or mechanical
single-focus work goes to a helper subagent, so the lead's context stays clean enough to judge the
findings at the end.

| Work | Who | Model |
|---|---|---|
| Inputs, worktree, verification, synthesis, anything posted | lead | session model |
| Existing-threads sweep → digest | `general-purpose` subagent | `haiku` — mechanical extraction from the JSON files the lead saved |
| Diff pass against the checklist | `general-purpose` subagent | `opus` — analysis against a rubric |
| Test run in the worktree | `general-purpose` subagent | `sonnet` — needs a shell and a build |
| Optional Codex lenses | background Bash in the lead | see `codex-lens.md` |

Rules for every helper:

- **One helper = one task + an explicit output shape.** Helpers return digests and raw findings;
  the lead consolidates and judges. A helper with a vague mandate returns a wall of prose — the exact
  thing delegation was meant to prevent.
- **The mandate is read-only, and read-only puts every write out of scope, reversible or not.** Say it
  in the spawn prompt: no edits, no new files in any repository or worktree (a throwaway probe test is
  a write), no `git add` / `commit` / `reset` / `checkout`, only `<scratch>`. A helper that thinks a
  probe would settle a finding reports the finding as unverified and includes the probe as text for
  the lead to run.
- **A helper cannot ask the user anything.** Whatever it would have asked comes back to the lead in
  its report, together with the assumption it made instead.
- **If reality differs from the state the spawn prompt describes, the helper stops and reports** — it
  does not substitute a plausible task for the one described.
- Helpers post nothing anywhere; all external output goes through the lead (Step 7).
- The lead never pastes full thread dumps, full diffs or test logs into its own context when a digest
  suffices. Catching yourself reading paginated comment JSON means that work belonged to a helper.

## Code navigation — Serena first; any other source needs the user's yes

Navigate VirtoCommerce code — the PR's own repository and every platform or module repository it
touches — with the **Serena** MCP server: activate the local clone as a project, then
`find_symbol`, `find_referencing_symbols`, `find_implementations`. This binds the lead and every
helper.

Why Serena and not reading files: the questions this review lives on are "who overrides this
`virtual`?", "who calls this method?", "which overload is this?". Serena answers them by symbol
identity. A text read answers only "what text is at this path", and a text search also matches
comments, literals and same-named members on other types.

When Serena comes back **empty**, or is not installed, or has no project for the repository you need:

1. Check the cheap causes first: is the right project active, is its checkout at the version the PR
   builds against, does a shorter or substring name path find it?
2. Still nothing → **stop and ask the user.** Offer, in this order:
   - clone the missing repository locally and activate it in Serena;
   - install or fix Serena (recipe below);
   - explicit permission to read the source another way — the local clone as plain files, or
     GitHub via `gh` **at the exact ref the PR builds against**.
3. Only after the user picks the third option do you read source that way, and the review says which
   findings rest on it.

Never, with or without permission: decompile an assembly, read NuGet XML docs or packages in the
local NuGet cache as a stand-in for source, or state a signature from memory. A guessed signature
reads exactly like a verified one in the review that follows.

A helper that hits an empty Serena result cannot ask: it returns the question to the lead and marks
every finding that depended on it as unverified.

| Thought | Reality |
|---|---|
| "GitHub at the base commit is the exact version — that's better than Serena" | It answers "what text is at this path", not "who overrides it". And the user decides the fallback, not you. |
| "An empty result proves nothing; debugging Serena would eat the deadline" | Asking costs one message. The user may fix the setup in a minute — and a silent fallback hides a broken setup that then degrades every future review. |
| "Reading via GitHub is fastest — I'll offer it first" | Offer the options in the order above. The fallback is the user's pick, never your recommendation: the point of asking is the chance to fix the setup. |
| "Decompiling is only my fallback" | It is not a fallback at all. See above. |
| "I'll mark it unverified if time runs out" | Fine for the finding — and it still does not license reading source by another route without asking. |

**Installing Serena** (per machine): it needs `uv` / `uvx` on `PATH`. In Claude Code:
`/plugin marketplace add anthropics/claude-plugins-official`, then
`/plugin install serena@claude-plugins-official`, then restart Claude Code (MCP tools bind at session
start). Verify with `claude mcp list` — the Serena server shows as connected. Then activate each
repository's local clone as a Serena project before navigating it.

## Severity scale

Use it verbatim in the output:

- **blocker** — breaks downstream consumers or data: a breaking public or `virtual` API change, a
  wrong or missing migration, a security or authorization gap
- **major** — a real defect or a violated platform invariant that ships a bug
- **minor** — a convention violation, or a performance smell without measured impact
- **nit** — style, naming, docs

What to look for, in ranked order, is `review-checklist.md` (next to this file). Read it before
spawning the diff-pass helper, and hand its path to that helper.

## Steps

### 1. Context (lead + sweep helper)

- PR metadata and CI status (small payloads, lead):
  ```bash
  gh pr view <pr> --repo VirtoCommerce/<repo> --json title,body,baseRefName,headRefName,headRefOid,author,files
  gh pr checks <pr> --repo VirtoCommerce/<repo>
  ```
  Red CI is context for severity, not a reason to skip the review.
- Save the existing threads to files — the output goes to disk, not into the lead's context:
  ```bash
  gh api repos/VirtoCommerce/<repo>/pulls/<pr>/comments --paginate > <scratch>/pr-<pr>-comments.json
  gh api repos/VirtoCommerce/<repo>/pulls/<pr>/reviews --paginate > <scratch>/pr-<pr>-reviews.json
  ```
  Spawn the **sweep helper** on those two files. Output shape, per thread: `file:line`, the point in
  one sentence, status (open / resolved / outdated), and any decision already litigated there. The
  lead reads only this digest. Reviewing without it produces duplicates and re-litigates settled
  decisions.
- Read the PR description against the checklist's "is it declared?" item before reading the diff:
  the description is what a consumer upgrades on.

### 2. Worktree at the PR head (lead)

Fetch the PR head by its pull ref — this also works when the branch lives in a fork — and add a
detached worktree next to the clone, never inside it:

```bash
git -C <clone> fetch origin pull/<pr>/head:refs/remotes/origin/pr/<pr>
git -C <clone> worktree add --detach <clone>/../worktrees/<repo>/pr-<pr> origin/pr/<pr>
```

Then check that the worktree HEAD equals `headRefOid` from Step 1 before any review starts. A stale
remote ref produces a review of code that is not in the PR.

Code navigation uses Serena on the **clone** (the baseline); the worktree is where the diff and the
tests run. For every site the PR has not touched, the two agree by definition.

### 3. Optional: Codex lenses (background)

If the user has the Codex CLI and its Claude Code plugin, run the two Codex lenses in the background
now, while Steps 4–5 run — setup, commands and pitfalls in `codex-lens.md`. If not, skip this step;
the review is complete without it.

### 4. Diff pass (analysis helper)

Spawn the diff-pass helper (`opus`) with: the worktree path, `origin/<baseRefName>`, the path of
`review-checklist.md`, the path of `verification-discipline.md` with the instruction to read it first
and apply it throughout, the Serena rule above, and the read-only mandate. Its task:

- Read the branch diff: `git -C <worktree> diff origin/<baseRefName>...HEAD`.
- Navigate code per **Code navigation** above.
- Walk the checklist dimensions in order; report each finding as
  `severity | file:line | claim | evidence`, and separately list what it checked and found clean.

For perf-heavy diffs (EF queries, hot paths, caching), if the `dotnet-diag` plugin is installed, also
run its **`analyzing-dotnet-performance` skill in the lead** (Skill tool, main loop) on the changed
files — its pattern catalog is wider than the checklist's performance section. Do **not** spawn the
sibling `optimizing-dotnet-performance` **agent** for this: its engine is that same skill, a subagent
cannot load skills, and it then free-forms — observed producing findings about code that does not
exist. Either way, every perf finding is verified against the worktree in Step 6.

### 5. Tests (test helper)

Spawn the test helper (`sonnet`), told not to edit, create or commit anything, to run the affected
test projects in the worktree and report: pass/fail counts, failures verbatim, and whether the PR's
new behavior is covered by new or updated tests (name the test files). No coverage for changed
behavior is itself a finding, usually **major**.

### 6. Verify, then consolidate (lead)

Every finding — Codex's, a helper's, or your own — is confirmed against the actual code in the
worktree at an exact `file:line`, never against the diff summary or a helper's paraphrase. Codex
errs; a class-level claim ("authorization gap") needs the real controller or handler read. Drop what
is unconfirmed, already raised in an existing thread (per the sweep digest), or duplicated between
sources. **Treat a helper's severities as proposals:** re-rank each one yourself against decisions
the helper could not see.

**That "drop" clause is where this step goes wrong.** A dropped finding leaves no artifact — no
reader, no rebuttal — so the weakest reasoning of the whole pass collects there, invisible. Dropping
a finding is itself a claim about the code and needs the evidence its opposite would need: state the
dismissal as a claim, ask what would falsify it, and if the answer is "I'd have to read X", read X.
Check this table at the moment you drop something, not afterwards:

| Thought | Reality |
|---|---|
| "The base class / another module does the same" / "it's parity" | That is where the shape came from, not whether it is a defect. Provenance changes the **destination** — a finding here **plus** an item for the owning repository — never the existence. And it says nothing when the diff newly routes code over the inherited flaw. |
| "There's a cache / guard below it, so it's fine" | Name the layer the cost is on and the layer the mitigation is on. If they differ, the mitigation answers a different question. A cache also only helps on hits. |
| "…measurable but small / negligible / cheap" | An adjective in the slot where a measurement belongs. Measure it, cite a measurement, or file it unquantified. |
| "The codebase always / never does X" | A claim about a population. Count it (one search) or don't invoke it. |
| "The checklist prescribes X" | A general prescription is not a measurement of this codebase. Check that the recipe appears in the code before applying it; when it does not, that absence is data, not a gap to fill. |
| "This class isn't ours to fix" | Right about the *fix site*, irrelevant to the *report*: a finding here plus an item for the owning repository, both. |
| "The tool errs" | A reason to check the claim, never a reason to rule on its provenance. |
| "I'll record it as a residual risk" | A requirement written down instead of met is a dismissal wearing an artifact's clothes. Legitimate only when infeasibility is itself evidenced. |

**Severity moves both ways, or it is a ratchet.** Before promoting a finding, check whether a decision
about its subject is already recorded — in the PR, its threads, or earlier in this review. A decision
has no artifact in the diff, so a re-derivation always arrives with fresher evidence than the decision
it would override — and fresh evidence that the mechanism is real is not evidence that the decision
was wrong.

The standing case is a **prerelease version pin in a coordinated multi-repo change**: a companion PR
pins a dependency to a prerelease build of another PR in the same change (`-alpha.`, `-beta.`,
`-rc.`, `-pr-` in a `.csproj` or `module.manifest`). That pin is scaffolding so the PR builds before
its dependency releases; it is re-pinned at release and never reaches the base branch as-is. It is
**not a finding at any severity, not a blocking item, and not a request to re-pin to a newer build.**
At most, one merge-order line: the companions' green CI validated against the pinned build's API
surface, so the build against the released version is the one that must be re-run after the re-pin. If the author has not said which release the pin becomes, ask
that as a question. Every technical fact about the pin can be true (NU5104, an older build, exact
prerelease resolution) and none of them bears on whether it is a defect.

| Thought | Reality |
|---|---|
| "The helper's facts are correct, so it's at least minor" | Correct facts wearing the wrong severity is the hard case: verification passes and returns you to the same conclusion. The facts do not bear on whether the pin is a defect. |
| "The pinned build is stale — ask them to re-pin now" | Re-pinning happens at release. The merge-order note already says what green CI did and did not validate. |
| "I'll make it a blocking checklist item instead of a finding" | A blocking item is a severity under another name. |

**Output one consolidated review:**

1. Verdict.
2. Findings, ordered by the severity scale, each with a verified `file:line`.
3. What was checked and found clean: dimensions covered, tests run, Codex lenses run (with model and
   effort) or skipped.
4. **Checked and dropped, because …** — one line per dismissal. It costs almost nothing and is the
   only thing that makes the invisible pile reviewable.
5. Anything that rests on an unverified source or on a user-approved navigation fallback.

### 7. Posting discipline

- Post nothing to GitHub without an explicit ask — deliver the review in the conversation.
- If the user authored the PR: converge on clear decisions and recommendations; do not offer to draft
  proposals or comments addressed to reviewers.
- Asked to post: submit a formal **review**, never `gh pr comment`. An issue comment lands in the
  conversation tab; it does **not** clear the user's "Review requested" state or move
  `reviewDecision`. Only a submitted review of any type resolves the request. Ask which type first:
  `COMMENT` is neutral (clears the request, no approval), `APPROVE` also lifts the merge gate,
  `REQUEST_CHANGES` blocks merge.
- **Hybrid layout, one review event.** Anchor line-specific findings as inline comments; keep
  cross-cutting and design findings in the summary body, where a single line anchor would
  misrepresent them. Post both in one call:
  ```bash
  gh api --method POST repos/VirtoCommerce/<repo>/pulls/<pr>/reviews --input <scratch>/review.json
  # review.json: { "commit_id": "<headRefOid>", "event": "COMMENT" | "APPROVE" | "REQUEST_CHANGES",
  #   "body": "<verdict + cross-cutting findings>",
  #   "comments": [ { "path": "src/…", "line": <n>, "side": "RIGHT", "body": "<finding>" }, … ] }
  ```
  `line` + `side: RIGHT` anchors to the new-file line; a line outside every diff hunk is rejected
  with 422. `gh pr review --body-file` carries only the summary body and cannot anchor lines, so use
  it only when every finding is cross-cutting. To add inline threads after a summary was already
  posted (a submitted review body cannot be edited), post a second `COMMENT` review carrying only
  `comments`.
- **Verify delivery by the anchored code, not by a field.** A review can post with comments silently
  dropped, so check:
  ```bash
  gh api repos/VirtoCommerce/<repo>/pulls/<pr>/reviews/<review-id>/comments \
    --jq '.[] | "\(.path|split("/")|last):\(.position)  <-  \(.diff_hunk|split("\n")|.[-1])"'
  ```
  Each row must show the line you meant to annotate. **Do not test `.line`**: this endpoint reports
  the anchor in `position` and leaves `line` and `side` `null` even on a correctly delivered comment,
  so a `select(.line == null)` check reports every comment as dropped. `diff_hunk` is the only field
  that shows what the comment actually attached to.
- Then confirm the request cleared:
  `gh pr view <pr> --repo VirtoCommerce/<repo> --json reviewRequests,reviewDecision,latestReviews`
  — a requested reviewer must be gone from `reviewRequests`.
- **A listing endpoint that paginates lies by omission.** `…/pulls/<pr>/reviews` without
  `--paginate` can omit the review you posted a minute ago, and the empty result reads as "it never
  landed". Add `--paginate`, or query the review by id.
- Comments in English. Nothing about a downstream client — no client names, no client code, no client
  data — in a public repository.
- Keep the worktree until posting is done (line numbers may need re-checking), then
  `git -C <clone> worktree remove <worktree>`.
