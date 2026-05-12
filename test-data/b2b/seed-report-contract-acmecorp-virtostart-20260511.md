# Contract Seed — Org-AcmeCorp on VirtoStart

**Platform:** https://virtostart-demo-admin.govirto.com
**Store:** B2B-store
**Contract:** Contract-AcmeCorp-2026
**Pricelist ID:** `97b7f4bb-34e1-4260-8f77-1dee1daa403b`
**Assignment ID:** `0401570d-52af-48c2-9a0c-8dba60a6d4ea`
**Currency:** USD
**Flat discount:** 10% off list
**User group:** `contract-acmecorp-2026`
**Org:** Org-AcmeCorp (`8a64d782-d3f5-4f3f-835a-525b8b41b496`)
**Date:** 2026-05-11T14:50:02.513Z

## Note — Contract module status

`VirtoCommerce.Contract` module is **not installed** on virtostart (`/docs/VirtoCommerce.Contract/swagger.json` returns 404). Contract pricing is therefore modeled via the canonical native pattern:

1. **Pricelist** holds the negotiated prices
2. **PricelistAssignment** targets buyers via `UserGroupsContainsCondition`
3. **Member.groups** on Org-AcmeCorp carries the user-group tag so org members inherit it

This matches the existing "Contract-New contract-BeerUSD" precedent on virtostart.

## Pricing

| SKU | Product | List | Contract sale | Saving |
|-----|---------|-----:|--------------:|-------:|
| `AYB-04369900` | TOUGHBOOK 40 mk2 | $2259.00 | $2033.10 | $225.90 |
| `SYU-76371555` | MacBook Pro 2023 Touchbar | $1200.00 | $1080.00 | $120.00 |
| `JPJ-30487565` | iPhone 16 Pro | $999.00 | $899.10 | $99.90 |
| `553390824` | LG EG9600 65" 4K TV | $600.00 | $540.00 | $60.00 |
| `566903892` | Canon Imageclass MF232W | $189.00 | $170.10 | $18.90 |

## Org groups change

Before: `["Premium Customers","contract-acmecorp-2026","B2B-store"]`
After:  `["Premium Customers","contract-acmecorp-2026","B2B-store"]`

## Demo angle

Backs **Demo 4b** ("Global Margin & Pricing Optimization"): when John signs in and views any of the 5 contract SKUs, the storefront xAPI pricing evaluator returns the contract sale price instead of list — visible via strike-through pricing on PDP / cart and reflected in fresh quote line items.

## Verify

```bash
# Storefront xAPI as John (storefront-side):
# Sign in to https://virtostart-demo-store.govirto.com as test-john.mitchell-20260508@test-agent.com / TestPass123!
# Open the LG TV PDP — should now show $540 (was $600).
# Or run a probe query (admin) — should return list+sale for the 5 SKUs:
curl -X POST "$BACK_URL/api/pricing/evaluate" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"storeId":"B2B-store","userGroups":["contract-acmecorp-2026"],"productIds":["202d4ea3-f167-4523-9f50-289f3b6d6af6"]}'
```