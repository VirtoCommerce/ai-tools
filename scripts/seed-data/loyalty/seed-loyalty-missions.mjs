/**
 * seed-loyalty-missions.mjs — VCST-5319 Loyalty Missions fixture seeder.
 *
 * Provisions the mission fixtures declared in `missions-specs.mjs` (the single source of truth),
 * their PerSku SKU targets, and the `Loyalty.Missions.Enable` store setting that gates the whole
 * feature. Runtime GUIDs land in `test-data/aliases.<env>.json`; nothing server-assigned is ever
 * written to a committed file.
 *
 * API (VirtoCommerce.Loyalty 3.1006.0-pr-14 — /docs/VirtoCommerce.Loyalty/swagger.json):
 *   GET    /api/loyalty-missions/new                 → a valid empty LoyaltyMission (the template)
 *   POST   /api/loyalty-missions/search              → { totalCount, results }
 *   POST   /api/loyalty-missions                     → create (accepts status Published directly)
 *   GET    /api/loyalty-missions/{id}                → one mission (200 + null body when absent)
 *   DELETE /api/loyalty-missions?ids=…               → allowed at EVERY status, incl. Published
 *   POST   /api/loyalty-mission-goal-items/search    → PerSku targets by missionId
 *   POST   /api/loyalty-mission-goal-items           → create one target
 *   PUT    /api/loyalty-mission-goal-items           → update one target
 *   DELETE /api/loyalty-mission-goal-items?ids=…     → remove targets
 *   GET/PUT /api/stores/{id}                         → store settings live on the store body
 *   POST   /api/assets?folderUrl=…                   → multipart banner upload (SVG accepted)
 *   GET    /api/assets?folderUrl=…                   → folder listing; the source of the asset URL
 *   DELETE /api/assets?urls=…                        → remove an asset by its RELATIVE url
 *
 * IDEMPOTENCY — why it deletes rather than repairs.
 * A Published mission is IMMUTABLE: `EnsureMutableAsync` rejects every edit except the single
 * transition Published -> Archived, and rejects everything on an Archived one. So there is no
 * repair-in-place path for any Published fixture. The seeder instead compares a STRUCTURAL
 * SIGNATURE (`missionSignature`, deliberately date-free) plus a live window check, and on any drift
 * DELETEs and recreates. DELETE works at every status, which is what makes that safe. A mission whose
 * signature matches and whose window is open is reused untouched, so its GUID — and therefore every
 * `@td(MSN_*.id)` already resolved against it — stays stable across re-seeds.
 *
 * Usage:
 *   node scripts/seed-data/loyalty/seed-loyalty-missions.mjs
 *   node scripts/seed-data/loyalty/seed-loyalty-missions.mjs --only MSN_PERSKU_ALL
 *   node scripts/seed-data/loyalty/seed-loyalty-missions.mjs --dry-run --verbose
 *   node scripts/seed-data/loyalty/seed-loyalty-missions.mjs --teardown
 *   node scripts/seed-data/loyalty/seed-loyalty-missions.mjs --missions off   # toggle-test helper
 *   node scripts/seed-data/loyalty/seed-loyalty-missions.mjs --missions on
 *   node scripts/seed-data/loyalty/seed-loyalty-missions.mjs --reupload-banners  # artwork edited
 *
 * PROGRESS (VCST-5346). Mission DEFINITIONS alone render a page of identical 0% / warning /
 * not-completed cards, because the storefront draws every visual state from `loyaltyMissionProgress`.
 * Progress has no write API on this build — `/api/loyalty-mission-progress` is search+get, and the one
 * writer is `LoyaltyMissionHandler : IEventHandler<OrderChangedEvent>` filtered to `EntryState.Added`.
 * There is no order-STATUS gate, so this seeder provisions the states with ONE Swagger-shaped order
 * (`POST /api/order/customerOrders`, status New) for the `USER` role's SECURITY-ACCOUNT id, and then
 * asserts the result twice: through the admin progress search, and through `loyaltyMissionProgress`
 * itself — the only surface that reports `daysRemaining`, which is computed per request and never
 * stored. A re-provision recreates the WHOLE mission set (a progress row cannot be reset, and one
 * order contributes to one mission once); it only happens when the live state does not already match.
 *
 * GROUP TARGETING. Two fixtures (MSN_GROUP_VIP / MSN_GROUP_VIP_PRIVATE) carry a real
 * `UserGroupIsCondition`, and the seeder resolves BOTH audience accounts live before writing anything:
 * the member must be in the target group and the non-member must NOT be, compared the way the server
 * compares (whole-string, OrdinalIgnoreCase). Either check failing ABORTS the seed — a targeted fixture
 * whose audience nobody belongs to seeds cleanly and can only ever report an absence that reads as a
 * product defect. The OBSERVED group lists go to the overlay as MSN_GROUP_AUDIENCE; the accounts
 * themselves belong to the loyalty user seeder and are never created or deleted here.
 *
 * BANNERS. Each mission carries the artwork for its GOAL TYPE (money / repeat orders / featured SKUs),
 * uploaded from `test-data/uploads/msn-banner-*.svg` under a FIXED file name so the asset URL is stable
 * across runs — it is part of `missionSignature`, and a churning URL would recreate every mission on
 * every seed. The URL is per-env and goes to the overlay; `bannerUrl` is set at CREATE time because a
 * Published mission can never gain one afterwards, and each URL is asserted to serve 2xx + image/*.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STORE_ID, DRY_RUN, TEARDOWN, ONLY, ROOT, BACK_URL, ADMIN, ADMIN_PASSWORD,
  log, verbose, assertSafeTarget, auth, api, idsParam,
  uploadAsset, assetUrlOk, buildStoreSeo,
  writeEnvAliasOverride, verifyRemoved, discoverCatalogProducts, loadAliases,
} from '../../lib/seed-common.mjs';
import { roleByKey, resolveRole } from '../../lib/user-roles.mjs';
import {
  MISSIONS, MISSION_BY_ALIAS, STORE_SETTING, PERSKU_PRODUCTS, TARGETING,
  BANNERS, BANNER_FOLDER, BANNER_CONTENT_TYPE, bannerSourceRel, bannerAssetRel, bannerKeyFor,
  missionName, isSeededMissionName, needsGoalItems, resolveCurrencies, resolveLocales,
  buildMissionBody, buildGoalItems, reconcileGoalItems, localizedValues,
  ZERO_STOCK_PRODUCT, TARGET_PRODUCTS, OWNED_PRODUCTS, goalSlotsFor, localeIntentsUsed, localeFieldFor,
  missionSignature, signaturesMatch, windowIsOpen, windowExpectsOpen, validateSpecShape,
  PROGRESS_ORDER, PROGRESS_ORDER_ALIAS, PROGRESS_USER_ROLE, progressOrderNumber,
  predictProgress, percentagesMatch, progressFixtures, DANGER_THRESHOLD_DAYS, WINDOWS,
  TARGET_GROUP, GROUP_AUDIENCE, isGroupTargeted, groupsInclude,
  POINTS_ORDER, POINTS_ORDER_ALIAS, PROGRESS_ORDERS,
  POINTS_PRODUCT, REWARD_SPEND, rewardBuysUnits, lineUnitPrice,
  orderMoney, readingValues, readingsConsistentWith, READING_ORDER,
} from './missions-specs.mjs';

const argv = process.argv.slice(2);
const missionsFlagIdx = argv.indexOf('--missions');
/** `--missions on|off` sets ONLY the gate and exits — the toggle-test helper. */
const MISSIONS_TOGGLE = missionsFlagIdx >= 0 ? String(argv[missionsFlagIdx + 1] || '').toLowerCase() : null;
/** Push the banner BYTES back up even though the URL already serves — for when the artwork changed. */
const REUPLOAD_BANNERS = argv.includes('--reupload-banners');

/**
 * ADDITIVE MODE: create what is missing, NEVER delete-and-recreate what is already there.
 *
 * The seeder's repair strategy is delete-and-recreate, because a Published mission is immutable. That
 * is correct in isolation and DESTRUCTIVE when someone else's work is sitting on top of these
 * fixtures: `LoyaltyMissionProgress` rows have no delete API on this build, so recreating a mission
 * mints a fresh GUID and ORPHANS every progress row against a dead mission id — and the only way back
 * is to place another order, which cannot be undone either. A parallel VCST-5346 session hit exactly
 * that risk on 2026-08-27 while holding live progress on MSN_ENDING_SOON / MSN_PROGRESS_PARTIAL /
 * MSN_PROGRESS_COMPLETED.
 *
 * So `--no-recreate` turns every recreate decision into a SKIP + a report. It deliberately does not
 * silence the drift — the run still says which fixture is wrong and why, it just refuses to be the
 * one that destroys the shared state. Use it whenever another session may be mid-run against the env;
 * combine with `--only <ALIAS>` to add a single new fixture and touch nothing else.
 */
const NO_RECREATE = argv.includes('--no-recreate');

/* ── Store settings ─────────────────────────────────────────────────────────── */

/**
 * Read both loyalty switches off the store. The base switch is REPORTED, never written — suites
 * 075/075b/075c read it through LOYALTY_SETTINGS and a mission seed has no business moving it.
 */
