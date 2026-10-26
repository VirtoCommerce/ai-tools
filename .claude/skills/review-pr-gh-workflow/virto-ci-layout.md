# How VirtoCommerce CI is distributed

Read at `SKILL.md` Step 1. **This file is a map, not the source of truth**: the source is the
`VirtoCommerce/.github` repository itself — its `README.md` and the policy files it names — read **at
the base ref of the PR under review**. Where the two disagree, the repository wins and this file is
stale; say so in the review.

## The shared repository: `VirtoCommerce/.github`

It carries four kinds of thing, and each reaches its consumers by a different channel — which is why a
change to each has a different blast radius:

| Kind | Where | How a consumer gets it | Who picks up a change |
|---|---|---|---|
| Reusable workflows | `.github/workflows/*.yml` with `on: workflow_call` | `uses: VirtoCommerce/.github/.github/workflows/<file>@<ref>` from a caller's workflow | callers on a branch ref on merge; callers on a version tag on their next bump |
| Actions (composite and Node) | `actions/<name>/action.yml` | `uses: VirtoCommerce/.github/actions/<name>@<tag>` | whoever moves to the tag that carries the change — for modules, the next template deploy |
| Module workflow templates | `workflow-templates/*.yml` (+ `*.properties.json`) | **copied** into module repositories by the `Deploy Module workflows` workflow, for the repositories listed in `module-repos.json` | nobody until a maintainer runs the deploy with a version; then every listed repository at once |
| The repository's own CI | other `.github/workflows/*.yml` | runs in this repository only | — |

Retired reusable workflows move to `deprecated/`; residual callers of deprecated actions and workflows
are tracked in `deprecated-residual-callers.md`.

## What follows for the review

- **Template change** — the README's "Update workflow templates" procedure is the contract. Templates
  carry no version field of their own: their "version" is the tag their first-party `uses:` lines pin
  (`VirtoCommerce/.github/actions/<name>@<tag>`), and a change reaches modules only when a tag is cut
  and the deploy runs with it (its default `version` input bumped). A template that references a new
  action must pin a tag that **contains** that action — check with
  `node .claude/skills/review-pr-gh-workflow/prepare.mjs ref <clone> <tag> actions/<name>/action.yml`
  (add a merge commit's SHA to check the tag also contains a fix). The consumers are `module-repos.json`, not a
  code search.
- **Same-file PRs.** Dependabot and the weekly pin-update PR can bump the same `uses:` line in
  `workflow-templates/` independently; whichever merges second becomes a no-op or a conflict.
- **A module repository PR that edits a deployed template file** (`module-ci.yml`, `release.yml`, …
  in a `vc-module-*` repository) is overwritten by the next deploy. Unless the PR says it is
  deliberate, that is a finding with a destination in `VirtoCommerce/.github`.
- **Node actions** commit a built `dist/` next to `src/`. Review `src/` and `package-lock.json`; `dist/`
  is generated, and whether it matches is the repository's `check-dist` gate's job — read its result,
  do not diff the bundle by eye.
- **Pinning policy is the repository's own**: `.pinact.yaml` and `zizmor.yml` say which owners must be
  SHA-pinned and which may float on a ref. Apply those files, not a general rule.
- **The repository already gates workflow PRs** (pin check, workflow security scan, dist check — find
  them by the `paths:` filters in its own workflows). Their results are evidence in Step 5; a PR that
  relaxes a gate or its config (`zizmor.yml`, `.github/actionlint.yaml`, `.pinact.yaml`) is reviewed
  as a security change.
- **Caller classes.** Use the vocabulary `deprecated-residual-callers.md` already uses, so the review
  and the tracking file agree: `LIVE-MUTABLE` (active caller on a branch — breaks on merge),
  `LIVE-pinned` (active caller on a version tag — breaks on its next bump), `archived`,
  `self-deprecated`.
- **Dependency-bump PRs** (Dependabot, the weekly template pin update) are in scope for this skill, but
  `VirtoCommerce/.github` also carries its own `update-pr-check` and `bulk-dependabot-review` skills
  for exactly that case; if the user works from that repository, mention them.
