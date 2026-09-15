# BUG — `POST /api/platform/settings/v2/tenant/Store/{id}/values` returns 204 and the written value never takes effect

## Status: CONFIRMED

**Severity:** High · **Priority:** High · **Found:** 2026-09-11 · **Ticket:** standalone — **related to** VCST-5024, not caused by it
**Env:** vcst-qa — `BACK_URL=https://vcst-qa.govirto.com`, store `B2B-store`
**Found by:** `/qa-test VCST-5024` — the backend lane called stop-the-line after noticing the two settings readers disagreed.

## Summary

A store-scoped setting written through the platform's documented settings-v2 tenant endpoint returns **HTTP 204**, and the settings API then reports the new value — while the value **never reaches the store entity**, which is what module code actually reads. The write succeeds and does nothing. The read that follows reports a value that is not in force.

**This is a platform/module contract mismatch, not a loyalty defect.** It is filed separately because it will outlive VCST-5024 and affects any module resolving settings off `store.Settings`.

## Steps to reproduce

1. `POST {BACK_URL}/api/platform/settings/v2/tenant/Store/B2B-store/values` with body `{"Loyalty.LoyaltyBalanceCalculationMode":"Organization"}`.
2. `GET` the same endpoint.
3. `GET {BACK_URL}/api/stores/B2B-store` and read `settings[]` for the same setting name.
4. Exercise any behaviour gated on that setting.

**Actual:**

| Surface | Reports |
|---|---|
| The `POST` | **204** |
| `GET …/settings/v2/tenant/Store/{id}/values` | `"Organization"` |
| `GET /api/stores/{id}` → `settings[]` | **`value: null`** (`defaultValue: "Customer"`) |
| Behaviour | **`Customer`** — unchanged |

Behaviourally confirmed: with the settings API reporting `Organization`, an order placed at 14:40:56Z wrote a loyalty ledger row with `organizationId: NULL`, the organization balance stayed `0`, and two members' balances stayed separate. Global scope read `"Customer"` throughout, so this is not a merged-global artefact — **only the two store-scoped readers disagreed.**

**Expected:** either the write reaches the store the module reads, or it fails loudly. A `204` followed by a read that reports a value not in force is the worst of both.

## Root cause analysis

Module code resolves the setting from the **store entity**, not the settings API:

`Core/Extensions/StoreExtensions.cs` →
`store.Settings.GetValue<string>(Settings.General.LoyaltyBalanceCalculationMode)` → `null` → falls to the compiled default `Customer`.

The settings-v2 tenant write lands somewhere the store aggregate does not read (or does not evict). **The Admin UI path is unaffected and works** — `settings-unified.js` opens in entity mode for a store, assigns `parentSetting.value` on the in-memory store entity, and the blade's own **Save** (`PUT /api/stores`) persists it; `saveTenantValues` is never called on that path. **`PATCH /api/stores/{id}` with a JSON Patch on the `settings[]` element also works**, and took effect immediately and behaviourally (a member's `loyaltyBalance` flipped 39,533 → 0 on the next read).

So an administrator **can** enable such a setting. An integrator or automation using the documented settings API cannot, and is told it succeeded.

## Module versions

Platform `3.1069.0`. Observed against `VirtoCommerce.Loyalty 3.1008.0-pr-17-116e`, but the mismatch is in the platform settings surface and is not specific to that module.

## Impact

Any automation, deployment script or integration that configures store settings through the documented endpoint may be silently ineffective, and the verification read confirms the wrong answer — so the failure is undetectable by the obvious check. Cost measured in this run: ~16 minutes of testing against a store believed to be reconfigured, one consumed test fixture, and a QA lane that had to stop the line to catch it.

Severity **High rather than Critical**: no administrator capability is lost, because both UI paths work.

## Fix Routing (→ /qa-fix)

- **repo:** `VirtoCommerce/vc-platform` (settings surface) · **repoKind:** `platform` · **confidence:** MEDIUM — the failing layer is proven by behaviour, but the platform-side write/cache path was not read in source.
- **Two candidate causes, not yet distinguished:** the tenant write persists to a store the aggregate does not load, **or** it persists correctly and the store aggregate cache is not evicted. Distinguishing them is the first step, not a detail.
- **Minimum acceptable fix:** make the two store-scoped readers agree, or make the tenant write fail loudly for a scope it cannot serve.

## Evidence

- `reports/tickets/Sprint26-18/VCST-5024/summary.json` → `environment` (both readings, and the working `PATCH` path)
- `reports/tickets/Sprint26-18/VCST-5024/testing-checklist.md` item **K1** and the *Flip window discipline* block
- `reports/tickets/Sprint26-18/VCST-5024/screenshots/K1-admin-points-calculation-mode-shows-Customer.png` and `K1-…-Organization-postflip.png`

## Not claimed

- The platform-side write path and cache behaviour were **not read in source** — hence MEDIUM, not HIGH.
- Not established whether this affects **all** tenant-scoped settings or only those a module reads off `store.Settings`. Only one setting was exercised.
- No claim about Azure Boards / other deployments; observed on one environment.
