#!/usr/bin/env node
/**
 * scripts/seed-data/sales-rep/seed-sales-rep-demo.mjs
 *
 * Seed the presentation-grade DEMO sales-rep dataset: real company names, real street addresses,
 * real orders of real catalog products, real document titles backed by real openable files, and no
 * `AGENT-TEST` string on any surface a viewer can see. Declarations and derivations live in
 * sales-rep-demo-specs.mjs; this file is resolve-then-write plus its own teardown.
 *
 * REUSED ACCOUNTS ARE HANDLED WITH DELIBERATE COWARDICE. The two reps are real people, so this
 * seeder NEVER calls `ensureRep()` and never goes near `POST /api/sales-rep`. That endpoint is a
 * CREATE shape (it takes a password) and the fixture seeder calls `resetSecurityPassword()` on
 * every reseed of an existing rep — pointing either at a colleague's email would reset their
 * password. The only write this makes against a rep is `PUT /api/sales-rep` with the rep's own
 * object and a longer `organizations` list, which is the same call seed-rep-only-org.mjs already
 * makes and which touches no credential. The prior list is recorded in the ledger first, so
 * teardown restores exactly what was there.
 *
 * Consequence, and it is a feature: a rep who is NOT ALREADY a sales rep cannot be attached safely,
 * because attaching would mean creating an account for a real person. Such a rep is SKIPPED with a
 * loud explanation rather than guessed at. The rest of the dataset seeds around them, so a missing
 * second rep costs you one rep's worth of demo, not the demo.
 *
 * DEGRADES IN THREE PLACES, ON PURPOSE. Each needs an input this repo cannot derive:
 *   - a rep whose email variable is unset          -> that rep is skipped
 *   - a rep who is not already a sales rep         -> that rep is skipped
 *   - a rep whose password is unset                -> that rep's TASKS are skipped
 * Everything not downstream of the missing input still seeds. A half-configured environment should
 * cost you the part that depends on the gap, not the whole run.
 *
 * Usage:
 *   TEST_ENV=virtostart npm run seed:sales-rep-demo -- --dry-run
 *   TEST_ENV=virtostart npm run seed:sales-rep-demo
 *   TEST_ENV=virtostart npm run seed:sales-rep-demo:teardown
 */

import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  ROOT, BACK_URL, FRONT_URL, STORE_ID, DRY_RUN, TEARDOWN, ONLY,
  assertSafeTarget, auth, api, log, verbose, idsParam, verifyRemoved,
  writeEnvAliasOverride, discoverCatalogProducts, uploadScopedFile,
} from '../../lib/seed-common.mjs';
import {
  __setApi, ensureSecurityAccount, findRole, searchMemberships, ensureOrgMembership,
  stripSeededGlobalRoles, deleteUserByEmail, resolvePassword,
} from '../../lib/user-provision.mjs';
import { orgAlreadyServed, appendServedOrg, removeServedOrg } from './rep-only-org-specs.mjs';
import { UPLOAD_SCOPE } from './sales-rep-docs-specs.mjs';
import {
  DEMO_ORGS, DEMO_CONTACTS, DEMO_REPS, DEMO_DOCUMENTS, DEMO_TASKS, DEMO_PROFILE, DEMO_LEDGER_KEY,
  demoMarker, isDemoMarker, markerSweepInScope, demoProblems,
  buildDemoFileBytes, buildDemoDocumentRequest, buildDemoOrderBody,
  demoOrderNumber, ordersInPostOrder, productNeedByOrg, isDemoSafeProduct,
  orgByKey, contactByKey, roleSeesDocuments, SALES_REP_ROLE_ADVANCED, documentSourceRel,
  DEMO_LISTS, listProductNeedByOrg, DEMO_LIST_SCOPE, DEMO_CARTS, DEMO_REP_CARTS, cartProductNeedByOrg, resolveTaskText,
} from './sales-rep-demo-specs.mjs';

const TEST_ENV = process.env.TEST_ENV || 'vcst';
// Re-exported under the local name the rest of this file already uses. The literal lives in the
// spec module because reconcile check [12] and the drift guard read it too.
const LEDGER_KEY = DEMO_LEDGER_KEY;
const only = (key) => !ONLY || key === ONLY;

// ---- ledger ----------------------------------------------------------------

const overlayPath = () => join(ROOT, `test-data/aliases.${TEST_ENV}.json`);

/**
 * The id ledger. Lives under a `_`-prefixed key because `selectProbeTargets()` in overlay-specs.mjs
 * skips those — without the underscore, `td:reconcile` check [11] would member-probe every order
 * and file GUID in here and report a wave of false STALE results for ids that were never members.
 */
function readLedger() {
  const p = overlayPath();
  if (!existsSync(p)) return { profile: DEMO_PROFILE, env: TEST_ENV, entities: [] };
  try {
    return JSON.parse(readFileSync(p, 'utf8'))[LEDGER_KEY] || { profile: DEMO_PROFILE, env: TEST_ENV, entities: [] };
  } catch {
    return { profile: DEMO_PROFILE, env: TEST_ENV, entities: [] };
  }
}

/**
 * The id this seeder recorded for (type, key) on a previous run, or null. Read ONCE at module scope
 * so a run that rewrites the ledger mid-way still resolves against the state it started from.
 */
const PRIOR_LEDGER = readLedger();
const priorId = (type, key) =>
  (PRIOR_LEDGER.entities || []).find((e) => e.type === type && e.key === key)?.id || null;

function writeLedger(entities) {
  writeEnvAliasOverride({
    [LEDGER_KEY]: {
      profile: DEMO_PROFILE, env: TEST_ENV, marker: 'DEMO-SR',
      generated: new Date().toISOString(), entities,
    },
  });
}

// ---- rep resolution --------------------------------------------------------

/** Every sales rep on the environment (paged). */
async function allReps() {
  const out = [];
  for (let skip = 0; ;) {
    const res = await api('POST', '/api/sales-rep/search', { skip, take: 50 }, { expectStatus: [200, 201] });
    const batch = res?.results || res?.items || [];
    out.push(...batch);
    skip += batch.length;
    if (batch.length < 50 || skip >= (res?.totalCount ?? skip)) break;
  }
  return out;
}

/**
 * Resolve each declared rep to a LIVE sales-rep record, or explain precisely why it cannot be used.
 * Never creates anything: a rep who is not already a rep is reported, not provisioned.
 */
