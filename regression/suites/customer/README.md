# Customer-Authored Suites

This directory is **yours**. Put suites you write for your storefront's custom features here. The plugin auto-discovers any `.csv` file registered in `config/test-suites.json` regardless of where it lives — `customer/` is the canonical home so plugin updates never overwrite your work.

## Why this is a separate dir

- **Plugin updates won't touch it.** Everything under `regression/suites/Frontend/` and `Backend/` may be modified by plugin minor releases. `customer/` is yours forever.
- **Convention for review.** When VC support helps you triage, "is this in `customer/`?" is the first question they'll ask — bug in your suite vs bug in the plugin.
- **Easy bulk operations.** Selections like `"customer-only": { "where": { "tag": "customer-authored" } }` work because everything here tags itself.

## How to start

1. Read [`../../docs/test-authoring.md`](../../../docs/test-authoring.md) — the customer-side suite-writing guide.
2. Clone the closest shipped suite as a starting pattern:
   ```bash
   cp ../Frontend/checkout/011-checkout-flow.csv ./checkout/100-my-custom-checkout.csv
   ```
3. Edit:
   - Suite IDs (start at `100+` to avoid collision with shipped suites at `001-080`)
   - Aliases (use `@td(MY_CUSTOM_ENTITY.field)` — add entries to `test-data/aliases.json`)
   - Steps + Assertions to match your custom behavior
   - Tags: include `"customer-authored"` and any module-specific tags
4. Register in `config/test-suites.json`:
   ```json
   {
     "id": "100",
     "name": "My Custom Checkout",
     "file": "regression/suites/customer/checkout/100-my-custom-checkout.csv",
     "domain": "purchase-flow",
     "layer": "frontend",
     "concern": "functional",
     "priority": "P1",
     "testCount": 10,
     "estimatedMinutes": 7,
     "agent": "qa-frontend-expert",
     "tags": ["customer-authored", "myco", "checkout"],
     "envRiskGate": "staging"
   }
   ```
5. Validate: `npm run suites:lint && npx tsx scripts/validate-td-refs.ts`.
6. Run: `npx tsx ci/run-regression.ts -- 100`.
7. Iterate.

## Suggested layout

```
regression/suites/customer/
├── modules/              ← suites for your custom VC modules
│   └── <module-name>/
├── checkout/             ← customizations to the checkout flow
├── ui/                   ← branded theme assertions
├── integrations/         ← custom payment processors, ERP sync, etc.
├── business-logic/       ← your custom BL invariants (BL-{YOUR-CO}-*)
└── README.md             ← this file
```

Sub-folder names don't matter — they're for your team's organization. The orchestrator finds suites by the `file` path in the manifest.

## Conventions to follow (matches shipped suites)

- **15-column Enriched CSV format** — same as shipped suites. Spec: [`../../../.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md`](../../../.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md).
- **`@td()` for all data** — no hardcoded IDs/SKUs/emails/orgs. See [`../../../.claude/rules/test-data.md`](../../../.claude/rules/test-data.md).
- **Namespace your BL IDs** — `BL-{YOUR-CO}-{DOMAIN}-{NNN}` so they don't collide with VC's `BL-{DOMAIN}-{NNN}`.
- **Tag with `customer-authored`** — makes bulk-running easy.
- **Tag with `requiresModules`, `storefrontProfile`, `paymentProcessors`, `envRiskGate`** — same multi-env aware filters apply to your suites as to shipped ones.

## What NOT to do

- Don't modify shipped suites under `regression/suites/Frontend/` or `Backend/` — plugin updates will overwrite. If a shipped suite is wrong for your deployment, copy it into `customer/` and adapt the copy.
- Don't reuse VC's BL IDs (`BL-CART-001` etc.) for your own invariants — namespace yours.
- Don't commit credentials or PII into your suite CSVs. Use `@td(ALIAS.email)` referring to `aliases.json` (or `aliases.${TEST_ENV}.json` for env-specific overrides).
- Don't skip the `Failure_Signals` column — it's what the agent uses to know when to call FAIL vs AMBIGUOUS.

## Need help?

- Full guide: [`../../../docs/test-authoring.md`](../../../docs/test-authoring.md)
- Stability promise: [`../../../docs/versioning.md`](../../../docs/versioning.md)
- Support runbook: [`../../../docs/support-runbook.md`](../../../docs/support-runbook.md)
- Plugin source: https://github.com/VirtoCommerce/vc-mcp-testing-module
