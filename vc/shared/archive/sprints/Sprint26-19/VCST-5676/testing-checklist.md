# VCST-5676 — Testing checklist (FAST, reproduce/characterize)

**Ticket:** [vc-shell] VcScheduler: quick-create/editor doesn't close after a successful save — repeated Save creates duplicate events
**Type × status:** Bug × To do → `not-fixed` → `feature-test` FAST (reproduce live, fresh evidence; next = `/vc-fix:qa-fix` only if it reproduces)
**Surface:** hosted Storybook `https://vc-shell-storybook.govirto.com/` → `data-display-vcscheduler--editing-flow` (preview iframe). vc-shell is a separate product — storefront `BL-UI-*`, selectors, suites and themes do not apply; no `config/test-suites.json` suite covers it.
**Build under test:** `iframe.html` 200, `last-modified` 2026-09-23 14:34 UTC; preview bundle `assets/iframe-BHhSTguc.js`; framework v2.6.0 (console banner); vc-shell `main` = `9977ed633` (2026-09-23 14:30 UTC). `VcScheduler.vue` history: `694fdf620` (#258), `30279bf52` (#289, dark-theme surface), `ffaac427c` (#364, comments) — none changes `onQuickSave`/`onEditorSave`.
**Expected {SPEC}:** `onQuickSave` always sets `quick.open = false` after emitting `event-create`; `onEditorSave` closes the modal in both branches (vc-shell `main` source). Docs (`vc-scheduler.docs.md` §Editing UX): single click = quick-create popover, double click / drag = editor modal, "More options" = modal carrying the title.
**Story fact:** EditingFlow keeps events in an in-memory `ref([])` that resets on every page load, so any duplicate pair must come from within ONE page load.

## Conditions — real-user input only (real pointer + keyboard; no synthetic `element.click()`, no eval)

| # | Condition | Verdict | Evidence |
|---|---|---|---|
| 1 | Build is complete: `iframe.html` present, EditingFlow renders in the preview iframe | PASS | iframe.html 200, story renders; only 404 is favicon.ico — the hollow-build theory does not apply to this build |
| 2 | Single click empty cell → type title → **Save button** → popover closes, exactly 1 event | PASS | closed, 1 (`vcst-5676-c2-after-save-closed.png`) |
| 3 | Single click empty cell → type title → **Enter** in title field → popover closes, exactly 1 event | PASS | closed, 1 |
| 4 | Double click empty cell → modal editor → title → Save → modal closes, exactly 1 event | PASS | closed, 1; no stray quick popover |
| 5 | Drag across empty cells → modal editor → Save → closes, 1 event | PASS | Jul 20→22 prefilled; closed, 1 spanning chip |
| 6 | Quick-create → "More options" → modal (title carried) → Save → closes, 1 event, no quick popover left behind | PASS | one modal, title carried; closed, 1 |
| 7 | Rapid double-press of Save / Enter+Save in one open popover → still exactly 1 event (double-submit, ECL-7.3 pattern by analogy) | **FAIL** | **Modal editor: double-press Save → modal closes, 2 identical events** — 4/4 (3 loads + toolbar modal). Quick popover double-press / Enter+Enter / Enter→Save → 1. (`vcst-5676-c7-modal-dblsave-duplicate.png`, `…-before-dblsave.png`, `…-after-dblsave.png`, `….gif`) |
| 8 | After each save, Escape and Cancel on a freshly opened editor close it (control); no stuck editor state reachable | PASS | Escape / Cancel / X close both surfaces; no stuck editor reachable after any save, including right after the duplicate |
| 9 | Toolbar "+ New event" → modal → Save → closes, 1 event | PASS | closed, 1 |
| 10 | Repeat 2–4 on 3 separate page loads (matches the report) | PASS | 1 event each, every load (`vcst-5676-c10-load3-final.png`) |
| 11 | Cross-engine: repeat 2–4 on Firefox | PASS (2–4) / FAIL reproduces | c2–c4 → 1 each; modal double-press Save → 2 (`vcst-5676-c11-firefox-dblsave-duplicate.png`) |
| 12 | Fast-typing variant: click a cell, type immediately, press Enter before the popover finishes its open transition | PASS | immediate type+Enter → 1. Limit: ~0.5 s per MCP call, so input *during* the open transition could not be forced |

## Result — 2026-09-23 (qa-testing-expert, playwright-chrome + playwright-firefox)

**PARTLY REPRODUCED.**

- **Reproduces (4/4, Chromium + Firefox):** double-pressing **Save in the modal editor** (opened by double-clicking an empty cell, or by toolbar "+ New event") closes the modal and creates **two identical events**. Source (`main`): `onEditorSave` emits `event-create` and then sets `editor.open = false` with no re-entry guard, so a second press landing before the popup unmounts emits again. The quick-create popover does not duplicate under the same input.
- **Does not reproduce:** the editor staying open after a save, and Escape / Cancel doing nothing. Paths excluded: quick Save, Enter, Enter+Enter, Enter→Save, double-press; modal Save, human-paced ×2, Enter; drag; More options; toolbar; switching cells while open; fast typing; 3 reloads; Firefox.
- Console: 0 errors during saves (Storybook noise only). Network: no chunk 404s.
- Incidental, not filed: focus is not returned to the opening cell after close (it lands on the document root); the modal's accessible name is "New event Close" because the Close button sits inside the heading that names it, and a second "New event" h3 appears in the body.
