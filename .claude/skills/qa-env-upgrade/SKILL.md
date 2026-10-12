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

What the operator gets, in order: **two tables** — (1) release → latest release (Component · On env ·
Latest release), (2) PR/alpha builds and everything to decide (Now · Becomes · Why) — nothing written
yet, they can stop here → **questions in stages**, one stage per message: ① PR builds that already
have a release, ② PR/alpha builds with no release, ③ the theme, ④ open the PR with all of the above.
A human with merge rights on `vc-deploy-dev` merges it; the merge deploys.

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

## 2. Tables first — before any question

Write `{}` to `<scratchpad>/env-upgrade-<env>.decisions.json` (the defaults: a PR build with a release
→ release, everything else kept) and run the table command:

```bash
npm run deploy:upgrade -- --plan=<plan> --decisions=<decisions>
```

Show the output **verbatim** before asking anything — the operator decides with the whole diff in view.

## 3. Questions in stages

```bash
npm run deploy:upgrade -- --plan=<plan> --stages
```

It prints `stages[]` in asking order; an empty stage is absent, so skip straight to the next one. Ask
**one stage per `AskUserQuestion` call** and wait for the answer before the next stage:

| `id` | Question (stage number as asked, skipping absent ones) |
|---|---|
| `released` | Keep the PR builds whose work is already in a release? |
| `unreleased` | These PRs are **not merged** — no release contains their work, and replacing removes it from the env. Keep them? |
| `theme` | Keep the theme PR build, or move to the green dev alpha? |

In the question list every `items[]` entry on its own line — `<component> <now> → <becomes> — <why>`,
with **⚠ DOWNGRADE** when `downgrade` is true and `keeping blocks: <blocks>` when `blocks[]` is not
empty — then each `stays[]` line as information (never asked). Never write "no release" for an
`unreleased` item: a release usually exists, it just does not contain the PR.

**`stale: true`** = the PR build predates the latest release (it lacks that release's changes). Its `why`
already says so; after the last stage list every kept stale item once as a recommendation —
"update PR #N (merge dev into it, rebuild) and pin the new build" — the fix is a fresh PR build, not
the release, and it is outside this command (`/qa-deploy-pr` pins it).
Options, the stage's `recommended` first and labelled *(Recommended)*:

- *Keep the PR/alpha builds* → `"keep"` for every item
- *Replace with release* (theme: *Replace with the green dev alpha*) → `"replace"` for every item
- *Decide per module* — only when `items[]` has more than one entry → one follow-up per item.

Record every answer per component in `<scratchpad>/env-upgrade-<env>.decisions.json`:
`{ "<component>": "keep" | "replace", … }` (the `component` field verbatim; steps 3 and 5 always pass
`--decisions`). After the last stage, re-run the table command — **only if** some answer differs from
the stage's `recommended` — and show the output verbatim. A replace the checks blocked reads
"blocked: …" — say so in one line; an approved downgrade reads "⚠ DOWNGRADE" — name it.

Exit 2 means the decisions file is malformed (the error names the key): rewrite it from the answers and
re-run. If the error names the plan (unreadable, unsupported schema), go back to step 1.

## 4. Last stage — open the PR?

"Open a deploy PR into `<branch>` with these N changes? A human merges." N is the counts line of the
latest table. `0 to change` → say the env is up to date and stop.

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