async function resolveReps() {
  const live = await allReps();
  // Index EVERY address a rep answers to, not just the first. A Contact can carry several emails
  // and a separate login account per email; the search row surfaces only one of them, so a
  // single-key map silently fails to find a rep who is plainly there — reported as "not a sales rep
  // on this environment", which sends the reader off to create an account for a real person.
  const byEmail = new Map();
  for (const r of live) {
    for (const e of [...(r.emails || []), r.email, r.userName]) {
      const key = String(e || '').trim().toLowerCase();
      if (key && !byEmail.has(key)) byEmail.set(key, r);
    }
  }
  const resolved = [];

  for (const spec of DEMO_REPS) {
    const email = String(process.env[spec.emailVar] || '').trim().toLowerCase();
    if (!email) {
      log(`SKIP rep ${spec.key} (${spec.fullName}) — ${spec.emailVar} is not set.`);
      log(`     Set it in .env.${TEST_ENV}. This seeder will not guess an email: attaching sales-rep`);
      log('     status to the wrong real person is not a recoverable mistake.');
      resolved.push({ spec, skipped: 'no-email' });
      continue;
    }
    const hit = byEmail.get(email);
    if (!hit) {
      log(`SKIP rep ${spec.key} (${spec.fullName} <${email}>) — not a sales rep on this environment.`);
      log('     Attaching them would mean CREATING an account for a real person (POST /api/sales-rep');
      log('     takes a password), which this seeder will not do. Make them a rep in the Admin UI');
      log('     first, then re-run — everything else seeds around them in the meantime.');
      resolved.push({ spec, skipped: 'not-a-rep' });
      continue;
    }
    const full = await api('GET', `/api/sales-rep/${hit.id}`, null, { expectStatus: [200, 404] });
    const roleName = full?.roleName || '(unknown)';
    resolved.push({ spec, email, rep: full || hit, roleName });
    log(`rep ${spec.key}: ${spec.fullName} <${email}> → ${hit.id} · role "${roleName}" · serves ${(full?.organizations || []).length} org(s)`);

    // SIGN-IN IDENTITY vs REP IDENTITY. A Contact can carry several emails and the platform will
    // happily hold a SEPARATE ApplicationUser per email pointing at that same contact. Only ONE of
    // them is the rep record's account, and organization memberships hang off THAT account's userId
    // — so signing in with the other email yields a token that carries sales-rep:access (the hub
    // renders in full) over ZERO granting memberships, i.e. an empty customer list, empty orders and
    // zero counters, with no error anywhere. Measured live on virtostart 2026-09-23: the contact
    // "Alla Volkova" has two accounts; the one this variable named had 0 memberships while the rep
    // record's had 6. Whoever looks at that screen concludes the DATA is broken.
    const repUserName = String(full?.userName || '').trim().toLowerCase();
    if (repUserName && repUserName !== email) {
      log(`  WARN: ${spec.emailVar} names <${email}>, but this rep's account is <${full.userName}>.`);
      log('        Both resolve to the same Contact, and they are DIFFERENT login accounts. Served-org');
      log("        memberships belong to the rep record's account, so a session signed in as the other");
      log('        email sees a fully rendered hub with NO customers, NO orders and zero statistics.');
      log(`        Point ${spec.emailVar} at <${full.userName}> unless you also mirror the memberships.`);
    }

    // The role is READ and asserted, never written: changing a real person's platform role is not
    // this seeder's business. But a mismatch has to be loud, because its symptom is an ABSENCE —
    // the document library is simply missing from the basic role's navigation, with no error.
    if (spec.showsDocuments && !roleSeesDocuments(roleName)) {
      log(`  WARN: ${spec.fullName} holds "${roleName}", so the Document library is NOT in their hub.`);
      log(`        The ${DEMO_DOCUMENTS.length} demo documents will seed but be INVISIBLE to them.`);
      log(`        Set their Sales Rep role to "${SALES_REP_ROLE_ADVANCED}" in the Admin blade.`);
    }
    if (spec.salesRepRole && roleName !== spec.salesRepRole) {
      log(`  NOTE: expected role "${spec.salesRepRole}", live role is "${roleName}".`);
    }
  }
  return resolved;
}

// ---- members ---------------------------------------------------------------

/**
 * LEDGER FIRST, search second — and the order is the whole point.
 *
 * `/api/members/search` is INDEX-backed, so a member created moments (or, as measured on
 * virtostart 2026-09-23, hours) earlier can come back as zero rows while the entity is perfectly
 * alive. Idempotency built on that search is not idempotency: every re-seed fails to find what it
 * made and creates it again. Four re-runs produced FIVE of every demo buyer — visible to anyone
 * opening Company members, each duplicate with no account and no membership, because only the
 * newest row got those.
 *
 * The ledger is the authority: it records the id this seeder actually created. A GET by id is
 * index-free and answers truthfully. The search is kept only as the fallback for a lost or reverted
 * overlay, and it is the reason a stale ledger entry cannot strand an entity either.
 */
async function findExisting(memberType, marker, name, ledgerId) {
  if (ledgerId) {
    const byId = await api('GET', `/api/members/${ledgerId}`, null, { expectStatus: [200, 404] });
    // memberType is checked because an id could in principle be reused by another entity type.
    if (byId?.id && String(byId.memberType || memberType) === memberType) return byId;
    verbose(`ledger id ${ledgerId} for ${name} is gone — falling back to search`);
  }
  const res = await api('POST', '/api/members/search', { memberType, keyword: name, take: 20, deep: true }, { expectStatus: [200, 201] });
  const rows = res?.results || [];
  const hit = rows.find((m) => m.outerId === marker) || rows.find((m) => m.name === name) || null;
  if (!hit && !ledgerId) {
    verbose(`no ${memberType} found for "${name}" by marker or name — will CREATE`);
  }
  return hit;
}

/** Organizations. Idempotent on the hidden marker first, then the display name. */
async function ensureOrgs() {
  const out = {};
  for (const spec of DEMO_ORGS) {
    if (!only(spec.key)) continue;
    const marker = demoMarker('ORG', spec.key);
    const found = await findExisting('Organization', marker, spec.name, priorId('organization', spec.key));
    if (found?.id) {
      if (found.outerId !== marker) {
        // Backfill: an org created before the marker existed, or by an interrupted run. Only ever
        // stamps an EMPTY outerId — a foreign one belongs to another system and is left alone.
        if (!found.outerId) {
          await api('PUT', '/api/members', { ...found, outerId: marker });
          verbose(`org ${spec.key}: backfilled marker`);
        } else if (!isDemoMarker(found.outerId)) {
          log(`  WARN org ${spec.name} carries a foreign outerId "${found.outerId}" — left as is, not swept by teardown.`);
        }
      }
      out[spec.key] = { id: found.id, name: spec.name };
      verbose(`org ${spec.key} exists (${found.id})`);
      continue;
    }
    const body = {
      memberType: 'Organization', name: spec.name, outerId: marker, status: 'Active',
      emails: [spec.email], phones: [spec.phone],
      // NOTE: no `isDefault` — the platform rejects a DEFAULT BillingAndShipping address
      // (POST /api/members -> 400 "BillingAndShipping address cannot be set as default",
      // measured live 2026-09-23). Every other org/contact in this repo omits it too
      // (user-provision.mjs). A --dry-run cannot catch this: it POSTs nothing.
      addresses: [{
        addressType: 'BillingAndShipping', line1: spec.line1, city: spec.city,
        regionName: spec.regionName, postalCode: spec.postalCode,
        countryCode: spec.countryCode, countryName: spec.countryName,
        phone: spec.phone, email: spec.email,
      }],
    };
    const created = await api('POST', '/api/members', body);
    out[spec.key] = { id: created?.id || `dry-org-${spec.key}`, name: spec.name };
    log(`org created: ${spec.name} (${out[spec.key].id})`);
  }
  return out;
}

/** Buyer contacts inside their organizations. */
async function ensureContacts(orgs) {
  const out = {};
  for (const spec of DEMO_CONTACTS) {
    if (!only(spec.key)) continue;
    const org = orgs[spec.org];
    if (!org) { verbose(`contact ${spec.key}: org ${spec.org} not in scope, skip`); continue; }
    const fullName = `${spec.firstName} ${spec.lastName}`;
    const marker = demoMarker('CT', spec.key);
    const found = await findExisting('Contact', marker, fullName, priorId('contact', spec.key));
    if (found?.id) {
      if (!found.outerId) await api('PUT', '/api/members', { ...found, outerId: marker });
      out[spec.key] = { id: found.id, name: fullName };
      verbose(`contact ${spec.key} exists (${found.id})`);
      continue;
    }
    const orgSpec = orgByKey(spec.org);
    const body = {
      memberType: 'Contact', outerId: marker,
      firstName: spec.firstName, lastName: spec.lastName, fullName, name: fullName,
      emails: [spec.email], status: 'Approved',
      organizations: String(org.id).startsWith('dry-') ? [] : [org.id],
      addresses: [{
        addressType: 'BillingAndShipping', firstName: spec.firstName, lastName: spec.lastName,
        line1: orgSpec.line1, city: orgSpec.city, regionName: orgSpec.regionName,
        postalCode: orgSpec.postalCode, countryCode: orgSpec.countryCode,
        countryName: orgSpec.countryName, email: spec.email,
      }],
    };
    const created = await api('POST', '/api/members', body);
    out[spec.key] = { id: created?.id || `dry-ct-${spec.key}`, name: fullName };
    log(`contact created: ${fullName} @ ${org.name}`);
  }
  return out;
}

// ---- buyer accounts + org roles --------------------------------------------

