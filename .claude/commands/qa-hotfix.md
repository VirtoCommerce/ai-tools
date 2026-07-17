---
description: "Release a HOTFIX of an already-merged-and-released fix into the bundles that are currently the latest stable releases — ASK which ones first; the set changes over time (e.g. at one point v12 & v14), never hardcode it. Resolves the JIRA task → its linked PR → fix commit, verifies the PR is merged AND shipped, then per bundle: checks the support/<X.Y> branch exists, cherry-picks the fix, pushes, and triggers the repo's 'Release hotfix' workflow. Every write is gated behind explicit confirmation; never auto-merges; STOPs when no support branch exists."
argument-hint: "VCST-XXXX [v12,v14] [--repo=<name>] [--pr=<ref>] [--dry-run]"
disable-model-invocation: true
---

# /qa-hotfix — Release a Hotfix into Frozen Bundles

Cherry-pick an already-merged-and-released fix onto the `support/<major.minor>` branches of the
frozen stable bundles that need it, then cut the patch releases. Backed by the
[`/qa-hotfix` skill](../skills/qa-hotfix/SKILL.md) — the command is the terminal
entry; the skill holds the full methodology and the gate ladder.

This is the productized form of the manual cherry-pick → "Release Hotfix" flow.

## Usage
```
/qa-hotfix VCST-5082 v12,v14         # task + the bundles that are currently the latest stable
/qa-hotfix VCST-5082                 # asks which bundles are the latest if omitted
/qa-hotfix VCST-5082 v12 --dry-run   # read-only precheck only, no writes
/qa-hotfix VCST-5082 v14 --repo=vc-module-catalog   # disambiguate repo (rarely needed)
/qa-hotfix VCST-5082 v14 --pr=vc-module-catalog#882 # force the PR (JIRA description unreadable)
```

`$ARGUMENTS` = a **JIRA task key** + optionally a comma-separated **bundle list** (`vN`). If the
bundle list is omitted, ask the user which bundles are currently the latest stable before doing
anything (this is the "я тебе говорю v12 и v14" step).

## Flow (gate ladder — STOP/BAIL is a success)

1. **Resolve the fix (linked PR is the primary path).** PRIMARY: the PR **linked to the task** —
   GitHub search by task key (the precheck does this automatically). FALLBACK, only when that finds
   nothing / can't disambiguate: read the issue **description** for a PR link (via the Atlassian MCP
   `getJiraIssue`, or the script's JIRA REST fallback) — `feedback-find-linked-pr-in-jira-first`.
   LAST RESORT: manual `--pr=<owner/repo#num | url>` / `--repo=`. The repo must be a single
   hotfixable product repo (`vc-module-*`, `vc-platform`, `vc-frontend`).
2. **Gate the fix — merged AND released (run the gate phase FIRST, with NO bundles yet).** This is
   the original "проверяем, что PR смержен и релиз выпущен" step:
   ```bash
   npm run hotfix:precheck -- VCST-XXXX            # gates-only: PR → merged → shipped
   # add --pr=<owner/repo#num> only if the linked-PR search needs the manual fallback
   ```
   - PR not merged → **STOP**, ask to merge first.
   - Fix not shipped in a release yet → **STOP**, ask to run the normal "Release" workflow on the
     base branch first ("сначала просим выпустить релиз").
   - Both pass → the script prints "✓ Gates passed" and asks for bundles — go to step 3.
3. **Establish which bundles are the latest stable (ASK — never hardcode).** Only after the gates
   pass. The stable-bundle set changes over time; `v12`/`v14` are only an example. Ask
   **"which release bundles are currently the latest stable?"** and use exactly what the user names.
4. **Per-bundle precheck (read-only).** Re-run with the named bundles:
   ```bash
   npm run hotfix:precheck -- VCST-XXXX --bundles=<the bundles the user named>
   ```
   Per bundle it resolves the pinned version → line `X.Y` → `support/X.Y` branch existence → the
   patch a hotfix would produce:
   - `support/X.Y` missing for a bundle → **STOP for that bundle** (creating a release branch is a
     release-management decision — hand off, never auto-create).
   - `--dry-run` ends here.
5. **Per READY bundle — gated writes (confirm before EACH).** Work in `.fix-workspace/` (gitignored):
   1. `git fetch && git checkout support/X.Y`
   2. `git cherry-pick <fixSha>` — on conflict, resolve only if trivially mechanical; otherwise
      **STOP + hand off** (do not force a risky resolution).
   3. Show the diff → **confirm** → `git push origin support/X.Y`.
   4. **confirm** → trigger + verify the release:
      ```bash
      npm run hotfix:release -- --repo=<name> --branch=support/X.Y --expect-commit=<fixSha> --poll
      ```
      This dispatches the repo's "Release hotfix" workflow (module/platform/theme variant,
      discovered by name), waits for it, and verifies the published patch contains the fix commit.
6. **Verify + report.** Re-run the precheck (the bundle should now read `already-applied`), report
   the new patch versions + release URLs per bundle, and comment the outcome on the JIRA task.
   Note: a vc-frontend hotfix asset is named `vc-frontend-X.Y.Z.zip`, not `vc-theme-b2b-vue-*`
   (`reference-vc-frontend-release-asset-naming`) — use the release's real `assets[]` URL when a
   bundle pin must be updated.
7. **Offer self-diagnostics (consent-gated).** At the very end of the run — released, STOPPED, or
   BAILed — ask a single Yes/No to run [`/vc-self-check`](../skills/vc-self-check/SKILL.md) on this
   session (local `DIAG-*.md` only, nothing sent externally). Run it **only** on an explicit Yes;
   never auto-trigger. Skip the offer silently if the end-of-session prompt already offered it
   (`selfCheckSeen`) or telemetry wasn't collected. See the skill's *Final step* section.

## Hard rules

- **Never auto-merge / never auto-create a support branch.** Writes are: cherry-pick, push to the
  existing `support/X.Y`, and the Release-hotfix dispatch — each behind explicit confirmation.
- **One repo per task.** Multi-repo or cross-module fixes → STOP + hand off.
- `GIT_TOKEN` (PAT with `repo` + `workflow`/`actions:write`) is read from `.env.local`. `gh` is not
  required — writes go through local `git` + the GitHub REST API.
