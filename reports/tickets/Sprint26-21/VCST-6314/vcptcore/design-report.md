# VCST-6314 visual lane (4v) - design report

qa-design skill: loaded (+ qa-accessibility). Executor: ui-ux-expert on `playwright-mobile` (isolated, --secrets). Env vcptcore-qa. Build SalesRep 3.1016.0-pr-26-92d4, theme 2.61.0-pr-2597. Signed in as SR_REP_PRIMARY (one sign-in, success). Target: AcmeCorp customer page -> Quick actions -> Schedule call; never saved (Cancel / Escape). No 404 on plugin chunks.
History: attempt 1 on Chrome DevTools MCP was SKIPPED (profile signed out, no --secrets, no auth path). This is attempt 2.

| Axis | Verdict |
|---|---|
| V-1 popup 1440 / 390 | PASS (BL-UI-001..005); BL-UI-006 advisory Low (below) |
| V-2 keyboard + a11y + axe | PASS, no new defect (known VCST-6459/5713/6460/6466/6464 not re-filed) |
| V-3 call line legibility | PARTIAL: no call-type row reachable; known VCST-6456 only, not shown worse |
| V-4 vs. DESIGN | SKIPPED - PNG mockup only, no Claude Design project; mockup diffs are advisory (PO questions already carried) |

## V-1 layout (measured via getBoundingClientRect)
- 1440x900: dialog panel y 92..808 inside viewport, no document horizontal scroll (scrollWidth 1440). Content 462..978 (516 wide), fields 36 px high. Due date (466,366,204x36) and Time (732,366,204x36) share top and height: aligned, 62 px gutter. Cancel/Save 128x43 each, same top (749). Evidence `4v-popup-1440.png`.
- Time list: 96 options, listbox 250x192 at y 410..602, `overflow-y:auto` (scrollHeight 3532), inside viewport at both widths, no clipping. `4v-time-list-1440.png`, `4v-time-list-390.png`.
- 390x844: dialog becomes full-screen sheet (0,0,390x844); no element crosses the viewport edge, scrollWidth 390; Cancel/Save 161x43 side by side (bottom 828 < 844). Due date and Time stack full width (297 each), the Due date/Time pair is not side by side on mobile - by design of the breakpoint, no clipping. `4v-popup-390.png`.
- Touch targets at 390: inputs 36 px high, Close 68x68, dropdown toggles 38x38 (>=24). **Add to calendar** checkbox labels are 131x20 and 123x20 (height 20 < 24, BL-UI-006 strict). WCAG 2.5.8 is still met by the spacing exception (24 px circles do not intersect another target; nearest target 24 px away). Advisory Low, a UI-kit VcCheckbox pattern, not specific to this ticket, not filed.

## V-2 keyboard + a11y
- Tile is a real `<button>`, reached by Tab (about 33 stops from the breadcrumb, i.e. late in the order, same as any right-rail control), 1.6 px solid outline, offset 1.6 px. Enter opens; focus lands on Title input inside the dialog.
- Dialog: `role=dialog aria-modal=true aria-labelledby=<title heading>`. Trap holds both directions: Shift+Tab from Title wraps to Cancel (disabled Save skipped), Tab from Cancel wraps to Close.
- Escape with the Time list open closes the list only (aria-expanded false), second Escape closes the dialog and focus returns to the Schedule call tile (BUTTON, same rect). Correct layered behaviour.
- Names: Title*, Customer, Due date*, Time*, Priority, Notes all have programmatic labels (label[for]); Time/Priority/Customer carry aria-describedby; the "Add to calendar" group is a `<fieldset>` with that legend; Google/Apple checkboxes are labelled; Clear / Toggle dropdown / Open calendar / Close have names. Cancel and Save carry visible text.
- axe-core 4.10.2 on the open dialog (wcag2a/aa, 21a/aa, 22aa): 0 violations. 1 incomplete: color-contrast on the Notes textarea (placeholder over white) - needs manual check, not claimed clean.
- Not verifiable here: screen-reader output, 2.4.11 against a sticky header was not triggered (modal covers page), 3.3.8/3.3.7 n/a.
- Known, observed only, not re-filed: dropdown toggles open on focus (VCST-6459), Save disabled while empty; focus ring 1.6 px (VCST-6460 contrast already known).

## V-3 call line
- `/company/tasks` at 390: no horizontal scroll (390/390); seeded tasks wrap title and "Due ... - category" line fully, nothing truncated. The account has no Call-type row (seeded "callback" tasks are plain type), so the call line format could not be reproduced on that page. Dashboard widget at 390 had not rendered rows when probed. Only evidence of the truncated call line remains the discovery crop `3x-dashboard-widget-call-row.png` ("Due Oct 28, 2026, 4:45 PM - AGENT-..."), consistent with known VCST-6456, not worse. Re-check after creating a call task (save was forbidden here).

## New defects
None filed or proposed beyond the Low advisory above (checkbox label 20 px high at 390).
Precedence note: no spec/invariant conflict, no AMBIGUOUS.
