# VCST-4892 — VcDateInput / VcCalendar / VcDatePicker — Storybook Execution Report

**Date:** 2026-05-22 | **Agent:** ui-ux-expert (retry) | **Browser:** Chrome DevTools MCP  
**Build:** `iframe-5Gno_YKX.js` on `vcst-qa-storybook.govirto.com` | **PR:** vc-frontend#2291

---

## Environment

| Host | Status |
|------|--------|
| `vcst-qa-storybook.govirto.com` | Index loads (34 date entries confirmed), canvas **BLOCKED** — Apollo crash on every story |
| `vcst-dev-storybook.govirto.com` | PR #2291 components absent (`NoStoryMatchError` for all date IDs) |

---

## BLOCKER — Sitewide Story Render Failure (Confirmed Real)

**All stories on the QA Storybook fail to render.** The preview iframe is permanently stuck in `sb-preparing-story` state. Tested: VcCalendar/Default, VcDateInput/Default, VcDatePicker/Default, VcDateSelector/Basic, VcButton/Primary — same failure on all.

**Console error on every story load:**

```
Uncaught Error: Apollo client with id default not found.
Use an app.runWithContext() or provideApolloClient() if you are outside of a component setup.
Stack: vite-inject-mocker-entry.js:1717:15869 → iframe-5Gno_YKX.js:2:159674
```

**Root cause (precise):** `vite-inject-mocker-entry.js` (Vite MSW mock injector, part of the Storybook build) executes `useApolloClient()` at module initialization time — synchronously, before the Vue app context is available. The uncaught error aborts Storybook's preview initialization pipeline. `#storybook-root` remains empty; `sb-preparing-story` never resolves.

**Scope:** System-wide — not specific to date components. VcButton also fails identically. The issue is in the Storybook build configuration, not in the date picker components themselves.

**Evidence:**
- `screenshots/storybook/vcdateinput-default-apollo-error.png` — VcDateInput/Default blocked + console error
- `screenshots/storybook/storybook-system-wide-blocked.png` — VcCalendar main app view, loading forever
- `screenshots/storybook/storybook-loading-forever-vccalendar.png` — "Content is loading..." indefinitely
- `screenshots/storybook/vcdateselector-basic-blocked.png` — VcDateSelector/Basic also blocked

**Suggested fix:** In `.storybook/preview.ts`, wrap Apollo client provision in a decorator's `setup()` using `app.runWithContext()`, or call `provideApolloClient(client)` before any composable invokes `useApolloClient()`.

---

## Story Index — PASS

Index confirmed via `/index.json` (v5, 733 total entries):

| Component | Stories in index |
|-----------|-----------------|
| VcDateInput | 18 (default + 17 variants incl. locale-ru, locale-ja, locale-en-us) |
| VcCalendar | 13 (default + 12 variants incl. locale-ru, locale-ja) |
| VcDatePicker | 16 (default + 15 variants incl. locale-ja, close-on-select-false, enabled-teleport) |
| VcDateSelector (deprecated) | 7 (basic + 6 variants) |

All 54 story IDs from `storybook-story-ids.md` verified present in the index.

---

## Checklist Results — Sections A, B, C, E, F, G

**65 items — all BLOCKED.** No story canvas renders; interactive testing, ARIA inspection, event capture, and visual assertions are not possible.

| Section | P0 | P1 | P2 | Result |
|---------|----|----|-----|--------|
| A — VcDateInput (15) | 5 | 7 | 3 | BLOCKED |
| B — VcCalendar (15) | 2 | 10 | 3 | BLOCKED |
| C — VcDatePicker (18) | 3 | 11 | 4 | BLOCKED |
| E — Accessibility (10) | 3 | 6 | 1 | BLOCKED |
| F — VcDateSelector deprecation (3) | 0 | 2 | 1 | BLOCKED |
| G — i18n gaps (4) | 1 | 3 | 0 | BLOCKED |

**Partial index observation (F-1):** Storybook sidebar labels VcDateSelector as "Deprecated" — static sidebar renders correctly.  
**Partial index observation (G-1):** `locale-ru` stories exist in index for both VcDateInput and VcCalendar — cannot verify runtime rendering.

---

## Bug Stubs

### BUG-1 — Sitewide Storybook Story Render Failure (Apollo Client Context Error)

**Severity: P0 — Blocker** | **Component:** Storybook build config (`.storybook/preview.ts` / `vite-inject-mocker-entry.js`)  
**Repro:** Navigate to any story on `vcst-qa-storybook.govirto.com` → canvas shows infinite spinner.  
**Console:** `Uncaught Error: Apollo client with id default not found` — stack in `vite-inject-mocker-entry.js:1717` calling into `iframe-5Gno_YKX.js`.  
**Scope:** ALL 733 stories blocked, not just date components.  
**Evidence:** `screenshots/storybook/vcdateinput-default-apollo-error.png`

---

## Quality Gate

**Items run: 65 | PASS: 0 | BLOCKED: 65 | P0 pass rate: 0 / 14**  
**Status: BLOCKED** — cannot proceed until BUG-1 is resolved and a fixed Storybook build is deployed.  
**Recommendation:** Re-run this checklist against the fixed build before merging PR #2291.
