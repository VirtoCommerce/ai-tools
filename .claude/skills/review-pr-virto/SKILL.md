---
name: review-pr-virto
description: Use when asked to review a pull request in a VirtoCommerce platform or vc-module-* GitHub repository ("review PR 123 in vc-module-cart", "look at this x-api PR", "run a review on this PR") — code that ships as NuGet packages to downstream projects the reviewer cannot see. Not for a generic code review of other repositories (/code-review), this repo's own prompt files (/prompt-review), or a /qa-fix local diff before its PR (the vc-fix reviewers).
compatibility: Requires the gh CLI signed in to GitHub, a local clone of the repository under review, and the Serena MCP server for code navigation. Optional — the Codex CLI with its Claude Code plugin (codex-lens.md), and the dotnet-diag plugin for perf-heavy diffs.
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
`mktemp -d`. Helpers write nothing anywhere else, except as the helper rules below declare.

## Orchestration model

The lead session is the **orchestrator**. Its job is the bird's-eye view: the PR's intent, the
invariants in play, the verdict in progress, and the final synthesis. Token-heavy or mechanical
single-focus work goes to a helper subagent, so the lead's context stays clean enough to judge the
findings at the end.

| Work | Who | Model |
|---|---|---|
| Inputs, worktree, verification, synthesis, anything posted | lead | session model |
| Digest of the existing review threads (Step 1) | **sweep helper** — a `general-purpose` subagent | `haiku` — mechanical extraction from the JSON files the lead saved |
| Diff pass against the checklist (Step 4) | **diff-pass helper** — a `general-purpose` subagent | `opus` — analysis against a rubric |
| Test run in the worktree (Step 5) | **test helper** — a `general-purpose` subagent | `sonnet` — needs a shell and a build |
| Optional Codex lenses (Step 3) | background Bash in the lead | see `codex-lens.md` |

Rules for every helper — paste them into every spawn prompt (Steps 1, 4, 5):

- **One helper = one task + an explicit output shape.** Helpers return digests and raw findings;
  the lead consolidates and judges. A helper with a vague mandate returns a wall of prose — the exact
  thing delegation was meant to prevent.
- **The mandate is read-only, and read-only puts every write out of scope, reversible or not.** Say it
  in the spawn prompt: no edits, no new files in any repository or worktree (a throwaway probe test is
  a write), no `git add` / `commit` / `reset` / `checkout`, only `<scratch>`. A helper that thinks a
  probe would settle a finding reports the finding as unverified and includes the probe as text for
  the lead to run. **One exception, for the test helper only:** building and running the existing
  tests writes build output (`bin/`, `obj/`, test results) into the worktree; that output is allowed,
  and nothing else is.
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

Serena indexes the **clone**, so it answers about the **baseline**, not about the PR. Two
consequences:

- **A symbol the diff adds does not exist in the baseline** — read it in the worktree; an empty Serena
  result for it is expected and is not the stop condition below.
- **A member the diff changes does exist in the baseline, and Serena must find it.** Its overrides
  and callers are the compatibility question this review exists for, so an empty result for a
  changed member *is* the stop condition below. Its new body you read in the worktree.
- **The baseline is only right if the clone is at it.** After Step 2's fetch, check that the clone is
  clean (`git -C <clone> status --porcelain` prints nothing) and that `git -C <clone> rev-parse HEAD`
  equals `git -C <clone> rev-parse origin/<baseRefName>`. If not, **do not switch or reset it
  yourself** — it may hold the user's work. Say what you found and ask whether to fast-forward or
  switch it, or to go on knowing that baseline answers reflect another state. For any other
  repository the PR depends on, the right state is the version its `.csproj` / `module.manifest`
  references.

When Serena comes back **empty** for anything except a symbol the PR adds, or is not installed, or
has no project for the repository you need:

1. Check the cheap causes first: is the right project active, is its clone at the baseline (above),
   does a shorter or substring name path find it?
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

**Installing Serena** (per machine): the recipe and its check are `docs/onboarding.md` §Serena. Then
activate each repository's local clone as a Serena project before navigating it.

## Severity scale

Use it verbatim in the output:

- **blocker** — breaks downstream consumers or data: a breaking public or `virtual` API change, a
  wrong or missing migration, a security or authorization gap
- **major** — a real defect or a violated platform invariant that ships a bug
- **minor** — a convention violation, or a performance smell without measured impact
- **nit** — style, naming, docs

## Review checklist

What to look for lives in `checklist/`, one file per dimension. Walk them **in this order** — it is
ranked by expected severity for code that ships as NuGet packages:

1. `checklist/backward-compatibility.md` — highest
2. `checklist/platform-conventions.md`
3. `checklist/data-and-migrations.md`
4. `checklist/performance.md`
5. `checklist/correctness.md`
6. `checklist/tests.md`

Compatibility comes first for the reason at the top of this file. Each item says what to flag and why; verify every claim
against the code per **Code navigation**, never from memory of how the platform "usually" looks.

