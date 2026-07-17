---
description: "Deliver an ALREADY-RELEASED hotfix onto the deployed vcptcore-stable + vcptcore-regression environments, then confirm + verify it. Per env: bump the module/Platform version in vc-deploy-dev's backend/packages.json (commit 'VCST-XXXX: title' → triggers the Cloud platform deployment Action), wait for the Action to go green, poll /api/platform/modules until the env reports the new version, then verify the fix behaves live. Comments the result on the JIRA task, transitions the per-env subtasks (Check on regression/stable) + the parent to Done (live transition discovery, never Cancelled), bumps the frozen stable + `latest` bundles (auto-detect, then ASK), and self-diagnoses the run. Delivery-only — STOPs if the hotfix isn't released yet (run /qa-hotfix first). Gated writes, dry-run by default, never auto-merges."
argument-hint: "VCST-XXXX [--envs=stable,regression] [--bundles=v14,v15] [--dry-run]"
disable-model-invocation: true
---

# /qa-hotfix-check — Deliver & Verify a Hotfix on stable + regression

Take a hotfix that `/qa-hotfix` already **released**, deliver it onto the running `vcptcore-stable`
and `vcptcore-regression` environments (via `vc-deploy-dev`'s `backend/packages.json`), wait for the
deploy to land, verify the fix live, record it on JIRA, and bump the latest-stable bundles. Backed by
the [`/qa-hotfix-check` skill](../skills/qa-hotfix-check/SKILL.md) — the command is the terminal entry;
the skill holds the full methodology, the wiring facts, and the gate ladder.

Third link in the chain: [`/qa-bundle-check`](qa-bundle-check.md) detects → [`/qa-hotfix`](qa-hotfix.md)
produces → **`/qa-hotfix-check` delivers + verifies**.

## Usage
```
/qa-hotfix-check VCST-5416                         # deliver to stable + regression (dry-run first)
/qa-hotfix-check VCST-5416 --envs=stable           # one env only
/qa-hotfix-check VCST-5416 --dry-run               # read-only plan, no writes
/qa-hotfix-check VCST-5416 --bundles=v14,v15       # pre-name the stable bundles to bump
```

`$ARGUMENTS` = a **JIRA task key** + optional `--envs=` (default `stable,regression`), `--bundles=`,
`--dry-run`. The hotfix must ALREADY be released on the env's line — if not, the flow STOPs and sends
you to `/qa-hotfix`.

## Flow (gate ladder — STOP/BAIL is a success)

1. **Dry-run: resolve + plan (read-only).** Resolve the task → product repo + merged fix commit, read
   each env's pinned version + line, resolve the target (highest `X.Y.*` release on the line that
   contains the fix), and run the release-asset gate:
   ```bash
   npm run hotfix:deliver -- VCST-XXXX --envs=stable,regression        # dry-run (default)
   ```
   Verdicts: `📝 planned` → deliver · `◯ already delivered` → skip that env · `⛔ no hotfix on line` →
   **STOP**, run `/qa-hotfix` for that bundle/line first · `⛔ asset missing` → **STOP**, publish/repair
   the release asset (else the deploy rolls back — the GithubReleases 404 trap) · `— not in manifest` →
   nothing to do. The two envs are often on different lines, so a STOP on one doesn't block the other.
2. **Deliver (gated write — confirm the per-env plan first).** Only for `planned` envs, after the user
   confirms. Deliver **one env at a time** by default:
   ```bash
   npm run hotfix:deliver -- VCST-XXXX --envs=stable,regression --apply
   ```
   Per env it bumps `packages.json` → commits `VCST-XXXX: <title>` to the env branch (the push triggers
   "Cloud platform deployment") → polls that Action to `success` → polls `/api/platform/modules` until
   the module reports the target version. `⛔ deploy failed` → read the Action logs, fix root cause or
   escalate. `⚠ version not confirmed` → investigate, don't claim a pass. (Platform confirms on the
   Action + `/health`; the modules API has no Platform-core version.)
3. **Verify the fix behaves live (the "и всё работает" step).** For each delivered env, reproduce the
   task's STR on that live environment (`/qa-verify-fix` methodology): backend/module/GraphQL/Admin →
   **qa-backend-expert**; storefront-visible → **qa-frontend-expert**. One flaky rerun OK; a persistent
   failure after a confirmed-delivered version is a **STOP** (don't comment "verified").
4. **Comment on the JIRA task (English).** Once every targeted env is delivered AND verified: comment
   the per-env table (env · branch · pinned→target · deploy link) + the verdict. If verification was
   provider-limited/inconclusive, say so — don't claim a clean pass. Markdown, not wiki.
5. **Transition the tracker to Done.** Close the per-env **subtasks** ("Check on regression" / "Check on
   stable") for the envs delivered this run, then the **parent** task — via the Atlassian MCP. The
   workflow is **multi-hop**, so discover transitions live (`getTransitionsForJiraIssue` →
   `transitionJiraIssue`, re-query after each hop) until status name = `Done`: subtask `Take to
   development → In progress → go to done`; parent Bug `check hotfix → Testing on stable → Move to done`.
   **Never pick `Cancelled`** (a Done-category lookalike). Only close on a genuine pass — a delivery FAIL
   or behavioural FAIL is a STOP (provider-limited + no-regression is closeable).
6. **Bump the bundles — frozen stable AND `latest` (auto-detect, then ASK).** Detect which bundles trail
   this same-line patch, then confirm before writing:
   ```bash
   npm run bundle:check -- v14
   npm run bundle:check -- v15
   npm run bundle:check -- latest    # rolling newest-generation bundle
   ```
   Propose **both**: the frozen stable bundles (v14/v15 — the set drifts, never hardcode) **and**
   `bundles/latest`. `latest` tracks the newest generation, so it trails only when the fix is on the
   newest line (an older-frozen-line hotfix leaves it `✓ current`) — offer it explicitly whenever it
   trails so it isn't silently skipped. Bump each confirmed bundle's pin (module `Version`, or
   `PlatformVersion`+`PlatformImageTag`) as a PR to `master`. Never auto-merge the bundle PR.
7. **Self-diagnose the run.** End with a one-line **OK / DEGRADED / BROKEN** verdict per stage (deliver,
   verify, comment, transition, bundles) and surface every DEGRADED item as an explicit follow-up (e.g.
   "Azure behavioural proof still owed"). Deeper plugin-wide diagnosis: `/vc-self-check`.

## Hard rules

- **Delivery-only** — if the hotfix isn't released on the env's line, STOP → `/qa-hotfix` first.
- **Dry-run by default; `--apply` only after the user confirms the plan.** Deliver one env at a time; a
  failure on the first pauses the second. `merge_pull_request` / `gh pr merge` stay denied.
- **Asset gate before every commit** (no `.zip` asset ⇒ deploy rolls back ⇒ STOP).
- **A green deploy Action is not enough** — require the live `/api/platform/modules` version match (or
  `/health` for Platform) before "delivered".
- **Only close the tracker on a genuine pass**; resolve transitions by status name and **never pick
  `Cancelled`**. Always end with the Step 7 self-check and surface DEGRADED items as follow-ups.
- **Don't guess bundles** — auto-detect, then ask. `GIT_TOKEN` (PAT with `contents:write` on
  vc-deploy-dev + `actions:read` + product-repo read) is read from `.env.local`; the live check needs
  the env's admin credentials. `gh` is not required — writes go via the GitHub REST API.