async function readLoyaltySettings() {
  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`);
  const find = (name) => (store.settings || []).find((s) => s.name === name) || null;
  const missions = find(STORE_SETTING.missionsSetting);
  const base = find(STORE_SETTING.baseSetting);
  const effective = (s) => (s == null ? null : (s.value == null ? s.defaultValue === true : s.value === true));
  return { store, missions, base, missionsEnabled: effective(missions), baseEnabled: effective(base) };
}

/**
 * Set `Loyalty.Missions.Enable` on the store. Idempotent (a no-op when already at `desired`) and
 * surgical: it rewrites exactly that one entry of `store.settings` and PUTs the store back, so no
 * other store setting — loyalty or otherwise — is disturbed.
 */
async function setMissionsEnabled(desired) {
  const { store, missions, missionsEnabled, baseEnabled } = await readLoyaltySettings();
  if (missions == null) {
    throw new Error(
      `${STORE_SETTING.missionsSetting} is not registered on store ${STORE_ID}. `
      + 'The Loyalty module build that declares it is probably not deployed on this env.',
    );
  }
  if (missionsEnabled === desired) {
    log(`✓ ${STORE_SETTING.missionsSetting} already ${desired} (${STORE_SETTING.baseSetting}=${baseEnabled})`);
    return { changed: false, missionsEnabled: desired, baseEnabled };
  }
  const next = {
    ...store,
    settings: (store.settings || []).map((s) => (
      s.name === STORE_SETTING.missionsSetting ? { ...s, value: desired } : s
    )),
  };
  await api('PUT', '/api/stores', next, { expectStatus: [200, 204] });
  log(`✓ ${STORE_SETTING.missionsSetting}: ${missionsEnabled} → ${desired} (${STORE_SETTING.baseSetting}=${baseEnabled}, untouched)`);
  return { changed: true, missionsEnabled: desired, baseEnabled };
}

/* ── Missions ───────────────────────────────────────────────────────────────── */

async function searchMissions() {
  const r = await api('POST', '/api/loyalty-missions/search', { take: 200 }, { expectStatus: [200, 201] });
  return r?.results || [];
}

/** Every mission this seeder owns, keyed by name. */
async function ourMissionsByName() {
  const all = await searchMissions();
  const map = new Map();
  for (const m of all) if (isSeededMissionName(m.name)) map.set(m.name, m);
  return map;
}

async function deleteMissions(ids) {
  if (!ids.length) return;
  const qs = ids.map((id) => `ids=${encodeURIComponent(id)}`).join('&');
  await api('DELETE', `/api/loyalty-missions?${qs}`, null, { expectStatus: [200, 204] });
}

/* ── PerSku goal items ──────────────────────────────────────────────────────── */

async function goalItemsFor(missionId) {
  const r = await api('POST', '/api/loyalty-mission-goal-items/search', { missionId, take: 200 }, { expectStatus: [200, 201] });
  return r?.results || [];
}

/**
 * Bring a PerSku mission's SKU targets to exactly the desired set.
 *
 * The reconcile (rather than a wipe-and-recreate) is forced by the schema: `LoyaltyMissionGoalItem`
 * has a UNIQUE index on (MissionId, ProductId) and a duplicate insert surfaces as a raw HTTP 500 SQL
 * error, not a 409 — so a blind re-POST on a re-seed does not fail gracefully, it fails illegibly.
 * The bulk `PUT /items` route is NOT an upsert either (it hits the same index), so each row is
 * created / updated / removed individually.
 */
async function syncGoalItems(spec, missionId, products) {
  const desired = buildGoalItems(spec, missionId, products);
  const existing = DRY_RUN ? [] : await goalItemsFor(missionId);
  const { create, update, remove } = reconcileGoalItems(desired, existing);

  for (const row of create) await api('POST', '/api/loyalty-mission-goal-items', row, { expectStatus: [200, 201] });
  for (const row of update) await api('PUT', '/api/loyalty-mission-goal-items', row, { expectStatus: [200, 204] });
  if (remove.length) {
    const qs = remove.map((r) => `ids=${encodeURIComponent(r.id)}`).join('&');
    await api('DELETE', `/api/loyalty-mission-goal-items?${qs}`, null, { expectStatus: [200, 204] });
  }
  // A repaired QUANTITY is reported at normal verbosity, not just under --verbose. MSN_PERSKU_ANY was
  // found live on 2026-08-27 carrying slot B at 2 against a spec of 1 — targetValue 4 instead of 3 —
  // and the reconcile would have fixed it on the next run without anyone learning that it had ever
  // been wrong. A silent repair of a discriminating value is indistinguishable from no drift at all.
  if (update.length) {
    log(`  ⚠ ${missionName(spec)}: repaired ${update.length} drifted goal-item quantity/-ies → ${update.map((u) => `${u.productId}=${u.quantity}`).join(', ')}`);
  }
  verbose(`goal items for ${missionName(spec)}: +${create.length} ~${update.length} -${remove.length}`);

  if (DRY_RUN) return desired.length;
  // A PerSku mission with zero targets is structurally valid and permanently uncompletable — the
  // exact silent failure this seeder exists to prevent. Assert, do not assume.
  const after = await goalItemsFor(missionId);
  if (after.length !== desired.length) {
    throw new Error(`${missionName(spec)}: expected ${desired.length} goal items, found ${after.length}`);
  }
  // COUNT was asserted; QUANTITY was not — and quantity is what decides currentValue/targetValue and
  // therefore every percentage derived from this mission. A row count that matches while a quantity
  // does not is precisely how MSN_PERSKU_ANY sat at targetValue 4 while looking correctly seeded.
  const wantByProduct = new Map(desired.map((d) => [d.productId, Number(d.quantity)]));
  const wrong = after
    .filter((r) => Number(r.quantity) !== wantByProduct.get(r.productId))
    .map((r) => `${r.productId}: ${r.quantity} (want ${wantByProduct.get(r.productId)})`);
  if (wrong.length) {
    throw new Error(`${missionName(spec)}: goal-item quantities did not land — ${wrong.join('; ')}`);
  }
  return after.length;
}

/* ── Banner artwork ─────────────────────────────────────────────────────────── */

/**
 * Upload the three banner SVGs (one per goal type) and return `{ key: url }`.
 *
 * Idempotent by FIXED FILE NAME, not by timestamp: an already-serving asset is reused untouched, so
 * the URL is the same on every run. That matters twice over — `bannerUrl` is part of
 * `missionSignature`, so a churning URL would delete and recreate every mission on every seed; and a
 * Published mission is immutable, so a URL that moves cannot be corrected in place afterwards.
 *
 * `--reupload-banners` forces the bytes back up when the artwork itself has been edited (the URL is
 * unchanged, so no mission is recreated — the same address simply serves the new image).
 */
async function uploadBanners() {
  const urls = {};
  for (const [key, b] of Object.entries(BANNERS)) {
    const existing = REUPLOAD_BANNERS ? null : await servingBannerUrl(key);
    if (existing) { urls[key] = existing; verbose(`banner ${key}: already serving — reused (${existing})`); continue; }
    const bytes = readFileSync(join(ROOT, bannerSourceRel(key)));
    const info = await uploadAsset(BANNER_FOLDER, b.file, bytes, BANNER_CONTENT_TYPE);
    urls[key] = info.url;
    verbose(`banner ${key}: uploaded ${b.file} → ${info.url}`);
  }
  return urls;
}

/**
 * The URL an already-uploaded banner serves at, or null.
 *
 * The address is READ BACK from the platform's own folder listing rather than composed here. The
 * upload returns an absolute `https://<host>/cms-content/assets/…` URL, and hand-building that string
 * would bake this deployment's asset-storage layout into the seeder — the GOLDEN RULE case: correct
 * once, then silently wrong (every run re-uploading, or every mission pointing at a 404) the moment a
 * deployment stores blobs anywhere else.
 */
async function listBannerFolder() {
  const r = await api('GET', `/api/assets?folderUrl=${encodeURIComponent(BANNER_FOLDER)}`, null, { expectStatus: [200, 201] });
  return (r?.results || []).filter((x) => x.type !== 'folder');
}

async function servingBannerUrl(key) {
  const entry = (await listBannerFolder()).find((x) => x.name === BANNERS[key].file);
  if (!entry?.url) return null;
  return (await assetUrlOk(entry.url)) ? entry.url : null;
}

/**
 * Prove the banner is actually FETCHABLE and is an image. An unreachable or wrong-typed bannerUrl
 * renders as a blank card, which reads as a storefront bug — so it is asserted here, at the only point
 * where the cause is still visible.
 */
async function verifyBannerServes(key, url) {
  if (DRY_RUN) return { key, url, status: 'dry-run', contentType: null };
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}`);
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !/^image\//i.test(contentType)) {
    throw new Error(`banner ${key} at ${url} → HTTP ${res.status}, content-type "${contentType}" (expected 2xx + image/*)`);
  }
  return { key, url, status: res.status, contentType };
}

/** Remove the uploaded banner assets. Full teardown only — a scoped one leaves siblings using them. */
async function deleteBanners() {
  // Only what is actually THERE is deleted. Deleting an already-absent asset does not no-op on this
  // platform — it answers HTTP 500 *"Could not find file …"* — so a blind delete makes the second
  // teardown of an already-clean env fail, which reads as a broken teardown rather than a finished one.
  const present = new Set((await listBannerFolder()).map((e) => e.name));
  const removed = [];
  for (const [key, b] of Object.entries(BANNERS)) {
    if (!present.has(b.file)) { verbose(`banner ${key}: already absent`); continue; }
    const rel = bannerAssetRel(key);
    await api('DELETE', `/api/assets?urls=${encodeURIComponent(rel)}`, null, { expectStatus: [200, 204] });
    removed.push(rel);
  }
  const residue = await verifyRemoved(async () => {
    const still = [];
    for (const key of Object.keys(BANNERS)) if (await servingBannerUrl(key)) still.push(key);
    return still;
  });
  if (residue > 0) throw new Error(`teardown left ${residue} banner asset(s) serving under ${BANNER_FOLDER}`);
  return removed;
}

/* ── Progress provisioning (VCST-5346) ──────────────────────────────────────
 *
 * The storefront's mission card renders PROGRESS, and progress has no write API on this build: the
 * only writer is `LoyaltyMissionHandler : IEventHandler<OrderChangedEvent>` filtered to
 * `EntryState.Added`, which enqueues `ProcessOrderAsync` on Hangfire. There is no order-STATUS gate,
 * so a plain `POST /api/order/customerOrders` provisions it — no cart, no checkout, no payment, no
 * browser. Everything here exists to make that one order produce a deterministic set of states.
 *
 * WHY A RE-PROVISION DELETES AND RECREATES *EVERY* MISSION, not just the ones whose state is wrong.
 * A given order contributes to a given mission exactly once (`TransactionExistsAsync(missionId,
 * orderId, userId)` plus a unique index), and a progress row cannot be deleted, edited or reset
 * through any API. So the only way back to a known progress state is a mission with a NEW id — at
 * which point a fresh order must be placed for it. But that fresh order also lands on every OTHER
 * mission that still carries progress from the previous order, adding a second contribution and
 * silently pushing e.g. MSN_ORDERCOUNT from 1/2 to 2/2. Recreating the whole set makes the resulting
 * progress a pure function of (the spec set) x (one order) instead of of the run history. It is a big
 * hammer, so it only swings when the live state does NOT already match: on an unchanged env the
 * seeder reuses everything and touches nothing.
 */

/** The account whose progress this is — resolved through the role registry, never as a literal. */
async function resolveProgressOwner() {
  const role = resolveRole(roleByKey(PROGRESS_USER_ROLE));
  if (!role.email) {
    throw new Error(
      `cannot resolve the ${PROGRESS_USER_ROLE} role's email (looked for ${roleByKey(PROGRESS_USER_ROLE).emailVars.join('|')} in .env.${process.env.TEST_ENV || 'vcst'}). `
      + 'The progress fixtures need a real storefront account; an order with no customer writes progress nobody can query.',
    );
  }
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(role.email)}`, null, { expectStatus: [200, 404] });
  // MUST be the SECURITY-ACCOUNT id, not the contact/member id. The write side stores
  // `order.CustomerId` verbatim (`context.UserId = order.CustomerId`, no lookup) while the read side
  // keys on `GetCurrentUserId()` = the `sub` claim = AspNetUsers.Id. Using `memberId` writes a row the
  // storefront can never see, and it fails SILENTLY — the page just shows nothing started.
  if (!u?.id) {
    throw new Error(`security account for ${role.email} not found — cannot place the progress order (seed the user first: npm run seed:users)`);
  }
  return { email: role.email, userId: u.id, userName: u.userName || role.email, memberId: u.memberId || '' };
}

/** Live progress rows for our fixtures, keyed by missionId. */
async function liveProgressByMission(missionIds, userId) {
  if (!missionIds.length) return new Map();
  const r = await api('POST', '/api/loyalty-mission-progress/search', { missionIds, userId, take: 200 }, { expectStatus: [200, 201] });
  return new Map((r?.results || []).map((p) => [p.missionId, p]));
}

/** Does a live progress row match what the spec declares? A missing row never matches. */
function progressMatches(spec, row) {
  if (!row) return false;
  const want = predictProgress(spec);
  if (!want) return false;
  return row.status === want.status
    && percentagesMatch(Number(row.percentage), want.percentage)
    && Number(row.currentValue) === want.currentValue
    && Number(row.targetValue) === want.targetValue;
}

async function findProgressOrder(order = PROGRESS_ORDER) {
  const number = progressOrderNumber(order);
  const r = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 5 }, { expectStatus: [200, 201] });
  return (r?.results || []).find((o) => o.number === number) || null;
}

/** Delete EVERY seed order. Returns how many were removed. */
async function deleteProgressOrder() {
  let removed = 0;
  for (const order of PROGRESS_ORDERS) {
    const found = await findProgressOrder(order);
    if (!found) continue;
    await api('DELETE', `/api/order/customerOrders?${idsParam([found.id])}`, null, { expectStatus: [200, 204] });
    verbose(`deleted provisioning order ${found.number}`);
    removed++;
  }
  return removed;
}

/** The money shape the platform ACTUALLY stored, read off an order entity. Never authored. */
const observedMoney = (o) => ({
  sub: Number(o?.subTotal ?? 0),
  discount: Number(o?.discountTotal ?? 0),
  shipping: Number(o?.shippingTotal ?? 0),
  tax: Number(o?.taxTotal ?? 0),
  total: Number(o?.total ?? 0),
  currency: o?.currency || '',
});

/**
 * Create the provisioning order if it is not already there. Deliberately NOT a rebuild-on-drift: a
 * second order would add a SECOND contribution to every mission it matches, so an order that exists is
 * always reused. The caller deletes it first when a genuine re-provision is needed.
 *
 * `catalogId` is mandatory on a line item — omitting it fails as a raw SQL NOT NULL violation
 * (HTTP 500, verified live), not as a readable validation error.
 */
async function ensureProgressOrder(order, owner, products, currency) {
  const number = progressOrderNumber(order);
  const existing = await findProgressOrder(order);
  if (existing) {
    if (existing.customerId !== owner.userId) {
      throw new Error(
        `${number} exists but is owned by ${existing.customerId}, not ${owner.email} (${owner.userId}). `
        + 'Its progress landed under the wrong account and the storefront cannot see it. Re-run after `--teardown`.',
      );
    }
    verbose(`provisioning order ${number} exists → ${existing.id}`);
    const back = await api('GET', `/api/order/customerOrders/${existing.id}`, null, { expectStatus: [200] });
    return { id: existing.id, created: false, money: observedMoney(back) };
  }
  const body = {
    number,
    storeId: STORE_ID,
    currency,
    status: order.status,
    customerId: owner.userId,
    customerName: `AGENT-TEST Missions (${owner.email})`,
    items: order.lines.map((l) => {
      const p = products?.[l.slot];
      if (!p?.id) throw new Error(`order ${order.key} line ${l.slot} has no resolved product`);
      const item = {
        sku: p.sku, productId: p.id, catalogId: p.catalogId, name: p.name,
        quantity: l.quantity, price: lineUnitPrice(l), productType: 'Physical', currency,
      };
      // A PER-UNIT discount. Measured live (2026-08-28): `discountAmount` survives a CREATE — an
      // order of A x2 @30 with discountAmount 5.25 plus B x1 @42.50 and 24.50 shipping stored
      // sub=102.50, discountTotal=10.50, shippingTotal=24.50, TOTAL=116.50. That divergence between
      // merchandise value and total is the whole reason this order exists in this shape.
      if (Number(l.unitDiscount || 0) > 0) item.discountAmount = Number(l.unitDiscount);
      return item;
    }),
  };
  // Shipping is a SHIPMENT, not an order-level field: the platform folds `shipments[].price` back
  // into order.Total and recomputes the order-level figure, so writing shippingTotal directly is
  // silently discarded (the lesson seed-sales-rep.mjs records from the other direction).
  if (Number(order.shippingPrice || 0) > 0) {
    const p = Number(order.shippingPrice);
    body.shipments = [{
      shipmentMethodCode: 'FixedRate', shipmentMethodOption: 'Ground', currency,
      price: p, priceWithTax: p, total: p, totalWithTax: p,
      status: 'New', number: `${number}-S1`, items: [],
    }];
  }
  if (Number(order.taxTotal || 0) > 0) body.taxTotal = Number(order.taxTotal);

  const created = await api('POST', '/api/order/customerOrders', body, { expectStatus: [200, 201] });
  const back = await api('GET', `/api/order/customerOrders/${created?.id}`, null, { expectStatus: [200] });
  const money = observedMoney(back);
  log(`  ✓ order ${number} → ${created?.id} (${owner.email}, ${order.lines.map((l) => `${l.slot}x${l.quantity}`).join(' + ')})`);
  log(`      observed: sub=${money.sub} discount=${money.discount} shipping=${money.shipping} tax=${money.tax} TOTAL=${money.total} ${money.currency}`);
  return { id: created?.id, created: true, money };
}

/**
 * The seed order's money shape must DIVERGE, or the OrderValue fixtures are decorative.
 *
 * This runs against what the PLATFORM STORED, immediately after the write, because the spec asking
 * for a shipping charge is not evidence that the platform kept one. A collapse here is not a warning:
 * every OrderValue target was derived from the predicted gaps, so if the observed gaps are different
 * the targets no longer divide anything and the run would seed a set that cannot fail. Louder now is
 * cheaper than a green suite that proves nothing.
 */
function assertMoneyDiverges(cashMoney, pointsMoney) {
  const predicted = orderMoney();
  const problems = [];
  if (!(cashMoney.shipping > 0 || cashMoney.tax > 0)) {
    problems.push(`the cash order stored NO shipping and NO tax (total ${cashMoney.total} = merchandise ${cashMoney.sub} - discount ${cashMoney.discount}) — merchandise value and order.Total are the same number, so no OrderValue case can distinguish them`);
  }
  if (!(cashMoney.discount > 0)) {
    problems.push(`the cash order stored NO discount — gross and net merchandise are the same number, so "a discount reduces spend progress" cannot fail`);
  }
  if (!(pointsMoney.total > 0)) {
    problems.push(`the points order stored a total of ${pointsMoney.total} — MSN_ORDERVALUE_POINTS's target was derived from a non-zero points contribution and now sits outside any real band`);
  }
  const observed = {
    netMerchandise: cashMoney.sub - cashMoney.discount,
    grossMerchandise: cashMoney.sub,
    orderTotal: cashMoney.total,
    totalPlusPoints: cashMoney.total + pointsMoney.total,
  };
  for (let i = 1; i < READING_ORDER.length; i++) {
    const lo = READING_ORDER[i - 1]; const hi = READING_ORDER[i];
    if (!(observed[hi] - observed[lo] > 0.01)) {
      problems.push(`observed readings ${lo} (${observed[lo]}) and ${hi} (${observed[hi]}) collapsed onto one number`);
    }
  }
  for (const key of READING_ORDER) {
    const want = readingValues(predicted)[key];
    if (Math.abs(want - observed[key]) > 0.01) {
      problems.push(`observed ${key} is ${observed[key]} but the committed spec predicts ${want} — every OrderValue target was derived from the prediction, so each one may now sit outside the band it was chosen to divide`);
    }
  }
  if (problems.length) {
    throw new Error(
      'the seed orders did not land with a DISCRIMINATING money shape:\n    - '
      + problems.join('\n    - ')
      + '\n  Fix the order spec (or the platform behaviour) before relying on any OrderValue fixture — '
      + 'a set that seeds cleanly here is exactly how the flat $30 order passed for two sprints.',
    );
  }
  return observed;
}

