# Storefront field labels fail contrast (2.52:1) — neutral-400 on white

- **Severity:** Medium (BL-A11Y-003; WCAG 2.2 1.4.3)
- **Provenance:** OUT-OF-SCOPE / pre-existing design-system pattern — found on VCST-5883's return details page; **does not block VCST-5883** (a11y carve-out)
- **Environment:** vcptcore-qa1 · theme `2.59.0-pr-2500-9d19`
- **Found by:** `/qa-test VCST-5883` visual lane — Lighthouse `color-contrast`, 14 instances
- **Evidence:** `reports/tickets/Sprint26-19/VCST-5883/design-report.md` · `screenshots/4v-storefront-return-details-375.png`

## Expected

Normal-size text ≥ 4.5:1 against its background.

## Actual

Field labels rendered with `text-neutral-400` (`#a3a3a3`) on white measure **2.52:1** — on the return
details page: Status, Date, Order number, Reason for decline, Requested, Approved — at every viewport.
The values themselves (including the danger-coloured decline reason) pass.

## Note

The class is shared across account pages, so the fix belongs to the design-system token, not to the returns
module.
