---
name: mf-new-plugin
description: "Use when a Virto Commerce backend module should ship a storefront plugin (a Module Federation remote for vc-frontend): scaffolding StorefrontApp/ into the module's *.Web project, wiring the module's .csproj, module.manifest and .gitignore, and proving it with check:plugin-module."
argument-hint: "<plugin-name> <path to the module's *.Web project> [--with-i18n] [--with-apollo] [--with-vueuse] [--with-tailwind] [--no-router]"
---

# mf-new-plugin — a storefront plugin inside an existing backend module

**The generator creates, this skill edits, the check decides.** `yarn create:plugin --module` writes only new files
(`StorefrontApp/`) and never touches the module's own. The module's files differ from module to module, so this
skill edits them: read the file, change the least, show the diff. `yarn check:plugin-module` is the verdict; the
skill is done when it passes, not when the edits look right.

The procedure is scenario **S1a** in vc-frontend: `client-app/core/federation/scenarios/s1a-plugin-in-an-existing-module.md`.
Read it from the checkout first. It is the source for every step below; this file adds only what an agent must do
differently. Where they disagree, the checkout wins, and say so in the report.

The skill stops for the user at least twice: after the preflight (step 1) and before it writes any module file
(step 3). It never commits or pushes.

## 1. Preflight

Find two folders and write them down:

- **The vc-frontend checkout** (`$FRONTEND`), with `yarn install` done. Ask if it is not obvious. The generator, the
  checks and the floors all come from it, and its facade version (`client-app/core-api/package.json`) becomes the
  plugin's floor: it must not be newer than the facade of the storefronts the plugin is for (S1a, before you
  start, 1). Ask which storefronts those are when it is not clear. It must have `"check:plugin-module"` in
  `package.json` and the S1a file; without them the checkout predates this flow — stop.
- **The module's `*.Web` project** (`$WEB`), the folder holding `module.manifest` and the `.csproj`.

`$FRONTEND` and `$WEB` name the two folders in this file only. In commands, write the absolute paths: every shell
call starts fresh, so a variable set in one is empty in the next.

Stop and report, changing nothing, when:

| Finding | Why |
|---|---|
| `$WEB/StorefrontApp/` is committed | not this scenario. The plugin exists: upgrading it is S4, debugging it S7 |
| `$WEB/StorefrontApp/` exists but is untracked (`git status --porcelain` shows `?? …StorefrontApp/`) | an earlier run stopped, or it is someone's uncommitted work. Show what is in it (`git ls-files --others --exclude-standard -- StorefrontApp` in `$WEB`), then offer to go on from step 3, or to move it out of the module repo and start over. Never delete it. Move it only on the user's yes, and out of the repo: a copy left inside the `*.Web` project would be built into the module |
| the module repo has other uncommitted changes | the diffs in step 3 must show only this skill's edits. On a resumed run, its own earlier edits to the three module files may stay; show them in step 3 |
| the module repo is on its default branch | ask for a branch first |
| `node --version` in `$FRONTEND` is not 22, or `corepack --version` fails | the checkout asks for Node 22 (its `engines`), and the plugin builds through corepack (S1a, before you start, 2). Say what to install |
| the facade is not released: `curl -sfIL -o /dev/null https://github.com/VirtoCommerce/vc-frontend/releases/download/core-v<version>/vc-frontend-core-<version>.tgz` fails, `<version>` being `$FRONTEND/client-app/core-api/package.json`'s | the plugin's install would 404 in step 4. Read S1a ⚠️ 3 to the user and ask how to go on |

Then confirm with the user, in one message:

1. **The plugin name** (kebab-case). It becomes the plugin id, the remote name and the default route. Take it
   from the arguments if given; otherwise propose one from the module id (`VirtoCommerce.SalesRep` → `sales-rep`).
