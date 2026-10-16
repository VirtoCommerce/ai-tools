# Correctness — does it run when it should and fail when it must

- **Triggers fire on what the author meant.** `on:` filters (`branches`, `tags`, `paths`, `types`)
  read against the events the PR description intends; `branches` and `tags` together on `push` mean
  either; a `types:` list that omits `synchronize` means pushes to an open PR do not re-run it. A
  trigger that can never fire is dead code; one that fires too widely is a cost or a security item.
- **Conditions.** An `if:` with no status function is implicitly `success() && …`, so a cleanup or
  notification step after a failure never runs; `always()` also runs on cancellation, where
  `!cancelled()` is usually meant. A step-level `if:` comparing a string to a boolean input, an
  expression wrapped in quotes that makes it a non-empty (truthy) string: each makes a condition
  constant. A `secrets.*` reference in `if:` is worse: the `secrets` context is not available there
  (*Using secrets*: "cannot be directly referenced in `if:` conditionals"), so the workflow file fails
  validation (`Unrecognized named-value: 'secrets'`) and nothing in it runs. The safe shape is a
  job-level `env:` from the secret and an `if:` on `env.*`.
- **Failures that cannot fail the run.** `continue-on-error: true`, `|| true`, `set +e`, a pipeline
  without `pipefail` (which shell keyword gives which flags: `scripts.md` §bash / sh), a test step
  whose result only lands in an artifact. On a job that gates a merge or a release, a swallowed failure is a
  **major**.
- **Job graph.** `needs:` that skips a job when a dependency is skipped (a skipped need skips
  dependants unless their `if:` says otherwise); outputs read from a job that is not in `needs`
  (evaluates empty); a matrix whose `include`/`exclude` drops a combination the author meant to keep;
  `fail-fast` cancelling the siblings whose result was wanted.
- **Values crossing steps and jobs.** Step outputs through `$GITHUB_OUTPUT` (the old `::set-output`
  command is disabled); a multi-line value without the delimiter form; an output referenced by a
  misspelt step `id` (evaluates empty, no error); an environment variable set in one job and read in
  another (jobs do not share an environment).
- **Release and publish paths** — version derivation, tag creation, package push, changelog. Run the
  logic in your head for: the first release on a branch, a re-run of the same commit (does it publish
  twice or fail on "already exists"?), a prerelease vs a release, a tag pushed without a matching
  version in the project files. A double publish or a wrong version is a **blocker**.
- **Platform differences.** A step that assumes `bash` on a Windows runner, path separators, line
  endings, a tool present on one runner image and not another. The runner image's contents are read
  from the image's published software list at the label used, not from memory.
- **Deprecated or removed** commands and runtimes: an action version on a Node runtime GitHub has
  retired, a `runs-on` label GitHub has removed. Cite the deprecation notice.
