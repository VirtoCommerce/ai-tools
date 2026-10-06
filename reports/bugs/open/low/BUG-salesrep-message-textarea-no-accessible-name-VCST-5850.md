# BUG: Message textarea has no accessible name in the Send a message and Share dialogs

**Severity:** Low · **Provenance:** OUT-OF-SCOPE (found while testing VCST-5850) · **Oracle:** BL-A11Y (WCAG 2.2 SC 1.3.1, 4.1.2)
**Env:** vcptcore-qa · theme 2.59.0-pr-2476-0abb · 2026-10-06 · found-by-agent, found-in-testing

## Steps
1. Sign in as a sales rep (`@td(SR_REP_PRIMARY)`), open Sales Rep hub → My customers → envelope on any row.
2. Inspect the accessibility tree of the *Send a message* modal.
3. Repeat in Lists → Share → Specific customers (Message (optional) field).

## Expected
The textarea is named by its visible label ("Message", "Message (optional)").

## Actual
The textarea is exposed as an unnamed `textbox`; Playwright resolves it only as `getByLabel('')`. The Title input in
the same modal is named correctly, so the label is not associated (missing `for`/`id` or `aria-labelledby`).

## Impact
Screen-reader users hear "edit text" with no purpose for the one required field of the form.
