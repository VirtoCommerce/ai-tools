# Scratch-harness patterns — Path 2 (mounted-component/DOM) for a module-embedded Vue 3 shell

The shell sub-app (e.g. `vc-module-pagebuilder`'s `src/VirtoCommerce.PageBuilderModule.Web/Apps/page-builder-shell/`) ships only Node's built-in
`tsx --test` — no `@vue/test-utils`, no jsdom, no bundler-driven component-mount tooling. A
**state/logic** bug doesn't need this file at all (see `SKILL.md` Path 1 — the real `tsx --test` runner
already proves it). This file is **only** for a **mounted-component/template/DOM** bug, where the repro
genuinely needs SFC compilation + a DOM. Everything here is throwaway: nothing in this file's recipe is
ever committed — the PR carries only the product-code fix, plus both runs' output as evidence.

## Why the scratch install, not a real devDependency

Adding `vitest`/`@vue/test-utils`/`jsdom` to the sub-app's own `package.json` would be a real dependency
change — an instant Gate-4 fail (minimal diff, no framework/tooling churn) and a real cost to every other
contributor who clones the repo. The goal is an install that is **invisible to `git`**: the packages land
in the gitignored `node_modules`, with **zero** diff to `package.json` or the lockfile
(`yarn.lock`/`package-lock.json`). How you get there depends on the sub-app's package manager (check the
`packageManager` field) — the recipe below uses `npm --no-save`; the Yarn Berry caveat follows it.

## 1. Scratch-install + verify it left no trace

Run from the sub-app directory (e.g. `.fix-workspace/vc-module-pagebuilder/src/VirtoCommerce.PageBuilderModule.Web/Apps/page-builder-shell/`):

```bash
# BEFORE — confirm clean
git diff --stat package.json package-lock.json yarn.lock 2>/dev/null   # expect: no output

npm install --no-save --no-package-lock vitest @vue/test-utils jsdom @vitejs/plugin-vue

# AFTER — confirm still clean (the whole point of --no-save)
git diff --stat package.json package-lock.json yarn.lock 2>/dev/null   # expect: no output
```

If either check shows a diff, `git checkout -- package.json package-lock.json` before proceeding — the
scratch install must never touch tracked files.

**Yarn Berry (`yarn@4`, e.g. page-builder) caveat — check the linker mode BEFORE running the npm
install.** Yarn Berry defaults to **PnP** (`nodeLinker: pnp` — no `node_modules` at all; resolution is
enforced by a `.pnp.cjs` require hook), where `npm install --no-save` won't give `vite`/`vitest` anything
they can actually resolve — the resulting "cannot find module" failure will look like a broken install,
not a package-manager mismatch, and burn time debugging the wrong problem. Check first:

```bash
grep -m1 '^nodeLinker' .yarnrc.yml 2>/dev/null    # "pnp" (or absent under yarn@4+) = PnP mode
test -d node_modules && echo "node_modules present" || echo "no node_modules (likely PnP)"
```

- **`nodeLinker: node-modules` (or `node_modules/` already present):** proceed with `npm install --no-save`
  as above — just confirm the AFTER `git status` shows no change to `yarn.lock`/`.yarn/` (npm won't write
  them, but verify).
- **PnP (`nodeLinker` unset/`pnp`, no `node_modules`):** skip the npm install — go straight to a
  throwaway directory *outside* the checkout instead (a scratch dir with its own disposable
  `package.json`, installed with `npm`/`yarn` there) and point the scratch vitest config's module
  resolution at it. Never mutate the sub-app's own manifest or `.pnp.cjs`.

## 2. Ephemeral vitest config — reuse the sub-app's REAL vite config

