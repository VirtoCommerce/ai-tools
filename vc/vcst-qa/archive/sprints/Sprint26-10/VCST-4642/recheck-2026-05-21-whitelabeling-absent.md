# VCST-4642 — Live Recheck: WhiteLabeling Module Absent + GetPageContext Gating

**Date:** 2026-05-21 (afternoon, after the morning sign-off)
**Env:** vcst-qa | **Browser:** playwright-chrome (anonymous session)
**Storefront:** https://vcst-qa-storefront.govirto.com
**Trigger:** User requested re-verification of the `@needsModule` gating behavior when WhiteLabeling module is genuinely absent (not simulated).

## Summary

✅ **`@needsModule` end-to-end gating works under a REAL module absence.**

The vcst-qa platform now reports `VirtoCommerce.WhiteLabeling` as **not installed** in the storefront-resolved capability manifest. The vc-frontend client correctly strips the `whiteLabelingSettings` selection and the `whiteLabelingFields` fragment definition from outgoing `GetPageContext` requests. No HTTP 400s, no `Cannot query field` errors, no Vue warnings.

This upgrades the earlier F4 finding (PASS via manifest-mutation simulation) to **PASS via real backend absence**.

## State delta since morning sign-off (2026-05-21)

| Aspect | Morning evidence (`evidence-fe1`) | Afternoon live recheck |
|---|---|---|
| Manifest module count | 80 | 82 |
| `VirtoCommerce.WhiteLabeling` | present, v3.1001.0 | **absent** |
| `VirtoCommerce.WhiteLabeling.WhiteLabelingEnabled` setting | `true` | **N/A — module not listed** |
| `VirtoCommerce.MarketingExperienceApi` | absent | **present, v3.1001.0** (this is the xMarketing extension — F1 may now be resolved) |
| `VirtoCommerce.PushMessages` | absent | present |
| `VirtoCommerce.Quote` | absent | present |
| `VirtoCommerce.XRecommend` | absent | present |
| Real frontend operation name | `InitializeApplication` | `InitializeApplication` (same) |
| Real frontend query selection set | `store(domain) { storeUrl settings { modules { moduleId version settings { name value } } } }` | identical |

**Probable cause of delta:** between the morning capture and now, the platform either re-deployed with a different module bundle, or the per-store module filter changed. Worth confirming with platform engineering — modules being toggled off mid-day in a shared QA env is a coordination signal we should not miss.

## Recheck — F4 path with real module absence

### Step 1 — Confirmed absence in `localStorage`

```jsonc
// vc:initialStore:v1:vcst-qa-storefront.govirto.com → data.settings.modules
{
  "moduleCount": 82,
  "hasVirtoCommerceWhiteLabeling": false,
  "moduleIdSubstringMatch": false   // searched for /whitelabel|theme/i
}
```

Evidence: `recheck-2026-05-21-manifest-no-whitelabeling.json` (full manifest dump).

### Step 2 — `GetPageContext` request body inspection (homepage + `/contact`)

Navigated `/` and `/contact`. In **both** requests, the GraphQL POST body shows the gate took effect:

- `pageContext { user, store, slugInfo }` — no `whiteLabelingSettings { ... }` selection
- No `fragment whiteLabelingFields on WhiteLabelingSettingsType` definition

Evidence: `recheck-2026-05-21-getpagecontext-no-whitelabeling.graphql` (abridged body).

For comparison, the morning evidence (`flag-toggle-report.md` baseline A, with WhiteLabeling installed) DID include the fragment AND the selection.

### Step 3 — Console / network hygiene

- 9 GraphQL POSTs on homepage, all HTTP 200; 6 on `/contact`, all HTTP 200.
- No `Cannot query field` errors.
- No `Unknown type WhiteLabelingSettingsType` errors.
- 2 console errors (unrelated to PR-2293; appeared pre-load and on every navigation — likely pre-existing asset 404s).

### Step 4 — F1 reproducibility check (incidental, anonymous /cart)

Navigated `/cart` (anonymous). Filtered for `GetPromotionCoupons` — **operation did not fire in this anonymous session**. Other cart operations (`GetShortCart`, `GetFullCart`, `AddOrUpdateCartShipment`, `AddOrUpdateCartPayment`, `GetMenu`) all returned HTTP 200.

The earlier F1 reproduction required:
- a signed-in customer
- a cart with promotion-eligible items
- `VirtoCommerce.XMarketing` absent from the manifest

Now that `VirtoCommerce.MarketingExperienceApi` is present in the manifest (and that may be the same package as xMarketing under a renamed module ID, or a separate module that satisfies the same `promotionCoupons` resolver), a fresh F1 reproduction would need a signed-in test. **Not blocking this recheck.** Recommend a follow-up signed-in run to confirm whether F1 is now resolved.

## Storefront visual state

Screenshot captured at `recheck-2026-05-21-home-no-whitelabeling.png` (viewport). Coffee theme bundled-defaults render correctly. No visible regressions — the storefront simply uses its own bundled logo/theme tokens when the WhiteLabeling resolver is unavailable.

## Net assessment

| Question | Answer |
|---|---|
| Does the @needsModule gating work when the named module is genuinely absent? | **YES — confirmed live, not simulated** |
| Does GetPageContext request body strip whiteLabelingSettings when module is absent? | **YES — both selection and fragment definition removed** |
| Are there any HTTP 400 / GraphQL errors on the homepage or /contact with this state? | **NO** |
| Is the F1 finding (GetPromotionCoupons 400 on /cart) still reproducible? | **NOT in this anonymous /cart session.** Needs signed-in retest to confirm whether MarketingExperienceApi addition resolved it |

## Why the morning evidence appeared to show a working WhiteLabeling

The morning sign-off (Elena, `frontend-execution-report.md` FE-3, FE-4 + `flag-toggle-report.md`) tested two paths:
1. **FE-3** — WhiteLabeling **present** in manifest → `whiteLabelingSettings` fragment IS requested (positive path PASS)
2. **FE-4** — manifest **mutated** in browser to remove WhiteLabeling → fragment IS stripped (negative path PASS, simulated)
3. **Flag toggle** — module installed, per-store flag toggled OFF → fragment STILL requested (F8, the per-store flag has no consumer)

The new afternoon state covers a fourth path that the morning evidence couldn't (because the module was installed all morning):

4. **WhiteLabeling actually uninstalled / not in manifest** — fragment IS stripped (negative path PASS, real)

All four paths now have evidence on disk.

## Recommendation

- ✅ No action needed on the gating mechanism — it works as designed.
- ❓ Confirm with platform engineering why `VirtoCommerce.WhiteLabeling` dropped from the manifest. Was the module uninstalled, or is there a per-store assignment we should know about?
- ❓ Signed-in /cart retest to confirm whether F1 (GetPromotionCoupons) is now resolved by the MarketingExperienceApi addition, or whether the missing `@needsModule(name:"VirtoCommerce.XMarketing")` directive still surfaces a 400 when XMarketing is absent.

## Artifacts produced this recheck

- `recheck-2026-05-21-manifest-no-whitelabeling.json` — full localStorage manifest dump (82 modules, no WhiteLabeling)
- `recheck-2026-05-21-getpagecontext-no-whitelabeling.graphql` — abridged GetPageContext request body
- `recheck-2026-05-21-home-no-whitelabeling.png` — homepage screenshot in current state
- This report
