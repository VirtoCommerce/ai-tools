# Storefront return details page shifts its layout as the decision content loads (CLS)

- **Severity:** Medium
- **Provenance:** IN-SCOPE (partly) — the page is VCST-5628's; VCST-5883 (vc-frontend PR #2500) adds the decline-reason blocks that enlarge the shift
- **Environment:** vcptcore-qa1 · theme `2.59.0-pr-2500-9d19`
- **Found by:** `/qa-test VCST-5883` — visual lane (Lighthouse) + orchestrator PerformanceObserver re-measure
- **Evidence:** `reports/tickets/Sprint26-19/VCST-5883/design-report.md` · `screenshots/4v-storefront-return-details-1440.png`

## Measured

| Page | CLS |
|---|---|
| `/account/returns/:id`, a **Requested** return (no decision content) | 0.084 |
| same page, a **PartiallyApproved** return with return + line decline reasons | 0.153 |
| same, Lighthouse (throttled) | 0.4375 |

## Expected

`BL-UI-001` layout stability — CLS under 0.1 on page load.

## Actual

The summary and items render, then the decline-reason blocks arrive and push the content down; the decided
return shifts about twice as much as an undecided one.

## Suggested direction

Reserve space for the reason blocks (skeleton / min-height) or render them with the rest of the return data.
