# Comment compression

The subject is the **comments in the reviewed code** — `#` lines in YAML and shell, `//` and `/* */`
in scripts. The goal is a comment a maintainer reads in one pass: every fact needed to change the
code safely, nothing they can read from the code itself. Shorter is the means, not the goal — a
proposal that drops a reason is worse than no proposal.

## Two modes

- **PR mode** (part of every review, `SKILL.md` Step 4): only comments the PR **adds or changes**.
  Untouched comments are out of scope, whatever their length.
- **Repository mode** (`SKILL.md` §Comment compression of a whole repository): every comment in
  the files `prepare.mjs snapshot` lists — `.github/workflows/*.yml`, `workflow-templates/*.yml`,
  `actions/*/action.yml` and the scripts those actions run (`actions/*/scripts/**`,
  `actions/*/src/**`; never `dist/` or `node_modules/`) — or the subset the user names.

The rules below are the same for both.

## Propose a compression when a comment

- **restates the code**: what the next line does, the value of an input, the name of the step;
- **narrates history** past the one fact a reader needs ("first we tried X, then Y, which failed
  because…" → the constraint that made Y necessary);
- **repeats** another comment in the same file, a sibling file, or the PR description;
- **uses many words for one fact**: hedges, "note that", "basically", "in order to", lists of
  everything that was checked;
- **is longer than the code it explains** without carrying a non-obvious why.

## Never cut

- **Security rationale** — why a privileged trigger is safe, why a value goes through `env:`, why
  credentials are not persisted, why a ref is pinned, why an author check uses
  `pull_request.user.login`. These comments stop the next editor from undoing the guard: shorten the
  wording, keep every condition.
- **Constraints a reader cannot see**: an upstream bug, a platform limit, a value that must match
  another file ("must agree with check-dist"), an ordering requirement.
- **Links** to an issue, a docs page or a ticket — keep one, drop duplicates.
- **Tool directives** (`zizmor: ignore[...]`, `shellcheck disable=…`, `# yaml-language-server:`) and
  their one-line justification.

## Shape of a proposal

```
file:start-end | N → M lines | what goes (restated code / history / repetition / wordiness)
<the proposed comment, exactly as it would replace the original lines>
```

- Keep the comment syntax and indentation of the original, so it can be applied or posted as a
  ` ```suggestion ` unchanged.
- One proposal per comment block. Propose only where the saving is real — at least a third of the
  lines, or a two-line block that becomes one.
- A comment that is **wrong** (no longer matches the code) is not a compression: in PR mode it is a
  finding in the main review; in repository mode list it separately under **Stale comments**.

## Output

- **PR mode:** its own section after the findings, **Comment compression** — **always present**:
  the proposals and `K comments, N → M lines`, or `none (K comments checked)` when nothing qualifies,
  so the reader knows the check ran. It never changes the verdict and carries no severity. A comment
  that repeats or over-explains belongs here, **not** among the findings as a nit. Posted only when
  the user asks, as `suggestion` blocks on those lines.
- **The lead does it itself** when it skips helpers on a small diff: same rules, same section.
- **Repository mode:** per file, the proposals; then **Stale comments**; then the total. Nothing is
  edited: applying the proposals is a write to the user's clone, made by the lead only on an
  explicit ask, file by file, and shown as a diff before anything is committed.

## Repository mode — steps (lead)

The same orchestration as a review (`SKILL.md` §Orchestration model): helpers read, the lead acts.

1. `node .claude/skills/review-pr-gh-workflow/prepare.mjs snapshot <clone> <scratch>` — a worktree
   of the clone's current HEAD at `<scratch>/wt/snapshot` (no `node_modules/`, `dist/`) and the file
   list. Reading it needs no prompt; reading the clone itself would cost one per file.
2. Spawn the **comments helper** (`pr-review-reader`, `sonnet`) with the file list (or the subset the
   user named), the worktree path and this file. Past ~40 files, split the list across helpers in
   one message.
3. Verify each proposal against the file (the cited lines exist, nothing from §Never cut is lost),
   drop the rest, deliver the output above.
4. End the message with the cleanup question; on yes,
   `node .claude/skills/review-pr-gh-workflow/prepare.mjs snapshot-cleanup <clone> <scratch>`.
