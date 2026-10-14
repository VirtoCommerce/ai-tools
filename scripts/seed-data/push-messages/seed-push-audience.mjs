#!/usr/bin/env node
/**
 * seed-push-audience.mjs — provision the Push Messages AUDIENCE-BUILDER fixture (VCST-5944).
 *
 * WHAT IT MAKES (see push-audience-specs.mjs for WHY each row exists):
 *   AGENT-TEST-PUSH-PARENT            Organization, root of the seeded tree
 *     └ AGENT-TEST-PUSH-CHILD         Organization, parentId = the parent (THE thing a stock env
 *                                     has none of: 61 orgs, zero with a parent)
 *   1 contact WITH a login in the PARENT, 2 contacts WITH logins in the CHILD,
 *   1 contact with NO security account in the CHILD,
 *   1 Employee WITH a login, deliberately OUTSIDE the tree.
 *
 * WHAT IT BUYS: selecting the parent company must resolve to 3 recipients. A non-recursive
 * expansion returns 1; an expansion blind to the login gate returns 4. Three distinct numbers,
 * so the claim "adding a company includes everyone in it, and in the companies under it" can
 * FAIL. Same for "All registered customers" (`membertype:Contact`) excluding an Employee that
 * holds a login — on a stock env that Employee has no login, so the exclusion is unobservable.
 *
 * MECHANISM: plain Platform REST (`/api/members`, `/api/platform/security/users/create`), then a
 * targeted `Member` reindex, because the audience preview reads the Member SEARCH INDEX — a
 * freshly created member is invisible to it until indexed (`documentType: 'Member'`,
 * `documentIds: [...]`; NOT `ids`, see test-data-authoring.md §5a).
 *
 * IDEMPOTENT find-or-create keyed on business keys only (org name, contact email). Runtime
 * platform GUIDs are written to `test-data/aliases.<env>.json` — never into a committed file.
 * Passwords are a `{{VAR}}` token resolved at seed time (VCST-5406).
 *
 * USAGE
 *   TEST_ENV=<env> node scripts/seed-data/push-messages/seed-push-audience.mjs [--dry-run] [--verbose]
 *   TEST_ENV=<env> node scripts/seed-data/push-messages/seed-push-audience.mjs --verify
 *   TEST_ENV=<env> node scripts/seed-data/push-messages/seed-push-audience.mjs --teardown
 *
 * `--verify` is the part that matters: it drives the feature's OWN endpoint
 * (`POST /api/push-message/preview-recipients`) and prints the ACTUAL counters, then asserts the
 * fixture discriminates. A green seed with a red verify is a GAP to report, not a fixture to ship.
 *
 * Safety: ENV_RISK gate (assertSafeTarget). Teardown removes ONLY AGENT-TEST-PUSH-* entities and
 * ends on a zero-residue assert.
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, ensureMemberIndex,
  writeEnvAliasOverride, DRY_RUN, TEARDOWN, STORE_ID, ROOT,
} from '../../lib/seed-common.mjs';
import { resolvePassword, passwordSource } from '../../lib/user-provision.mjs';
import {
  SEED_PREFIX, EMAIL_PREFIX, PASSWORD_VAR, ORGS, PEOPLE, MEMBER_QUERY,
  orgBody, memberBody, seedOuterId, isSeededOuterId,
  expectedRecipients, nonRecursiveRecipients, loginBlindRecipients, expectedCompaniesExpanded,
  findDecidabilityProblems, teardownOrder,
} from './push-audience-specs.mjs';

const argv = process.argv.slice(2);
const VERIFY_ONLY = argv.includes('--verify-only');
const VERIFY = argv.includes('--verify') || VERIFY_ONLY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── lookups (business key only) ─────────────────────────────────────────────── */

async function searchMembers(body) {
  const res = await api('POST', '/api/members/search', { take: 100, deepSearch: true, ...body }, { expectStatus: [200, 201] });
  return res?.results || [];
}

/** Find a seeded org by its stable name (or by the outerId marker, if the name drifted). */
async function findOrg(spec) {
  const byName = await searchMembers({ keyword: spec.name, memberType: 'Organization' });
  return byName.find((m) => m.name === spec.name || isSeededOuterId(m.outerId) && m.outerId === seedOuterId(spec.key)) || null;
}