/**
 * Wait for Hangfire to write the progress the order implies, then assert it. Polling rather than a
 * fixed sleep because the write is asynchronous: asserting immediately reads an empty table and
 * reports a provisioning failure that is really a race.
 */
async function awaitProgress(specs, userId, missionIdByAlias, { attempts = 20, intervalMs = 3000 } = {}) {
  const ids = specs.map((s) => missionIdByAlias[s.aliasName]).filter(Boolean);
  let live = new Map();
  for (let i = 0; i < attempts; i++) {
    live = await liveProgressByMission(ids, userId);
    if (specs.every((s) => progressMatches(s, live.get(missionIdByAlias[s.aliasName])))) return live;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const detail = specs.map((s) => {
    const row = live.get(missionIdByAlias[s.aliasName]);
    const want = predictProgress(s);
    return `${s.aliasName}: want ${want.status} ${want.percentage}% (${want.currentValue}/${want.targetValue}), got ${row ? `${row.status} ${row.percentage}% (${row.currentValue}/${row.targetValue})` : 'NO PROGRESS ROW'}`;
  }).join('\n    ');
  throw new Error(`progress did not reach the declared state within ${(attempts * intervalMs) / 1000}s:\n    ${detail}`);
}

/** A token for the customer-facing GraphQL. `/graphql` needs its own bearer; seed-common keeps its private. */
async function graphqlToken() {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: ADMIN, password: ADMIN_PASSWORD, scope: 'offline_access' }),
  });
  if (!res.ok) throw new Error(`graphql token failed: ${res.status}`);
  return (await res.json()).access_token;
}

/**
 * Assert the states through the query the FRONTEND actually reads.
 *
 * The admin REST search above proves the rows exist; it cannot prove the storefront sees them, and it
 * cannot see `daysRemaining` at all — that field is computed per request in the xAPI resolver and is
 * never persisted, so the danger-badge fixture is unverifiable anywhere else. Run as admin with an
 * explicit `userId` (the authorization handler allows admin-or-self), which keeps the seeder from
 * needing the customer's password.
 */
async function verifyViaCustomerQuery(userId, locales) {
  const token = await graphqlToken();
  // `cultureName` is REQUIRED here, and its absence is not a stylistic difference. Measured on vcst-qa
  // 2026-08-28: without it the `description` resolver throws `ARGUMENT_NULL` for EVERY item and the
  // field comes back null — including for a mission whose stored description the admin API returns in
  // full. `name` resolves either way, so a query that omits the culture reads as "no mission has a
  // description" and a description case would assert an absence that is an artefact of the query.
  const culture = locales?.['store-default'];
  const query = `query($s:String!,$u:String,$c:String){ loyaltyMissionProgress(storeId:$s userId:$u first:100 cultureName:$c){ totalCount items {
    missionId name description status percentage currentValue targetValue daysRemaining isStarted missionType
    items { productId currentQuantity targetQuantity } } } }`;
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables: { s: STORE_ID, u: userId, c: culture } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`loyaltyMissionProgress failed: ${JSON.stringify(json.errors).slice(0, 300)}`);
  const byName = new Map((json.data?.loyaltyMissionProgress?.items || []).map((i) => [i.name, i]));

  const problems = [];
  for (const spec of progressFixtures()) {
    const card = byName.get(missionName(spec));
    const want = predictProgress(spec);
    if (!card) { problems.push(`${spec.aliasName}: absent from the customer-facing query entirely`); continue; }
    if (card.status !== want.status) problems.push(`${spec.aliasName}: status ${card.status}, expected ${want.status}`);
    if (!percentagesMatch(Number(card.percentage), want.percentage)) problems.push(`${spec.aliasName}: percentage ${card.percentage}, expected ${want.percentage}`);
    if (card.isStarted !== true) problems.push(`${spec.aliasName}: isStarted=false — the card renders a transient 0% placeholder, not a real progress row`);
    // The danger badge is a pure function of daysRemaining, and this is the ONLY surface that reports it.
    // `Number.isFinite` is load-bearing: an open-ended window declares endOffsetDays === null, and
    // `null < 10` is TRUE in JS — without the guard this would demand a numeric daysRemaining below the
    // threshold from the one fixture whose whole point is that it has none.
    if (Number.isFinite(WINDOWS[spec.window]?.endOffsetDays) && WINDOWS[spec.window].endOffsetDays < DANGER_THRESHOLD_DAYS) {
      if (!(card.daysRemaining < DANGER_THRESHOLD_DAYS)) {
        problems.push(`${spec.aliasName}: daysRemaining=${card.daysRemaining}, not below the ${DANGER_THRESHOLD_DAYS}-day danger threshold — the badge renders warning`);
      }
    }
    const rows = card.items || [];
    if (want.rows.length && rows.length !== want.rows.length) problems.push(`${spec.aliasName}: ${rows.length} SKU row(s), expected ${want.rows.length}`);
    if (want.rows.length) {
      const met = rows.filter((r) => r.currentQuantity >= r.targetQuantity).length;
      if (met !== want.rowsMet) problems.push(`${spec.aliasName}: ${met} target-met SKU row(s), expected ${want.rowsMet}`);
    }
    log(`  ✓ ${spec.aliasName.padEnd(24)} ${String(card.status).padEnd(11)} ${String(card.percentage).padEnd(5)}% ${card.currentValue}/${card.targetValue} daysRemaining=${card.daysRemaining} rows=${rows.map((r) => `${r.currentQuantity}/${r.targetQuantity}`).join(',') || '—'}`);
  }
  // MSNF-045: every fixture that AUTHORS a description must SERVE it on the surface the storefront
  // modal reads. The admin API round-trip the write path already asserts proves only that the text is
  // STORED; whether the customer-facing resolver hands it back is a separate question, and it is the
  // question the case asks. A stored-but-unserved description is precisely the half-run the fixture
  // was added to end, so it is asserted here rather than assumed.
  for (const spec of MISSIONS) {
    const want = spec.l10n?.description?.['store-default'];
    if (!want) continue;
    const card = byName.get(missionName(spec));
    if (!card) { log(`  ℹ ${spec.aliasName}: not returned by this query run — description check skipped`); continue; }
    if (card.description !== want) {
      problems.push(`${spec.aliasName}: the customer-facing query returns description ${JSON.stringify(card.description)}, expected ${JSON.stringify(want)} for culture ${culture}`);
    } else {
      log(`  ✓ ${spec.aliasName.padEnd(24)} description served in ${culture} (${want.length} chars)`);
    }
  }

  // MSNF-020: the open-ended fixture is verified on the SAME surface, and it is the only assertion
  // that can prove it. `daysRemaining` is computed per request and never stored, so nothing static and
  // nothing in the admin API can tell a null from a number here — and a null is precisely what the
  // storefront's untested date-badge branch keys on. Reported rather than thrown when the fixture is
  // simply absent from this run (a --only pass), but a NON-null value is a hard failure: it means the
  // mission acquired an end date and the fixture has silently become an ordinary one.
  const openSpec = MISSION_BY_ALIAS.MSN_OPEN_ENDED;
  if (openSpec) {
    const card = byName.get(missionName(openSpec));
    if (!card) {
      log(`  ℹ ${openSpec.aliasName}: not returned by this query run — skipped (it has no progress row of its own)`);
    } else if (card.daysRemaining !== null) {
      problems.push(`${openSpec.aliasName}: daysRemaining=${card.daysRemaining}, expected null — the mission has acquired an end date, so the null-daysRemaining badge branch is unreachable again`);
    } else {
      log(`  ✓ ${openSpec.aliasName.padEnd(24)} daysRemaining=null (open-ended)`);
    }
  }

  if (problems.length) throw new Error(`the customer-facing query does not show the declared states:\n    ${problems.join('\n    ')}`);
}

