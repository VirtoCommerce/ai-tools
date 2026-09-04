# VCST-5802 — Fix Verification (Phase B / GREEN)

**Verdict: VERIFIED_WITH_NOTES** · vc-shell hosted Storybook, framework **2.6.0-rc.0**, preview bundle `assets/iframe-CYJDt9Tz.js`, Light theme, `playwright-chrome`, 2026-09-02.

The quick-info popover now exposes `role="dialog"` with the event title as its accessible name, moves focus to its close control on open, and returns focus to the originating chip on close — confirmed on 4 distinct events across 3 consecutive reps. The subtle case matters most and passes: when the user has moved focus out of the panel, closing it leaves focus where the user put it instead of reclaiming it. Two items are not PASS: the untitled-event fallback is unreachable through the deployed stories (**NOT-RUN**, unit-covered by the requester), and item 8's expected accessible name was mis-stated in the brief — the overflow popover is not regressed, but its name is `"More events"`, not the formatted date.

## Product-scope substitutions (vc-shell ≠ storefront)

`BL-UI-*`, `critical-ui-scope.md`, `storefront-selectors.md` and `config/test-suites.json` do not cover vc-shell and are **not cited**. `BL-A11Y-001`/`-003` are scoped by their own text to the accessibility-gated storefront themes → inapplicable. Substituted oracles: **WCAG 4.1.2 Name/Role/Value** (primary) + **1.3.1**, the **PR #350 documented contract**, and `BL-A11Y-002`/`BL-A11Y-004` **by analogy only** — both are stated product-neutrally but all their `Source`/`Suite coverage` evidence is storefront (`client-app/`, suite `045`), so they are not validated vc-shell invariants. Location was by role + accessible name and `.vc-*` BEM; no `data-test-id`. Themes here are Light/Dark/Green — Light (default) used.

## Instrument calibration (done before any verdict)

`[active]` **moved on demand**: no match → `button "New event" [active]` → `button "Previous" [active]` across two Tab presses. Instrument live; downstream focus readings are trustworthy. `browser_evaluate` was used **only** for the allowlisted scoped `axe.run(selector)`; no `document.activeElement` read, no `@allow-eval`.

## Checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Quick-info exposes `role="dialog"` | **PASS** | a11y tree node `dialog` on all 4 events (was `role: null`) |
| 2 | Accessible name = event title | **PASS** | `dialog "Flash Deal"` · `"Summer Sale"` · `"Loyalty pricing review"` · `"Back to School Promo"` — tracks the opener, not a constant |
| 3 | Focus moves to close control on open | **PASS** | `button "Close" [active]` immediately after each open (3/3 reps) |
| 4 | Focus returns to the chip on close | **PASS** | Escape→`e92`; Close-button→`e87`; Escape→`f25e155`. Restored to the *exact* opener — `e87`, not the sibling `e59` Summer Sale segment |
| 5 | Named dialog, not merely focusable | **PASS** | role + name both present; item 1 & 2 are the discriminators, not focusability |
| 6 | Untitled event → name "Event details" | **NOT-RUN** | Unreachable via UI — see Findings F1. Not assumed to work |
| 7 | "User moved on" — focus not reclaimed | **PASS** | Panel open, Shift+Tab parked focus on `e154` "Back to School Promo" *outside* the panel; Escape → focus **stayed on `e154`**, not yanked to the `e92` opener. Corroborated by the body-focus variant (Tab past document end → Escape → no focus reclaim) |
| 8 | VCST-5671 overflow not regressed | **PASS (expectation corrected)** | `dialog "More events"`, focus entered first list item, Escape → focus back to the exact `+1 more` opener `f4e80`. See F2 — name is `"More events"`, not the date |
| 9 | Quick-create: dialog + "New event" + title focus | **PASS** | `dialog "New event"`, `textbox "Title" [active]` on open |
| 10 | Escape closes; still no trap | **PASS** | Escape closed from inside the panel, from the footer, and from `body`; Tab escaped the panel freely (no trap added) |
| 11 | Edit/Delete still Tab-reachable | **PASS** | Close → `Delete [active]` → `Edit [active]` in order |
| 12 | No new console errors | **PASS** | 0 errors across the run; sole error is a pre-existing `favicon.ico` 404 (benign) |
| 13 | Story render/runtime sweep | **PASS** | All **22** non-docs `VcScheduler` stories navigated, 0 render/runtime errors, non-empty renders |
| 14 | axe-core scan | **PASS (non-regression only)** | axe **4.11.3** loaded (no CSP block); scoped `axe.run('.vc-popover')` → **0 violations, 0 incomplete, 14 rule-passes**. **Explicitly non-discriminating for this defect** — see F3 |

## Findings

**F1 — Item 6 unreachable through the deployed UI (NOT-RUN, not a failure).** Every create path enforces a non-empty title, so no untitled event can be produced as a real user: quick-create's Save renders `[disabled]` on an empty title (observed live); the editor modal's Save is gated by the same `title.trim().length > 0`; and the `EmitMode` story — the documented empty-title create path — produced **no** rendered event on either single- or double-click (the cell took focus, the grid stayed empty). No story fixture ships an event with an empty title. The requester's RED-A already covers this case at unit level (`names the panel generically when the event has no title` failed pre-fix, passes post-fix), so the fallback is unit-verified but **browser-unverified**. Injecting an untitled event would have required bypassing the UI and is out of bounds.

**F2 — Item 8's expected value was mis-stated in the brief; behaviour is correct and unregressed.** The overflow popover's accessible name is the localized `"More events"`, not the formatted date; the date (`July 15th, 2026`) is the *visible* header title, which `aria-label` overrides for naming. This is **pre-existing VCST-5671 behaviour, not a #350 regression**: `_internal/month/` is byte-identical to `#349` in the local clone (`git diff --numstat` empty) and `MORE_EVENTS: "More events"` already exists in `en.json` at `#349`. The panel is correctly named either way, so this is a documentation correction, not a defect.

**F3 — axe's clean result is not evidence for this fix.** As the ticket anticipated, axe cannot see a missing role on an element with no interactive semantics to contradict, nor a focus transition that never happens; the pre-fix bare `div.vc-popover` would very likely have scanned equally clean. Treat item 14 strictly as non-regression cover for *other* violation classes. Also outside what axe can conclude: five of the six WCAG 2.2 additions — **2.4.11, 2.5.7, 3.2.6, 3.3.7, 3.3.8**.

**No AT pass was run.** No NVDA/JAWS/VoiceOver is available in this toolkit, so nothing here claims screen-reader coverage — only that role and name are correctly exposed in the a11y tree.

**Incidental (described, not filed):**
- **I1 — quick-create loses the user's place on close.** Escape from the quick-create popover leaves no focused element (`[active]` absent) because its opener is a non-focusable day cell. Not a #350 regression (pre-fix quick-create had no focus management at all), but a keyboard user who opens it from a cell is dropped to `body`.
- **I2 — `Loading` story nests ~40 `role="status"` live regions inside an outer `status "Loading events…"`.** A nested live-region cascade is a plausible screen-reader announcement storm. Unverified without an AT pass; outside this ticket.

**Local-clone caveat (no action taken).** `.fix-workspace/vc-shell` is currently in the **pre-#350 state** for the month popovers — `MonthEventPopover.vue` carries no `role`/`aria-label` and `EVENT_DETAILS` is absent from `en.json`. It was read strictly read-only and was **not** treated as the oracle; the deployed bundle was. Nothing in that tree was modified.