/**
 * Give each buyer contact a login and an ORGANIZATION MEMBERSHIP carrying its declared role.
 *
 * Without this the `role` on a contact is decoration: a Contact with no ApplicationUser and no
 * membership has no role anywhere in the platform, so the org's member list shows people with no
 * permissions and the demo misrepresents the very model it is meant to show.
 *
 * THE ROLE IS ORG-SCOPED, NEVER GLOBAL (VCST-5028). A B2B role granted globally would apply to
 * every organization the account touches, which is not what "Purchasing agent at Northwind" means.
 * `stripSeededGlobalRoles` removes any B2B role that leaked onto the account itself, and the grant
 * rides the membership — the same discipline `provisionContactLogins` already enforces for the b2b
 * fixture family.
 *
 * These accounts ARE ours — invented buyers at fictional companies — so unlike the reps, creating
 * them and setting their password is legitimate. The password is a `{{VAR}}` token resolved from
 * the environment, never a literal.
 */
async function ensureBuyerAccounts(orgs, contacts) {
  // user-provision carries its own module-level TOKEN (null here), so hand it our authenticated client.
  __setApi(api);
  const password = resolvePassword('{{SR_DEMO_BUYER_PASSWORD}}');
  const roleCache = new Map();
  const created = [];

  for (const spec of DEMO_CONTACTS) {
    if (!only(spec.key)) continue;
    const contact = contacts[spec.key];
    const org = orgs[spec.org];
    if (!contact || !org) continue;
    if (String(contact.id).startsWith('dry-') || String(org.id).startsWith('dry-')) {
      log(`[DRY] would grant ${spec.email} "${spec.role}" at ${org.name}`);
      continue;
    }

    if (!roleCache.has(spec.role)) roleCache.set(spec.role, await findRole({ role_name: spec.role }));
    const role = roleCache.get(spec.role);
    if (!role?.id) {
      // Loud, because the symptom is a member who silently has no permissions.
      log(`  WARN: platform role "${spec.role}" not found — ${spec.email} gets a login but NO role.`);
      continue;
    }

    const userId = await ensureSecurityAccount(spec.email, password, contact.id, 'Approved');
    if (!userId || String(userId).startsWith('dry-')) continue;

    await stripSeededGlobalRoles(spec.email);
    const existing = await searchMemberships(userId);
    await ensureOrgMembership(userId, org.id, org.name, role.id, existing, false, spec.email, 'Approved');

    created.push({
      type: 'account', key: spec.key, id: userId, email: spec.email,
      role: spec.role, roleId: role.id, orgId: org.id, orgName: org.name,
    });
    log(`account: ${spec.email} → "${spec.role}" at ${org.name}`);
  }
  return created;
}

// ---- rep attachment --------------------------------------------------------

/**
 * Give each resolved rep its demo organizations, ADDITIVELY. Existing served organizations are
 * preserved — a rep's real book is not this demo's to rearrange — and the prior list is captured in
 * the ledger before the write, so teardown puts back exactly what was there rather than an
 * approximation of it.
 */
async function attachServedOrgs(reps, orgs) {
  const attachments = [];
  for (const r of reps) {
    if (r.skipped) continue;
    const priorOrgs = (r.rep.organizations || []).map((o) => ({ organizationId: o.organizationId, organizationName: o.organizationName }));
    let organizations = [...priorOrgs];
    const added = [];
    for (const key of r.spec.servedOrgs) {
      const org = orgs[key];
      if (!org || String(org.id).startsWith('dry-')) continue;
      if (orgAlreadyServed(organizations, org.id)) continue;
      organizations = appendServedOrg(organizations, { id: org.id, name: org.name });
      added.push(key);
    }
    attachments.push({
      type: 'rep-attachment', key: r.spec.key, salesRepId: r.rep.id, userId: r.rep.userId,
      email: r.email, priorOrganizations: priorOrgs,
      addedOrgIds: added.map((k) => orgs[k].id),
      servedOrgIds: organizations.map((o) => o.organizationId),
    });
    if (!added.length) { verbose(`rep ${r.spec.key}: already serves every demo org`); continue; }
    await api('PUT', '/api/sales-rep', { ...r.rep, organizations }, { expectStatus: [200, 201, 204] });
    log(`rep ${r.spec.key}: +${added.length} demo org(s) (${added.join(', ')}); ${organizations.length} total, ${priorOrgs.length} pre-existing preserved`);
  }
  return attachments;
}

// ---- orders ----------------------------------------------------------------

/**
 * Discover each organization's own product pool and CLAIM the picks globally, so no product ends
 * up under two customers. Over-fetches (x4 plus headroom) because two filters run after the
 * search: the fixture-product exclusion, and the global claim.
 *
 * Returns {} under --dry-run: `discoverCatalogProducts` is hard-gated on DRY_RUN and returns []
 * there, so a shortfall warning in a dry run would describe the stub, not the catalog.
 */
// `need` lets a second consumer (the shared lists) ask for its own per-org counts. The claim set
// is per CALL, so lists and orders draw independently — two callers are not meant to share a pool.
async function discoverProductPools(need = productNeedByOrg()) {
  if (DRY_RUN) return {};
  const claimed = new Set();
  const pools = {};
  for (const org of DEMO_ORGS) {
    const want = need[org.key] || 0;
    if (!want) continue;
    // Ask for a wide slice, then narrow it THREE ways. The catalog's search is relevance-ordered
    // but not relevance-bounded (see productMatch in the spec module), it carries near-duplicate
    // rows for the same physical product, and it still serves this repo's own fixture products.
    // Capped: discoverCatalogProducts asks for twice this, and a search over ~1000 fails SILENTLY to [].
    const found = await discoverCatalogProducts(api, Math.min(want * 8 + 40, 450), { searchPhrase: org.productSearch }).catch(() => []);
    const seenName = new Set();
    const usable = [];
    for (const p of found) {
      if (!isDemoSafeProduct(p) || claimed.has(p.id)) continue;
      const name = String(p.name || '').trim();
      // (a) the name must actually carry the category word — a relevance tail is not a pool;
      if (org.productMatch && !org.productMatch.test(name)) continue;
      if (org.productExclude && org.productExclude.test(name)) continue;
      // (b) one row per distinct product name, or an order shows the same line twice;
      const nameKey = name.toLowerCase().replace(/s+/g, ' ');
      if (!nameKey || seenName.has(nameKey)) continue;
      seenName.add(nameKey);
      usable.push(p);
      if (usable.length >= want) break;
    }
    for (const p of usable) claimed.add(p.id);
    pools[org.key] = usable;
    const rejected = found.filter((p) => !isDemoSafeProduct(p)).length;
    if (usable.length < want) {
      log(`  WARN ${org.name}: only ${usable.length}/${want} distinct product(s) matched ${org.productMatch} within "${org.productSearch}" — line items will REPEAT within its orders. Widen productMatch or lower the order line counts.`);
    } else {
      verbose(`${org.name}: ${usable.length} product(s) from "${org.productSearch}"${rejected ? `, ${rejected} fixture product(s) excluded` : ''}`);
    }
    if (rejected) log(`  excluded ${rejected} AGENT-TEST catalog product(s) from ${org.name}'s pool`);
  }
  return pools;
}

