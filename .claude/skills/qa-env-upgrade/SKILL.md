---
name: qa-env-upgrade
description: "[QA Methodology] Upgrade a deployed environment to the LATEST RELEASED modules + platform and the newest GREEN dev alpha of the storefront theme. Compares the env's vc-deploy-dev backend/packages.json with VirtoCommerce/vc-modules modules_v3.json (modules) and the latest vc-platform release (platform), and theme/artifact.json with the newest vc-frontend dev alpha whose Theme CI run is green; moves PR/alpha pins to the release that contains them and ASKS only where no release does; prints ONE table; asks once before opening ONE deploy PR. Use when asked to bring an env up to date / 'обновить стенд до последних релизов'. Read-only until the operator's yes; never merges — a human merges to deploy."
argument-hint: "<env>"
disable-model-invocation: true
---

# /qa-env-upgrade — bring an environment up to the latest releases

```
/qa-env-upgrade vcst                 # vcst-qa
/qa-env-upgrade vcptcore_qa1         # any env that has a .env.<env> file
```

What the operator gets, in order: **questions** only where a pin has no release yet → **one table**
(nothing written yet; they can stop here) → **one yes/no** → on yes, **a PR link**. A human with merge
rights on `vc-deploy-dev` merges it; the merge deploys.

Out of scope: adding or removing modules, hotfix delivery (`/qa-hotfix-check`), deploying a ticket's
PR builds (`/qa-deploy-pr`).

**Deterministic core: `npm run deploy:upgrade`** (`scripts/deploy/vc-deploy.ts upgrade`; flags and exit
codes in its `upgrade/cli.ts` header). The script does every comparison, check and edit. This skill
asks, shows, and relays — **it never re-derives a version, a status or a check by hand**, and never
edits the manifest itself. Status meanings and why each rule exists: [`reference.md`](reference.md).

**Safety contract.** Steps 1–4 only read. Step 5 is the only write, and only after the operator's yes.
Never merge, never force-push, never touch a branch other than the named env's.

Requires `GIT_TOKEN` (read on VirtoCommerce repos) and an authenticated `gh` (writes use its keyring
token; without write on `vc-deploy-dev` the script uses a fork, else prints web-edit links).

## 1. Plan (read-only)

`$ARGUMENTS` = the env in `TEST_ENV` form. No env → STOP and ask; never default to one.

```bash
npm run deploy:upgrade -- --env=<env> --plan-out=<scratchpad>/env-upgrade-<env>.plan.json --json
```

Exit 2 → show the error and stop (missing env file, branch not found, token, rate limit).
`openUpgradePrs` not empty → list them and ask whether to go on (two upgrade PRs on one branch conflict).

## 2. Questions — one per feature group

For each entry of `questions` (≤4 per `AskUserQuestion` call): header = the group `key`; the question
shows every `lines[]` entry verbatim (pins, PR links and state, the release it would become, DOWNGRADE
where flagged). Options, the recommended one first and labelled *(Recommended)* per the group's
`recommended`:

- *Keep the PR/alpha builds* → `"keep"`
- *Replace with release* → `"replace"`
- *Decide per module* → ask one follow-up per component, record `{ "<component>": "keep" | "replace" }`

Write the answers to `<scratchpad>/env-upgrade-<env>.decisions.json` as
`{ "<key>": "keep" | "replace" | { … } }`. No questions → skip the file.

## 3. Table

```bash
npm run deploy:upgrade -- --plan=<plan> --decisions=<decisions>
```

Show the output **verbatim** — it is the table, the counts and the check results. A *Replace* the checks
blocked is marked "you approved → release; blocked: …" in it; say so in one line.

## 4. One yes/no

"Open a deploy PR into `<branch>` with these N changes? A human merges." The counts line has N.
`0 to change` → say the env is up to date and stop.

## 5. On yes — apply

```bash
npm run deploy:upgrade -- --plan=<plan> --decisions=<decisions> --apply \
  --trailer="<this session's commit attribution line>" --pr-footer="<this session's PR attribution>"
```

- exit 0 → report the PR URL and the merge note below.
- exit 1 → relay the message: *stale* means someone changed the env since step 1 — offer to start
  over from step 1; a web-edit link means no write path — hand the links over.
- exit 2 → relay the error; nothing was written unless the message says PARTIAL.

**Merge note:** a human merges; the merge triggers the deploy. Right after it the env can serve the
OLD build for a minute or two, so check `/api/platform/modules` only after the deploy Action is green
**and** the versions have actually changed.

## Never

- Never downgrade, never add or remove a module, never call an alpha a release.
- Never write before the step-4 yes; never merge; never edit another env's branch.
- Never hand-edit the manifest or work around a script STOP — report it.
- Never transcribe versions, module lists or env→branch mappings into this file.
