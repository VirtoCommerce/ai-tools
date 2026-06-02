# Alias Applicability Audit — 2026-06-02

> Classifies all 211 aliases in `test-data/aliases.json` as either `template` (universal pattern customer needs) or `vcst-data` (vcst's seeded values; customer replaces wholesale).

## Summary

| Classification | Count | % |
|----------------|-------|---|
| **template** — universal alias name + structure, customer fills values | 7 | 3.3% |
| **vcst-data** — vcst-seeded entities, customer replaces with their own | 204 | 96.7% |
| **Total** | 211 | 100% |

## Template aliases (universal — customer needs equivalents)

These represent universal concepts every VC customer needs. The current values in `aliases.json` are vcst's; the alias NAMES + STRUCTURE are the customer-facing contract.

| Alias key | Rationale |
|-----------|-----------|
| `VIRTUAL_CATALOG_B2B` | Generic alias name — universal pattern. Customer overrides values; alias key + structure stays. |
| `AGENT_POOL_SLOT_1` | Generic alias name — universal pattern. Customer overrides values; alias key + structure stays. |
| `AGENT_POOL_SLOT_2` | Generic alias name — universal pattern. Customer overrides values; alias key + structure stays. |
| `AGENT_POOL_SLOT_3` | Generic alias name — universal pattern. Customer overrides values; alias key + structure stays. |
| `ADMIN_ROLE_TESTER` | Generic alias name — universal pattern. Customer overrides values; alias key + structure stays. |
| `ADMIN_ROLES_COMMON` | Generic alias name — universal pattern. Customer overrides values; alias key + structure stays. |
| `ADMIN_USER` | Generic alias name — universal pattern. Customer overrides values; alias key + structure stays. |

## Gaps in templates/aliases.json.template

Aliases that are classified as `template` but **not yet present in `templates/aliases.json.template`**. These should be added so customers see the full pattern when they install:

(none — template file is in sync with the classification)

Extra in templates/aliases.json.template (not in main aliases.json, may be aspirational):

- `TEST_CATALOG_ROOT`
- `TEST_STORE`
- `TEST_PRODUCT_SIMPLE`
- `TEST_PRODUCT_CONFIGURABLE`
- `TEST_USER_B2C`
- `TEST_ORG_PRIMARY`
- `TEST_ADDRESS_DOMESTIC`
- `TEST_COUPON_VALID`

## vcst-data aliases (204 entries)

These are vcst's seeded entity references. Customer's deployment has different products / orgs / users / groups, so customers fork the entire `aliases.json` and replace these wholesale. Categorized for readability:

### Configurable products (CFG_*) (33)

- `CFG_LAPTOP`
- `CFG_RING`
- `CFG_GIFTBOX`
- `CFG_HOODIE`
- `CFG_CONDITIONAL_BIKE`
- `CFG_022_SECTIONS`
- `CFG_023_SECTIONS`
- `CFG_023_OPTIONS`
- `CFG_017_SECTIONS`
- `CFG_HAT`
- _…and 23 more_

### vcst-seeded products (16)

- `PROD_FULL_FIELD_COVERAGE`
- `PROD_HEADPHONES`
- `PROD_LAPTOP`
- `PROD_SHOES`
- `PROD_COFFEE_MAKER`
- `PROD_PHONE_CASE`
- `PROD_DEFAULT`
- `PROD_OOS`
- `PROD_LOW_STOCK`
- `PROD_PACK_SIZE`
- _…and 6 more_

### Payment-processor sandbox cards (22)

- `CYBERSOURCE_VISA`
- `CYBERSOURCE_VISA_ALT`
- `CYBERSOURCE_MC`
- `CYBERSOURCE_AMEX`
- `CYBERSOURCE_DECLINED`
- `CYBERSOURCE_INVALID`
- `SKYFLOW_VISA`
- `SKYFLOW_VISA_ALT`
- `SKYFLOW_MC`
- `SKYFLOW_AMEX`
- _…and 12 more_

### Other (107)

- `CARD_INSUFFICIENT_FUNDS`
- `CARD_EXPIRED`
- `CARD_SPECIAL_CHARS_NAME`
- `CARD_LONG_NAME`
- `COUPON_10PCT`
- `COUPON_TOP20`
- `COUPON_20PCT`
- `COUPON_SHIPPING`
- `COUPON_WELCOME`
- `COUPON_E2E`
- _…and 97 more_

### Loyalty / user groups (3)

- `LOYALTY_SETTINGS`
- `USER_GROUP_VIP`
- `LOYALTY_VIP_USER`

### vcst-seeded users / orgs (17)

- `TECHFLOW_ADMIN`
- `TECHFLOW_BUYER`
- `BUILDRIGHT_ADMIN`
- `SUPPORT_AGENT`
- `IMPERSONATE_TARGET`
- `OTHER_ORG_USER`
- `TECHFLOW_ADMIN_VIRTOSTART`
- `TECHFLOW_BUYER_VIRTOSTART`
- `BUILDRIGHT_ADMIN_VIRTOSTART`
- `BUILDRIGHT_BUYER_VIRTOSTART`
- _…and 7 more_

### Lockout / auth test users (1)

- `LOCKOUT_TEST_USERS`

### Seed-run-specific (SEED_*) (5)

- `SEED_20260529_OOS`
- `SEED_20260529_TIER_PRICED`
- `SEED_20260529_PL_USD`
- `SEED_20260529_PL_EUR`
- `SEED_20260529_VARIATION_PARENT`

## Recommended actions (Layer 1 / Layer 2 implications for workstream #6)

**Layer 1 (customer-facing plugin) ships:**
- `templates/aliases.json.template` with the **7 template aliases** plus generic `TEST_*` placeholders the customer fills in (already 9 generic ones present)
- Documentation in `docs/test-authoring.md` § "@td() resolver" already references this pattern

**Layer 2 (vcst-internal deployment) keeps:**
- `test-data/aliases.json` with **204 vcst-seeded entries** plus their backing CSVs (`test-data/orgs/`, `test-data/products/`, `test-data/users/`)
- All historical changelog entries in `_meta`
- Sprint-run-specific `SEED_20260602_*` aliases

## Verification

After Layer 1 / Layer 2 split:

```bash
# Layer 1 customer would have only templates + an empty aliases.json starting point
# Their workflow:
cp templates/aliases.json.template test-data/aliases.json   # then edit with their values

# Layer 2 vcst keeps the current 211-alias aliases.json as-is.
```

## Notes for human reviewer

1. **Payment-processor sandbox cards** are arguably universal (the sandbox PANs work across processor sandboxes). Currently classified as `vcst-data` because the specific selections are vcst's convention. Could split into a separate `templates/sandbox-cards.json` that customers reuse as-is.
2. **AGENT_POOL_SLOT_\*** is classified as `template` because the SLOT PATTERN is universal even though the underlying CSV holds vcst's values. The pattern `@td(AGENT_POOL_SLOT_1.email)` works for any customer with an agent-user-pool.csv populated for their team.
3. Some aliases like `IMPERSONATE_TARGET_MANY_ORGS` are vcst-internal test fixtures (specific lockout / blocked / invited states) — these are vcst-data even though the CONCEPT is universal. Customer would seed their own equivalents.