/* ── Group-targeting audience ───────────────────────────────────────────────
 *
 * A group-targeted fixture is worth nothing without two accounts that are provably on OPPOSITE sides
 * of the group, and "provably" has to mean OBSERVED, not declared: the committed registry records who
 * we intend the audience to be, and this is the step that checks the env agrees. Both directions are
 * asserted because each fails silently on its own —
 *   - the member drifting OUT of the group makes MSN_GROUP_VIP invisible to everyone, which reads as a
 *     targeting bug rather than as a fixture problem;
 *   - the non-member drifting IN makes "a non-member does not see it" unfalsifiable, and the case
 *     passes forever. That one is not hypothetical: LOYALTY_NOBAL_USER already carries groups
 *     ["VIP"] despite its name suggesting an unrelated purpose, so the wrong pick was one line away.
 *
 * Verified in source: the groups come from the CONTACT's `Groups` collection via
 * `IMemberResolver.ResolveMemberByIdAsync(securityUserId)`, and the comparison is whole-string
 * OrdinalIgnoreCase. `groupsInclude` mirrors that, so this agrees with the predicate that will really
 * decide visibility rather than with a stricter one of our own.
 */
async function resolveAudienceAccount(roleKey) {
  const decl = roleByKey(roleKey);
  const role = resolveRole(decl);
  if (!role.email) {
    throw new Error(
      `cannot resolve the ${roleKey} role's email (looked for ${decl.emailVars.join('|')} in .env.${process.env.TEST_ENV || 'vcst'}). `
      + 'The group-targeted fixtures need both audience accounts; without one, targeting cannot be observed in either direction.',
    );
  }
  const acct = await api('GET', `/api/platform/security/users/${encodeURIComponent(role.email)}`, null, { expectStatus: [200, 404] });
  if (!acct?.id) {
    throw new Error(`security account for ${roleKey} (${role.email}) not found — seed the loyalty users first (npm run seed:loyalty-users)`);
  }
  // The group lives on the MEMBER, not the account: GetUserGroups resolves securityUserId -> memberId
  // -> member.Groups. An account with no member record yields a NULL UserGroups server-side, at which
  // point every UserGroupIsCondition returns false and the mission vanishes with no error.
  if (!acct.memberId) {
    throw new Error(
      `${roleKey} (${role.email}) has a security account but no memberId. The server reads groups off the `
      + 'CONTACT, so this account can never satisfy a UserGroupIsCondition — every targeted mission would '
      + 'silently disappear for it, and the absence would read as a product bug.',
    );
  }
  const member = await api('GET', `/api/members/${encodeURIComponent(acct.memberId)}`, null, { expectStatus: [200, 404] });
  const groups = Array.isArray(member?.groups) ? member.groups.map(String) : [];
  return { role: roleKey, email: role.email, userId: acct.id, memberId: acct.memberId, groups };
}

async function resolveGroupAudience() {
  const member = await resolveAudienceAccount(GROUP_AUDIENCE.memberRole);
  const nonMember = await resolveAudienceAccount(GROUP_AUDIENCE.nonMemberRole);

  if (!groupsInclude(member.groups, TARGET_GROUP)) {
    throw new Error(
      `${member.role} (${member.email}) carries groups ${JSON.stringify(member.groups)}, which do not include `
      + `"${TARGET_GROUP}". The group-targeted fixtures would have NO audience at all, so "a targeted mission `
      + 'reaches its group" could never be observed — and the resulting absence would read as a targeting defect.',
    );
  }
  if (groupsInclude(nonMember.groups, TARGET_GROUP)) {
    throw new Error(
      `${nonMember.role} (${nonMember.email}) is ALSO in "${TARGET_GROUP}" (groups ${JSON.stringify(nonMember.groups)}). `
      + 'With both control accounts inside the audience, "a non-member does NOT see it" cannot fail, and the '
      + 'positive control proves nothing — a mission with no targeting at all would pass identically.',
    );
  }
  log(`  audience: ${member.role} ${member.email} groups=${JSON.stringify(member.groups)} (in "${TARGET_GROUP}")`);
  log(`            ${nonMember.role} ${nonMember.email} groups=${JSON.stringify(nonMember.groups)} (NOT in "${TARGET_GROUP}")`);
  return { member, nonMember };
}

/* ── Product resolution ─────────────────────────────────────────────────────── */

/**
 * Resolve the two PerSku target products by LIVE DISCOVERY, never by a committed SKU. Sorted by SKU
 * before slicing so a re-run against an unchanged catalog picks the SAME two products and the overlay
 * stops churning. Their ids AND skus are per-env, so both go to the overlay — a SKU is a business key
 * for a fixture we author, but these are products we merely FOUND, so nothing about them is invariant.
 */
async function resolveTargetProducts(storeCurrency) {
  // Live discovery is still used — but ONLY to find a REFERENCE product, never as a fixture. What is
  // borrowed from it is the catalog, the category and a pricelist that a real, sold product on this
  // env already sits in; those are per-env configuration and authoring them would be a committed
  // guess (`.claude/rules/test-data.md` GOLDEN RULE). What is NOT borrowed is identity, price or
  // currency — that is exactly the part discovery cannot constrain, and picking the first two
  // discovered products is how a EUR 455 row landed beside a USD 25 one in the featured-SKU modal.
  const found = await discoverCatalogProducts(api, 12);
  const usable = found.filter((p) => p.id && p.sku).sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
  if (!usable.length) {
    throw new Error(
      'no catalog product could be discovered to borrow a catalog/category/pricelist from. '
      + 'Seed the catalog first (npm run seed:catalog).',
    );
  }
  const reference = usable[0];
  verbose(`reference product for catalog/category/pricelist: ${reference.sku} (${reference.id})`);

  const out = {};
  for (const spec of [...PERSKU_PRODUCTS, ZERO_STOCK_PRODUCT]) {
    out[spec.slot] = await ensureFixtureProduct(spec, reference, storeCurrency);
  }
  out[POINTS_PRODUCT.slot] = await resolvePointsProduct();
  return out;
}

/**
 * The points-priced target: FOUND through another fixture's alias, never created and never priced
 * here. Its SKU lives in `test-data/aliases.json` under LOY_SKU_PTS_UNIT, which is the one place this
 * repo declares it — naming it again in the missions spec would be a second copy that can drift.
 *
 * The RESOLVED price and currency are read back and checked against what the spec's arithmetic
 * assumes, because every points target (MSN_ORDERVALUE_POINTS's threshold, the reward-spendability
 * check) is derived from that unit price. A silent change there moves every one of them at once.
 */
async function resolvePointsProduct() {
  const aliases = loadAliases();
  const src = aliases?.[POINTS_PRODUCT.sourceAlias];
  const sku = src?.sku || src?.code;
  if (!sku) {
    throw new Error(
      `${POINTS_PRODUCT.aliasName} resolves through ${POINTS_PRODUCT.sourceAlias}, which declares no sku in test-data/aliases.json. `
      + 'Without a points-priced product the currency-blindness fixtures (MSN_PERSKU_PTS, MSN_ORDERVALUE_POINTS) ask nothing.',
    );
  }
  const r = await api('POST', '/api/catalog/listentries', { keyword: sku, take: 10 }, { expectStatus: [200, 201, 400, 404] });
  const hit = (r?.listEntries || r?.results || []).find((p) => p.code === sku && p.type === 'product');
  if (!hit) {
    throw new Error(
      `the points-priced product ${sku} (${POINTS_PRODUCT.sourceAlias}) does not exist on this env. `
      + 'Seed it first: `npm run seed:loyalty-fixtures`. Without it MSN_PERSKU_PTS and MSN_ORDERVALUE_POINTS '
      + 'would seed against nothing and their questions would silently go unasked.',
    );
  }
  const priced = await api('POST', '/api/catalog/products/prices/search', { productIds: [hit.id], take: 20 }, { expectStatus: [200, 201] });
  const prices = ((priced?.results || [])[0]?.prices || []);
  const loyaltyCurrency = String(src.currency || '').toUpperCase();
  const price = prices.find((p) => String(p.currency).toUpperCase() === loyaltyCurrency) || prices[0];
  if (!price) {
    throw new Error(`${sku} carries no price at all — a points target with no price cannot be bought and the fixture is inert`);
  }
  if (Number(price.list) !== Number(POINTS_PRODUCT.listPrice)) {
    throw new Error(
      `${sku} is priced ${price.list} ${price.currency} but missions-specs.mjs assumes ${POINTS_PRODUCT.listPrice}. `
      + 'That number is the divisor for MSN_ORDERVALUE_POINTS\'s derived threshold and for the reward-spendability '
      + 'check, so both are now wrong. Update POINTS_PRODUCT.listPrice (and re-check the derived targets) or restore the price.',
    );
  }
  log(`  ✓ points target ${POINTS_PRODUCT.slot}: ${sku} — priced ${price.list} ${price.currency} (found via ${POINTS_PRODUCT.sourceAlias}, not created)`);
  return {
    id: hit.id, sku, name: src.name || POINTS_PRODUCT.productName,
    catalogId: hit.catalogId, currency: price.currency, listPrice: Number(price.list),
  };
}

/* ── MSNF-035: the created zero-stock target ──────────────────────────────────
 *
 * Find-or-create by SKU, then hold it at zero stock. Three decisions worth stating:
 *
 * 1. IT INHERITS ITS NEIGHBOUR'S CATALOG, CATEGORY AND PRICELIST rather than authoring any of them.
 *    Slot A is a product this env already sells — it is in the store's catalog, in a category the
 *    storefront renders, and priced in a pricelist the store resolves. Copying those three from it is
 *    the GOLDEN RULE applied to provisioning: an authored catalog/category/currency would be a
 *    committed guess about per-env config, and the failure mode is a product that exists, resolves
 *    through @td(), and is invisible to the storefront — which reads as the modal being broken.
 * 2. THE PRICE IS SET, NOT SKIPPED. An unpriced row renders as broken, and "broken" is a different
 *    observation from "out of stock" — a case that cannot tell them apart files the wrong defect.
 * 3. THE ZERO IS RE-ASSERTED ON EVERY RUN. Inventory is the one property of this fixture that another
 *    process can change without touching anything this seeder owns, so it is written every time
 *    rather than only at create, and read back.
 */
