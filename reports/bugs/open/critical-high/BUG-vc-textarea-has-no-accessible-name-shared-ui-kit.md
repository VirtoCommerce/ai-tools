# BUG: `vc-textarea` has NO accessible name — two independent defects in the shared UI kit

## Status: CONFIRMED · re-verified against current head 2026-09-21
**Severity: High** (P1) · **every textarea in the storefront** is affected, not only the surface it was
found on. A form field with no accessible name is unusable by a screen-reader user.
**Found by:** `/qa-test VCST-5732` (2026-09-18 round, re-confirmed 2026-09-21) · **deferred by the
developer to a shared-UI-kit ticket, deliberately and correctly** — a storefront-wide component change
should not ride in a feature PR.
**Archetype:** `RENDER` (accessible-name computation)

**Env:** vcptcore-qa @ theme `2.58.0-pr-2464-2971-2971a77b` · `playwright-edge` · re-checked in **both**
the New Task and Edit Task modals.

## Why this report exists
The developer's 2026-09-18 answer named this **"the highest severity on the list"** and asked for it to be
re-verified against current head before anyone picked it up, because VCST-5653's focus-ring work merged
after the original run. **Re-verified: unchanged, still failing, in both modals.**

## Expected vs Actual
- **Expected:** the Notes textarea's accessible name is "Notes" (the visible label sits directly above it).
- **Actual:** the textarea has **no accessible name at all**. The accessibility tree renders it as a bare
  `textbox` with no name — contrast the sibling Title field, which correctly renders `textbox "Title"`.

## Root cause — two bugs stacked, per the developer's own diagnosis
1. `aria-labelledby` on the textarea points at **the textarea's own id** (a self-reference, which the
   accessible-name computation discards).
2. The label component is handed `for` while its prop is **`forId`**, so `VcLabel` renders a **`<div>`**
   instead of a `<label>` — there is no label element to associate with in the first place.

**This is not fixable from a consumer.** The self-reference outranks any `aria-label` a calling component
could pass in, which is why the feature PR could not work around it.

The original QA observation and the developer's diagnosis agree exactly, from opposite directions: QA
reported *"there is no `<label>` at all"* and *"name computation falls through to the placeholder"*; the
developer found the `for`/`forId` mismatch that causes it.

## Steps to Reproduce
1. Sign in as a sales rep → `/company/calendar` → **Add task** (and separately, **Edit** any task).
2. Inspect the Notes textarea in the accessibility tree, or read the form with a screen reader.
3. Compare with the Title input in the same modal, which has a correct name.

## Recommended fix
In `vc-textarea`: fix `VcLabel`'s `for`/`forId` prop resolution so a real `<label for>` is rendered, **or**
point `aria-labelledby` at the rendered label's actual DOM id. Then re-check every textarea consumer —
this component is storefront-wide.

## Related — the same ticket's calendar cluster
`D8` / `D14` / `D16` are the other three deferred UI-kit items and live in **`vc-calendar`**, not here:
`BUG-vc-calendar-grid-aria-application-role-and-focus-cluster.md`. The developer grouped all four as
"shared UI kit"; they are two components and two fixes.

## Business rule
`WCAG 3.3.2` (labels or instructions) · `WCAG 4.1.2` (name, role, value) · `BL-A11Y-*`.

## Provenance
**PRE-EXISTING on the shared component**, surfaced by VCST-5732. Per `close-out.md` §5-verdict.2 it is
filed as its own ticket at its own severity and does **not** fail VCST-5732's verdict.

## Fix Routing
`vc-frontend` — the in-repo Vue UI kit (`vc-textarea` + `VcLabel`). Single repo. **Reach exceeds the
diff:** already-shipped consumers across the storefront depend on this component, so the fix wants a
deliberate `/qa-regression` pass over the forms that use it, not just this feature's surface.

## Evidence
Accessibility-tree reads of both modals, 2026-09-21 (visual lane). Note that **axe-core does not catch
this class**: a non-empty but *wrong* accessible name satisfies both axe and Lighthouse, and on the prior
round axe returned zero violations while this and ten other genuine AA failures were live.
