---
name: qa-env-upgrade
description: "[QA Methodology] Bring a deployed environment up to the latest released modules + platform and the newest green dev alpha of the storefront theme, as ONE deploy PR on vc-deploy-dev that a human merges. Use when asked to bring an env up to date / 'обновить стенд до последних релизов'. Not for hotfix delivery (/qa-hotfix-check) or a ticket's PR builds (/qa-deploy-pr). Read-only until the operator's yes; never merges."
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
codes in its `scripts/deploy/upgrade/cli.ts` header). The script does every comparison, check and edit. This skill
asks, shows, and relays — **it never re-derives a version, a status or a check by hand**, and never
edits the manifest itself. Status meanings and why each rule exists: [`reference.md`](reference.md).

**Safety contract.** Steps 1–4 write nothing outside the scratchpad. Step 5 is the only outward write,
and only after the operator's yes. Never merge, never force-push. The only branch created is a new
`env-upgrade-*` branch (on `vc-deploy-dev`, or your fork); the PR targets the named env's branch, which
nothing writes until a human merges.

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

For each entry of `questions` (≤4 per `AskUserQuestion` call): header = the group `key` cut to 12
chars (the tool's limit — an untracked group's key is a module Id); the question names the full `key`
and shows every `lines[]` entry verbatim (pins, PR links and state, the release — or, for the theme,
the green dev alpha — it would become, DOWNGRADE where flagged). Options, the recommended one first
and labelled *(Recommended)* per the group's `recommended`:

- *Keep the PR/alpha builds* → `"keep"`
- *Replace with release* (a theme-only group: *Replace with the green dev alpha*) → `"replace"`
- *Decide per module* — only when `components[]` has more than one entry → one follow-up per
  `components[]` entry, record `{ "<component>": "keep" | "replace" }`. A `lines[]` entry that reads
  "stays as is" is shown, never asked: it is not in `components[]` and the script rejects it.

Write the answers to `<scratchpad>/env-upgrade-<env>.decisions.json` as
`{ "<full key>": "keep" | "replace" | { … } }`. No questions → write `{}` (a group not listed is
KEEP; steps 3 and 5 always pass `--decisions`).

## 3. Table

```bash
npm run deploy:upgrade -- --plan=<plan> --decisions=<decisions>
```

Show the output **verbatim** — it is the table, the counts and the check results. A *Replace* the checks
blocked is marked "you approved → release; blocked: …" (theme: "you approved → green dev alpha;
blocked: …") in it; say so in one line. An approved downgrade reads "(you approved, DOWNGRADE)" — name it.

Exit 2 here means the decisions file is malformed (unknown group, component or value — the error names
it): show the error, rewrite the file from the step-2 answers, re-run. If the error names the plan
instead (unreadable, unsupported schema), go back to step 1.

## 4. One yes/no

"Open a deploy PR into `<branch>` with these N changes? A human merges." The counts line has N.
`0 to change` → say the env is up to date and stop.

## 5. On yes — apply

```bash
npm run deploy:upgrade -- --plan=<plan> --decisions=<decisions> --apply \
  --trailer="<this session's commit attribution line>" --pr-footer="<this session's PR attribution>"
```

Add `--draft` when the operator asks for a trial run: the PR opens as a draft, which nobody can merge
until it is marked ready.

- exit 0 → the PR is open and carries exactly the edited files: report its URL and the merge note below.
- exit 1 → the message names one of these (mapping: `scripts/deploy/upgrade/cli.ts` APPLY):
  - **nothing to change** — nothing written; the env is up to date.
  - **stale** ("changed on `<branch>` since the plan") — nothing written; offer to restart from step 1.
  - **unreadable** ("could not read … to confirm it is unchanged") — nothing written; check `GIT_TOKEN` / access and retry step 5.
  - **no write path** (web-edit links) — no file committed (a fork or an empty branch may remain);
    hand the links over.
  - **PARTIAL commit** — WRITTEN: the branch is in an inconsistent state; hand the compare URL over
    (fix or delete the branch).
  - **branch pushed, PR not opened** — WRITTEN: hand the compare URL over to open it.
  - **PR opened, but its files could not be verified / it does not carry or also touches files** —
    WRITTEN: the `✅ PR` line is printed first; relay that URL and say it must be reviewed before merge.
- exit 2 → nothing was written (tool error, STOP or bad input — every exit-2 path in `scripts/deploy/upgrade/cli.ts` comes
  before the first write): relay the error.

**Merge note:** a human merges; the merge triggers the deploy. Right after it the env can serve the
OLD build for a minute or two, so check `/api/platform/modules` only after the deploy Action is green
**and** the versions have actually changed.

## Never

- Never downgrade without an explicit, flagged approval; never add or remove a module; never call an
  alpha a release.
- Never write before the step-4 yes; never merge; never edit another env's branch.
- Never hand-edit the manifest or work around a script STOP — report it.
- Never transcribe versions, module lists or env→branch mappings into this file.
