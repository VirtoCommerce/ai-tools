# `/company/members` scrolls horizontally at 375 px — fixed-width status badge overflows the row `[P3]`

**Env:** vcptcore-qa @ Platform 3.1066.0, Theme 2.58.0-pr-2459-2f36 (B2B-store)
**Ref:** found during the VCST-5472 `/qa-test` run — **not caused by that change** (see Provenance)

## Summary

At a 375 px viewport the Company → Members page scrolls horizontally by 19 px, violating BL-UI-004 (content boundary). The member-row status badge is a fixed `w-20` (80 px) element whose wrapper adds `pr-3`, and together they exceed the width left in the mobile card row. Reproduced on two fresh loads; no other storefront table page overflows at the same viewport.

## Steps to Reproduce

1. Sign in as a member of a B2B organization (a company-orders permission is enough).
2. Set the viewport to **375 × 812**.
3. Navigate to `/company/members`.
4. Compare `document.documentElement.scrollWidth` with `document.documentElement.clientWidth` — or simply swipe the page sideways.

## Expected vs Actual

- **Expected:** no horizontal document scrolling at any supported viewport; the status badge wraps, truncates, or shrinks to fit (BL-UI-004).
- **Actual:** the document scrolls horizontally by 19 px.

```
clientWidth 360 · documentElement.scrollWidth 379 · overflow 19px
offender: div.py-4.5.pr-3      left 287.5 → right 379.5 (w 92)   text "Active"
  child:  div.w-20.rounded-sm.px-2.5.py-0.5.text-center.md:hidden.bg-success.text-additional-5
                               left 287.5 → right 367.5 (w 80)
both inside .vc-table__mobile
```

![Horizontal overflow at 375 px on /company/members](../screenshots/BUG-company-members-mobile-overflow-375.png)

## Provenance — not a VCST-5472 regression

VCST-5472 (`vc-frontend` PR #2459) touched only the **desktop** `<thead>` and the selection `<th>` inside `vc-table.vue`, plus that component's dark-theme SCSS. The offending markup is in the **mobile card branch** (`.vc-table__mobile`), rendered from the members page's own slot content — a code path the PR does not touch. The same mobile branch on `/account/orders`, `/account/quotes` and `/company/info` measures **0 overflow** on the identical build, which isolates the cause to this page's badge markup rather than to the shared component.

## Root Cause (suspected)

The badge is sized with a fixed Tailwind `w-20` rather than a content-driven max-width. Any row whose preceding columns consume enough width pushes the badge past the viewport edge; `pr-3` on the wrapper adds the final 12 px. A `max-w-full` + `truncate`, or dropping the fixed width in favour of intrinsic sizing, should resolve it.

## Business Rules

- **BL-UI-004** — Content boundary: horizontal scrolling on the document at any tested viewport (375/768/1024/1280/1920) is a bug unless the scrolling element is itself an intentional horizontal scroller. The document is the scroller here, not the table.

## Fix Routing

- **Repo:** vc-frontend
- **Kind:** frontend
- **Anchor:** the members-page mobile row template that renders the `w-20` status badge inside `.vc-table__mobile`
