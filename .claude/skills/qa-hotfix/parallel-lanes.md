# /qa-hotfix — parallel lanes (read with ≥2 `READY` bundles)

Supporting file for [`SKILL.md`](SKILL.md) §The write steps. Read it before the batch confirmation.

### Parallel vs sequential — what can run concurrently

The unit of parallelism is the **support branch** (one per `READY` bundle). Because of *one repo
per task*, all bundles route to the **same repo**, so this is fan-out across that repo's support
lines (`3.1000`, `3.1011`, …). Default: **for ≥2 `READY` bundles, run them in parallel**; drop to
sequential the moment a branch needs human judgment (a cherry-pick conflict).

**Parallelize (independent per branch — safe):**

- **Per-bundle precheck** — read-only; `scripts/hotfix/hotfix-precheck.ts` already takes all bundles in one call.
- **The whole per-branch write pipeline** (steps 0–4), one lane per support line — **but each lane
  needs its OWN git worktree**: a single working tree can only be checked out on one branch at a
  time, so cherry-picking two lines in one clone is inherently serial. Give each line an isolated
  worktree: `git worktree add .fix-workspace/<repo>--<X.Y> support/<X.Y>` → cherry-pick / push /
  release run concurrently across lanes.
- **`hotfix:release … --poll` per branch** — the **biggest win**: each poll blocks minutes, and the
  lanes are independent (different lines → different `X.Y.*` tags, no tag collision; the auto
  `IncrementPatch` commit lands on each line's own branch; the Release-hotfix workflow has **no
  repo-scoped `concurrency` group**, so GitHub runs the dispatches concurrently). Launch them as
  background jobs, then collect verdicts.

**Keep sequential / serialized (a shared resource or a barrier):**

- **Steps 1–3** (resolve fix → gate merged+shipped → ask bundles) and the **fix-shape check** —
  per *task*, computed once; nothing to fan out.
- **The ordered pipeline WITHIN a lane** — `checkout → cherry-pick → (resolve) → push → release`
  each depends on the previous; only *across* lanes is it parallel.
- **The human confirmation gate** — collapse it into **one batch confirmation** (show every lane's
  diff, confirm once) *before* any push. Never fan out writes without it.
- **Two releases on the SAME support branch** — never concurrent (degenerate: two bundles on one
  `X.Y` line share the branch → the `IncrementPatch` auto-commits would race). Distinct lines only.
- **JIRA comment + status advance** — one *task* → do **once, after all lanes finish** (aggregate
  the per-bundle results into a single comment + a single `Hotfix ready` transition), not per lane.

**Isolation rules for a parallel run:** a lane that hits a cherry-pick conflict (or any STOP)
**must not abort the other lanes** — that lane STOPs and hands off; the rest proceed, and the final
report lists per-lane outcomes (released / stopped-conflict / stopped-other). Rate limits are a
non-issue with `GIT_TOKEN` (5000 req/h).