async function ensureOrders(orgs, reps) {
  const pools = await discoverProductPools();
  // Each order takes the next unused window of its organization's pool, so two orders for one
  // customer do not silently share line items.
  const cursor = {};
  // Every demo order is attributed to a rep's ApplicationUser, because salesRepOrders/lastOrder match
  // on order.CustomerId == the rep's LOGIN id. Buyer-placed orders would vanish from the rep hub.
  const repByOrg = new Map();
  for (const r of reps) {
    if (r.skipped) continue;
    for (const k of r.spec.servedOrgs) if (!repByOrg.has(k)) repByOrg.set(k, r);
  }

  const created = [];
  for (const spec of ordersInPostOrder()) {
    if (!only(spec.key)) continue;
    const org = orgs[spec.org];
    const contact = contactByKey(spec.buyer);
    const rep = repByOrg.get(spec.org);
    if (!org || !rep) { verbose(`order ${spec.key}: no org or no attached rep for ${spec.org}, skip`); continue; }

    const number = demoOrderNumber(spec.key);
    const found = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 1 }, { expectStatus: [200, 201] });
    const existing = (found?.results || [])[0];
    if (existing) { created.push({ type: 'order', key: spec.key, id: existing.id, number }); verbose(`order ${number} exists`); continue; }

    const pool = pools[spec.org] || [];
    const start = cursor[spec.org] || 0;
    const window = pool.slice(start, start + spec.items);
    cursor[spec.org] = start + spec.items;

    const body = buildDemoOrderBody(spec, {
      org: orgByKey(spec.org), contact, orgId: org.id,
      customerId: rep.rep.userId, products: window,
    });
    const res = await api('POST', '/api/order/customerOrders', body);
    created.push({ type: 'order', key: spec.key, id: res?.id || `dry-${spec.key}`, number, marker: body.outerId });
    log(`order ${number} — ${org.name}, ${spec.status}, ${spec.items} item(s), $${spec.total}`);
  }
  return created;
}

// ---- documents -------------------------------------------------------------

async function allDocuments() {
  const out = [];
  for (let skip = 0; ;) {
    const res = await api('POST', '/api/sales-rep/documents/search', { skip, take: 50 }, { expectStatus: [200, 201, 404] });
    const batch = res?.results || res?.items || [];
    out.push(...batch);
    skip += batch.length;
    if (batch.length < 50 || skip >= (res?.totalCount ?? skip)) break;
  }
  return out;
}

/**
 * A document's bytes: the real file from `test-data/uploads/` when one is declared, otherwise the
 * generated fallback. Falling back rather than throwing is deliberate — the uploads folder holds
 * large binaries, and a checkout without them should still produce a working demo, just one whose
 * documents are thin. The origin is reported per document so "thin" is never silent.
 */
function documentBytes(spec) {
  const rel = documentSourceRel(spec);
  if (rel) {
    const abs = join(ROOT, rel);
    if (existsSync(abs)) return { bytes: readFileSync(abs), origin: rel };
    log(`  NOTE ${spec.key}: ${rel} not found — falling back to generated bytes (a thin but valid file).`);
  }
  return { bytes: buildDemoFileBytes(spec), origin: 'generated' };
}

async function ensureDocuments() {
  const live = await allDocuments();
  const byName = new Map(live.map((d) => [d.displayName || d.name, d]));
  const created = [];
  for (const spec of DEMO_DOCUMENTS) {
    if (!only(spec.key)) continue;
    let hit = byName.get(spec.name);
    // Same title, different file (e.g. DOCX -> PDF): replace it, or the old bytes stay live forever.
    // A regenerated asset is replaced too, or a generator fix never reaches the library. Compared by
    // the content hash recorded in the ledger — size alone misses a same-length byte fix (a mis-encoded
    // em-dash is one byte either way). No recorded hash means "unknown", which replaces once.
    const sha = createHash('sha256').update(documentBytes(spec).bytes).digest('hex');
    const priorSha = (readLedger().entities || []).find((e) => e.type === 'document' && e.key === spec.key)?.sha256;
    if (hit?.id && (hit.name !== spec.fileName || hit.contentType !== spec.contentType || priorSha !== sha)) {
      if (!DRY_RUN) await api('DELETE', `/api/sales-rep/documents?${idsParam([hit.id])}`, null, { expectStatus: [200, 204, 404] });
      log(`document replaced: ${spec.name} (${hit.name} -> ${spec.fileName})`);
      hit = null;
    }
    if (hit?.id) { created.push({ type: 'document', key: spec.key, id: hit.id, fileId: hit.fileId, name: spec.name, sha256: sha }); verbose(`document "${spec.name}" exists`); continue; }
    const { bytes, origin } = documentBytes(spec);
    const file = await uploadScopedFile(UPLOAD_SCOPE, spec.fileName, bytes, spec.contentType);
    const doc = await api('POST', '/api/sales-rep/documents', buildDemoDocumentRequest(spec, file.id));
    created.push({ type: 'document', key: spec.key, id: doc?.id || `dry-${spec.key}`, fileId: file.id, name: spec.name, sha256: sha });
    log(`document created: ${spec.name} (${spec.fileName}, ${bytes.length} bytes, from ${origin})`);
    // Pin is a separate call: CreateAsync forces isPinned=false, so sending it above would look
    // effective while doing nothing.
    if (spec.pinned && doc?.id && !DRY_RUN) {
      await api('POST', `/api/sales-rep/documents/${doc.id}/pin`, {}, { expectStatus: [200, 201, 204] });
      log(`  pinned: ${spec.name}`);
    }
  }
  return created;
}

// ---- tasks (rep-scoped GraphQL) --------------------------------------------

const GQL = '/graphql/sales-rep';
const M_CREATE_TASK = 'mutation($c:InputCreateSalesRepTask!){createSalesRepTask(command:$c){id name}}';
const M_DELETE_TASK = 'mutation($c:InputDeleteSalesRepTask!){deleteSalesRepTask(command:$c)}';
const M_UPDATE_TASK = 'mutation($c:InputUpdateSalesRepTask!){updateSalesRepTask(command:$c){id name}}';
const M_TASK_STATUS = 'mutation($c:InputChangeSalesRepTaskStatus!){changeSalesRepTaskStatus(command:$c){id completed}}';
// The unfiltered list is not guaranteed to include completed tasks, so every filter is read and merged.
const TASK_FILTERS = ['upcoming', 'overdue', 'completed'];
const Q_TASKS = (filter) => `{salesRepTasks(first:200, filter:"${filter}"){items{id name description dueDate completed}}}`;

/**
 * A rep-scoped token. `storeId` is REQUIRED by this grant. Returns null rather than throwing when
 * the password is absent: a missing password costs the task widget, not the run.
 */
async function repToken(r) {
  const envKey = `${r.spec.passwordVar}`;
  const password = process.env[envKey];
  if (!password) {
    // Tasks are private to their owner, so an operator acting ON BEHALF of the rep is the only
    // other way in. No org switch: a task belongs to the rep, not to a customer organization.
    const token = await repTokenInOrg(r, null);
    if (!token) {
      log(`SKIP tasks for ${r.spec.key} — ${envKey}_${TEST_ENV.toUpperCase()} is not set in .env.local and no operator could log in on behalf.`);
      log('     Orders, customers and documents are unaffected; only the task widget renders empty.');
    }
    return token;
  }
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: r.email, password, storeId: STORE_ID }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    log(`SKIP tasks for ${r.spec.key} — token request returned ${res.status}. Not retrying: repeated`);
    log('     failures against a real person’s account can lock it out.');
    return null;
  }
  return body.access_token;
}

