# FIX-2026-06-29-1823 — VCST-5391 (auto-fix via /qa-fix)

**Status:** PR open for human review — NOT merged (Gate 7 stop).
**Ticket:** [VCST-5391](https://virtocommerce.atlassian.net/browse/VCST-5391) — [Cart] Editing a configurable product's configuration from the cart and saving returns an error and loses the configuration.
**PR:** https://github.com/VirtoCommerce/vc-module-x-cart/pull/132 (OPEN · mergeable, BLOCKED on human review)

| Field | Value |
|-------|-------|
| Repo / kind | `VirtoCommerce/vc-module-x-cart` / module |
| Branch | `claude/qa-autofix/VCST-5391` (base `dev`) |
| Commits | `b7627b7` (fix + test) · `fd6955a` (Sonar S125 comment reword) |
| Dev agent | fullstack-backend · Reviewer | backend-reviewer |
| Author identity | Elena Mutykova (Lenajava1) + `Co-Authored-By: Claude` (CLA-safe) |

## Root cause

`CartAggregate.UpdateConfiguredLineItemAsync` (the `changeCartConfiguredItem` write path) assigned freshly-built configuration items to the line item **without setting `ConfigurationItem.LineItemId`**. The `CartConfigurationItemType` money resolvers (`extendedPrice`/`listPrice`/`salePrice`) resolve the line-item currency via `GetConfiguratonItemCurrency`, which matches `ConfigurationItem.LineItemId` against `cart.Items[].Id`. With the back-reference null, currency resolved null → `ToMoney(null)` threw `ARGUMENT_NULL` on a `NonNullGraphType<MoneyType>` field → the mutation returned HTTP 200 with top-level `errors[]` and `items[0].configurationItems = [null]`. The `cart`/`fullCart` query path was unaffected (persistence populates `LineItemId` on read-back), so the storefront masked it via re-fetch.

## Fix

`src/VirtoCommerce.XCart.Core/CartAggregate.cs` — set `configurationItem.LineItemId = lineItem.Id` for each item after the `ConfigurationItems` assignment, restoring the FK the resolver depends on (mirrors the persisted/query path). +10 lines, no contract/schema/manifest/migration change, no pricing math altered.

New ADD-only test: `tests/VirtoCommerce.XCart.Tests/Aggregates/UpdateConfiguredLineItemConfigurationItemLineItemIdTests.cs` — asserts every config item carries `LineItemId == lineItem.Id` (the exact key the resolver matches). RED before fix, GREEN after.

## Gate ladder

| Gate | Result |
|------|--------|
| G0 eligibility | PASS (localized, non-breaking, single-repo) |
| G1 single repo | PASS (`vc-module-x-cart`; RCA anchor confirmed) |
| G2 reproduce (red) | PASS (new xUnit fails on current code) |
| G3 fix (green) | PASS (213 pass / 0 fail; pre-existing tests unmodified) |
| G4 review | PASS (backend-reviewer APPROVE; add-path gap → follow-up note, not folded in) |
| G5 CI + Sonar QG + auto-tests | PASS (ci, SonarCloud QG, auto-tests ×3 DBs, swagger, cla all green; 1 self-correction for an S125 false-positive comment) |
| G6 E2E / deploy | DEFERRED — backend static pre-deploy; PR labeled "needs deploy verification"; closes post-merge via `/qa-verify-fix VCST-5391` |
| G7 human review | STOP — PR open, never auto-merged |

## Follow-up (non-blocking, noted in PR body)

The sibling `AddConfigurationItemsAsync` / `UpdateConfigurationItemsAsync` paths build configuration items with the same missing-`LineItemId` shape (currently masked by the post-mutation cart re-fetch — no proven symptom). Recommend a separate follow-up ticket rather than expanding this PR.

## Next

Human reviews + merges PR #132. After the module's alpha artifact deploys to QA, run `/qa-verify-fix VCST-5391` (re-run the edit-config-from-cart flow + Backend cart suites) to close Gate 6.