A new rule goes into the file of its dimension; a new dimension is a new file plus a line in the list
above, at the rank it deserves. Read the checklist before spawning the diff-pass helper, and hand that
helper the paths in this order.

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
  gh api graphql --paginate --slurp -f owner=VirtoCommerce -f repo=<repo> -F pr=<pr> -f query='query($owner:String!,$repo:String!,$pr:Int!,$endCursor:String){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:100,after:$endCursor){pageInfo{hasNextPage endCursor} nodes{isResolved isOutdated path line comments(first:50){nodes{author{login} body}}}}}}}' > <scratch>/pr-<pr>-threads.json
  gh api repos/VirtoCommerce/<repo>/pulls/<pr>/reviews --paginate --slurp > <scratch>/pr-<pr>-reviews.json
  gh api repos/VirtoCommerce/<repo>/issues/<pr>/comments --paginate --slurp > <scratch>/pr-<pr>-conversation.json
  ```
  (GraphQL, because REST review comments carry no resolved state.) Spawn the **sweep helper**, with
  the helper rules, on those three files. Output shape, per thread: `file:line`, the point in
  one sentence, status (open / resolved / outdated), and any decision already litigated there. The
  lead reads only this digest. Reviewing without it produces duplicates and re-litigates settled
  decisions.
- Read the PR description against the checklist's "is it declared?" item before reading the diff:
  the description is what a consumer upgrades on.

### 2. Worktree at the PR head (lead)

Fetch **both ends of the range** — the base branch and the PR head, the head by its pull ref so it
also works when the branch lives in a fork — then add a detached worktree next to the clone, never
inside it:

```bash
git -C <clone> fetch origin +<baseRefName>:refs/remotes/origin/<baseRefName> +pull/<pr>/head:refs/remotes/origin/pr/<pr>
git -C <clone> worktree add --detach <clone>/../worktrees/<repo>/pr-<pr> origin/pr/<pr>
```

On a re-run, where the worktree exists, use `git -C <worktree> checkout --detach origin/pr/<pr>`
instead. The `+` lets a re-run pick up a force-pushed head. A stale `origin/<baseRefName>` is as bad as a
stale head: the three-dot diff then starts from an older merge base and pulls base-branch commits
into the review.

Before any review starts, check both ends:

- the worktree HEAD equals `headRefOid` from Step 1;
- `git -C <worktree> diff --name-only origin/<baseRefName>...HEAD` lists the same files as
  `gh api repos/VirtoCommerce/<repo>/pulls/<pr>/files --paginate --jq '.[].filename'`. Do not
  compare against `files` from `gh pr view`: that field stops at 100 files without saying so, and a
  larger PR would fail the check with a correct worktree.

Either mismatch means the review would cover code that is not the PR — stop and find out why.

Code navigation uses Serena on the **clone**, once it is at the baseline (**Code navigation**); the
worktree is where the diff and the tests run. For every site the PR has not touched, the two agree by
definition.

### 3. Optional: Codex lenses (background)

If the user has the Codex CLI and its Claude Code plugin, run the two Codex lenses in the background
now, while Steps 4–5 run — setup, commands and pitfalls in `codex-lens.md`. If not, skip this step;
the review is complete without it.

### 4. Diff pass (diff-pass helper)

Spawn the diff-pass helper (`opus`) with: the worktree path, `origin/<baseRefName>`, the paths of
the `checklist/` files in the order listed under **Review checklist**, the path of
`verification-discipline.md` with the instruction to read it first and apply it throughout, the
Serena rule above, and the helper rules. Its task:

- Read the branch diff: `git -C <worktree> diff origin/<baseRefName>...HEAD`.
- Navigate code per **Code navigation** above.
- Walk the checklist dimensions in order; report each finding as
  `severity | file:line | claim | evidence`, and separately list what it checked and found clean.

For perf-heavy diffs (EF queries, hot paths, caching), read `dotnet-diag.md` — an optional extra pass
the lead runs when the `dotnet-diag` plugin is installed.

### 5. Tests (test helper)

Spawn the test helper (`sonnet`) with the helper rules, including their build-output exception, to
run the affected test projects in the worktree and report: pass/fail counts, failures verbatim, and whether the PR's
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

**Severity moves both ways, or it is a ratchet** — a recorded decision outranks a fresh re-derivation,
and a prerelease version pin in a coordinated multi-repo change is never a finding. Before promoting or
re-ranking a finding, and whenever a prerelease pin appears, read `severity-ratchet.md`.

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
- Asked to post: submit a formal **review**, never `gh pr comment` — only a submitted review clears
  a pending review request. The type to ask about, the one-call layout for summary plus inline
  comments, and how to verify delivery are in `posting.md`; read it before posting anything.
- Comments in English. Nothing about a downstream client — no client names, no client code, no client
  data — in a public repository.
- Keep the worktree until the review is delivered — and, if asked to post, until posting is done (line
  numbers may need re-checking) — then `git -C <clone> worktree remove <worktree>`.
