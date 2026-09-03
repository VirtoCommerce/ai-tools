# Compare v2 — booleans render icon AND text, and the negative glyph is a cross not a minus — P3

## Status: CONFIRMED
**Found by:** VCST-5735 `/qa-test` FULL run · 5b verifier live probe · IN-SCOPE
**Archetype:** `RENDER`

**Severity:** Low/P3 · **Type:** Design drift · **BELOW the 5d severity floor — not filed to the tracker**

**Env:** vcst-qa @ theme `2.57.0-pr-2452-d1e4-d1e45b04` (PR #2452, open), Platform `3.1063.0`.

## Summary
Bullet 10 asks for "Yes/No shown as check / minus icons **rather than text**". The build ships the icon
**and** the literal text (`✓ Yes` / `✕ No`), and the negative glyph is a **cross**, not the specified minus.

## Expected vs Actual
- **Expected:** a check or minus glyph in place of the words.
- **Actual:** `<icon> Yes` / `<icon> No` — both — with `x` where `minus` was specified.

## Why this is Low and why it is recorded anyway
Nothing is unreadable or unreachable; a customer sees the correct value either way. It is graded P3 and
therefore **not filed** under the 5d floor. It is written down because on a run whose durable record is
the checklist, a finding that appears in neither a ticket nor a draft has been *deleted*, not deprioritised.

Worth noting for whoever fixes it: keeping the text is arguably **better** than the spec. A peer session
verified the icons carry `aria-hidden` and the literal text is what reaches assistive technology — so
removing the text to match the spec would create a WCAG 1.1.1 defect. **Do not "fix" this by deleting the
text.** The defensible change is the glyph only.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront · **repoKind:** frontend · **Repo:** `VirtoCommerce/vc-frontend`
- **Component:** `client-app/shared/compare/components/compare-table.vue` (boolean cell renderer)
- **Routing confidence:** HIGH
