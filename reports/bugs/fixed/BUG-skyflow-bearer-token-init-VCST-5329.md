# BUG — Skyflow payment fails to initialize across environments ("Failed to get bearer token") `[High]`

**JIRA:** VCST-5329 (Relates to VCST-5269) · **Status:** FIXED · **Filed:** 2026-06-22 · **Fixed/verified:** 2026-07-03
**Env:** vcst-qa (Platform 3.1038.0) **and** virtostart (storefront 2.51.0) — reproduces on both

## Summary
Selecting the **Skyflow** payment method on `/cart` renders the card section but the Skyflow iframe never loads (stuck "Loading…"). `initializeCartPayment` returns `INVALID_OPERATION`/`data:null`. CyberSource succeeds on the identical cart in both envs, so only the Skyflow processor fails. Root cause is a server-side Skyflow credential failure ("Failed to get bearer token"), **not** application code and **not** VCST-5269's visibility change.

## STR
1. Sign in (storefront user).
2. Add a buyable in-stock product → `/cart`.
3. Set shipping/billing address + delivery method (required to mount the card section on builds without the VCST-5269 fix).
4. Select **Skyflow**.

**Expected:** Skyflow card form loads, usable.
**Actual:** iframe stuck "Loading…"; `initializeCartPayment` → `INVALID_OPERATION`, `data:null`; console `TypeError: Cannot read properties of undefined (reading 'container')`.

## Evidence
- Skyflow `initializeCartPayment` (both envs): `{"errors":[{"message":"Error trying to resolve field 'initializeCartPayment'.","extensions":{"code":"INVALID_OPERATION"}}],"data":{"initializeCartPayment":null}}`
- CyberSource `initializeCartPayment` (same cart): `{"data":{"initializeCartPayment":{"isSuccess":true,...flex JWT + flex-microform.min.js v2.0.2}}}`
- `GetSkyflowCards` ({storeId}-only, vcst-qa): also `INVALID_OPERATION`
- App Insights (vcst-qa): `System.InvalidOperationException: Failed to get bearer token` at `VirtoCommerce.Skyflow.Data.Services.SkyflowClient.GetBearerTokenInternal`
- Screenshots: `tests/Sprint-current/VCST-5269/screenshots/TC-5269-skyflow-card-visible-no-address.png`, `…-skyflow-with-address.png`, `…-skyflow-with-billing-address.png`, `…-skyflow-virtostart.png`

## Root cause
Skyflow module installed/active/registered (`VirtoCommerce.Skyflow` v3.1003.0; `B2B-store`, `isActive`, `allowCartPayment=true`). It reads all config from `appsettings.json` → `Payments:Skyflow` (vault URIs/`vaultId`/`tableName` + `PaymentFormAccount.*`/`IntegrationsAccount.*` service-account `clientID`/`keyID`/`privateKey`), NOT Admin/DB (`settings: []` by design). `GetBearerTokenInternal` POSTs to the token endpoint and throws "Failed to get bearer token" when no `access_token` returns → missing/invalid/expired Skyflow credentials. CyberSource is unaffected (DB-stored settings).

## Scope
- Reproduces on vcst-qa **and** virtostart **2.51.0 (predates PR #2336)** → not caused by VCST-5269, not vcst-qa-specific. Broader Skyflow credential/backend problem.
- Blocks all Skyflow regression (suite 040b). CyberSource / Authorize.Net unaffected.
- vcst-qa loss is consistent with the 2026-05-15 restore-from-another-env wiping appsettings secrets; virtostart failing too suggests the shared Skyflow service-account/vault may be revoked or expired.

## Suggested action (infra / DevOps)
Re-populate each env's `appsettings.json` → `Payments:Skyflow` with valid Skyflow vault + service-account credentials and restart/redeploy; if present, verify the Skyflow service account / token endpoint is not revoked/expired. Secrets live in infra config / the Skyflow account, not the QA repo. Re-verify via `/qa-verify-fix` once restored.

## Discovery
Found during VCST-5269 verification — the fix (PR #2336) made the already-broken Skyflow card form appear earlier on `/cart`, surfacing this pre-existing outage.

## Resolution
**Status: FIXED** — Skyflow vault/service-account credentials (`appsettings.json → Payments:Skyflow`) restored/redeployed on the infra side (no application code change). JIRA VCST-5329 = Done.

QA re-verified live on **2026-07-03** (Platform 3.1038.0 · Theme 2.53.0-pr-2336-50d4-50d40585), two accounts / two browsers:
- Personal shopper (chrome) and WL org user `wl-fashion@virtocommerce.com` / WL-ORG-B (edge).
- `initializeCartPayment` → **`isSuccess:true`** with a valid Skyflow `accessToken` (JWT bearer) + `vaultID c1aeec61ad7c46c2b724f004a7658b2f` + `vaultURL https://ebfc9bee4242.vault.skyflowapis.com`; `GetSkyflowCards` → 200 (no INVALID_OPERATION).
- Card iframe renders inline (no "Loading…" stall); console clean (no `TypeError ...'container'`, no bearer-token error).
- Skyflow test card `5424000000000015` accepted into the iframe (order not placed).

Evidence: `tests/Sprint-current/VCST-5329/` (skyflow-reverify.md, skyflow-reverify-wlfashion.md + screenshots).