Check the sub-app's actual config filename first — it may be `vite.config.ts` or `vite.config.mts`
(e.g. `vc-module-pagebuilder`'s shell uses `.mts`); import whichever one is actually there.

Don't hand-roll SFC/TS resolution — merge the sub-app's own Vite config (aliases, plugins) with just the
test-environment bits, so the compiled component behaves exactly as it does in the real app:

```ts
// .fix-workspace/<repo>/src/VirtoCommerce.PageBuilderModule.Web/Apps/page-builder-shell/vitest.scratch.config.ts
// NEVER staged / committed — delete before opening the PR.
import { defineConfig, mergeConfig } from "vitest/config";
import realConfig from "./vite.config"; // the sub-app's own, unmodified config

export default mergeConfig(
  realConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: false, // match the shell's explicit-import style, not implicit globals
    },
  }),
);
```

## 3. Worked example — a stale reactive banner not clearing after a mounted action

```ts
// .fix-workspace/_scratch/VCST-XXXX/repro.spec.ts
// Outside the sub-app tree entirely — imports the REAL component from the checkout.
import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import PublishBanner from "../../vc-module-pagebuilder/src/VirtoCommerce.PageBuilderModule.Web/Apps/page-builder-shell/src/components/PublishBanner.vue";

describe("PublishBanner — clears 'has unsaved changes' after Publish (VCST-5515)", () => {
  test("hides the banner once the publish action resolves", async () => {
    const wrapper = mount(PublishBanner, { props: { pageId: "test-page" } });
    await wrapper.get('[data-test-id="field-title"]').setValue("edited title");
    expect(wrapper.find('[data-test-id="unsaved-banner"]').exists()).toBe(true); // dirty state shows it

    await wrapper.get('[data-test-id="publish-button"]').trigger("click");
    await wrapper.vm.$nextTick();

    // red before fix: banner still present because the dirty flag never resets post-publish
    expect(wrapper.find('[data-test-id="unsaved-banner"]').exists()).toBe(false);
  });
});
```

Run it against the scratch config:

```bash
npx vitest run --config vitest.scratch.config.ts \
  ../../_scratch/VCST-XXXX/repro.spec.ts
```

Red = the banner assertion fails (element still found); green = it passes after the fix. Paste both
transcripts into the PR body, same discipline as `/angular-admin`'s scratch harness:

```
### Red→green evidence (ephemeral vitest harness, not committed)
$ npx vitest run --config vitest.scratch.config.ts ...    # before fix
✗ hides the banner once the publish action resolves        ← red
$ npx vitest run --config vitest.scratch.config.ts ...    # after fix
✓ hides the banner once the publish action resolves        ← green
```

## 4. Pre-PR strip checklist (mandatory — do this every time)

Run from the sub-app directory before handing off to `frontend-reviewer`:

```bash
git status --porcelain
```

Expected output: **only the product-code fix file(s)**. Specifically confirm absent:
- `package.json` / `package-lock.json` / `yarn.lock` (the scratch install used `--no-save`)
- `vitest.scratch.config.ts` (delete it — `rm vitest.scratch.config.ts`)
- Any `node_modules/` entries (gitignored, but double-check `.gitignore` actually covers the sub-app path)
- The scratch repro test itself lives under `.fix-workspace/_scratch/`, outside the checkout's tracked
  tree — confirm it was never created inside the sub-app directory

If anything unexpected shows up, `git checkout --` / `rm` it before committing — a leaked scratch-harness
file is a Gate-4 REQUEST_CHANGES (`frontend-reviewer.md`'s scratch-harness-leakage check).

## Gotchas

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cannot find module 'vitest/config'` | scratch install didn't complete / wrong cwd | re-run step 1 from the sub-app directory, not the repo root |
| Real `vite.config.ts` import fails under vitest | the config does something Node-only vitest can't resolve (e.g. a plugin needing a dev server) | strip to the minimal plugin set needed for SFC compilation in the merged config, note the deviation in the PR body |
| Component needs `@vc-shell/framework` composables/providers to mount | the shell provides app-level context (auth, i18n, router) via `provide`/plugins | stub only what the seam touches via `global.provide`/`global.plugins` in the `mount()` call — same technique as `vue-unit-test/vitest-patterns.md` §3, don't wire the whole app |
| Scratch config or `node_modules` shows up in `git status` | ran install/config creation inside the tracked sub-app tree without `--no-save`, or forgot to delete the scratch config | re-verify with the Pre-PR checklist above; delete before commit |
