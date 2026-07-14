# Triage Taxonomy — the 8 classes with worked examples

One `CLASS` per regression FAIL. The hard part is separating a **product** defect
from a **test** defect — the evidence (trace + screenshot + CSV row), not the
symptom, decides. Bias: **ambiguous → `REAL_BUG` / `CONFIDENCE: LOW`** (routes to
live repro / human review); never relabel an uncertain failure as a test-defect
to clear the board.

---

## Product-side

### `REAL_BUG`
The product genuinely misbehaves. **Must be confirmable by a live repro** (Phase 4) — the classifier flags, it does not assert-and-file.

*Signals:* a real 5xx or GraphQL `errors[]` on a valid operation in `trace.networkFailures[]`; an app-code exception with a real stack frame (`ProductCard.vue:47`) in `consoleErrors[]`; a screenshot showing a control genuinely broken/missing (not merely renamed); a BL-* invariant actually violated by the product.

*Example:* `CART-018` asserts line total = unit × qty. Trace: `POST /graphql (AddItem) → 200` but response `price.total` is `0`; screenshot shows `$0.00` in the cart. Live repro confirms. → `REAL_BUG`, P1, `vc-module-x-cart`, `BL-CART-003`.

---

## Test-side (product is fine — the test is wrong)

### `TEST_STEPS_DEFECT`
The script is wrong: vague/compound step, or a missing `[WAIT]` after a state-changing `[ACT]` so the assertion reads before the async settle (the classic false FAIL — `reference_additem_async_settle`, `platform-patterns.md`).

*Example:* `SRCH-004` does `[ACT] type query` immediately followed by `[ASSERT] results contain X` with no `[WAIT]`. Trace: no network error, all 200; screenshot shows results *did* load a moment later. → `TEST_STEPS_DEFECT`; fix = insert `[WAIT] for results list`.

### `ASSERTION_DEFECT`
The assertion is wrong or too strict — most often an exact-value assert on env-dependent data (literal price, order#, count, slug, title — DV-016), or a check of behavior the product never promised.

*Example:* `CAT-012` asserts `[DOM] category shows "26 products"`. Catalog was reseeded; it now shows 24. The count *renders correctly* — the test hardcoded 26. → `ASSERTION_DEFECT`; fix = assert count is a non-negative integer / matches the live listing count, not a literal.

### `TEST_DATA_DEFECT`
A referenced entity is stale/missing — a drifted `@td()` GUID, an unseeded env (`@td` resolves to `""`), a deleted SKU/coupon/org. The product works; the fixture is gone (`.claude/rules/test-data.md`).

*Example:* `PROMO-007` applies `@td(COUPON_SUMMER.code)`; the coupon was never seeded on this env, so the field is empty and "apply" no-ops. → `TEST_DATA_DEFECT`; fix = `/qa-seed-data promotions` + `npm run td:validate`, or update the alias.

### `STALE_TEST`
The feature **legitimately changed** — control renamed/moved/removed, flow re-routed, copy updated — and the test was never synced. Confirmed by the screenshot + a live env-check (`/qa-review-tests --verify`), never assumed.

*Example:* `ORD-009` clicks `'Return'`; the button was renamed to `'Request Return'`. Screenshot shows the new label present and working. `/qa-review-tests --verify` reports CHANGED. → `STALE_TEST`; fix = update the selector/label, or `/qa-test-lifecycle` for a broader feature sync.

*Disambiguation — STALE_TEST vs TEST_DATA_DEFECT:* if the **UI/flow** changed → STALE_TEST; if the **data** the test points at drifted while the UI is unchanged → TEST_DATA_DEFECT.

*Disambiguation — ASSERTION_DEFECT vs REAL_BUG:* if the product does the right thing and the *check* is wrong → ASSERTION_DEFECT; if the check is right and the *product* is wrong → REAL_BUG. When you can't tell, it's REAL_BUG/LOW.

---

## Non-actionable (no code and no test change)

### `FLAKY`
Oscillates PASS↔FAIL across runs with no code change (`flaky:true` from the store or `compute-metrics.ts` trends), or a transient race/timeout with no product fault. → recommend re-run/quarantine; no bug, no CSV edit.

### `ENV`
Infra/environment failure: env unreachable, deploy window, search index still rebuilding, auth/session setup failed. Not product, not test. → recommend re-run once the env is healthy. (Datatrans redirect is *not* an ENV/BLOCKED reason — `feedback_datatrans_redirect_not_blocker`.)

### `KNOWN_ISSUE`
Matches a `vc-bug-catalog` entry, an already-filed tracker ticket in `References`, or documented by-design / config-gated behavior (e.g. multi-step checkout gated by `checkout_multistep_enabled`; token revocation needs `EnablePersistentStorageTokenValidation`). → dismiss with the link.

---

## Marker contract (emitted by `ci/agents/regression-triage-agent.md`)

```
CLASS: <one of the 8>
SEVERITY: P0|P1|P2|P3          # REAL_BUG only
ROUTE_REPO: <repo|ambiguous>   # REAL_BUG only
COMPONENT: <area, short>
REPRO_LAYER: frontend|backend|none   # REAL_BUG only
CONFIDENCE: HIGH|MEDIUM|LOW
ROOT_CAUSE: <one sentence>
ORACLE_MATCH: <vc-bug-catalog/BL id | none>
SUGGESTED_FIX: <one line — required for the 4 test-defect classes; "n/a" otherwise>
```
