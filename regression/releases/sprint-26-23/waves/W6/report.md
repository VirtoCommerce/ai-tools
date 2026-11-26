# W6 — UI kit, Bridge soft look, a11y & i18n · REG-2026-11-26-1415-W6

Owner Elena Kutasina · vcst · Platform 3.1101.0 · theme 2.63.0-alpha.2681 · persona set S4.

| Suite | Planned | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|---|
| 048c Layout stability | 49 | 39 | 7 | 3 | 0 |
| 046 Localization | 37 | 7 | 0 | 4 | 26 |
| 045 Accessibility | 32 | 2 | 0 | 8 | 22 |
| 071 White-labeling branding | 18 | 1 | 0 | 0 | 17 |
| 070 White-labeling storefront | 51 | 0 | 0 | 0 | 51 |

**116 cases are `Automation_Status = Manual` and were recorded SKIPPED, not run** (070 all 51, 046 26, 045 22, 071 17). Whether to drive them is an owner decision.

## Before triage (owner) — 22 FAIL/BLOCKED without a ledger row
- **048c layout (7 fail):** CLS 0.396 on initial render (CLS-001), 0.186 (CLS-002), dashboard 0.111 shifted by the reporting chart; store logo SVG without dimensions (IMG-001); touch targets too close at 375 px (TGT-001, COMP-HEADER-003); horizontal scroll in `de` at 320 px (STR-001). Pre-existing or new — not decided.
- **Blocked:** 048c VCINPUT-002 / VCBUTTON-005/006 (locator / Storybook timeouts); 046 L10N-002/003/004/006 (fixture drift); 045 — S4 personas have no addresses, wishlists or orders, variant-picker PDP not seeded.
- **Stale text:** 046 L10N-001 (category segment differs per culture), ROUTE-001/002 (seeded slug absent), language selector has en-GB and en-US.
- **To investigate:** `/api/files/*_sm` PDP images 404 (046); in de-DE the slug of the Affligem Dubbel bottle resolves to the 30 L keg product.
- **Lane:** playwright-firefox could not start (expected firefox-1549 build missing); 071 ran on chrome. The firefox MCP server needs a restart.