const makeGql = (token) => async (query, variables = {}) => {
  const res = await fetch(`${BACK_URL}${GQL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (body.errors) throw new Error(`GraphQL ${GQL}: ${JSON.stringify(body.errors.map((e) => e.message)).slice(0, 300)}`);
  return body.data || {};
};

const dueDate = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(17, 0, 0, 0);
  return d.toISOString();
};

async function ensureTasks(reps) {
  const created = [];
  for (const r of reps) {
    if (r.skipped) continue;
    const mine = DEMO_TASKS.filter((t) => t.rep === r.spec.key && only(t.key));
    if (!mine.length) continue;
    if (DRY_RUN) { log(`[DRY] would create ${mine.length} task(s) for ${r.spec.key}`); continue; }
    const token = await repToken(r);
    if (!token) continue;
    const gql = makeGql(token);
    const live = new Map();
    try {
      for (const f of TASK_FILTERS) for (const x of (await gql(Q_TASKS(f)))?.salesRepTasks?.items || []) live.set(x.id, x);
    } catch (e) {
      if (!/salesRepTasks/.test(e.message)) throw e;
      log(`SKIP tasks — this platform's sales-rep module has no tasks API (${e.message.slice(0, 90)}…). Upgrade the module to seed them.`);
      return created;
    }
    for (const t of mine) {
      const name = resolveTaskText(t.name);
      const description = resolveTaskText(t.description);
      const due = dueDate(t.dueInDays);
      // Ledger id first, so a task whose text changed is UPDATED rather than duplicated; name second,
      // for a lost overlay.
      const prior = live.get(priorId('task', t.key)) || [...live.values()].find((x) => x.name === name);
      let id = prior?.id;
      if (prior) {
        const drift = prior.name !== name || (prior.description || '') !== description
          || Math.abs(new Date(prior.dueDate) - new Date(due)) > 12 * 3600e3;
        if (drift) {
          await gql(M_UPDATE_TASK, { c: { id, name, description, type: t.type, priority: t.priority, dueDate: due } });
          log(`task updated (${r.spec.key}): ${name}`);
        } else verbose(`task "${name}" exists`);
      } else {
        id = (await gql(M_CREATE_TASK, { c: { name, description, type: t.type, priority: t.priority, dueDate: due } }))?.createSalesRepTask?.id;
        if (!id) { log(`  WARN task ${t.key}: createSalesRepTask returned no id`); continue; }
        log(`task created (${r.spec.key}): ${name}${t.dueInDays < 0 ? ` — due ${-t.dueInDays} day(s) ago` : ''}`);
      }
      // Completion is a separate status call; converge both ways so a spec edit can re-open a task.
      if (!!prior?.completed !== !!t.completed) {
        const res = await gql(M_TASK_STATUS, { c: { id, completed: !!t.completed } });
        if (res?.changeSalesRepTaskStatus?.completed !== !!t.completed) log(`  WARN task ${t.key}: status did not change to completed=${!!t.completed}`);
        else if (t.completed) log(`  task completed (${r.spec.key}): ${name}`);
      }
      created.push({ type: 'task', key: t.key, id, ownerUserId: r.rep.userId, name });
    }
  }
  return created;
}

// ---- teardown --------------------------------------------------------------

/**
 * Ledger first, marker sweep second, owner sweep third — because no single one of them is
 * sufficient. The ledger misses anything an interrupted run created; the marker cannot reach a
 * document or a task (neither model has a spare field); and an owner sweep is the only way to find
 * a task whose id was never recorded.
 *
 * Reps are DETACHED, never deleted: they are real accounts that existed before this demo.
 */
async function teardown() {
  const ledger = readLedger();
  const ent = (type) => (ledger.entities || []).filter((e) => e.type === type && only(e.key));
  log(`TEARDOWN — ledger holds ${ledger.entities?.length || 0} entity/entities${ONLY ? ` (scoped to ${ONLY})` : ''}`);

  // 1. Tasks (rep-scoped; needs the rep's own token).
  const attachments = ent('rep-attachment');
  const taskRows = ent('task');
  if (taskRows.length && !DRY_RUN) {
    for (const a of attachments) {
      const spec = DEMO_REPS.find((r) => r.key === a.key);
      const token = await repToken({ spec, email: a.email, rep: { userId: a.userId } });
      if (!token) { log(`  tasks for ${a.key}: unreachable without a token — left in place.`); continue; }
      const gql = makeGql(token);
      const mine = taskRows.filter((t) => t.ownerUserId === a.userId);
      for (const t of mine) await gql(M_DELETE_TASK, { c: { id: t.id } }).catch((e) => log(`  WARN task ${t.key}: ${e.message}`));
      log(`  tasks: deleted ${mine.length} for ${a.key}`);
    }
  }

  // 1b. Shared lists — a list is a CART row, so it must go before the members that own it, and it
  //     cannot be swept by marker (a wishlist carries no outerId of ours). Ledger only. Deleted with
  //     the ADMIN cart API rather than the storefront mutation, because the author is sometimes a real
  //     person whose token this seeder does not hold at teardown time.
  // 1a. Active carts — buyer-owned, deleted through the admin cart API for the same reason.
  const carts = ent('cart');
  if (carts.length && !DRY_RUN) {
    await api('DELETE', `/api/carts?${idsParam(carts.map((c) => c.id))}`, null, { expectStatus: [200, 204, 404] });
    log(`  active carts: deleted ${carts.length}`);
  } else if (carts.length) log(`[DRY] active carts: would delete ${carts.length}`);

  const lists = ent('list');
  if (lists.length && !DRY_RUN) {
    await api('DELETE', `/api/carts?${idsParam(lists.map((l) => l.id))}`, null, { expectStatus: [200, 204, 404] });
    log(`  shared lists: deleted ${lists.length}`);
  } else if (lists.length) log(`[DRY] shared lists: would delete ${lists.length}`);
  // 2. Orders — before the members they reference.
  const orders = ent('order');
  if (orders.length && !DRY_RUN) {
    await api('DELETE', `/api/order/customerOrders?${idsParam(orders.map((o) => o.id))}`, null, { expectStatus: [200, 204, 404] });
    log(`  orders: deleted ${orders.length}`);
  } else if (orders.length) log(`[DRY] orders: would delete ${orders.length}`);

  // 3. Documents — ledger only; the model has no marker field to sweep by.
  const docs = ent('document');
  if (docs.length && !DRY_RUN) {
    await api('DELETE', `/api/sales-rep/documents?${idsParam(docs.map((d) => d.id))}`, null, { expectStatus: [200, 204, 404] });
    log(`  documents: deleted ${docs.length}`);
  } else if (docs.length) log(`[DRY] documents: would delete ${docs.length}`);

  // 4. Detach served orgs, restoring the rep's ORIGINAL list verbatim.
  for (const a of attachments) {
    const liveRep = await api('GET', `/api/sales-rep/${a.salesRepId}`, null, { expectStatus: [200, 404] });
    if (!liveRep?.id) { log(`  rep ${a.key}: no longer present, nothing to detach.`); continue; }
    let organizations = liveRep.organizations || [];
    for (const id of a.addedOrgIds || []) organizations = removeServedOrg(organizations, id);
    if (!DRY_RUN) await api('PUT', '/api/sales-rep', { ...liveRep, organizations }, { expectStatus: [200, 201, 204] });
    log(`  rep ${a.key}: detached ${(a.addedOrgIds || []).length} demo org(s); ${a.priorOrganizations.length} pre-existing restored`);
  }

  // 4b. Buyer accounts + their org memberships. Before the contacts, because the account is what
  //     holds the membership and the contact is its member record — deleting the contact first
  //     leaves an account pointing at nothing. deleteUserByEmail removes membership + account
  //     (+ the contact), so the contact pass below finds these already gone and is a no-op for them.
  const accounts = ent('account');
  if (accounts.length && !DRY_RUN) {
    __setApi(api);
    for (const a of accounts) {
      await deleteUserByEmail(a.email).catch((e) => log(`  WARN account ${a.email}: ${e.message}`));
    }
    log(`  buyer accounts: deleted ${accounts.length} (with their org memberships)`);
  } else if (accounts.length) log(`[DRY] buyer accounts: would delete ${accounts.length}`);

  // 5. Contacts then organizations (children before parents), ledger + marker sweep.
  for (const [type, marker, path] of [['contact', 'CT', '/api/members'], ['organization', 'ORG', '/api/members']]) {
    const fromLedger = ent(type).map((e) => e.id);
    const swept = [];
    for (const spec of (type === 'organization' ? DEMO_ORGS : DEMO_CONTACTS)) {
      const name = type === 'organization' ? spec.name : `${spec.firstName} ${spec.lastName}`;
      const m = demoMarker(marker, spec.key);
      if (!markerSweepInScope(m, ONLY)) continue;
      const hit = await findByMarker(type === 'organization' ? 'Organization' : 'Contact', m, name);
      if (hit?.id && hit.outerId === m && !fromLedger.includes(hit.id)) swept.push(hit.id);
    }
    const ids = [...new Set([...fromLedger, ...swept])];
    if (!ids.length) { verbose(`${type}: nothing to delete`); continue; }
    if (DRY_RUN) { log(`[DRY] ${type}: would delete ${ids.length} (${swept.length} marker-orphan)`); continue; }
    await api('DELETE', `${path}?${idsParam(ids)}`, null, { expectStatus: [200, 204, 404] });
    log(`  ${type}: deleted ${ids.length}${swept.length ? ` (${swept.length} marker-orphan the ledger missed)` : ''}`);
  }

  // 6. Report unledgered library rows rather than deleting them — a document carries no marker, so
  //    "not in the ledger" cannot distinguish our orphan from somebody else's upload.
  if (!DRY_RUN) {
    const known = new Set(ent('document').map((d) => d.name));
    const strays = (await allDocuments()).filter((d) => !known.has(d.displayName || d.name));
    if (strays.length) {
      log(`  NOTE: ${strays.length} document(s) remain in the shared library and are not in this ledger.`);
      log('        Documents carry no hidden marker, so this tool will not guess they are ours.');
      log('        Review with `npm run sr:inventory` if they should go.');
    }
    const residue = await verifyRemoved(async () => {
      const r = await api('POST', '/api/members/search', { keyword: 'Northwind Traders', take: 5, deep: true });
      return (r?.results || []).filter((m) => isDemoMarker(m.outerId));
    });
    log(residue === 0 ? '  verifyRemoved: zero marker residue.' : `  WARN: ${residue} marker-bearing member(s) remain`);
  }

  if (!ONLY) writeLedger([]);
  log('Teardown complete.');
}

