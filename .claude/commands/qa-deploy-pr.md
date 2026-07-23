---
description: "Gather ALL fresh CI prerelease artifacts a change produced (across several vc-module-* repos + vc-platform + vc-frontend) and deploy them TOGETHER to a test environment in ONE manifest update, so /qa-test and /qa-verify-fix have the change actually live. Resolve a tracker ticket's linked PRs across all repos (or an explicit --module/--platform/--theme/--pr set) → each PR's latest vc3prerelease build → repin vc-deploy-dev@<env-branch> backend/packages.json (AzureBlob/BlobName + PlatformVersion) and theme/artifact.json. Minimal-diff repin; dry-run combined diff by default; --apply opens ONE gated deploy PR (direct same-repo when the account has write on vc-deploy-dev, else a fork PR; writes route through gh's keyring token; prints the web-edit URL when it can't push). --verify reports per-target deploy state (branch pin — incl. BlobName-only prerelease pins — + live /api/platform/modules). Env-aware (never hardcodes vcst-qa). Gated writes, never auto-merges — a human merges vc-deploy-dev to deploy."
argument-hint: "<ticket-key> [--pr owner/repo#N ...] [--module Id=Ver ...] [--platform Ver] [--theme <url>] [--env <name>] [--apply] [--verify]"
disable-model-invocation: true
---

# /qa-deploy-pr — Deploy a change's PR artifacts to the test env

Close the "artifact not deployed" gap that `/qa-test PR #N` and `/qa-verify-fix <ticket-key>`
only detect-and-wait on today. A change usually spans several PRs (a module + its xAPI + the
storefront); this **gathers every fresh CI prerelease artifact and repins them together, in one
manifest update**, on the env's `vc-deploy-dev` branch — then a **human merges** to deploy.
Backed by the [`/qa-deploy-pr` skill](../skills/qa-deploy-pr/SKILL.md) — the command is the
terminal entry; the skill holds the methodology, the env wiring, and the delivery gate.

## Usage
```
/qa-deploy-pr VCST-5173                    # dry-run: resolve all linked PRs → combined diff (no writes)
/qa-deploy-pr VCST-5173 --verify           # read-only: is the bundle already deployed on the env?
/qa-deploy-pr VCST-5173 --apply            # gated: open ONE deploy PR (direct same-repo if you have write, else a fork PR)
/qa-deploy-pr --pr=VirtoCommerce/vc-module-cart#412 --pr=VirtoCommerce/vc-frontend#2280
/qa-deploy-pr VCST-5173 --env=vcptcore     # target another environment (branch resolved from the env)
```

## Rules
- **Dry-run is the default; writes are gated on `--apply`.** Ask before applying.
- **Never merges.** Ends at an open cross-fork PR (or a prepared diff + web-edit URL) for a
  human to review + merge. Revert the temporary pin after the change is verified.
- **Tracker-agnostic:** the explicit `--pr`/`--module` path works with any tracker; ticket-key
  auto-resolution uses the configured tracker's dev links (Jira today) — on Azure Boards pass
  the PRs via `--pr`.
- **Env-aware:** the `vc-deploy-dev` branch + `BACK_URL` come from `TEST_ENV` / `.env.<env>`
  (`vcst`→`vcst-qa`, else the branch matching the env). Never hardcode `vcst-qa`.

Deterministic core: `scripts/deploy/deploy-pr-artifact.ts` (`npm run deploy:pr` /
`deploy:pr:apply`). Gate context: `.claude/rules/quality-gates.md` (G6 E2E verification) +
`.claude/templates/agent-dispatch.md` (Build Verification).
