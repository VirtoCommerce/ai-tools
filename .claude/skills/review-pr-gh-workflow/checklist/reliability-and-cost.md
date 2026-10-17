# Reliability and cost

Usually **minor**. Raise it only with evidence that the cost or flake is real (a measured run time, a
run history), never on the adjective alone (`/review-pr-virto` Step 6, the "measurable but small"
row).

- **`timeout-minutes`** on jobs that can hang (network, external services, interactive prompts). The
  default is six hours of billed runner time.
- **`concurrency`.** A PR workflow without `cancel-in-progress` burns a run per push; but
  `cancel-in-progress: true` on a **release, publish or deploy** job can cancel it half way —
  after the tag and before the package, or between two environments. That one is a **major**. A group
  key that is too broad (`${{ github.workflow }}` alone) makes unrelated branches cancel each other.
- **Caching.** A cache key that never changes (stale dependencies forever) or always changes (no hits);
  a cache restored into a job that a fork can write to and read back into a privileged one
  (`security.md`, cache poisoning).
- **Artifacts.** Size and `retention-days` for large uploads; an upload of the whole workspace where
  one file is needed (also the token-leak case in `security.md`).
- **Redundant runs.** A workflow triggered on both `push` and `pull_request` for the same branch runs
  twice per PR commit; a `paths` filter that does not exclude docs-only changes on an expensive build.
- **Flake sources.** Network fetches without retry, `sleep` used as a wait, `latest`-tagged tools that
  change under the workflow, dependence on run order between parallel jobs.
- **Duplication.** Copied steps across workflows where the repository already has a reusable workflow
  or composite action doing the same — count the copies before invoking it.