/** Find a seeded person by email (the business key), falling back to the outerId marker. */
async function findPerson(spec) {
  const hits = await searchMembers({ keyword: spec.email, memberType: spec.memberType });
  const byEmail = hits.find((m) => (m.emails || []).some((e) => String(e).toLowerCase() === spec.email.toLowerCase()));
  if (byEmail) return byEmail;
  const byMarker = await searchMembers({ keyword: SEED_PREFIX, memberType: spec.memberType });
  return byMarker.find((m) => m.outerId === seedOuterId(spec.key)) || null;
}

/** The per-env overlay this seeder wrote — the fallback handle when the search cannot see a member. */
function readOverlay() {
  const p = join(ROOT, `test-data/aliases.${process.env.TEST_ENV || 'vcst'}.json`);
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}; } catch { return {}; }
}

async function findUser(email) {
  const res = await api('POST', '/api/platform/security/users/search', { keyword: email, take: 20 }, { expectStatus: [200, 201] });
  return (res?.results || []).find((u) =>
    String(u.userName || '').toLowerCase() === email.toLowerCase() ||
    String(u.email || '').toLowerCase() === email.toLowerCase()) || null;
}

/* ── the audience preview — the feature's own endpoint ───────────────────────── */

async function preview({ memberIds = [], memberQuery = '', take = 0 } = {}) {
  return api('POST', '/api/push-message/preview-recipients', { memberQuery, memberIds, skip: 0, take }, { expectStatus: [200, 201] });
}

/**
 * Targeted Member reindex, then poll until EVERY seeded member is visible to the index-backed
 * keyword search — not just the first one.
 *
 * The probe deliberately does NOT use the feature's own preview endpoint: (a) a seed must work
 * where PushMessages is not deployed (seed-bootstrap runs this step as optional), and (b) "the
 * parent previews > 0" is true as soon as the parent's OWN contact is indexed, while the child
 * company and its contacts may still be missing — so --verify would read the non-recursive
 * answer (1) and report a product defect that is really index lag.
 */
async function indexMembers(ids, { tries = 20, delayMs = 5000 } = {}) {
  const memberIds = Object.values(ids);
  if (DRY_RUN || !memberIds.length) return true;
  // documentType MUST be a registered type and the field is `documentIds`, not `ids`
  // (test-data-authoring.md §5a — `ids:` silently degrades to a global incremental).
  await api('POST', '/api/search/indexes/index', [{ documentType: 'Member', documentIds: memberIds, rebuild: false }], { expectStatus: [200, 201, 204] });
  const specs = [...ORGS, ...PEOPLE].filter((s) => ids[s.alias]);
  let missing = specs;
  for (let i = 0; i < tries; i++) {
    const seen = await Promise.all(missing.map(async (s) => (await (s.memberType ? findPerson(s) : findOrg(s)))?.id === ids[s.alias]));
    missing = missing.filter((_, k) => !seen[k]);
    if (!missing.length) {
      log(`  member index caught up after ${(i * delayMs) / 1000}s (${specs.length}/${specs.length} members visible)`);
      return true;
    }
    if (i < tries - 1) await sleep(delayMs);
  }
  log(`  WARN: member index did not catch up — still invisible: ${missing.map((s) => s.alias).join(', ')}. Treat a low --verify count as UNKNOWN, not as absence.`);
  return false;
}

/* ── teardown ────────────────────────────────────────────────────────────────── */

