# Compare v2 — four mobile presentation features from the description were not built — P2

## Status: FILED — VCST-5873
**Tracker:** [VCST-5873](https://virtocommerce.atlassian.net/browse/VCST-5873) — Sub-task of VCST-5735
**Found by:** VCST-5735 `/qa-test` FULL run · 5b verifier live probe (`playwright-edge`) · IN-SCOPE
**Archetype:** `FALLBACK`

**Severity:** P2 · **Type:** Incomplete delivery against the ticket description

**Env:** vcst-qa @ theme `2.57.0-pr-2452-d1e4-d1e45b04` (vc-frontend PR #2452, open), Platform `3.1063.0`.

## Summary
Four behaviours the ticket describes are **absent from the build**, not defective in it. They were
measured by DOM presence and computed style, not inferred from a diff. **The designs exist** — VCDZ-883
carries two mobile mockups at 393 px under a "Mobile version" heading, and that ticket is closed `Done`.

This is a scope report, not a defect report: nothing here is broken, it was not built.

## The four, each measured

| # | Description promise (bullet) | Live |
|---|---|---|
| 1 | mobile tooltips open as a **bottom sheet** (7) | The info trigger is **absent from the DOM at 375 px** — a page-wide search for the tip text returns nothing. No sheet is reachable because nothing opens one |
| 2 | **horizontal-scroll indicator** (peek/arrow) (9) | No arrow control. `background-image: none`, `mask-image: none`, zero content-bearing pseudo-elements on any `compare-*` element |
| 3 | **scroll-snap** (9) | Both scrollers report `scroll-snap-type: none`; zero descendants carry `scroll-snap-align` |
| 4 | **duplicate Add-to-cart CTA at the bottom** (9) | At 375 px with 4 products the table ends at `product_type`; the only cart buttons are in the top header row |

## Steps to Reproduce
1. Open `/compare` at **375 px** with 4 products in one category.
2. Look for an info/tooltip trigger on any row — there is none.
3. Inspect `.compare-table__scroll` computed style — `scroll-snap-type: none`, no indicator pseudo-element.
4. Scroll to the bottom of the table — no second Add-to-cart control.

## Expected vs Actual
- **Expected:** the four behaviours the description specifies, and which VCDZ-883 mocked up.
- **Actual:** none present. Bullet 9's fifth promise — the overflow (⋯) menu — is also absent and is
  tracked separately in `BUG-compare-secondary-actions-hidden-below-md.md`, because that one has a
  different cause: those controls **were** built and are CSS-hidden.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **FAIL** | DOM-presence and computed-style probes at 375 px |
| 2. Backend Admin | N/A | presentation only |
| 3. GraphQL xAPI | N/A | no request involved |
| 4. Platform REST API | N/A | as above |

**Owning layer:** Layer 1 — Storefront

## Why this is one report and not four
One missing body of work, one fix, one reviewer sizing it. **But the four are itemised above with their
own measurements deliberately** — four independent features behind one title is how three of them get
silently dropped when someone implements the fourth and closes the ticket.

It is kept **separate** from the hidden-controls bug for the opposite reason: that is one stylesheet rule
(a one-line fix), this is four implementation tasks. Merged, a reviewer cannot size either.

## Open question for product, not for QA
VCST-5735 reached READY FOR TEST with its acceptance-criteria field reading `1. No requirements.`, and
carries **zero comments** — so if these four were deliberately descoped, that decision left no trace
anywhere. The designs were produced and signed off. **Someone should confirm whether this is unfinished
work on this story or a scope split that was never written down** — if the latter, this belongs in its
own story rather than as a Sub-task implying the story failed to deliver it.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** `VirtoCommerce/vc-frontend`
- **repoKind:** frontend
- **Ownership hint:** platform (no `project-profile.json` — native deployment)
- **Component / module:** `client-app/shared/compare/components/compare-table.vue`
- **RCA anchor:** n/a — these are unimplemented features, not a faulty code site. `/qa-fix` Gate 0 should BAIL this as `not-a-bug` (scope, not defect) rather than attempt it
- **Routing confidence:** HIGH on the repo, N/A on the anchor
