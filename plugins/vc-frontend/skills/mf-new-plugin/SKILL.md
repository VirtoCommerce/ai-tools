---
name: mf-new-plugin
description: "Use when a Virto Commerce backend module should ship a storefront plugin (a Module Federation remote for vc-frontend): scaffolding StorefrontApp/ into the module's *.Web project, wiring the module's .csproj, module.manifest and .gitignore, and proving it with check:plugin-module."
argument-hint: "<plugin-name> <path to the module's *.Web project> [--with-apollo] [--with-tailwind]"
---

# mf-new-plugin — a storefront plugin inside an existing backend module

**The generator creates, this skill edits, the check decides.** `yarn create:plugin --module` writes only new files
(`StorefrontApp/`) and never touches the module's own. The module's files differ from module to module, so this
skill edits them: read the file, change the least, show the diff. `yarn check:plugin-module` is the verdict; the
skill is done when it passes, not when the edits look right.

The procedure is scenario **S1a** in vc-frontend: `client-app/core/federation/scenarios/s1a-plugin-in-an-existing-module.md`.
Read it from the checkout first. It is the source for every step below; this file adds only what an agent must do
differently. Where they disagree, the checkout wins, and say so in the report.

The skill stops for the user twice: after the preflight (step 1) and before it writes any module file (step 3).
It never commits or pushes.

## 1. Preflight

Find two folders and write them down:

- **The vc-frontend checkout** (`$HOST`). Ask if it is not obvious. Then `git fetch` and check it is not behind
  `origin/dev`: the generator, the checks and the floors all come from it. It must have
  `"check:plugin-module"` in `package.json`; without it the checkout predates this flow — stop.
- **The module's `*.Web` project** (`$WEB`), the folder holding `module.manifest` and the `.csproj`.

Stop and report, changing nothing, when:

| Finding | Why |
|---|---|
| `$WEB/StorefrontApp/` exists | not this scenario. The plugin exists: upgrading it is S4, debugging it S7 |
| the module repo has uncommitted changes | the diffs in step 3 must show only this skill's edits |
| the module repo is on its default branch | ask for a branch first |

Then confirm with the user, in one message:

1. **The plugin name** (kebab-case). It becomes the plugin id, the remote name and the default route. Propose one
   from the module id (`VirtoCommerce.SalesRep` → `sales-rep`).
2. **The options:** `--with-apollo` if the plugin has its own GraphQL, `--with-tailwind` for Tailwind. The rest
   are asked by the generator; pass `--yes` only if the user wants the defaults.

## 2. Scaffold

From `$HOST`:

```bash
yarn create:plugin <name> --module "$WEB" [--with-apollo] [--with-tailwind]
```

It ends with a list of what is still to do in the module. Keep it: it is step 3's work list. If it prints
`!! @vc-frontend/core … is not released yet`, or `yarn install` in step 4 fails with a 404 on `@vc-frontend/core`,
read S1a ⚠️ 3 to the user and ask how to go on; never commit a yalc or `portal:` pin.

## 3. Wire the module

Run `yarn check:plugin-module "$WEB"` from `$HOST`. Every ❌ and ⚠️ about a module file is an edit. Plan them all,
then **[PAUSE]**: show each planned edit as a unified diff, and for any edit marked *decision* below say what it
changes for the module's users. Write nothing until the user agrees.

| File | Edit | Rules |
|---|---|---|
| `*.Web.csproj` | the `<Import>` line the check prints | Add it once, before `</Project>`, in the file's own indentation. If the `.csproj` already builds a storefront app with inline targets (the check warns about them), replacing them with the Import is a *decision*: list what the old targets did that the new file does not |
| `module.manifest` | `platformVersion` and each `<dependency>` the check names | Copy the versions from the check's `→` lines (it reads them from `BACKEND_REQUIREMENTS` in `$HOST`); never type one from memory or a doc. Replace a lower version in place; add a missing dependency to `<dependencies>`, creating the element if there is none. A version already higher stays. Every raise is a *decision*: platforms and modules below the floor can no longer install this module |
| `.gitignore` | the line the check prints | The repository's root `.gitignore` |
| CI (`.github/workflows/`) | none | Report only. Module CI is updated centrally (its commits read "Auto update Github Action workflows"), so a local edit is overwritten. It must set up Node; if it does not, say so in the report |

Apply the agreed edits, then run the check again. Loop until nothing about a module file fails; `yarn.lock is
empty` is step 4's. Never edit a file
inside `StorefrontApp/` to silence a check: it was generated for exactly this setup, so a failure there is a
generator bug to report.

## 4. Build the plugin

In `$WEB/StorefrontApp`:

```bash
yarn install
yarn type-check && yarn lint && yarn test && yarn build
```

`yarn install` writes `yarn.lock`; the module build installs with `--immutable`, so it must be committed with the
rest. Then, from `$HOST`, the full check:

```bash
yarn check:plugin-module "$WEB"
```

✅ `All checks passed.` Nothing else counts as done.

## 5. Optional: see it in a storefront, check a package

Offer both; do them only if the user wants.

- **Local storefront:** S1a step 5. It needs a backend in `$HOST/.env.local`. It changes
  `client-app/config/settings_data.json` in `$HOST`: restore it afterwards and confirm `git status` there is clean.
- **Package:** if the user has the module's zip (from its CI, or built locally the way CI does), run the check with
  `--artifact <zip>`. ✅ the plugin sits at the zip root, not under `bin/` (S1a ⚠️ 1).

## 6. Report

1. The edits in the module, file by file, and every *decision* the user took.
2. The last `check:plugin-module` output, verbatim.
3. What the user does next: commit (including `StorefrontApp/` and its `yarn.lock`), push for the module CI, run the
   check with `--artifact` on the CI zip, then install it on an environment (S6) and run it with `--env`.
4. Anything S1a says that turned out wrong, with the evidence.

## Never

1. Commit, push, or edit a file outside the module's `.csproj`, `module.manifest` and `.gitignore`.
2. Lower a version, or write one the check did not print.
3. Hand-edit `@vc-frontend/core` files, or anything under `$HOST` except the reverted local setting in step 5.
4. Re-run `create:plugin` over an existing `StorefrontApp/`, or delete one to make it run.
