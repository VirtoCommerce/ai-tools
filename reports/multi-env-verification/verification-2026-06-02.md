# Multi-env Filter Verification — Offline Report

Scenarios: 6 · Passed: 6 · Failed: 0

## [PASS] virtostart-smoke

Default virtostart smoke run — no module/profile/processor restrictions, ENV_RISK=test. Should run smoke selection fully (no gates triggered).

**Env:** `TEST_ENV=virtostart ENV_RISK=test`
**Selection:** `smoke` → 2 suites
**Kept:** 2  ·  **Skipped:** 0  ·  **EscapeHatch:** off

## [PASS] virtostart-restricted-modules

Customer running with only catalog,customer,orders modules enabled — must skip suites requiring marketing/loyalty/notifications/etc.

**Env:** `TEST_ENV=virtostart ENV_RISK=test MODULES_ENABLED=catalog,customer,orders`
**Selection:** `full` → 99 suites
**Kept:** 74  ·  **Skipped:** 25  ·  **EscapeHatch:** off
**Skip breakdown:** modules=25

**Sample skips (first 5 of 25):**
  - `023` (modules): requires modules [marketing] not in MODULES_ENABLED
  - `024` (modules): requires modules [marketing] not in MODULES_ENABLED
  - `025` (modules): requires modules [marketing] not in MODULES_ENABLED
  - `034` (modules): requires modules [store] not in MODULES_ENABLED
  - `035` (modules): requires modules [store] not in MODULES_ENABLED

## [PASS] virtostart-b2c-profile

Customer running a B2C-only deployment — must skip B2B-flagged suites.

**Env:** `TEST_ENV=virtostart ENV_RISK=test STOREFRONT_PROFILE=b2c`
**Selection:** `full` → 99 suites
**Kept:** 95  ·  **Skipped:** 4  ·  **EscapeHatch:** off
**Skip breakdown:** profile=4

**Sample skips:**
  - `006` (profile): storefrontProfile [b2b, hybrid] excludes active "b2c"
  - `008` (profile): storefrontProfile [b2b, hybrid] excludes active "b2c"
  - `010` (profile): storefrontProfile [b2b, hybrid] excludes active "b2c"
  - `013` (profile): storefrontProfile [b2b] excludes active "b2c"

## [PASS] production-risk-blocks-writes

ENV_RISK=production with no escape hatch — must skip all 45 envRiskGate-tagged suites.

**Env:** `TEST_ENV=customer_prod ENV_RISK=production`
**Selection:** `full` → 99 suites
**Kept:** 54  ·  **Skipped:** 45  ·  **EscapeHatch:** off
**Skip breakdown:** risk=45

**Sample skips (first 5 of 45):**
  - `011` (risk): envRiskGate "staging" exceeded by ENV_RISK "production"
  - `013` (risk): envRiskGate "staging" exceeded by ENV_RISK "production"
  - `014` (risk): envRiskGate "staging" exceeded by ENV_RISK "production"
  - `015` (risk): envRiskGate "staging" exceeded by ENV_RISK "production"
  - `017` (risk): envRiskGate "staging" exceeded by ENV_RISK "production"

## [PASS] production-risk-with-escape-hatch

ENV_RISK=production + ALLOW_ADMIN_WRITES_ON_PROD=true — escape hatch UNLOCKS the 45 envRiskGate suites.

**Env:** `TEST_ENV=customer_prod ENV_RISK=production ALLOW_ADMIN_WRITES_ON_PROD=true`
**Selection:** `full` → 99 suites
**Kept:** 99  ·  **Skipped:** 0  ·  **EscapeHatch:** ACTIVE

## [PASS] cybersource-only-storefront

PAYMENT_PROCESSORS_ENABLED=cybersource — must skip suites declaring other processors (Skyflow/Datatrans/Authorize.Net).

**Env:** `TEST_ENV=virtostart ENV_RISK=test PAYMENT_PROCESSORS_ENABLED=cybersource`
**Selection:** `payment` → 3 suites
**Kept:** 2  ·  **Skipped:** 1  ·  **EscapeHatch:** off
**Skip breakdown:** processors=1

**Sample skips:**
  - `040` (processors): paymentProcessors [skyflow, authorize-net, datatrance] not in PAYMENT_PROCESSORS_ENABLED
