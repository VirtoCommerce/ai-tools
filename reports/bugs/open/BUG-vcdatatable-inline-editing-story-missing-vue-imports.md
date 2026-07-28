# BUG: `VcDataTable / Inline Editing With Validation` story crashes — `onMounted` / `onUnmounted` not imported — [Medium]

**Env:** hosted vc-shell Storybook (`vc-shell-storybook.govirto.com`, built from `main`) · `@vc-shell/framework` 2.2.0 / 2.3.0 · Chromium 1232 · Windows 11
**Source:** [vc-shell#255](https://github.com/VirtoCommerce/vc-shell/pull/255) — the split of the 6024-line `vc-data-table.stories.ts` into 16 themed files · found while testing VCST-5412 (BH-15)
**Category (per VCST-5412 §10):** **Defect** — the story worked in the monolithic file, and is broken by the split.

## Summary

`vc-data-table.inline-editing.stories.ts` — a **new file created by this PR** — calls `onMounted()` and
`onUnmounted()` but imports only `ref` from `vue`. `setup()` throws a `ReferenceError`, so the story
renders an empty shell instead of the table. It is the only one of the 16 split files with a
mismatched `vue` import.

## Steps to reproduce

1. Open `https://vc-shell-storybook.govirto.com/iframe.html?id=data-display-vcdatatable--inline-editing-with-validation&viewMode=story`
2. Observe the story canvas and the console.

## Expected vs actual

**Expected:** the inline-editing demo renders — a 3-row product table with Edit / Save / Cancel controls
and a VeeValidate status bar.

**Actual:** Storybook shows `Cannot read properties of undefined (reading 'length')`; the story root is
94 characters of empty markup (`<div><div class="vc-app"><div><!----></div></div></div>`). A working
sibling story (`--basic`) renders 11,971 characters by comparison.

```
[@vc-shell/framework#global-error-handler] Unhandled Vue error:
  ReferenceError: onMounted is not defined
    at setup (…/assets/vc-data-table.inline-editing.stories-C6XRYBtL.js:1:1061)
```
The second error is a cascade: `setup()` aborted, so the refs the template reads were never returned.

![story renders blank](../tickets/Sprint26-15/VCST-5412/screenshots/BUG-vcdatatable-inline-editing-story-blank.png)

## Root cause

`framework/ui/components/organisms/vc-data-table/vc-data-table.inline-editing.stories.ts` line 2:

```ts
import { ref } from "vue";        // ← onMounted / onUnmounted missing
```

…while the story body uses both:

```ts
onMounted(() => { pollInterval = setInterval(updateEditState, 100); });
onUnmounted(() => { if (pollInterval) clearInterval(pollInterval); });
```

**Fix (one line):**
```ts
import { ref, onMounted, onUnmounted } from "vue";
```

Verified this is isolated — the other split files are consistent (`url-state` correctly imports
`computed`/`reactive`/`watch`/`provide`/`nextTick`; the rest use only `ref`).

## Why CI did not catch it

`framework/tsconfig.json` excludes story files from typecheck, with the repo's own marker:

```jsonc
"exclude": [
  …
  // TODO: fix this
  "**/*.stories.ts",
```

There is no auto-import plugin in the repo (no `unplugin-auto-import`), so `onMounted` is genuinely an
undefined identifier — but `yarn typecheck` never reads `.stories.ts`. The PR's stated verification
("`yarn lint` and `yarn typecheck` clean") is therefore accurate yet structurally unable to catch this.

`yarn test:storybook` renders every story in Chromium and **would** catch it, which puts the gap at
whether that job gates the merge.

**Suggested guard:** either remove `**/*.stories.ts` from the tsconfig `exclude` (resolving the existing
TODO), or make `test:storybook` a required check.

## Scope check

A sweep of **all 615 indexed stories** found this is the only story broken by a code defect.
For completeness, 10 other stories log errors that are **not** defects:
- 4 × `Data Display/VcVideo` — the sandbox regression, filed separately as
  `BUG-vc-video-sandbox-blocks-youtube-playback.md`
- 6 × `Layout/VcApp` — SignalR hub negotiation 404s because static Storybook has no platform backend;
  environmental, stories render fine (8–33 KB). Worth mocking to reduce noise, but not a defect.
