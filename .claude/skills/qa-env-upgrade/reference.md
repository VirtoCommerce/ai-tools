# /qa-env-upgrade — reference (read on demand)

The rules below are implemented in `scripts/deploy/upgrade/`; this file explains them. If the two
disagree, the code is what runs — fix whichever is wrong, in the same commit.

## Statuses

| Status | Meaning | Action |
|---|---|---|
| `EQUAL` | release pin == latest release | none (collapsed into one line) |
| `BEHIND` | release pin < latest release | → latest release |
| `AHEAD` | pin > latest release (or a theme release ≥ the dev version) | none — never downgrade |
| `PRERELEASE→RELEASE` | PR/alpha pin, the latest release contains it | → latest release |
| `PRERELEASE?` | PR/alpha pin, the latest release does not contain it (or would be a downgrade) | asked (feature group) |
| `NOT_IN_FEED` | Id absent from `modules_v3.json` (custom, client, private) | none |
| `NO_RELEASE` | feed holds only alphas / no green theme alpha | none |
| `DUPLICATE` | Id pinned in both sources | none — fix by hand |
| `DEP_CONFLICT` | a non-optional dependency of the target is not deployed on the env, or would be below its required version in the end state; or the change takes a module below what a module that does not move requires | not bumped |
| `PLATFORM_FLOOR` | target needs a newer platform than the end state has (or a platform change goes below what a module that does not move requires) | not bumped |
| `COUPLED` | `XCMS` + `PageBuilderModule` must move together (`scripts/deploy/upgrade/checks.ts` `COUPLED`) | not bumped |
| `BLOCKED_ASSET` | target not downloadable anonymously (zip, blob or ghcr image) | not bumped |

## Why the rules are what they are

- **A release is an empty `VersionTag` AND a GitHub release-download `PackageUrl`.** An alpha's `Version`
  field carries no suffix, so `Version` alone cannot tell them apart.
- **The platform is not in the feed** — its target is `vc-platform`'s latest non-draft, non-prerelease release.
- **A release can sit in `AzureBlob`** — private repos: the deploy downloads anonymously, so a
  `GithubReleases` pin of them 404s. Their target is checked and moved inside `AzureBlob`. A repo whose
  visibility the token cannot see is treated as private (a blob pin never 404s the deploy).
- **PR → release: the TARGET release itself is asked, by ancestry, then by `(#N)`** in the commits it
  added over the release before it. Hotfix cherry-picks are made without `-x`, so the merge sha alone
  misses them. The lowest release containing the PR proves nothing about a higher one on another line
  (a fix merged straight into a support branch may never reach master's latest).
- **A PR build is never auto-moved to a lower or not-yet-in-feed release.** If the latest release is
  LOWER than the pin, or only a release not yet in the feed contains it, the row is `PRERELEASE?`
  (DOWNGRADE flagged where lower) and the operator is asked — an auto-move would downgrade or point at nothing.
  A theme PR or branch build of a higher version than the dev alpha is flagged DOWNGRADE the same way.
  A group holding a DOWNGRADE is never recommended *Replace*, and an approved one stays flagged
  `DOWNGRADE` in the table, the PR body and the commit message.
- **The theme target is never called a release:** its question line reads `→ green dev alpha <file>`,
  its accepted change `→ GREEN DEV ALPHA`, and a blocked *Replace* `you approved → green dev alpha`.
- **Alpha `X.Y.Z-alpha.N` precedes release `X.Y.Z`** — matched "by version": the last alpha of a version
  is built minutes before its release.
- **Theme target = newest GREEN dev alpha.** The blob name has no sha; the only link to its CI run is the
  blob's `Last-Modified` inside the run's *Publish to Blob* step window. Runs are listed per commit
  (`?head_sha=`), because `branch=dev&event=push` returned nothing newer than two weeks back (measured
  2026-10-02). A red run can still have published — that alpha is never the target. Every run whose
  window holds the timestamp counts (concurrent pushes overlap): the alpha is a target only if ALL of
  them are green; mixed conclusions are noted as *ambiguous* and the next alpha is tried. Older commits'
  runs are loaded until one STARTED longer before the alpha than the longest run seen took to publish,
  and any event counts (a `workflow_dispatch` on dev publishes too). Best-effort: a run re-started much
  later than its siblings can still be missed.
- **Checks run on the END STATE, to a fixed point** — after the operator's answers, because a *Replace*
  changes what the end state is. One deploy 404 rolls back the whole install, hence the download check.
- **Moving only part of a feature to releases breaks it** — hence one question per tracker key, with
  the theme row and any `NOT_IN_FEED` PR build of the same key shown in the group.
- **The edit is checked BY VALUE** (`JSON.stringify`): an array compared with `!==` always differs (bc0701f5).
- **The PR goes into the env branch only:** a contents `PUT` without `branch` writes to the repo's default branch, with no review.
