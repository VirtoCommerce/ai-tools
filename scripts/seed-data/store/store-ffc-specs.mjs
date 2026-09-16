/**
 * scripts/seed-data/store/store-ffc-specs.mjs
 *
 * Side-effect-free decision logic for the store ↔ fulfillment-center scope guard
 * (`td:reconcile` check [12]). Importing this module performs NO env load, NO network, NO writes,
 * so both the live reconciler and `scripts/unit/store-ffc-specs.test.mjs` can consume it.
 *
 * WHY THIS GUARD EXISTS
 * ---------------------
 * A store resolves inventory ONLY through its own fulfillment-center set. When that set is empty,
 * EVERY product on the environment reports `availableQuantity = 0` / `isInStock = false` — however
 * much stock its inventory rows actually hold — and every xAPI `addItem` comes back with
 * `validationErrors[].errorCode = PRODUCT_FFC_QTY`.
 *
 * It is invisible to every STATIC guard: the fixtures, aliases and env overlays are all valid; only
 * a live probe of the store can see it. On REG-2026-08-17-1030 (vcptcore-qa, B2B-store had
 * mainFulfillmentCenterId=null and additionalFulfillmentCenterIds=[]) it surfaced as "product out of
 * stock, no add-to-cart control" in suite 042 and as a suspected PRODUCT_FFC_QTY product defect in
 * suite 078. The disambiguating evidence was a control product holding 100 units that STILL returned
 * PRODUCT_FFC_QTY — proving the store's scope, not the stock level, was at fault.
 *
 * Repair is always the same: `TEST_ENV=<env> npm run seed:store`
 * (seed-common `ensureStore` → `applyFulfillmentCenters`).
 */

/** @typedef {'ok'|'none'|'no-main'|'dangling-main'} StoreFfcStatus */

/**
 * Classify a store's fulfillment-center assignment against the live FFC inventory.
 *
 * `dangling-main` is deliberately its own status rather than being folded into `none`: a store
 * whose assigned main FFC has since been deleted still LOOKS configured in the store payload, but
 * behaves exactly like the empty case at runtime. Collapsing the two would make the failure message
 * point an operator at the wrong repair.
 *
 * @param {{mainFulfillmentCenterId?: string|null, additionalFulfillmentCenterIds?: string[]|null}} store
 * @param {Iterable<string>} liveFfcIds  ids of fulfillment centers that currently exist
 * @returns {{status: StoreFfcStatus, main: string|null, additional: string[], danglingAdditional: string[]}}
 */
export function classifyStoreFfc(store, liveFfcIds) {
  const live = liveFfcIds instanceof Set ? liveFfcIds : new Set(liveFfcIds || []);
  const main = store?.mainFulfillmentCenterId || null;
  const additional = (store?.additionalFulfillmentCenterIds || []).filter(Boolean);
  const danglingAdditional = additional.filter((id) => !live.has(id));

  if (!main && !additional.length) return { status: 'none', main, additional, danglingAdditional };
  if (!main) return { status: 'no-main', main, additional, danglingAdditional };
  if (!live.has(main)) return { status: 'dangling-main', main, additional, danglingAdditional };
  return { status: 'ok', main, additional, danglingAdditional };
}

/** True when the classification means "no product on this store can be added to a cart". */
export const isBlockingStoreFfc = (status) => status !== 'ok';

/**
 * Operator-facing explanation for a non-ok status. Kept here (not in the reconciler) so the unit
 * tests pin the wording that tells an operator WHICH repair to run.
 * @param {StoreFfcStatus} status
 * @param {{storeId: string, testEnv: string, main?: string|null, additionalCount?: number}} ctx
 */
export function describeStoreFfc(status, { storeId, testEnv, main = null, additionalCount = 0 }) {
  const repair = `run \`TEST_ENV=${testEnv} npm run seed:store\``;
  switch (status) {
    case 'none':
      return `store ${storeId} has NO fulfillment centers (mainFulfillmentCenterId=null, additionalFulfillmentCenterIds=[]) — every product resolves availableQuantity=0 and every addItem fails PRODUCT_FFC_QTY, whatever the inventory rows say; ${repair}`;
    case 'no-main':
      return `store ${storeId} has ${additionalCount} additional fulfillment center(s) but NO mainFulfillmentCenterId — ${repair}`;
    case 'dangling-main':
      return `store ${storeId} mainFulfillmentCenterId=${main} is not a live fulfillment center — dangling assignment; ${repair}`;
    default:
      return `store ${storeId} fulfillment-center scope is healthy`;
  }
}