/**
 * EXISTENCE, by exact code — never by `keyword`.
 *
 * `POST /api/catalog/listentries { keyword, take: N }` cannot be relied on for a hyphenated
 * `AGENT-TEST-MSN-` SKU. Measured on vcst-qa 2026-09-01 against a product the indexer had already
 * reported as `"Indexation completed successfully" totalCount=1 processedCount=1 errorCount=0`:
 *
 *   keyword, take=5  → totalCount=31, listEntries=[]     ← what both callers below used to ask
 *   keyword, take=20 → totalCount=31, listEntries=[]
 *   keyword, take=50 → totalCount=31, listEntries=[<the product>]
 *   code,    take=50 → totalCount=1,  listEntries=[<the product>]     ← exact, and not a window
 *
 * `listentries` browses the catalog TREE: `totalCount` counts categories as well as products, and the
 * tokenised SKU matches dozens of category rows that fill the first pages. Both callers were
 * therefore paging-dependent, and they failed in OPPOSITE, equally bad directions — the readiness gate
 * failed CLOSED and blamed the environment for a product that was live in under 6 s, while this
 * lookup failed OPEN, concluded the product did not exist, and re-created it into a duplicate-key
 * HTTP 500 (`IX_Code_CatalogId`) that no re-run could clear. Raising `take` is not the fix: it is a
 * magic number that re-breaks silently as the catalog grows. `catalogId` scoping is worse still — the
 * same measurement returned totalCount=0 for a product that demonstrably IS in that catalog.
 *
 * This is the pattern `seed-missions-e2e.mjs` `findProductByCode` already uses, including its rule
 * that ABSENCE IS A CONCLUSION, not a default: a response that returned fewer rows than it counted
 * has not answered the question and must never be read as "create it". (That seeder expresses the
 * rule as the exported `absenceIsProven` predicate; it is restated inline here rather than imported,
 * because reaching into the E2E spec module from the non-E2E seeder would couple two independent
 * fixture sets. The honest fix is to promote `absenceIsProven` to `scripts/lib/seed-common.mjs` so
 * both seeders share ONE implementation — noted rather than done, to keep this change single-purpose.)
 */
async function findProductByCode(code) {
  const r = await api('POST', '/api/catalog/listentries', { code, take: 50 }, { expectStatus: [200, 201, 400, 404] });
  const entries = (r?.listEntries || r?.results || []);
  const hit = entries.find((p) => p.code === code && String(p.type).toLowerCase() === 'product');
  if (hit) return { id: hit.id, code, name: hit.name, catalogId: hit.catalogId };
  if (Number(r?.totalCount || 0) > entries.length) {
    throw new Error(
      `catalog lookup for ${code} was inconclusive (totalCount=${r?.totalCount}, returned=${entries.length}) — `
      + 'refusing to treat a truncated response as proof the product does not exist',
    );
  }
  return null;
}

/**
 * INDEXED? A different question, so a different probe — and deliberately NOT `findProductByCode`.
 *
 * Existence above is answered by an exact-code criterion; reusing it here would make the index guard
 * pass for every product that merely EXISTS, quietly deleting the one check standing between
 * "fixtures created" and "fixtures the storefront can actually see". Addressed by id, so no keyword
 * window can truncate it — same shape as `seed-missions-e2e.mjs` `isIndexed`. Fail-CLOSED: an error
 * counts as "not indexed".
 */
async function isIndexed(productId) {
  const r = await api('POST', '/api/catalog/search/products', { objectIds: [productId], take: 5 }, { expectStatus: [200, 201, 400] }).catch(() => null);
  return (r?.items || r?.results || []).some((p) => p.id === productId);
}