2. **The options**, each one asked: `--with-i18n` (its own translations), `--with-apollo` (its own GraphQL, read from
   the module's scoped schema: S1b step 4), `--with-vueuse`, `--with-tailwind`, `--no-router` (no page of its own).
   The generator cannot ask them here: without a terminal it takes its defaults silently. A group left out is
   written as not shared, and importing it later bundles a second copy.

## 2. Scaffold

From `$FRONTEND`:

```bash
yarn create:plugin <name> --module "$WEB" --yes [the flags the user picked]
```

It ends with a list of what is still to do in the module. Keep it: it is step 3's work list. If it prints
`!! @vc-frontend/core … is not released yet`, or `yarn install` in step 4 fails with a 404 on `@vc-frontend/core`,
read S1a ⚠️ 3 to the user and ask how to go on; never commit a yalc or `portal:` pin.

## 3. Wire the module

Run `yarn check:plugin-module "$WEB"` from `$FRONTEND`. Every ❌ and ⚠️ about a module file is an edit. Plan them all,
then **[PAUSE]**: show each planned edit as a unified diff, and for any edit marked *decision* below say what it
changes for the module's users. Write nothing until the user agrees.

| File | Edit | Rules |
|---|---|---|
| `*.Web.csproj` | the `<Import>` line the check prints | Add it once, before `</Project>`, in the file's own indentation. If the `.csproj` already builds a storefront app with inline targets (the check warns about them), replacing them with the Import is a *decision*: list what the old targets did that the new file does not |
| `module.manifest` | `platformVersion` and each `<dependency>` the check names | Copy the versions from the check's `→` lines (it reads them from `BACKEND_REQUIREMENTS` in `$FRONTEND`); never type one from memory or a doc. Replace a lower version in place; add a missing dependency to `<dependencies>`, creating the element if there is none. A version already higher stays. Every raise is a *decision*: platforms and modules below the floor can no longer install this module |
| `.gitignore` | the line the check prints | The repository's root `.gitignore` |
| CI (`.github/workflows/`) | none | Report only. A VirtoCommerce module's CI is updated centrally (its commits read "Auto update Github Action workflows"), so a local edit is overwritten. Any other module owns its CI: if it does not set up Node 22 or 24 with corepack, the report shows the step to add (`actions/setup-node`, then corepack), for the user to make |

Apply the agreed edits, then run the check again. Loop until nothing about a module file fails; `yarn.lock is
empty` is step 4's. Stop the loop when the user declines an edit, or a ❌ prints no `→` line: the run is not done.
Report those lines verbatim and what each one blocks (a declined floor: the module cannot ship the plugin to
platforms below it). Never edit a file
inside `StorefrontApp/` to silence a check: it was generated for exactly this setup, so a failure there is a
generator bug to report.

## 4. Build the plugin

In `$WEB/StorefrontApp`:

```bash
corepack yarn install
corepack yarn type-check && corepack yarn lint && corepack yarn test && corepack yarn build
```

Through `corepack`, because a global `yarn` is often 1.x and the plugin pins Yarn 4. The install writes
`yarn.lock`; the module build installs with `--immutable`, so it must be committed with the rest. Then, from
`$FRONTEND`, the full check:

```bash
yarn check:plugin-module "$WEB"
```

✅ `All checks passed.` (exit code 0): the module's sources are wired. Only the exit code decides; the wording of
the check's lines can change between vc-frontend versions. The plugin is not shipped until a package passes
`--artifact` (step 5), so the report says which of the two the run reached.

## 5. Optional: see it in a storefront, check a package, try a local platform

Offer each; do only what the user wants.

- **Local storefront:** S1a step 5. It needs a backend in `$FRONTEND/.env.local` and `module_federation_enabled: true`,
  the default; a fork that turned it off is the user's to change. Before changing `.env.local`, copy it aside: git
  cannot restore it. Afterwards put it back, and compare `git status` in `$FRONTEND` with what it was before step 5.
  The two servers need ports 3000 (storefront) and 3001 (plugin). Check both are free first, e.g.
  `lsof -iTCP:3000 -sTCP:LISTEN`: a server already there may be the user's, so ask, and never stop it. Start both
  previews in the background, wait until each answers, and when done stop exactly those two.
- **Package:** run the check with `--artifact <zip>` on the module's zip, from its CI or built the way CI does
  (📁 module repo `vc-build compress`, which needs the .NET SDK; the zip lands in `artifacts/`). ✅ the plugin sits
  at the zip root, not under `bin/` (S1a ⚠️ 1).
- **Local platform:** if the user runs one, follow S6 → "On a local platform" with that zip: install, restart, then
  `--env <platform URL>` and the storefront from S2.2. ✅ the plugin's page renders with no override set. Restore
  `.env.local` in `$FRONTEND` afterwards, as above.

## 6. Report

1. Where the run got to: sources wired, package verified, or not done (and what blocks it).
2. The edits in the module, file by file, and every *decision* the user took.
3. The last `check:plugin-module` output, verbatim.
4. What the user does next: commit (including `StorefrontApp/` and its `yarn.lock`), push for the module CI, run the
   check with `--artifact` on the CI zip if step 5 did not, then install it on an environment (S6) and run it with
   `--env`.
5. Anything S1a says that turned out wrong, with the evidence.

## Never

1. Commit, push, or edit a file outside the module's `.csproj`, `module.manifest` and `.gitignore`, except
   `$FRONTEND/.env.local` in step 5, restored afterwards.
2. Lower a version, or write one the check did not print.
3. Hand-edit `@vc-frontend/core` files, or anything else under `$FRONTEND`. Never `git checkout` or `git restore` a file
   there: it may hold the user's own work.
4. Re-run `create:plugin` over an existing `StorefrontApp/`, or delete one. An untracked one may move out of the
   module repo, on the user's yes (step 1).