/**
 * SHARED LISTS, both scopes. See DEMO_LISTS in the spec module for what each one means and for the
 * live evidence behind it; the short version is that an Organization list is authored by a BUYER for
 * their colleagues, and a Customer list is authored by the REP for one customer and reached through
 * a share link rather than the customer's own Lists page.
 *
 * Each list is created with its AUTHOR's own token, never an admin one, so the storefront shows a
 * real person rather than "virto-admin". A Customer list additionally needs the author to be IN the
 * target organization when it is created, which is the same org-switch the storefront switcher does.
 *
 * Idempotent ledger-first, like every other entity here: the recorded id, then a name match among
 * the author's own lists as the fallback for a lost overlay. Never name-first — that is how five of
 * every demo buyer once appeared in Company members.
 */
async function ensureSharedLists(orgs, contacts, pools, reps) {
  const created = [];
  if (!DEMO_LISTS.length) return created;
  const buyerPassword = resolvePassword("{{SR_DEMO_BUYER_PASSWORD}}");
  const cursor = {};
  const tokenCache = new Map();

  for (const spec of DEMO_LISTS) {
    if (!only(spec.key)) continue;
    const org = orgs[spec.org];
    if (!org) { verbose(`list ${spec.key}: org not in scope, skip`); continue; }
    const isCustomerScope = spec.scope === DEMO_LIST_SCOPE.CUSTOMER;

    if (DRY_RUN) {
      log(`[DRY] would create ${spec.scope} list "${spec.name}" (${spec.items} item(s)) for ${org.name}`);
      continue;
    }

    // --- resolve the author and a token that can act as them -----------------
    let authorLabel = spec.author;
    let userId = null;
    let token = null;
    if (isCustomerScope) {
      const r = (reps || []).find((x) => !x.skipped && x.spec.key === spec.author);
      if (!r) { log(`  SKIP list ${spec.key} — rep ${spec.author} is not available on this environment`); continue; }
      authorLabel = r.spec.fullName;
      userId = r.rep.userId;
      const cacheKey = `${userId}:${org.id}`;
      if (!tokenCache.has(cacheKey)) tokenCache.set(cacheKey, await repTokenInOrg(r, org.id));
      token = tokenCache.get(cacheKey);
      if (!token) { log(`  SKIP list ${spec.key} — could not obtain a rep token for ${authorLabel} in ${org.name}`); continue; }
    } else {
      const ownerSpec = contactByKey(spec.author);
      if (!ownerSpec) { verbose(`list ${spec.key}: author not declared, skip`); continue; }
      authorLabel = `${ownerSpec.firstName} ${ownerSpec.lastName}`;
      const user = await api("GET", `/api/platform/security/users/${encodeURIComponent(ownerSpec.email)}`, null, { expectStatus: [200, 404] });
      if (!user?.id) { log(`  SKIP list ${spec.key} — no account for ${ownerSpec.email}`); continue; }
      userId = user.id;
      if (!tokenCache.has(ownerSpec.email)) tokenCache.set(ownerSpec.email, await storefrontToken(ownerSpec.email, buyerPassword));
      token = tokenCache.get(ownerSpec.email);
      if (!token) { log(`  SKIP list ${spec.key} — ${ownerSpec.email} could not obtain a storefront token`); continue; }
    }
    const gql = storefrontGql(token);

    // --- reuse before create -------------------------------------------------
    let listId = priorId("list", spec.key);
    if (listId) {
      const alive = await gql(`query { wishlist(listId: "${listId}") { id name } }`);
      if (!alive?.wishlist?.id) { verbose(`list ${spec.key}: ledger id ${listId} is gone`); listId = null; }
    }
    if (!listId) {
      const scopeArg = isCustomerScope ? `, scope: "${spec.scope}"` : "";
      const mine = await gql(`query { wishlists(storeId: "${STORE_ID}", userId: "${userId}", first: 50${scopeArg}) { items { id name } } }`);
      listId = (mine?.wishlists?.items || []).find((w) => w.name === spec.name)?.id || null;
      if (listId) verbose(`list ${spec.key}: matched an existing list by name`);
    }
    if (!listId) {
      const sharedWith = isCustomerScope ? ` sharedWithId: "${org.id}"` : "";
      const res = await gql(`mutation { createWishlist(command: { storeId: "${STORE_ID}" userId: "${userId}" listName: "${esc(spec.name)}" description: "${esc(spec.description)}" scope: "${spec.scope}"${sharedWith} }) { id name scope } }`);
      listId = res?.createWishlist?.id;
      if (!listId) { log(`  WARN list ${spec.key}: createWishlist returned no id`); continue; }
      log(`${spec.scope} list created: "${spec.name}" by ${authorLabel}${isCustomerScope ? ` FOR ${org.name}` : ` @ ${org.name}`}`);
    } else {
      verbose(`list ${spec.key} exists (${listId})`);
    }

    // --- fill from the org's own pool ---------------------------------------
    const pool = pools[spec.org] || [];
    const start = cursor[spec.org] || 0;
    const window = pool.slice(start, start + spec.items);
    cursor[spec.org] = start + spec.items;
    let count = 0;
    for (const product of window) {
      const r = await gql(`mutation { addWishlistItem(command: { listId: "${listId}" productId: "${product.id}" quantity: 2 }) { id itemsCount } }`);
      const n = r?.addWishlistItem?.itemsCount ?? 0;
      if (n > count) count = n;
    }
    if (count < spec.items) log(`  NOTE list "${spec.name}": ${count}/${spec.items} item(s) — the org pool ran short or a product is unavailable.`);

    // The share link is the ONLY way a customer reaches a Customer-scoped list, so record it: a demo
    // script that cannot hand out the URL cannot show the feature at all.
    const info = await gql(`query { wishlist(listId: "${listId}") { id sharingSetting { id scope sharedWithId access } } }`);
    const setting = info?.wishlist?.sharingSetting || null;
    const shareUrl = setting?.id ? `${FRONT_URL}/shared-list/${setting.id}` : null;
    if (shareUrl && isCustomerScope) log(`    share link: ${shareUrl}`);
    created.push({ type: "list", key: spec.key, id: listId, name: spec.name, scope: spec.scope, org: spec.org, author: authorLabel, itemsCount: count, shareUrl });
  }
  return created;
}

/**
 * ACTIVE CARTS — one per buyer member (DEMO_CARTS), created with the buyer's own token switched
 * into their organization so the cart carries organizationId. Reused when the buyer's cart already
 * holds items; an empty one is filled, because an empty cart is not an active cart (BL-SR-006).
 */
const CART_SEL = 'id name itemsCount organizationId total { formattedAmount } validationErrors { errorCode errorMessage }';