async function ensureFixtureProduct(spec, neighbour, storeCurrency) {
  if (!neighbour?.id) throw new Error(`${spec.aliasName} needs a discovered reference product to inherit its catalog/category/pricelist from`);

  // LOOK-UP ORDER MATTERS, and it is not a micro-optimisation. `/api/catalog/listentries` is
  // INDEX-backed, so a product that exists in the database but has not been indexed yet is invisible
  // to it — and the seeder then tries to create it again and gets a raw HTTP 500 duplicate-key SQL
  // error (observed on vcst-qa, 2026-08-28). The overlay id + `GET /api/catalog/products/{id}` is
  // DATABASE-backed and authoritative, so it is asked FIRST and the index search is only the fallback
  // for an env whose overlay has been cleared.
  let product = null;
  const knownId = productIdFromOverlay(spec.aliasName);
  if (knownId) {
    const byId = await api('GET', `/api/catalog/products/${knownId}`, null, { expectStatus: [200, 404] }).catch(() => null);
    if (byId?.id && byId.code === spec.sku) product = { id: byId.id, sku: spec.sku, name: spec.productName, catalogId: byId.catalogId };
  }
  if (!product) {
    // Deliberately catalog-BLIND. seed-standard-products scopes its equivalent lookup to a catalog
    // because a generic fixture SKU like WH-001 can collide with a real product on the env; this SKU
    // is `AGENT-TEST-MSN-` prefixed and therefore globally unique, and scoping it was measured to
    // return nothing on vcst-qa for a product the unscoped query finds — which sent the seeder
    // straight into a duplicate-key HTTP 500. See findProductByCode for why this is no longer a
    // `listentries` KEYWORD search.
    const hit = await findProductByCode(spec.sku);
    if (hit) product = { id: hit.id, sku: spec.sku, name: spec.productName, catalogId: hit.catalogId || neighbour.catalogId };
  }
  if (!product) {
    const full = await api('GET', `/api/catalog/products/${neighbour.id}`);
    const created = await api('POST', '/api/catalog/products', {
      catalogId: neighbour.catalogId,
      categoryId: full?.categoryId || null,
      code: spec.sku,
      name: spec.productName,
      productType: 'Physical',
      vendor: 'QA',
      isActive: true,
      isBuyable: true,
      // Only the zero-stock fixture tracks inventory — the zero it holds IS that fixture. The
      // buyable targets do NOT, because they are bought by the seed order on every run forever: a
      // tracked target drains and starts blocking cases for a reason that has nothing to do with
      // missions, which is the same slow-decay failure this module exists to prevent.
      trackInventory: spec.trackInventory !== false,
      // 1 and 1, always. `minQuantity`/`packSize` above 1 make the storefront stepper jump, so a case
      // step reading "set the quantity to exactly 1" is unachievable — measured on the product this
      // fixture used to discover into slot B (55557702 carries minQuantity 2).
      minQuantity: Number(spec.minQuantity ?? 1),
      packSize: Number(spec.packSize ?? 1),
      // A STORE-SCOPED SEO record, because the modal row links to the product's PDP and
      // `/product/<sku>` does NOT resolve on this storefront — it renders a client-side 404 behind
      // HTTP 200. Without a slug the out-of-stock row's own link is broken, and a case cannot tell a
      // broken link from the disabled control it is actually asserting. `buildStoreSeo` is the one
      // builder that carries slug + title + store + language, which is what td:reconcile [8] requires.
      seoInfos: [buildStoreSeo({ semanticUrl: spec.sku.toLowerCase(), pageTitle: spec.productName })],
    }, { expectStatus: [200, 201] });
    product = { id: created.id, sku: spec.sku, name: spec.productName, catalogId: neighbour.catalogId };
    log(`  ✓ created target ${spec.slot}: ${spec.sku} (${product.id}) in the catalog of ${neighbour.sku}`);
  } else {
    verbose(`target ${spec.slot} ${spec.sku} already exists (${product.id})`);
  }

  // Price: into the SAME pricelist the neighbour is priced in, so it is visible wherever that is.
  // `POST /api/catalog/products/prices/search` (Pricing module) returns
  // { results: [{ productId, product, prices: [{ pricelistId, currency, list, ... }] }] } — verified
  // live on vcst-qa. There is no `/api/pricing/prices/search`; it 404s.
  // PICKED BY CURRENCY, never by index. `prices[0]` is what this seeder used to take, and it is the
  // direct cause of the mixed-currency modal: the reference product 55557702 carries BOTH a USD 349
  // and a EUR 455 price, so which one `[0]` returns is an ordering accident. The featured-SKU modal
  // sums the rows it renders, so an accidental EUR row manufactures a mixed-currency subtotal — filed
  // as a bug once, and rejected as our own data.
  const neighbourPrices = await api('POST', '/api/catalog/products/prices/search', { productIds: [neighbour.id], take: 20 }, { expectStatus: [200, 201] });
  const candidates = ((neighbourPrices?.results || [])[0]?.prices || []);
  const wantCurrency = String(storeCurrency || '').toUpperCase();
  const ref = candidates.find((p) => String(p.currency).toUpperCase() === wantCurrency);
  if (!ref?.pricelistId) {
    throw new Error(
      `no ${wantCurrency} pricelist could be derived from the reference product ${neighbour.sku} `
      + `(it carries ${candidates.length ? candidates.map((p) => p.currency).join('/') : 'no prices at all'}). `
      + 'Pricing the fixture into a foreign-currency list would put a second currency into the featured-SKU '
      + 'modal, which sums its rows — and pricing it into none would render it as a BROKEN row, which is a '
      + 'different observation from out-of-stock and gets filed as the wrong defect.',
    );
  }
  await api('PUT', '/api/products/prices', [{
    productId: product.id,
    prices: [{ pricelistId: ref.pricelistId, productId: product.id, list: spec.listPrice, currency: ref.currency, minQuantity: 1 }],
  }], { expectStatus: [200, 204] });

  // Inventory. Only the ZERO-STOCK fixture has an inventory story: for it the zero IS the fixture, so
  // it is written at the store's MAIN fulfilment centre (not ffcs[0] — the storefront reads the
  // store's own centre), re-asserted every run, and read back. The buyable targets are
  // `trackInventory: false` and are deliberately given no stock record at all: a stock level is state
  // another process can move, and a fixture bought on every run forever must not be able to decay
  // into a case that fails for a reason unrelated to missions.
  if (spec.trackInventory !== false) {
    const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`);
    const ffcId = store?.mainFulfillmentCenterId || (store?.additionalFulfillmentCenterIds || [])[0];
    if (!ffcId) throw new Error(`store ${STORE_ID} declares no fulfillment centre — the zero-stock level cannot be written anywhere the storefront reads`);
    await api('PUT', '/api/inventory/plenty', [{
      fulfillmentCenterId: ffcId, productId: product.id,
      inStockQuantity: spec.inStockQuantity, reservedQuantity: 0, status: 'Enabled',
    }], { expectStatus: [200, 204] });

    // Read it back. A silently non-zero stock level is exactly the way this fixture goes vacuous: the
    // product still exists, still resolves, still appears in the modal — as an ordinary in-stock row.
    const back = await api('POST', '/api/inventory/search', { productIds: [product.id], take: 10 }, { expectStatus: [200, 201] })
      .catch(() => null);
    const rows = back?.results || back?.items || [];
    const here = rows.find((r) => r.fulfillmentCenterId === ffcId);
    if (here && Number(here.inStockQuantity) !== spec.inStockQuantity) {
      throw new Error(
        `${spec.sku}: inStockQuantity read back as ${here.inStockQuantity}, not ${spec.inStockQuantity} — `
        + 'the out-of-stock row this fixture exists to render would appear as an ordinary in-stock row.',
      );
    }
    const stocked = rows.filter((r) => Number(r.inStockQuantity) > 0);
    if (stocked.length) {
      throw new Error(
        `${spec.sku} carries stock at ${stocked.length} other fulfilment centre(s) (${stocked.map((r) => r.fulfillmentCenterId).join(', ')}) — `
        + 'the storefront may aggregate, so the product would not read as out of stock.',
      );
    }
  }

  // INDEX, THEN PROVE IT. The storefront resolves modal products through the SEARCH INDEX, so a
  // product that exists in the database and is not indexed is INVISIBLE in the mission modal — the
  // fixture would be created, aliased, guarded, and testing nothing. That is the exact vacuity this
  // whole module is written against, so the index is asserted rather than hoped for.
  //
  // TARGETED by document id (`documentIds`), document type `Product`. Both halves are corrections of
  // a measurement recorded here on 2026-08-28 that was wrong in two ways, re-measured on vcst-qa
  // 2026-09-01:
  //
  //   - The scoped form was written `ids: [...]`. The schema field is `documentIds` (IndexingOptions:
  //     documentType, documentIds, deleteExistingIndex, startDate, endDate, batchSize), so `ids` was
  //     silently dropped and what actually ran was a bare incremental — which is why "scoped" and
  //     "incremental" looked indistinguishable.
  //   - `CatalogProduct` is NOT a registered document type on this platform. `GET /api/search/indexes`
  //     registers `Product`, `Category`, `ContentFile`, `Member`, `PickupLocation`, `Pages`,
  //     `CustomerOrder`. A `CatalogProduct` request is accepted (HTTP 200 + a real jobId) and indexes
  //     nothing, which is what produced the `totalCount: 0, processedCount: 0` counters below and the
  //     conclusion that "the incremental indexer processed zero documents". It processed zero
  //     documents because it was addressed to an indexer that does not exist.
  //
  // Re-measured directly: a freshly created product triggered with `CatalogProduct` was still
  // unindexed after 120 s; the same product triggered with `{ documentType: 'Product', documentIds:
  // [id] }` was indexed in under 6 s. A full `rebuild: true` is still deliberately never issued — on
  // a shared QA env that is somebody else's outage. Indexing runs AFTER the price and stock writes so
  // the indexed document carries them. The job result is still captured for the failure message.
  let lastJob = null;
  const reindex = () => api('POST', '/api/search/indexes/index', [{ documentType: 'Product', documentIds: [product.id] }], { expectStatus: [200, 201, 202, 204] })
    .then((r) => { lastJob = r; return r; })
    .catch((e) => verbose(`reindex trigger: ${String(e.message).slice(0, 120)}`));
  // The readiness probe is addressed BY ID (see isIndexed), not by a `listentries` keyword window —
  // that window was paging-dependent and failed CLOSED on a healthy environment, blaming the env for
  // a product that was searchable in under 6 s. Still fail-closed; the timeout below is unchanged.
  const findIndexed = () => isIndexed(product.id);
  let indexed = await findIndexed();
  if (!indexed) {
    await reindex();
    for (let i = 0; i < 12 && !indexed; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      indexed = await findIndexed();
      if (!indexed && i === 5) await reindex();
    }
  }
  if (!indexed) {
    // The queued-job record is NOT the job result. `POST /api/search/indexes/index` returns
    // immediately with `isNew: true, finished: null, totalCount: 0` — the counters are the initial
    // record, not the outcome, and reading them as final is what produced the previous version of
    // this message ("a totalCount of 0 means the indexer found nothing to process"). The real
    // outcome lands on the push-notification feed, so that is where to look, and the jobId is
    // reported for exactly that purpose.
    const counters = lastJob
      ? `last reindex job QUEUED (not a result): jobId=${lastJob.jobId} — read its outcome from `
        + 'POST /api/platform/pushnotifications (IndexProgressPushNotification)'
      : 'no reindex job was successfully queued';
    throw new Error(
      `${spec.sku} exists (${product.id}) but did not become searchable through the storefront's own `
      + `index-backed products() query within ~2 min. ${counters}. `
      + 'The storefront resolves mission-modal products through that index, so the modal row would simply not render — the '
      + 'fixture would look seeded and test nothing. Check the push-notification feed first: an '
      + '"Indexation completed successfully" with totalCount=1 means the document IS indexed and the '
      + 'problem is this probe, not the environment. Otherwise wait for the environment\'s own indexing '
      + 'to recover and re-run; a full product rebuild on a shared QA env is somebody else\'s outage.',
    );
  }

  const stockLabel = spec.trackInventory === false ? 'untracked' : `stock ${spec.inStockQuantity}`;
  log(`  ✓ target ${spec.slot}: ${spec.sku} — ${spec.productName} (${stockLabel}, priced ${spec.listPrice} ${ref.currency}, minQty ${spec.minQuantity ?? 1}, indexed)`);
  return { ...product, currency: ref.currency, listPrice: Number(spec.listPrice) };
}

/**
 * The zero-stock product's id as this env's overlay last recorded it. Read directly rather than
 * through the resolver so the seeder has no dependency on the resolver's own alias contract, and
 * returns '' rather than throwing on a missing/unparsable overlay — an absent id is an ordinary
 * first-seed state, not an error.
 */
function productIdFromOverlay(aliasName) {
  const env = process.env.TEST_ENV || 'vcst';
  try {
    const raw = readFileSync(join(ROOT, `test-data/aliases.${env}.json`), 'utf8');
    return JSON.parse(raw)?.[aliasName]?.productId || '';
  } catch { return ''; }
}

/* ── Main ───────────────────────────────────────────────────────────────────── */

async function seed() {
  /** Fixtures `--no-recreate` refused to rebuild. Reported at the end so the drift is never silent. */
  const kept = [];
  const problems = validateSpecShape();
  if (problems.length) {
    console.error('ABORT: the committed mission spec set is not coherent:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(2);
  }

  const gate = await setMissionsEnabled(true);
  if (gate.baseEnabled === false) {
    log(`ℹ ${STORE_SETTING.baseSetting}=false on this store. Missions are INDEPENDENT of it (verified in source), so they still work — but base-loyalty cases will not.`);
  }

  const template = await api('GET', '/api/loyalty-missions/new');

  // An OrderValueGoal's currencyCode is REQUIRED at save — null and "" are both rejected with
  // "Currency code is required for the order value goal" — and a currency is per-env store config, so
  // it is resolved from the store here rather than committed as a literal.
  const { store } = await readLoyaltySettings();
  const currencies = resolveCurrencies(store);
  log(`  currencies: store-default=${currencies['store-default']} · store-alternate=${currencies['store-alternate']}`);
  // Locales are resolved from the store for the same reason currencies are: a store's language list is
  // per-env config, so a committed locale code would author translations into a language the storefront
  // on that env may never be able to request.
  const locales = resolveLocales(store);
  log(`  locales:    store-default=${locales['store-default']} · store-alternate=${locales['store-alternate']}`);
  const specs = ONLY ? MISSIONS.filter((m) => m.aliasName === ONLY || m.key === ONLY) : MISSIONS;
  if (ONLY && !specs.length) { console.error(`ABORT: --only ${ONLY} matches no mission spec.`); process.exit(2); }

  // Banners are uploaded BEFORE any mission is written: a Published mission is immutable, so a banner
  // that is not ready at create time can never be attached afterwards. ALL THREE are uploaded even on
  // a --only run, so a re-seed of one mission cannot leave the folder half-populated for the others.
  const bannerUrls = await uploadBanners();
  const bannerChecks = [];
  for (const [key, url] of Object.entries(bannerUrls)) {
    const r = await verifyBannerServes(key, url);
    bannerChecks.push(r);
    log(`  banner ${key.padEnd(12)} ${r.status} ${r.contentType || ''} ${url}`);
  }

  // The progress order's line items point at the SAME discovered products the PerSku goals target, so
  // a run that provisions progress needs them even if no selected spec has SKU targets of its own.
  const wantsProducts = specs.some(needsGoalItems) || (!ONLY && progressFixtures().length > 0);
  const products = wantsProducts && !DRY_RUN ? await resolveTargetProducts(currencies['store-default']) : {};
  if (wantsProducts && !DRY_RUN) {
    for (const p of PERSKU_PRODUCTS) log(`  PerSku target ${p.slot}: ${products[p.slot].sku} — ${products[p.slot].name} (qty ${p.quantity}, ${products[p.slot].currency})`);
    // ONE currency across every row the featured-SKU modal renders. Asserted here, at seed time,
    // rather than left to a guard: the modal sums its rows, so a second currency makes the subtotal
    // it renders meaningless, and that was filed as a product bug once and rejected as our own data.
    const cashCurrencies = new Set([...PERSKU_PRODUCTS, ZERO_STOCK_PRODUCT].map((p) => products[p.slot]?.currency).filter(Boolean));
    if (cashCurrencies.size !== 1) {
      throw new Error(
        `the featured-SKU target products resolved to ${cashCurrencies.size} currencies (${[...cashCurrencies].join(', ')}) — `
        + 'the modal sums the rows it renders, so this fixture would manufacture a mixed-currency subtotal.',
      );
    }
    if (!cashCurrencies.has(currencies['store-default'])) {
      throw new Error(`the target products resolved to ${[...cashCurrencies][0]} but the store default is ${currencies['store-default']} — the order lines and the modal rows would disagree`);
    }
    if (products[POINTS_PRODUCT.slot]?.currency === currencies['store-default']) {
      throw new Error(
        `${POINTS_PRODUCT.aliasName} resolved to the store default currency (${currencies['store-default']}) — `
        + 'MSN_PERSKU_PTS and MSN_ORDERVALUE_POINTS both ask whether a NON-cash line counts, and cannot ask it in the cash currency.',
      );
    }
  }

  // The audience is checked BEFORE any mission is written, and it ABORTS rather than warns. A
  // group-targeted mission seeded against an audience nobody is in is the vacuous-fixture failure this
  // whole module is written against — it seeds cleanly, resolves through @td(), and can only ever
  // report an absence that reads as a product defect.
  const wantsAudience = !DRY_RUN && specs.some(isGroupTargeted);
  const audience = wantsAudience ? await resolveGroupAudience() : null;

  // --- VCST-5346: decide whether the progress states need re-provisioning, BEFORE any mission is
  // written. A reset deletes the whole set (see the block comment above `resolveProgressOwner`), so
  // the decision has to precede the reuse loop rather than interrupt it.
  const wantsProgress = !ONLY && !DRY_RUN && progressFixtures().length > 0;
  let owner = null;
  let progressReset = false;
  /** True when --no-recreate declined a reset, so the progress assertions below cannot hold. */
  let progressRefused = false;
  if (wantsProgress) {
    owner = await resolveProgressOwner();
    log(`  progress owner: ${owner.email} → security account ${owner.userId} (role ${PROGRESS_USER_ROLE})`);
    const live = await ourMissionsByName();
    const rows = await liveProgressByMission(
      progressFixtures().map((s) => live.get(missionName(s))?.id).filter(Boolean),
      owner.userId,
    );
    const stale = progressFixtures().filter((s) => {
      const m = live.get(missionName(s));
      return !m || !progressMatches(s, rows.get(m.id));
    });
    progressReset = stale.length > 0;
    if (progressReset && NO_RECREATE) {
      // The whole-set reset is the single most destructive thing this seeder can do — it deletes every
      // mission so ONE order can redetermine the set. Under --no-recreate it is refused outright: the
      // progress rows it would orphan cannot be deleted, and the states it would rebuild may be the
      // very ones another session is asserting against right now.
      progressReset = false;
      progressRefused = true;
      for (const s of stale) kept.push({ alias: s.aliasName, id: live.get(missionName(s))?.id || '(absent)', reason: 'progress state does not match the spec' });
      log(`  ⚠ --no-recreate: NOT re-provisioning progress (${stale.map((s) => s.aliasName).join(', ')}). The whole-set reset would orphan undeletable LoyaltyMissionProgress rows.`);
    } else if (progressReset) {
      log(`  progress re-provision needed (${stale.map((s) => s.aliasName).join(', ')}) — recreating every mission so one order fully determines the set`);
      const all = [...live.values()];
      for (const m of all) {
        const items = await goalItemsFor(m.id);
        if (items.length) await api('DELETE', `/api/loyalty-mission-goal-items?${idsParam(items.map((i) => i.id))}`, null, { expectStatus: [200, 204] });
      }
      if (all.length) await deleteMissions(all.map((m) => m.id));
      await deleteProgressOrder();
      log(`  cleared ${all.length} mission(s) + the provisioning order`);
    } else {
      log('  progress states already match the spec — reusing them (no order placed)');
    }
  } else if (!DRY_RUN && ONLY) {
    log('  ℹ --only run: progress provisioning skipped (a re-provision is a whole-set operation, see resolveProgressOwner)');
  }

  const existing = DRY_RUN || progressReset ? new Map() : await ourMissionsByName();
  const now = new Date();
  const writeback = {};

  for (const spec of specs) {
    const name = missionName(spec);
    const body = buildMissionBody(spec, { template, storeId: STORE_ID, now, currencies, locales, bannerUrls });
    const want = missionSignature(body);
    const have = existing.get(name);

    let mission = have;
    let action = 'reused';

    if (have && spec.recreateAlways && NO_RECREATE) {
      kept.push({ alias: spec.aliasName, id: have.id, reason: 'recreateAlways' });
      action = 'KEPT (--no-recreate; NOT reset to Draft)';
    } else if (have && spec.recreateAlways) {
      await deleteMissions([have.id]);
      mission = null; action = 'recreated (recreateAlways)';
    } else if (have) {
      // A fetched record must be re-read in full: the search projection may omit dynamicExpression.
      const full = await api('GET', `/api/loyalty-missions/${have.id}`);
      const drifted = !signaturesMatch(missionSignature(full || have), want);
      // The window is compared against what the INTENT means, not against "is it open". MSN_EXPIRED is
      // supposed to be outside its window, so a plain expiry check would delete and recreate it on
      // every run — churning the GUID that `@td(MSN_EXPIRED.id)` resolves to. What is drift for one
      // intent is the fixture working for the other.
      const windowWrong = windowIsOpen(full || have, now) !== windowExpectsOpen(spec.window);
      const reason = drifted
        ? 'signature drift'
        : (windowWrong ? `window ${windowExpectsOpen(spec.window) ? 'expired' : 'reopened'}` : null);
      if (reason && NO_RECREATE) {
        // Reported, never silenced: the fixture IS wrong and the run says so — it simply refuses to be
        // the process that orphans someone else's undeletable progress rows to fix it.
        const detail = drifted
          ? `live ${JSON.stringify(missionSignature(full || have))} vs spec ${JSON.stringify(want)}`
          : reason;
        kept.push({ alias: spec.aliasName, id: have.id, reason, detail });
        action = `KEPT (--no-recreate; ${reason} NOT repaired)`;
      } else if (reason) {
        await deleteMissions([have.id]);
        mission = null;
        action = `recreated (${reason})`;
      }
    }

    if (!mission) {
      mission = await api('POST', '/api/loyalty-missions', body, { expectStatus: [200, 201] });
      if (action === 'reused') action = 'created';
    }

    // A LocalizedString posted in the wrong shape is accepted with 201 and persisted as {"values":{}} —
    // no error, no warning, every translation gone. So the translations are RE-READ and asserted rather
    // than assumed: a silently un-localized fixture would let a C11 case pass on the fallback branch.
    // A fixture the run deliberately refused to repair (--no-recreate) has NOT been written, so the
    // read-back assertions below would fail on the pre-existing record and turn a considered refusal
    // into a run that reads as broken — the same reason the progress verification is skipped after a
    // refused reset. The KEPT report is where that drift is surfaced.
    const kept0 = action.startsWith('KEPT');
    if (spec.l10n && mission?.id && !DRY_RUN && !kept0) {
      const back = await api('GET', `/api/loyalty-missions/${mission.id}`);
      for (const field of Object.keys(spec.l10n)) {
        const apiField = field === 'name' ? 'localizedName' : field;
        const got = localizedValues(back?.[apiField]);
        const want = localizedValues(body[apiField]);
        for (const [loc, text] of Object.entries(want)) {
          if (got[loc] !== text) {
            throw new Error(
              `${missionName(spec)}: ${apiField}[${loc}] did not round-trip `
              + `(sent ${JSON.stringify(text)}, stored ${JSON.stringify(got[loc])}). `
              + 'A LocalizedString must be posted as { values: { <locale>: <text> } }.',
            );
          }
        }
      }
      verbose(`${missionName(spec)}: localized fields verified on read-back`);
    }

    // Every mission's banner is re-read and re-checked, not just the localized one: `bannerUrl` is a
    // plain string the server neither resolves nor validates (it round-trips verbatim — verified live),
    // so a wrong or empty one has no symptom until a storefront card renders blank. A Published mission
    // is immutable, so the only moment this is fixable is now.
    if (mission?.id && !DRY_RUN && !kept0) {
      const back = await api('GET', `/api/loyalty-missions/${mission.id}`);
      if (back?.bannerUrl !== body.bannerUrl) {
        throw new Error(
          `${missionName(spec)}: bannerUrl did not round-trip (sent ${JSON.stringify(body.bannerUrl)}, `
          + `stored ${JSON.stringify(back?.bannerUrl)})`,
        );
      }
    }

    let items = 0;
    if (needsGoalItems(spec) && mission?.id && !DRY_RUN) {
      items = await syncGoalItems(spec, mission.id, products);
    }

    // The banner URL is an absolute, host-bearing address handed back by THIS env's asset store, so it
    // is overlay data exactly like the mission GUID — a committed one would point every other env at
    // this deployment's blob storage.
    writeback[spec.aliasName] = { id: mission?.id || '', banner_url: body.bannerUrl };
    // The resolved currency is per-env, so a case reads it from the overlay rather than assuming USD.
    if (spec.goal.currency) writeback[spec.aliasName].goal_currency = currencies[spec.goal.currency];
    // The resolved locale codes are per-env too, so a localization case reads which cultures were
    // really seeded rather than assuming en-US/de-DE.
    // …and ONLY for the intents the spec really authors text for. A fixture that localizes into the
    // store default alone (MSN_PERSKU_ALL's description) must not carry a `locale_alternate` naming a
    // language it has no text in — a dead field reads as coverage that does not exist.
    for (const intent of localeIntentsUsed(spec)) {
      writeback[spec.aliasName][localeFieldFor(intent)] = locales[intent];
    }
    const audienceLabel = isGroupTargeted(spec) ? `groups=[${spec.condition.groups.join(',')}]` : 'any-group';
    log(`✓ ${spec.aliasName.padEnd(26)} ${name.padEnd(34)} ${spec.status}/${spec.public ? 'public' : 'private'} ${audienceLabel.padEnd(13)} banner=${bannerKeyFor(spec)} ${action}${items ? ` (+${items} SKU targets)` : ''}`);
  }

  // --- VCST-5346: place the provisioning order, then prove the states landed. Skipped entirely when
  // --no-recreate declined the reset: the assertions below would fail on a state we deliberately chose
  // not to rebuild, turning a considered refusal into a run that reads as broken.
  if (wantsProgress && progressRefused) {
    log('  ⚠ progress verification skipped — --no-recreate left the live states as they were (see the KEPT report below).');
  } else if (wantsProgress) {
    const missionIdByAlias = Object.fromEntries(Object.entries(writeback).map(([k, v]) => [k, v.id]));

    // BOTH orders, cash first. The points order is not an optional extra: MSN_ORDERCOUNT's target is
    // derived from the order COUNT, so a run that placed only one would leave it at 1 of 2 — which is
    // indistinguishable from the currency-filter defect that fixture exists to detect.
    const cashOrder = await ensureProgressOrder(PROGRESS_ORDER, owner, products, currencies['store-default']);
    const pointsCurrency = products[POINTS_PRODUCT.slot]?.currency;
    if (!pointsCurrency) throw new Error('the points-priced target resolved no currency — the all-points order cannot be composed');
    const pointsOrder = await ensureProgressOrder(POINTS_ORDER, owner, products, pointsCurrency);

    // The money shape is checked against the PLATFORM'S OWN stored totals before anything is asserted
    // about progress. A collapse here invalidates every OrderValue target at once, and it is far
    // cheaper to fail on it now than to hand a suite a set of fixtures that cannot fail.
    const observed = assertMoneyDiverges(cashOrder.money, pointsOrder.money);
    log(`  money readings (observed): ${READING_ORDER.map((k) => `${k}=${observed[k]}`).join(' · ')}`);

    // The write is asynchronous (Hangfire), so this polls rather than asserting straight away.
    await awaitProgress(progressFixtures(), owner.userId, missionIdByAlias);
    // …and then re-asks the question through the query the storefront itself reads. The REST search
    // proves rows exist; only this proves the customer can see them, and only this reports
    // daysRemaining, which is computed per request and never stored.
    await verifyViaCustomerQuery(owner.userId, locales);

    // RECORD WHAT THE MONEY GOALS ACTUALLY MEASURED. This is the observation the whole redesign turns
    // on: each OrderValue mission's `currentValue` is compared against the four candidate readings,
    // and the reading it matches is the answer to "which figure does an OrderValueGoal read?". It is
    // RECORDED rather than asserted, because the fixture's job is to make the question decidable —
    // deciding it is the test case's job, and baking an expected answer in here would make the
    // fixture assert itself.
    const moneySpecs = MISSIONS.filter((m) => m.goal?.type === 'OrderValueGoal');
    const moneyIds = moneySpecs.map((m) => missionIdByAlias[m.aliasName]).filter(Boolean);
    const moneyRows = await liveProgressByMission(moneyIds, owner.userId);
    const predicted = orderMoney();
    for (const m of moneySpecs) {
      const row = moneyRows.get(missionIdByAlias[m.aliasName]);
      const accrued = row ? Number(row.currentValue) : null;
      writeback[m.aliasName] = {
        ...(writeback[m.aliasName] || {}),
        accrued_value_at_seed: accrued == null ? '' : String(accrued),
        progress_status_at_seed: row?.status || '',
        progress_percent_at_seed: row ? String(row.percentage) : '',
      };
      if (m.goal.currency === 'store-default') {
        const matches = readingsConsistentWith(accrued, predicted);
        const verdict = matches.length === 1
          ? `reads ${matches[0]}`
          : (matches.length === 0 ? 'MATCHES NO READING — investigate' : `AMBIGUOUS (${matches.join(', ')}) — the fixture stopped discriminating`);
        log(`      ${m.aliasName.padEnd(24)} target ${String(m.goal.value).padStart(7)} accrued ${String(accrued).padStart(8)} ${String(row?.status || 'no row').padEnd(11)} → ${verdict}`);
      } else {
        log(`      ${m.aliasName.padEnd(24)} target ${String(m.goal.value).padStart(7)} accrued ${String(accrued).padStart(8)} (${m.goal.currency} control — expected 0)`);
      }
    }

    writeback[PROGRESS_ORDER_ALIAS] = {
      id: cashOrder.id || '', user_id: owner.userId, user_email: owner.email, store_id: STORE_ID,
      currency: cashOrder.money.currency,
      observed_sub_total: String(cashOrder.money.sub),
      observed_discount_total: String(cashOrder.money.discount),
      observed_shipping_total: String(cashOrder.money.shipping),
      observed_tax_total: String(cashOrder.money.tax),
      observed_total: String(cashOrder.money.total),
    };
    writeback[POINTS_ORDER_ALIAS] = {
      id: pointsOrder.id || '', user_id: owner.userId, store_id: STORE_ID,
      currency: pointsOrder.money.currency,
      observed_line_value: String(pointsOrder.money.sub),
      observed_total: String(pointsOrder.money.total),
    };

    // SPENDABILITY, derived from the reward and the price the points product actually carries — never
    // from a committed number. `reward_buys_units` is what a case reads to size its next order.
    const rewardMission = MISSION_BY_ALIAS[REWARD_SPEND.rewardAlias];
    const unitPrice = Number(products[POINTS_PRODUCT.slot]?.listPrice);
    writeback[REWARD_SPEND.aliasName] = {
      reward: String(rewardMission?.reward ?? ''),
      unit_price: String(unitPrice),
      currency: pointsCurrency,
      reward_buys_units: String(rewardBuysUnits(rewardMission?.reward, unitPrice)),
    };
    log(`  reward spendability: ${rewardMission?.reward} ${pointsCurrency} buys ${rewardBuysUnits(rewardMission?.reward, unitPrice)} unit(s) at ${unitPrice}/unit (minimum ${REWARD_SPEND.minSpendableUnits})`);
  }

  // The audience fixture records what was OBSERVED, never what was assumed: the two emails are per-env
  // identity from .env.<env>, the security-account ids are runtime, and the group lists are live state
  // read off this env's contacts. A case resolves the pair from here instead of naming an account, and
  // `*_groups` is the evidence that the assertion it is about to make can actually fail.
  if (audience) {
    writeback[GROUP_AUDIENCE.aliasName] = {
      member_email: audience.member.email,
      member_user_id: audience.member.userId,
      member_groups: audience.member.groups.join('|'),
      nonmember_email: audience.nonMember.email,
      nonmember_user_id: audience.nonMember.userId,
      nonmember_groups: audience.nonMember.groups.join('|'),
    };
  }

  // The CREATED targets write back only their server-assigned ids plus the RESOLVED currency: their
  // sku and name are authored business keys committed in aliases.json, so re-writing those here would
  // put an env-invariant value in the per-env overlay and let the two silently disagree. The currency
  // is the opposite — it is what the pricelist actually gave us, and it is the field the drift guard
  // reads to prove the featured-SKU modal is still single-currency.
  for (const p of [...PERSKU_PRODUCTS, ZERO_STOCK_PRODUCT]) {
    const r = products[p.slot];
    if (r) writeback[p.aliasName] = { productId: r.id, catalogId: r.catalogId || '', currency: r.currency || '' };
  }
  // The FOUND points product carries its sku too: that key is owned by LOY_SKU_PTS_UNIT, so this
  // seeder records what it resolved rather than re-declaring a business key it does not own.
  {
    const r = products[POINTS_PRODUCT.slot];
    if (r) writeback[POINTS_PRODUCT.aliasName] = { productId: r.id, catalogId: r.catalogId || '', sku: r.sku, currency: r.currency || '' };
  }

  // The gate fixture records the OBSERVED state of both switches, so a case reads what is really
  // there rather than assuming the platform defaults.
  writeback[STORE_SETTING.aliasName] = {
    missions_enabled: String(gate.missionsEnabled),
    base_loyalty_enabled: String(gate.baseEnabled),
    store_id: STORE_ID,
  };

  writeEnvAliasOverride(writeback);

  // A refusal that nobody reads is the same as a silent repair. Everything --no-recreate declined is
  // listed here, with the id, so the fixture can be fixed deliberately (and by whoever owns the state
  // sitting on top of it) rather than incidentally by the next full seed.
  if (kept.length) {
    log(`⚠ --no-recreate kept ${kept.length} pre-existing fixture(s) that the spec says are WRONG:`);
    for (const k of kept) log(`    ${k.alias} (${k.id}) — ${k.reason}${k.detail && k.detail !== k.reason ? `\n      ${k.detail}` : ''}`);
    log('    Nothing was deleted. Re-run WITHOUT --no-recreate, once no other session depends on these ids, to repair them.');
  }
  log(DRY_RUN ? 'DRY RUN complete (no writes).' : `Seed complete — ${specs.length} mission(s)${kept.length ? `, ${kept.length} kept unrepaired` : ''}.`);
}

/**
 * Remove every product this seeder CREATED and blank its overlay ids. Scoped by SKU, and scoped to
 * `OWNED_PRODUCTS` — the points-priced target is FOUND through another fixture's alias and belongs to
 * the loyalty-fixture seeder, so deleting it would tear down somebody else's data. Zero-residue is
 * asserted per product, not assumed.
 */
async function deleteZeroStockProduct() {
  for (const spec of OWNED_PRODUCTS) {
    const find = async () => {
      const r = await api('POST', '/api/catalog/listentries', { keyword: spec.sku, take: 10 }, { expectStatus: [200, 201, 400, 404] });
      return (r?.listEntries || r?.results || []).filter((p) => p.code === spec.sku && p.type === 'product');
    };
    const hits = await find();
    if (!hits.length) { log(`ℹ no ${spec.sku} product to delete`); continue; }
    // MUST be `objectIds`: an empty ObjectIds on this endpoint wipes EVERY list entry (see the same
    // warning in seed-standard-products.mjs), so the guard is the non-empty check above.
    await api('POST', '/api/catalog/listentries/delete', { objectIds: hits.map((h) => h.id), objectType: 'CatalogProduct' }, { expectStatus: [200, 204, 404] })
      .catch((e) => log(`⚠ ${spec.sku} delete: ${String(e.message).slice(0, 120)}`));
    const residue = await verifyRemoved(find);
    if (residue > 0) throw new Error(`teardown left ${residue} ${spec.sku} product(s) behind`);
    if (!DRY_RUN) writeEnvAliasOverride({ [spec.aliasName]: { productId: '', catalogId: '', currency: '' } });
    log(`✓ deleted the created target ${spec.sku}`);
  }
  // The FOUND points target is blanked in the overlay but never deleted — a stale id is worse than
  // none (it would point @td() at a product this env no longer has), while deleting a fixture another
  // seeder owns would break every points case in the repo.
  if (!DRY_RUN) writeEnvAliasOverride({ [POINTS_PRODUCT.aliasName]: { productId: '', catalogId: '', sku: '', currency: '' } });
}

async function teardown() {
  // Bottom-up in the entity graph: the provisioning ORDER is what created every progress row, so it
  // goes before the missions it fed. A scoped (--only) teardown leaves it — the fixtures it did not
  // touch still depend on it, and re-creating it later would double-count on all of them.
  //
  // KNOWN, UNAVOIDABLE RESIDUE: LoyaltyMissionProgress rows cannot be deleted. `/api/loyalty-mission-
  // progress` is search+get only and nothing else in the module removes them, so the rows this order
  // produced outlive it. They are harmless — GetUserMissionsAsync iterates MISSIONS, so a row whose
  // mission is gone is unreachable from every API and every storefront surface — but they do
  // accumulate, like the loyalty operation-log rows in seed-loyalty-ephemeral-user.mjs. This is
  // reported rather than silently swallowed so a zero-residue claim is not made where none is possible.
  if (!ONLY) {
    const removed = await deleteProgressOrder();
    log(removed
      ? `✓ deleted ${removed} provisioning order(s) (${PROGRESS_ORDERS.map((o) => progressOrderNumber(o)).join(', ')})`
      : `ℹ no provisioning order to delete (${PROGRESS_ORDERS.map((o) => progressOrderNumber(o)).join(', ')})`);
    log('ℹ LoyaltyMissionProgress rows are NOT deletable (search+get API only) — the rows this order produced remain, orphaned and unreachable once their mission is gone.');
    if (!DRY_RUN) {
      writeEnvAliasOverride({
        [PROGRESS_ORDER_ALIAS]: {
          id: '', user_id: '', user_email: '', store_id: '', currency: '',
          observed_sub_total: '', observed_discount_total: '', observed_shipping_total: '',
          observed_tax_total: '', observed_total: '',
        },
        [POINTS_ORDER_ALIAS]: { id: '', user_id: '', store_id: '', currency: '', observed_line_value: '', observed_total: '' },
        [REWARD_SPEND.aliasName]: { reward: '', unit_price: '', currency: '', reward_buys_units: '' },
      });
    }
    // The audience ACCOUNTS are not ours to delete — they belong to the loyalty user seeder and other
    // suites sign in as them. What this seeder owns is the OBSERVATION, and a stale one is worse than
    // none: it would let a case claim a membership nobody re-checked. So the overlay entry is blanked
    // and the accounts are left alone.
    if (!DRY_RUN) {
      writeEnvAliasOverride({
        [GROUP_AUDIENCE.aliasName]: {
          member_email: '', member_user_id: '', member_groups: '',
          nonmember_email: '', nonmember_user_id: '', nonmember_groups: '',
        },
      });
    }
    log(`ℹ ${GROUP_AUDIENCE.memberRole} / ${GROUP_AUDIENCE.nonMemberRole} accounts left in place — they belong to the loyalty user seeder; only the observed-membership overlay was cleared.`);
  }

  const ours = await ourMissionsByName();
  const targets = ONLY
    ? [...ours.values()].filter((m) => m.name === missionName(MISSION_BY_ALIAS[ONLY] || { key: ONLY }))
    : [...ours.values()];

  // No missions is not "nothing to do": a previous partial run can leave the uploaded artwork behind,
  // and an orphaned asset is residue whether or not anything still points at it.
  if (!targets.length) {
    log('No AGENT-TEST-MSN- missions found.');
    if (!ONLY) {
      const removed = await deleteBanners();
      log(`✓ deleted ${removed.length} banner asset(s) under ${BANNER_FOLDER}`);
    }
    return;
  }

  // Bottom-up: the SKU targets are children of the mission and are NOT protected by the mission's
  // immutability rules, so they are removed first and explicitly rather than trusted to cascade.
  for (const m of targets) {
    const items = await goalItemsFor(m.id);
    if (items.length) {
      const qs = items.map((i) => `ids=${encodeURIComponent(i.id)}`).join('&');
      await api('DELETE', `/api/loyalty-mission-goal-items?${qs}`, null, { expectStatus: [200, 204] });
      verbose(`removed ${items.length} goal item(s) from ${m.name}`);
    }
  }
  await deleteMissions(targets.map((m) => m.id));
  log(`✓ deleted ${targets.length} mission(s)`);

  // The residue check is scoped to what this run actually claimed to delete. Unscoped, a `--teardown
  // --only X` run counted the ten fixtures it deliberately left alone as residue and threw — so the
  // one way to prove a SINGLE fixture's teardown symmetry was to wipe the whole set and churn every
  // other mission's GUID.
  const wanted = new Set(targets.map((m) => m.name));
  const residue = await verifyRemoved(async () => (
    (await searchMissions()).filter((m) => isSeededMissionName(m.name) && (!ONLY || wanted.has(m.name)))
  ));
  if (residue > 0) throw new Error(`teardown left ${residue} ${ONLY ? `${[...wanted][0]} ` : 'AGENT-TEST-MSN- '}mission(s) behind`);

  // The CREATED zero-stock product is ours, so a full teardown removes it — the discovered slot-A/B
  // products are NOT ours and are never touched. Scoped the same way as the banners: a `--only`
  // teardown leaves it, because MSN_PERSKU_OOS may still be targeting it.
  if (!ONLY) {
    await deleteZeroStockProduct();
  } else {
    log(`ℹ ${ZERO_STOCK_PRODUCT.sku} left in place — a scoped teardown cannot know whether MSN_PERSKU_OOS still targets it`);
  }

  // The uploaded artwork is ours too, so a full teardown removes it. A SCOPED teardown must not: the
  // missions it deliberately left alone still point at those URLs, and deleting the bytes would leave
  // them rendering a blank card — a fixture broken by its own cleanup.
  if (!ONLY) {
    const removed = await deleteBanners();
    log(`✓ deleted ${removed.length} banner asset(s) under ${BANNER_FOLDER}`);
  } else {
    log(`ℹ banner assets under ${BANNER_FOLDER} left in place — the missions still using them would render blank`);
  }
  log('✓ zero residue');

  // The gate is left ON deliberately. It is a store-wide switch, not an entity this seeder owns, and
  // turning it off would silently disable missions for anyone else using the env. Use `--missions off`.
  log(`ℹ ${STORE_SETTING.missionsSetting} left as-is — flip it explicitly with --missions off if you need it down.`);
}

async function main() {
  assertSafeTarget();
  await auth();

  if (MISSIONS_TOGGLE) {
    if (!['on', 'off'].includes(MISSIONS_TOGGLE)) { console.error('ABORT: --missions takes on|off'); process.exit(2); }
    const r = await setMissionsEnabled(MISSIONS_TOGGLE === 'on');
    writeEnvAliasOverride({ [STORE_SETTING.aliasName]: { missions_enabled: String(r.missionsEnabled), base_loyalty_enabled: String(r.baseEnabled), store_id: STORE_ID } });
    return;
  }

  if (TARGETING.customerIdCondition == null) {
    verbose('targeting note: this build offers group targeting only (UserGroupIsCondition.groups); there is no customer-id condition.');
  }

  if (TEARDOWN) { await teardown(); return; }
  await seed();
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
