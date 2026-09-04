# VCST-5671 — Fix Verification

**Ticket:** VCST-5671 · Bug · **High** · `[vc-shell] VcScheduler: "+N more" overflow popover is not keyboard/AT accessible`
**Fix:** vc-shell PR [#287](https://github.com/VirtoCommerce/vc-shell/pull/287) (`6e512da01`) + [#304](https://github.com/VirtoCommerce/vc-shell/pull/304) (`86def16e2`) — merged to `main` 2026-08-12 / 08-18
**Verdict: VERIFIED WITH NOTES** — 2026-08-25

## Env

Product is **`@vc-shell/framework`** (vc-shell — separate product, not the storefront). Affected 2.4.0, fixed **2.5.0**.
Source `main @ 324cd9b09` (= v2.5.0); live on hosted Storybook `assets/iframe-1uXuqCDm.js`, built 2026-08-19 10:28 GMT.
No linked fix PR was on the ticket — the two PRs were located from `main`'s history (`Closes VCST-5671`).

## Summary

The "+N more" overflow is now fully keyboard- and AT-operable: real `button` roles on the trigger and every entry,
`role="dialog"` + a localized accessible name on the panel, focus moved into the panel on open, and Escape returning
focus to the trigger. All six sub-checks pass live; RED→GREEN proven at unit level. One documentation defect remains —
see Notes.

## RED → GREEN (unit)

Same unmodified test files (`MonthMorePopover.test.ts`, `MonthWeekRow.test.ts`, `vc-popover.test.ts`), two sources:

| Phase | Source | Result |
|---|---|---|
| **RED** | `MonthMorePopover.vue` + `MonthWeekRow.vue` @ parent of #287; `vc-popover.vue` @ parent of #304 | **7 failed / 14 passed (21)** |
| **GREEN** | `main @ 324cd9b09` | **21 passed (21)** |

RED failures map 1:1 onto the ticket: `expected 'DIV' to be 'BUTTON'` (trigger not a control), `expected undefined to be 'dialog'` (no panel role), `expected [] to have a length of 2` and `Cannot call element on an empty DOMWrapper` (entries not buttons). Evidence: `evidence/red-prefix.txt`, `evidence/green-fixed.txt`.

## Live verification — hosted Storybook, story `data-display-vcscheduler--more-overflow`

| # | Check | Result | Evidence |
|---|---|---|---|
| a | "+N more" has role `button`, Tab-reachable | PASS | a11y tree `button "+1 more"`; 6th Tab stop; `BUTTON.vc-scheduler__more`, focus ring `outline: rgb(16,16,16) auto 1px` |
| b | Keyboard activation opens the popover | PASS | Enter opens; re-tested with Space — also opens |
| c | Panel has `role="dialog"` + non-empty accessible name | PASS | `div.vc-popover` `role="dialog"`, `aria-label="More events"` (localized, en+de) |
| d | Focus moves to the first event on open | PASS | `activeElement` = `BUTTON.vc-scheduler__more-popover-item`, name **"Summer Sale"** |
| e | Each entry is a focusable button | PASS | `button` × 4 (Summer Sale / Flash Deal / Loyalty Bonus / Clearance); Tab advances inside the panel |
| f | Escape closes **and** returns focus to the trigger | PASS | `.vc-popover` count 0; `activeElement` = `BUTTON.vc-scheduler__more` "+1 more" — not `<body>` |

Screenshots: `screenshots/5671-a-more-button-focused.png`, `screenshots/5671-bcde-popover-open-focus-first-event.png`.
Console: only the benign `vite-inject-mocker-entry.js` preload warning. Network: a `favicon.ico` 404 and one `ERR_ABORTED` on the preview bundle that succeeded on retry (200) — no functional failure.

## Notes (why WITH NOTES, not clean VERIFIED)

**Docs now contradict the code — P3, docs-only.** PR #287 rewrote `vc-scheduler.docs.md` §Accessibility to state the
overflow popover *"does **not** apply `role="dialog"` or trap focus"*. PR #304 then **added** `role="dialog"` +
`aria-label` at `MonthMorePopover.vue:8-9` and did not touch the docs (`git show --stat 86def16e2` lists no `docs.md`).
The line is false again — inverted from the original drift, but still wrong. This is precisely what the ticket's own
comment asked to be fixed ("so they don't keep asserting compliance that isn't there"). The *"or trap focus"* half is
still accurate: focus is moved, not trapped.

Suggested wording: the panel **does** carry `role="dialog"` and a localized accessible name, and moves focus in and
restores it on close; it does **not** trap focus, because `VcPopover` has no focus management of its own.

## Out of scope — filed separately

The ticket's comment also raised the **quick-info popover** (reachable but poor tab order, no focus management).
Confirmed still open: live a11y tree shows `role: null`, `aria-label: null`, and a source grep finds `role="dialog"`
only at the overflow call site. That is outside this ticket's STR and Expected, so it does not block this verdict —
filed as its own ticket and linked.

## Storefront rules deliberately NOT applied

vc-shell is a separate product: `BL-UI-*`, `critical-ui-scope.md`, `storefront-selectors.md` and the 123 regression
suites cover the storefront only — **none cover vc-shell**. Substituted: the component's own vitest suites, the live
a11y tree, and a real keyboard walk. Screen-reader announcement output was **not** verified (no NVDA/JAWS/VoiceOver in
the toolkit) — the AT claims rest on a11y-tree and attribute evidence.