async function teardown() {
  log(`Teardown: removing ${SEED_PREFIX}-* members, logins and orgs (bottom-up)...`);

  // 0) SNAPSHOT every id BEFORE deleting anything.
  //
  // MEASURED 2026-09-24 on vcptcore_qa1: resolving each member lazily, AFTER its security account
  // had been deleted, silently missed all four login-holding members. The by-email member lookup
  // is keyword search — index-backed — and deleting the security account re-writes the member's
  // index document, so for a window the email no longer matches. Teardown stepped straight over
  // Parent One, Child One, Child Two and Push Employee, and the residue assert (which used the
  // SAME stale search) then reported "zero residue" over four surviving members. That is the worst
  // shape a teardown can have: it fails in the direction that looks clean.
  //
  // So: resolve first, delete second, and verify by OBJECT ID (a direct lookup, not a keyword
  // match). The overlay is the fallback handle for anything the search cannot see at all.
  const overlay = readOverlay();
  const snapshot = [];
  for (const o of ORGS) {
    const id = (await findOrg(o))?.id || overlay[o.alias]?.id || null;
    if (id) snapshot.push({ kind: 'org', spec: o, id, label: o.name });
  }
  for (const p of PEOPLE) {
    const id = (await findPerson(p))?.id || overlay[p.alias]?.id || null;
    if (id) snapshot.push({ kind: 'person', spec: p, id, label: p.email });
  }
  log(`  resolved ${snapshot.length} live entity/entities before deleting anything`);

  // 1) logins first (a security account outlives its member and keeps counting as a recipient)
  for (const p of PEOPLE) {
    const u = await findUser(p.email);
    if (!u) continue;
    if (!DRY_RUN) {
      // The security delete query param is `names` (NOT ids / userNames — see user-provision.mjs).
      await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(p.email)}`, null, { expectStatus: [200, 204, 404] });
    }
    log(`  ✗ login ${p.email}`);
  }

  // 2) people, then 3) orgs deepest-first — from the SNAPSHOT, never re-resolved.
  const order = teardownOrder(snapshot);
  for (const s of order) {
    if (!DRY_RUN) await api('DELETE', `/api/members?ids=${encodeURIComponent(s.id)}`, null, { expectStatus: [200, 204, 404] });
    log(`  ✗ ${s.kind === 'org' ? 'org' : s.spec.memberType.toLowerCase()} ${s.label} (${s.id})`);
  }

  // 4) zero-residue assert — by OBJECT ID (what the search missed above) AND by keyword sweep.
  //    Computed here, not through seed-common's verifyRemoved(): that helper reads a THROWN probe
  //    as zero residue, and a check that could not run must never report clean.
  if (DRY_RUN) { log('DRY RUN teardown complete (no writes).'); return; }
  let survivorByAlias;
  let residue;
  try {
    survivorByAlias = {};
    const survivors = snapshot.length
      ? await searchMembers({ objectIds: snapshot.map((s) => s.id), take: 100 })
      : [];
    for (const m of survivors) {
      const s = snapshot.find((x) => x.id === m.id);
      if (s) survivorByAlias[s.spec.alias] = m.id;
    }
    if (survivors.length) log(`  residual member(s) by id: ${survivors.map((m) => `${m.memberType}:${m.name}`).join(', ')}`);
    const survivorIds = new Set(survivors.map((m) => m.id));
    const strays = (await searchMembers({ keyword: SEED_PREFIX, take: 100 }))
      .filter((m) => (String(m.name || '').startsWith(SEED_PREFIX) || isSeededOuterId(m.outerId)) && !survivorIds.has(m.id));
    for (const m of strays) {
      // A stray the snapshot never saw: keep a handle on it for the next teardown.
      const spec = [...ORGS, ...PEOPLE].find((s) => m.outerId === seedOuterId(s.key) || (!s.memberType && m.name === s.name));
      if (spec && !survivorByAlias[spec.alias]) survivorByAlias[spec.alias] = m.id;
    }
    if (strays.length) log(`  residual member(s) by name sweep: ${strays.map((m) => `${m.memberType}:${m.name}`).join(', ')}`);
    const logins = [];
    for (const p of PEOPLE) if (await findUser(p.email)) logins.push(p.email);
    if (logins.length) log(`  residual login(s): ${logins.join(', ')}`);
    residue = survivors.length + strays.length + logins.length;
  } catch (e) {
    log(`WARN: the residue check could not run (${String(e.message).slice(0, 200)}) — teardown is UNVERIFIED; overlay ids KEPT so the next teardown can still find any survivor.`);
    return;
  }
  // Blank ONLY the aliases whose entity is confirmed gone, so @td() reports a clear miss instead of
  // pointing at a deleted entity. A survivor keeps (or gains) its id: the overlay is the fallback
  // handle the next teardown needs for a member the keyword search cannot see.
  writeEnvAliasOverride(Object.fromEntries(
    [...ORGS, ...PEOPLE].map((s) => {
      const id = survivorByAlias[s.alias] || '';
      return [s.alias, { id, platform_id: id }];
    }),
  ));
  log(residue === 0 ? 'Teardown complete — zero residue.' : `WARN: ${residue} residual entity/entities remain — their overlay ids were kept; re-run the teardown.`);
}

/* ── verify: prove the fixture DISCRIMINATES, using the feature's own endpoint ── */

async function verifyLive(ids) {
  const parent = ORGS.find((o) => !o.parentKey);
  const child = ORGS.find((o) => o.parentKey);
  const employee = PEOPLE.find((p) => p.memberType === 'Employee');
  const problems = [];
  const say = (m) => console.log(`  ${m}`);

  console.log('\n[verify] POST /api/push-message/preview-recipients — actual counters\n');

  const pParent = await preview({ memberIds: [ids[parent.alias]], take: 25 });
  say(`PARENT  memberIds:[${parent.name}] -> ${JSON.stringify({
    totalCount: pParent.totalCount, membersMatched: pParent.membersMatched,
    companiesExpanded: pParent.companiesExpanded, peopleFromCompanies: pParent.peopleFromCompanies,
    peopleInScope: pParent.peopleInScope, extraLogins: pParent.extraLogins })}`);
  const wantParent = expectedRecipients(parent.key);
  if (pParent.totalCount !== wantParent) {
    problems.push(`PARENT totalCount = ${pParent.totalCount}, expected ${wantParent}` +
      (pParent.totalCount === nonRecursiveRecipients(parent.key) ? ' — this is EXACTLY the non-recursive answer: the company expansion did not descend into the child company' : '') +
      (pParent.totalCount === loginBlindRecipients(parent.key) ? ' — this is EXACTLY the login-blind answer: a contact with no security account was counted' : ''));
  }
  if ((pParent.companiesExpanded || 0) < 1) problems.push(`PARENT companiesExpanded = ${pParent.companiesExpanded}, expected >= 1 (the selected company itself must be expanded; the whole subtree is ${expectedCompaniesExpanded(parent.key)})`);

  const pChild = await preview({ memberIds: [ids[child.alias]], take: 25 });
  say(`CHILD   memberIds:[${child.name}] -> ${JSON.stringify({
    totalCount: pChild.totalCount, membersMatched: pChild.membersMatched,
    companiesExpanded: pChild.companiesExpanded, peopleFromCompanies: pChild.peopleFromCompanies,
    peopleInScope: pChild.peopleInScope, extraLogins: pChild.extraLogins })}`);
  const wantChild = expectedRecipients(child.key);
  if (pChild.totalCount !== wantChild) problems.push(`CHILD totalCount = ${pChild.totalCount}, expected ${wantChild}` +
    (pChild.totalCount === loginBlindRecipients(child.key) ? ' — the login-less contact was counted' : ''));

  const pEmp = await preview({ memberQuery: MEMBER_QUERY.EMPLOYEE, take: 100 });
  const empHit = (pEmp.results || []).find((r) => r.memberId === ids[employee.alias]);
  say(`EMPLOYEE memberQuery:'${MEMBER_QUERY.EMPLOYEE}' -> ${JSON.stringify({
    totalCount: pEmp.totalCount, membersMatched: pEmp.membersMatched,
    peopleInScope: pEmp.peopleInScope, extraLogins: pEmp.extraLogins })}` +
    ` | seeded employee in results: ${empHit ? `YES (${empHit.userName})` : 'NO'}`);
  if (!empHit) problems.push(`the seeded Employee (${employee.email}) is NOT among the membertype:Employee results — without it the exclusion claim stays vacuous`);
  if ((pEmp.peopleInScope || 0) < 1) problems.push(`membertype:Employee peopleInScope = ${pEmp.peopleInScope}, expected >= 1`);

  const pContact = await preview({ memberQuery: MEMBER_QUERY.EVERYONE, take: 1000 });
  const leaked = (pContact.results || []).find((r) => r.memberId === ids[employee.alias]);
  say(`EVERYONE memberQuery:'${MEMBER_QUERY.EVERYONE}' -> ${JSON.stringify({
    totalCount: pContact.totalCount, membersMatched: pContact.membersMatched,
    peopleInScope: pContact.peopleInScope })}` +
    ` | seeded employee present: ${leaked ? 'YES' : 'no'} | results returned: ${(pContact.results || []).length}`);
  if (leaked) problems.push(`the seeded Employee appears in the membertype:Contact audience — "All registered customers" is including an Employee`);
  if ((pContact.results || []).length < Math.min(pContact.totalCount, 1000)) {
    say(`  NOTE: ${(pContact.results || []).length} of ${pContact.totalCount} results were returned — the employee-absence check covers only the returned page.`);
  }

  console.log('');
  if (problems.length) {
    problems.forEach((p) => console.log(`  ✗ ${p}`));
    console.log(`\n[verify] ${problems.length} discrepancy/ies — report the ACTUAL numbers above, do not build cases on them.`);
  } else {
    console.log('[verify] ✓ the fixture discriminates: parent(3) / child(2) are the recursive, login-gated answers; the seeded Employee is visible to membertype:Employee and absent from membertype:Contact.');
  }
  return problems;
}

/* ── main ────────────────────────────────────────────────────────────────────── */

async function main() {
  assertSafeTarget();

  const decidability = findDecidabilityProblems();
  if (decidability.length) {
    console.error('SPEC IS NOT DECIDABLE — refusing to seed a fixture that cannot fail:');
    decidability.forEach((p) => console.error(`  ✗ ${p}`));
    process.exit(1);
  }

  await auth();
  if (TEARDOWN) { await teardown(); return; }

  const src = passwordSource(PASSWORD_VAR);
  if (src.kind === 'fallback') {
    log(`WARN: ${PASSWORD_VAR} is unset in this env — seeded logins will use the clone-safe fallback and may not be able to sign in.`);
  }
  const password = resolvePassword(PASSWORD_VAR);

  await ensureMemberIndex(api);

  const ids = {};

  // 1) orgs, top-down (the parent must exist before the child can point at it)
  log('\nOrganizations (top-down):');
  const orgIdByKey = {};
  for (const o of ORGS) {
    const parentId = o.parentKey ? orgIdByKey[o.parentKey] : null;
    let live = await findOrg(o);
    if (live?.id) {
      // Reconcile the parent link in place: the tree shape IS the fixture, so a drifted
      // parentId silently restores the undecidable flat-org state this seeder exists to fix.
      if (parentId && live.parentId !== parentId && !DRY_RUN) {
        await api('POST', '/api/members', { ...live, parentId }, { expectStatus: [200, 201, 204] });
        log(`  ✎ ${o.name}: parentId -> ${parentId}`);
        live = { ...live, parentId };
      }
      log(`  ↻ reuse  ${o.name} (${live.id})${live.parentId ? ` parent=${live.parentId}` : ''}`);
    } else {
      const created = await api('POST', '/api/members', orgBody(o, parentId));
      live = created || { id: `dry-${o.key}` };
      log(`  ✓ create ${o.name} (${live.id})${parentId ? ` parent=${parentId}` : ''}`);
    }
    orgIdByKey[o.key] = live.id;
    ids[o.alias] = live.id;
  }

  // 2) people
  log('\nMembers:');
  for (const p of PEOPLE) {
    const orgIds = p.orgKey ? [orgIdByKey[p.orgKey]].filter(Boolean) : [];
    let live = await findPerson(p);
    if (live?.id) {
      const want = new Set(orgIds);
      const have = new Set(live.organizations || []);
      const drifted = orgIds.length && (want.size !== have.size || [...want].some((x) => !have.has(x)));
      if (drifted && !DRY_RUN) {
        await api('POST', '/api/members', { ...live, organizations: orgIds }, { expectStatus: [200, 201, 204] });
        log(`  ✎ ${p.email}: organizations -> [${orgIds.join(', ')}]`);
      }
      log(`  ↻ reuse  ${p.memberType} ${p.email} (${live.id})`);
    } else {
      const created = await api('POST', '/api/members', memberBody(p, orgIds));
      live = created || { id: `dry-${p.key}` };
      log(`  ✓ create ${p.memberType} ${p.email} (${live.id})`);
    }
    ids[p.alias] = live.id;
  }

  // 3) logins — the login gate is the discriminating axis, so it is seeded explicitly,
  //    including the deliberate ABSENCE on CHILD_NOLOGIN.
  log('\nSecurity accounts:');
  for (const p of PEOPLE) {
    const memberId = ids[p.alias];
    const existing = await findUser(p.email);
    if (!p.hasLogin) {
      if (existing?.id) {
        // A stray login on the no-login contact silently turns the parent's 3 into 4.
        if (!DRY_RUN) await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(p.email)}`, null, { expectStatus: [200, 204, 404] });
        log(`  ✗ removed stray login on ${p.email} — it would collapse the login gate (3 becomes 4)`);
      } else {
        log(`  — ${p.email}: NO security account (by design — this is what makes the login gate falsifiable)`);
      }
      continue;
    }
    if (existing?.id) {
      if (!DRY_RUN && existing.memberId !== memberId) {
        const full = await api('GET', `/api/platform/security/users/${encodeURIComponent(p.email)}`, null, { expectStatus: [200, 404] });
        if (full) {
          full.memberId = memberId;
          await api('PUT', '/api/platform/security/users', full, { expectStatus: [200, 204] });
          log(`  ✎ relinked ${p.email} -> member ${memberId}`);
        }
      }
      log(`  ↻ reuse  login ${p.email} (${existing.id})`);
      continue;
    }
    const body = {
      userName: p.email, email: p.email, password, memberId, storeId: STORE_ID,
      userType: 'Customer', isAdministrator: false,
      status: 'Approved', emailConfirmed: true, lockoutEnabled: false,
    };
    const res = await api('POST', '/api/platform/security/users/create', body);
    if (res && res.succeeded === false) throw new Error(`security/users/create failed for ${p.email}: ${JSON.stringify(res.errors)}`);
    if (DRY_RUN) { log(`  ✓ create login (dry) ${p.email}`); continue; }
    const fresh = await findUser(p.email);
    if (!fresh?.id) throw new Error(`created login ${p.email} but could not resolve it back`);
    log(`  ✓ create login ${p.email} (${fresh.id})`);
  }

  // 4) writeback — runtime GUIDs to aliases.<env>.json ONLY. Written BEFORE indexing: everything
  //    above already exists on the platform, and the overlay is teardown's fallback handle for a
  //    member the index cannot see — a failure in a later step must not strand them without one.
  const liveIds = Object.fromEntries(
    [...ORGS, ...PEOPLE]
      .filter((s) => ids[s.alias] && !String(ids[s.alias]).startsWith('dry-'))
      .map((s) => [s.alias, ids[s.alias]]),
  );
  writeEnvAliasOverride(Object.fromEntries(
    Object.entries(liveIds).map(([alias, id]) => [alias, { id, platform_id: id }]),
  ));

  // 5) the preview reads the Member INDEX — a fresh member is invisible until indexed.
  let indexReady = true;
  if (!DRY_RUN) {
    log('\nIndexing:');
    indexReady = await indexMembers(liveIds);
    // Read back through a DEEP search: a child org carries a parentId, and the members search
    // without `deepSearch` only returns root-level members — `verifyCreated`'s generic probe
    // would report a perfectly good child org as missing.
    for (const o of ORGS) {
      const back = await searchMembers({ objectIds: [ids[o.alias]], take: 1 });
      if (!back.some((m) => m.id === ids[o.alias])) log(`  WARN: org ${o.name} did not read back through /api/members/search`);
    }
  }

  log(DRY_RUN ? '\nDRY RUN complete (no writes).' : `\nSeed complete. ${[...ORGS, ...PEOPLE].length} alias(es) -> aliases.<env>.json.`);

  if (VERIFY && !DRY_RUN) {
    if (!indexReady) log('WARN: the member index had not caught up — any count below that is LOWER than expected is UNKNOWN (index lag), not a product finding. Re-run npm run seed:push-audience:verify.');
    const problems = await verifyLive(ids);
    if (problems.length) process.exitCode = 3;
  } else if (!DRY_RUN) {
    log('Run with --verify to drive the audience preview and prove the fixture discriminates.');
  }
}

// --verify may be used standalone (no re-seed): resolve ids from the overlay and probe.
async function verifyOnly() {
  assertSafeTarget();
  await auth();
  const ids = {};
  for (const s of [...ORGS, ...PEOPLE]) {
    const live = s.memberType ? await findPerson(s) : await findOrg(s);
    if (!live?.id) throw new Error(`${s.alias} (${s.name || s.email}) is not seeded on this env — run the seeder first`);
    ids[s.alias] = live.id;
  }
  const problems = await verifyLive(ids);
  if (problems.length) process.exitCode = 3;
}

// `--verify-only` probes an ALREADY-seeded env without writing anything (safe to re-run while a
// suite is mid-flight); `--verify` seeds first, then probes.
const run = (VERIFY_ONLY && !TEARDOWN) ? verifyOnly : main;
run().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