async function ensureActiveCarts(orgs, pools, cursor = {}) {
  const created = [];
  if (!DEMO_CARTS.length) return created;
  const buyerPassword = resolvePassword('{{SR_DEMO_BUYER_PASSWORD}}');

  for (const spec of DEMO_CARTS) {
    if (!only(spec.key)) continue;
    const contact = contactByKey(spec.contact);
    const org = contact && orgs[contact.org];
    if (!org) { verbose(`cart ${spec.key}: org not in scope, skip`); continue; }
    const who = `${contact.firstName} ${contact.lastName}`;
    if (DRY_RUN) { log(`[DRY] would fill ${who}'s cart @ ${org.name} with ${spec.items} line(s)`); continue; }

    const user = await api('GET', `/api/platform/security/users/${encodeURIComponent(contact.email)}`, null, { expectStatus: [200, 404] });
    if (!user?.id) { log(`  SKIP cart ${spec.key} — no account for ${contact.email}`); continue; }
    const token = await buyerTokenInOrg(contact.email, buyerPassword, org.id);
    if (!token) { log(`  SKIP cart ${spec.key} — ${contact.email} could not obtain a storefront token in ${org.name}`); continue; }
    const gql = storefrontGql(token);
    const ctx = `storeId: "${STORE_ID}", userId: "${user.id}", currencyCode: "USD", cultureName: "en-US"`;


    const { cart, lines, added } = await fillCart(gql, ctx, spec, pools[contact.org] || [], cursor, contact.org);
    if (!cart?.id) { log(`  WARN cart ${spec.key}: ${who} has no cart`); continue; }
    if (!lines) log(`  WARN cart ${spec.key}: ${who}'s cart is still EMPTY — not an active cart`);
    else log(`${added ? 'active cart' : 'cart exists'}: ${who} @ ${org.name} — ${lines}/${spec.items} line(s), ${cart.total?.formattedAmount}`);
    if (cart?.organizationId && cart.organizationId !== org.id) log(`  WARN cart ${spec.key}: organizationId is not ${org.name}`);
    created.push({ type: 'cart', key: spec.key, id: cart.id, owner: contact.email, org: contact.org, itemsCount: cart.itemsCount || 0 });
  }
  return created;
}

/**
 * Fill a cart up to `spec.items` NON-GIFT lines from the org's pool — topping up a short cart, not
 * only an empty one (a gift line from an env cart promotion is not one of ours and never counts).
 * Any product the cart refuses (no price, no stock) is skipped: the pool is discovered for orders,
 * which are POSTed by admin and never check purchasability. A refused add leaves nothing behind.
 */
async function fillCart(gql, ctx, spec, pool, cursor, orgKey) {
  const SEL = `${CART_SEL} items { id productId quantity isGift selectedForCheckout }`;
  const own = (c) => (c?.items || []).filter((i) => !i.isGift).length;
  let cart = (await gql(`query { cart(${ctx}) { ${SEL} } }`))?.cart;
  const refused = new Set();
  let added = 0;
  // Start where the previous cart stopped (variety), but WRAP rather than stop: on a catalog with one
  // buyable product per family (virtostart, 2026-09-24) a strict disjoint walk left a buyer cartless.
  const start = pool.length ? (cursor[orgKey] || 0) % pool.length : 0;
  for (let n = 0; n < pool.length && own(cart) < spec.items; n += 1) {
    const product = pool[(start + n) % pool.length];
    cursor[orgKey] = start + n + 1;
    // Already in the cart: addItem would RAISE its quantity, not add a line — every re-run would grow it.
    if ((cart?.items || []).some((i) => i.productId === product.id)) continue;
    const before = own(cart);
    const qty = spec.quantities[before % spec.quantities.length];
    const res = (await gql(`mutation { addItem(command: { ${ctx}, productId: "${product.id}", quantity: ${qty} }) { ${SEL} } }`))?.addItem;
    if (res) cart = res;
    if (own(res) > before) added += 1;
    else (res?.validationErrors || []).forEach((e) => refused.add(e.errorCode));
  }
  const lines = own(cart);
  if (refused.size) (lines < spec.items ? log : verbose)(`  cart ${spec.key}: pool products refused — ${[...refused].join(', ')}${lines < spec.items ? ` (pool of ${pool.length} exhausted)` : ''}`);
  return { cart, lines, added };
}

/**
 * REP-CREATED CARTS (DEMO_REP_CARTS) — the only carts the rep's Active-carts tile counts. Built with
 * a token acting as the rep inside the served org (own password, else an operator's login-on-behalf),
 * then `unselect` lines are taken out of checkout so both tile figures read non-zero.
 */
async function ensureRepCarts(orgs, pools, reps, cursor) {
  const created = [];
  for (const spec of DEMO_REP_CARTS) {
    if (!only(spec.key)) continue;
    const org = orgs[spec.org];
    const r = (reps || []).find((x) => !x.skipped && x.spec.key === spec.rep);
    if (!org || !r) { log(`  SKIP rep cart ${spec.key} — ${!r ? `rep ${spec.rep} unavailable` : 'org not in scope'}`); continue; }
    if (DRY_RUN) { log(`[DRY] would fill ${r.spec.fullName}'s cart @ ${org.name} with ${spec.items} line(s), ${spec.unselect} unselected`); continue; }
    const token = await repTokenInOrg(r, org.id);
    if (!token) { log(`  SKIP rep cart ${spec.key} — could not obtain a rep token for ${r.spec.fullName} in ${org.name}`); continue; }
    const gql = storefrontGql(token);
    const ctx = `storeId: "${STORE_ID}", userId: "${r.rep.userId}", currencyCode: "USD", cultureName: "en-US"`;
    const SEL = `${CART_SEL} items { id quantity isGift selectedForCheckout }`;

    let { cart, lines: filled } = await fillCart(gql, ctx, spec, pools[spec.org] || [], cursor, spec.org);
    if (!cart?.id) { log(`  WARN rep cart ${spec.key}: no cart`); continue; }
    if (!filled) log(`  WARN rep cart ${spec.key}: still EMPTY — not an active cart`);
    if (cart?.organizationId && cart.organizationId !== org.id) log(`  WARN rep cart ${spec.key}: organizationId is not ${org.name}`);

    // Converge on: the `unselect` smallest-quantity NON-gift lines are off, every other line is on.
    // Response order is not insertion order, and a promotion's gift line must never be the one taken
    // out of checkout — so the choice is by quantity, which is stable across re-runs.
    const lines = (cart?.items || []).filter((i) => !i.isGift);
    // Capped at lines-1: unselecting the ONLY line leaves nothing for checkout and a $0.00 cart.
    const offCount = Math.min(spec.unselect, Math.max(lines.length - 1, 0));
    const wantOff = new Set([...lines].sort((a, b) => a.quantity - b.quantity || a.id.localeCompare(b.id)).slice(0, offCount).map((i) => i.id));
    const toOff = lines.filter((i) => wantOff.has(i.id) && i.selectedForCheckout !== false).map((i) => i.id);
    const toOn = lines.filter((i) => !wantOff.has(i.id) && i.selectedForCheckout === false).map((i) => i.id);
    for (const [mutation, ids] of [['selectCartItems', toOn], ['unSelectCartItems', toOff]]) {
      if (!ids.length) continue;
      const res = (await gql(`mutation { ${mutation}(command: { cartId: "${cart.id}", ${ctx}, lineItemIds: ${JSON.stringify(ids)} }) { ${SEL} } }`))?.[mutation];
      if (res) cart = res;
    }
    const off = (cart?.items || []).filter((i) => i.selectedForCheckout === false).length;
    log(`rep cart: ${r.spec.fullName} @ ${org.name} — ${cart?.itemsCount || 0} line(s), ${off} not for checkout, ${cart?.total?.formattedAmount}`);
    created.push({ type: 'cart', key: spec.key, id: cart.id, owner: r.email, org: spec.org, createdByRep: spec.rep, itemsCount: cart?.itemsCount || 0 });
  }
  return created;
}

/** A buyer's storefront token switched into one organization. Never written to disk. */
async function buyerTokenInOrg(username, password, organizationId) {
  const t = await tokenRequest({ grant_type: 'password', username, password, scope: 'offline_access', storeId: STORE_ID });
  if (!t?.access_token) return null;
  if (!t.refresh_token) return t.access_token;
  const switched = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token, organization_id: organizationId, scope: 'offline_access' });
  return switched?.access_token || t.access_token;
}

/**
 * A storefront token that acts as the REP, inside one served organization.
 *
 * Two paths, because a demo environment rarely has both. If the rep's own password is set we use it.
 * Otherwise an OPERATOR holding platform:security:loginOnBehalf impersonates them — which is how a
 * human would do this from the storefront, and it means the demo does not need a real colleague's
 * password just to curate a list. Either way the org switch is the same call the storefront's own
 * organization switcher makes, and it matters: a list created under the wrong active organization
 * cannot be shared with the right customer.
 */
async function repTokenInOrg(resolved, organizationId) {
  const envKey = `${resolved.spec.passwordVar}_${TEST_ENV.toUpperCase()}`;
  const direct = process.env[envKey] || process.env[resolved.spec.passwordVar];
  let tokens = null;
  if (direct) {
    tokens = await tokenRequest({ grant_type: "password", username: resolved.email, password: direct, scope: "offline_access", storeId: STORE_ID });
    if (!tokens?.access_token) log(`  NOTE ${resolved.spec.key}: ${envKey} did not authenticate; falling back to the operator path.`);
  }
  if (!tokens?.access_token) {
    // First fully-configured operator wins. IMPERSONATION_ADMIN is the env's dedicated login-on-behalf
    // account; USER2 is a last resort and usually lacks platform:security:loginOnBehalf.
    const operators = [
      [process.env.SR_DEMO_OPERATOR_EMAIL, process.env.SR_DEMO_OPERATOR_PASSWORD],
      [process.env.IMPERSONATION_ADMIN_EMAIL, process.env.IMPERSONATION_ADMIN_PASSWORD],
      [process.env.USER2_EMAIL, process.env.USER2_PASSWORD],
    ];
    const [opEmail, opPassword] = operators.find(([e, pw]) => e && pw) || [];
    if (!opEmail || !opPassword) {
      log(`  NOTE no rep password and no operator (SR_DEMO_OPERATOR_*, IMPERSONATION_ADMIN_* or USER2_*) — cannot act as ${resolved.spec.fullName}.`);
      return null;
    }
    const op = await tokenRequest({ grant_type: "password", username: opEmail, password: opPassword, scope: "offline_access", storeId: STORE_ID });
    if (!op?.access_token) { log(`  NOTE operator ${opEmail} could not sign in.`); return null; }
    tokens = await tokenRequest({ grant_type: "impersonate", user_id: resolved.rep.userId, scope: "offline_access" }, op.access_token);
    if (!tokens?.access_token) { log(`  NOTE operator ${opEmail} cannot log in on behalf of ${resolved.spec.fullName} (needs platform:security:loginOnBehalf).`); return null; }
  }
  if (tokens.refresh_token && organizationId) {
    const switched = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, organization_id: organizationId, scope: "offline_access" });
    if (switched?.access_token) return switched.access_token;
    log("  NOTE could not switch the rep into the target organization; the list would attach to the wrong one.");
    return null;
  }
  return tokens.access_token;
}

/** A storefront bearer for one BUYER. Never written to disk. */
async function storefrontToken(username, password) {
  const t = await tokenRequest({ grant_type: 'password', username, password, scope: 'offline_access', storeId: STORE_ID });
  if (!t?.access_token) log(`  WARN token for ${username}: sign-in failed`);
  return t?.access_token || null;
}

/** One /connect/token call. Returns the parsed body, or null. Nothing is written to disk. */
async function tokenRequest(body, bearer = null) {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: new URLSearchParams(body),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}
/** The customer-facing /graphql endpoint; seed-common own bearer is an ADMIN one and is private. */
const storefrontGql = (token) => async (query) => {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => ({}));
  if (body.errors?.length) log(`  gql: ${body.errors.map((e) => e.message).slice(0, 2).join(" | ").slice(0, 160)}`);
  return body.data;
};

const esc = (v) => String(v ?? "").split(BSLASH).join(BSLASH + BSLASH).split(DQ).join(BSLASH + DQ);
const BSLASH = String.fromCharCode(92);
const DQ = String.fromCharCode(34);
// ---- main ------------------------------------------------------------------

async function main() {
  assertSafeTarget();

  // Design gate BEFORE any write. A dataset that stopped discriminating — overlapping product
  // slots, no shared customer, a single order status — renders perfectly and demonstrates nothing,
  // and no structural check downstream would notice.
  const problems = demoProblems();
  if (problems.length) {
    console.error('ABORT: the demo dataset does not hold together:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(2);
  }

  await auth();

  if (TEARDOWN) { await teardown(); return; }

  const reps = await resolveReps();
  const usable = reps.filter((r) => !r.skipped);
  if (!usable.length) {
    console.error('ABORT: no demo rep could be resolved — there is nobody to attach the dataset to.');
    console.error('  See the SKIP lines above; each names the exact variable or Admin action needed.');
    process.exit(2);
  }

  const orgs = await ensureOrgs();
  const contacts = await ensureContacts(orgs);
  const accounts = await ensureBuyerAccounts(orgs, contacts);
  const attachments = await attachServedOrgs(reps, orgs);
  const orders = await ensureOrders(orgs, reps);
  const lists = await ensureSharedLists(orgs, contacts, await discoverProductPools(listProductNeedByOrg()), reps);
  // Oversampled ×8: a discovered product may carry no price or no stock, and the cart refuses it.
  // ×3 ran dry on virtostart (2026-09-24: PRODUCT_PRICE_INVALID / PRODUCT_FFC_QTY across 18 candidates).
  const cartNeed = Object.fromEntries(Object.entries(cartProductNeedByOrg()).map(([k, n]) => [k, n * 8]));
  // One pool + one cursor for buyer and rep carts, so the two never draw the same product twice.
  const cartPools = await discoverProductPools(cartNeed);
  const cartCursor = {};
  const carts = [
    ...await ensureActiveCarts(orgs, cartPools, cartCursor),
    ...await ensureRepCarts(orgs, cartPools, reps, cartCursor),
  ];
  const documents = await ensureDocuments();
  const tasks = await ensureTasks(reps);

  const entities = [
    ...Object.entries(orgs).map(([key, v]) => ({ type: 'organization', key, id: v.id, name: v.name, marker: demoMarker('ORG', key) })),
    ...Object.entries(contacts).map(([key, v]) => ({ type: 'contact', key, id: v.id, name: v.name, marker: demoMarker('CT', key) })),
    ...accounts, ...orders, ...documents, ...tasks, ...attachments, ...lists, ...carts,
  ];
  // A scoped run (--only) produced a SUBSET, so it MERGES into the ledger instead of replacing it.
  // Replacing it once dropped every contact id; the next full run fell back to a member search the
  // index had not caught up with, and created seven duplicate buyers (vcst, 2026-09-24).
  const merged = ONLY
    ? [...(readLedger().entities || []).filter((e) => !entities.some((n) => n.type === e.type && n.key === e.key)), ...entities]
    : entities;
  writeLedger(merged);

  const skipped = reps.filter((r) => r.skipped);
  log('');
  log(`Demo seeded: ${Object.keys(orgs).length} org(s), ${Object.keys(contacts).length} contact(s), `
    + `${orders.length} order(s), ${documents.length} document(s), ${lists.length} shared list(s), ${carts.filter((c) => c.itemsCount > 0).length} active cart(s), `
    + `${tasks.length} task(s), ${usable.length} rep(s).`);
  if (skipped.length) log(`${skipped.length} rep(s) skipped — see the SKIP lines above; re-run after fixing to fill them in.`);
  log(DRY_RUN ? 'DRY RUN — no writes were made.' : `Ledger → test-data/aliases.${TEST_ENV}.json[${LEDGER_KEY}]. Commit it.`);
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
