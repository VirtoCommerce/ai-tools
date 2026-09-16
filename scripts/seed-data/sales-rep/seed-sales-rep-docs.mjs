#!/usr/bin/env node
/**
 * seed-sales-rep-docs.mjs — VCST-5730 "Shared Document Library for Sales Reps" fixtures.
 *
 * Provisions two things, in this order (reps first: a document is created by the ADMIN, but the reps
 * are what a case signs in as, and the writer rep's role edit must not race the document loop):
 *
 *   1. TWO new sales reps (test-data/sales-rep/document-reps.csv) — deliberately NEW accounts, not
 *      re-roled existing ones: every rep in sales-reps.csv holds "Sales Representative"
 *      (sales-rep:access only), and that no-document-read state is itself this feature's
 *      permission-negative case, shared with ~40 other cases. Touching it would destroy both.
 *        SR_REP_DOCS         "Advanced Sales Representative"  → access + documents:read
 *        SR_REP_DOCS_WRITER  "Sales Representative" + "Sales Rep Documents Manager"
 *                                                            → access + documents:write, NO :read
 *   2. TWELVE documents in the `sales-rep-documents` library (sales-rep-docs-specs.mjs) covering
 *      mime/extension variety, a unicode+spaces file name, a ~3 MB file, an unknown extension, a
 *      blank display name, 3 categories and 2 pinned rows — sized so page-size and page-size + 1
 *      are reachable at BOTH a page size of 5 and of 10.
 *
 * Deployed contract (vc-module-sales-rep @ 16a2c23622 — the build live on vcptcore-qa; branch head
 * has since renamed fields, so do NOT read head). Documents are a TWO-STEP intake:
 *   a) POST /api/files/sales-rep-documents  (multipart)          → file id, ownerless
 *   b) POST /api/sales-rep/documents        { fileId, category, name, summary, pageCount }
 *      claims it (stamps the owner). An unclaimed blob is NOT a document and is not served.
 *   c) POST /api/sales-rep/documents/{id}/pin — IsPinned is FORCED false on create, so a pinned
 *      fixture is always this second call.
 * `category` is REQUIRED by the deployed validator, so every fixture declares one.
 *
 * ENVIRONMENT PREREQUISITE (checked, and reported precisely rather than as a generic failure):
 * `sales-rep-documents` must be listed in the deployment's `FileUpload:Scopes` appsettings. The
 * module does NOT self-register it (neither at 16a2c23622 nor at branch head), and no API can add
 * it. When it is absent, `POST /api/files/sales-rep-documents` answers **200 with
 * `succeeded:false, errorCode:"INVALID_SCOPE"`** — a refusal that looks like a success to a status
 * check. Step 2 is then unreachable and the seeder STOPs with that diagnosis; the reps still seed,
 * so re-running after the config lands provisions only the missing documents (idempotent).
 *
 * Business keys live in the committed CSV / spec module; runtime platform GUIDs go to
 * test-data/aliases.<env>.json (never a committed file). Re-commit that overlay after a reseed.
 *
 * Flags: --dry-run (reads only), --verbose, --teardown (remove only what this seeder created),
 *        --only <reps|documents|REP_KEY|DOC_ALIAS>.
 */
import {
  assertSafeTarget, auth, api, log, verbose, loadCsv,
  writeEnvAliasOverride, syncEnvAliases, uploadScopedFile, resetSecurityPassword,
  DRY_RUN, TEARDOWN, ONLY, verifyRemoved, idsParam,
} from '../../lib/seed-common.mjs';
import { resolvePassword } from '../../lib/user-provision.mjs';
import {
  UPLOAD_SCOPE, SEED_PREFIX, DOCUMENTS, DOC_REPS_COLUMNS, DOC_REP_KEYS,
  buildFileBytes, buildCreateRequest, expectedDisplayName, isSeededDocument,
  expectedPermissions, isGrantingRole,
} from './sales-rep-docs-specs.mjs';

const REPS_CSV = 'test-data/sales-rep/document-reps.csv';
const CSV_KEY = 'sales-rep/document-reps';
// The password is declared ONCE, in the CSV's `{{VAR}}` cell, and resolved by resolvePassword() —
// deliberately NO env override chain here. A seeder-side `SR_REP_PASSWORD || TEST_USER_PASSWORD`
// fallback (as seed-sales-rep.mjs carries) would let the account hold a value the committed CSV does
// not declare, which is exactly the contested-credential class `td:validate:credentials` exists to
// catch: a suite resolving @td(SR_REP_DOCS.password) would then get a var that is not the account's.

const only = ONLY ? String(ONLY) : null;
const wantReps = !only || only === 'reps' || DOC_REP_KEYS.includes(only);
const wantDocs = !only || only === 'documents' || DOCUMENTS.some((d) => d.alias === only);

// ---- helpers ---------------------------------------------------------------

/** b2b/organizations business key (ORG-001) → { id, name }. Pinned GUIDs, env-invariant. */
function orgMap() {
  const map = {};
  for (const r of loadCsv('test-data/b2b/organizations.csv')) {
    map[r.org_id] = { id: r.platform_id, name: r.org_name };
  }
  return map;
}

function repRows() {
  return loadCsv(REPS_CSV)
    .filter((r) => String(r.seeded).toLowerCase() === 'true')
    .filter((r) => !only || only === 'reps' || r.rep_key === only);
}

async function findRepByFullName(fullName) {
  const res = await api('POST', '/api/sales-rep/search', { keyword: fullName, take: 50, skip: 0 });
  const rows = res?.results || res?.salesReps || res?.items || [];
  return rows.find((r) => r.fullName === fullName || r.name === fullName) || null;
}

/** All platform roles, keyed by name (roles are seeded by the module at startup). */
async function roleIdsByName() {
  const res = await api('POST', '/api/platform/security/roles/search', { keyword: '', take: 200, skip: 0 });
  const map = {};
  for (const r of res?.results || []) map[r.name] = r.id;
  return map;
}

async function getUserByName(email) {
  return api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
}

/** Confirm the account email so the rep can sign in to the storefront UI (idempotent). */
async function confirmEmail(email) {
  const u = await getUserByName(email);
  if (!u?.id || u.emailConfirmed) return;
  await api('PUT', '/api/platform/security/users', { ...u, emailConfirmed: true }, { expectStatus: [200, 204] });
  verbose(`emailConfirmed=true for ${email}`);
}

/**
 * Add a NON-granting role (e.g. "Sales Rep Documents Manager") to the rep's ApplicationUser.
 * Must be a separate step: POST /api/sales-rep silently falls back to a granting role when `roleId`
 * names a non-granting one, so passing it at create looks accepted and does nothing. Idempotent, and
 * it survives a reseed because the module's UpdateAccountAsync only strips roles in the GRANTING set.
 */
async function ensureExtraRole(email, roleName, roles) {
  if (!roleName) return;
  if (isGrantingRole(roleName)) {
    throw new Error(`extra_role_name "${roleName}" is a GRANTING role — declare it as role_name instead; `
      + 'the module would strip and re-add it on every reseed');
  }
  const roleId = roles[roleName];
  if (!roleId) throw new Error(`role "${roleName}" not found on this env — the module seeds it at startup; is the SalesRep module installed?`);
  const u = await getUserByName(email);
  if (!u?.id) { log(`  WARN: no account for ${email}, cannot add role ${roleName}`); return; }
  if ((u.roles || []).some((r) => r.id === roleId || r.name === roleName)) {
    verbose(`${email} already holds ${roleName}`);
    return;
  }
  await api('PUT', '/api/platform/security/users',
    { ...u, roles: [...(u.roles || []), { id: roleId, name: roleName }] }, { expectStatus: [200, 204] });
  log(`  + role "${roleName}" → ${email}`);
}

// ---- phase 1: reps ---------------------------------------------------------

async function seedReps(orgs, roles) {
  const writeback = {};
  for (const row of repRows()) {
    const password = resolvePassword(row.password);
    const existing = await findRepByFullName(row.full_name);
    let rep;
    if (existing) {
      rep = await api('GET', `/api/sales-rep/${existing.id}`);
      log(`Rep exists: ${row.rep_key} (${rep.id})`);
      // Self-heal credential drift the same way seed-sales-rep.mjs does: the module's create-only
      // account path never resets a password, so a rep created before its var was set would 400
      // invalid_grant for a headless runner using @td() + the registry password.
      await resetSecurityPassword(api, row.email, password);
    } else {
      const roleId = roles[row.role_name];
      if (!roleId) throw new Error(`role "${row.role_name}" (${row.rep_key}) not found on this env`);
      const served = (row.served_orgs || '').split(';').map((s) => s.trim()).filter(Boolean)
        .map((k) => (orgs[k] ? { organizationId: orgs[k].id, organizationName: orgs[k].name } : null))
        .filter(Boolean);
      rep = await api('POST', '/api/sales-rep', {
        firstName: row.first_name, lastName: row.last_name, fullName: row.full_name,
        emails: [row.email], storeId: row.store, password,
        roleId, isLocked: false, organizations: served,
      });
      log(`Rep created: ${row.rep_key} (${rep?.id}) role="${row.role_name}" serving ${served.length} org(s)`);
    }
    if (!DRY_RUN) {
      await confirmEmail(row.email);
      await ensureExtraRole(row.email, row.extra_role_name, roles);
    }
    const userId = rep?.userId || (await getUserByName(row.email))?.id || '';
    verbose(`${row.rep_key} expected permissions: ${expectedPermissions(row).join(', ')}`);
    writeback[row.rep_key] = { contact_id: rep?.id || '', user_id: userId };
  }
  // CSV-backed aliases: only the drifting GUIDs move to the overlay; email/name/store stay in the CSV.
  syncEnvAliases(CSV_KEY, writeback);
  return writeback;
}

// ---- phase 2: documents ----------------------------------------------------

/** Every document currently in the library (paged; the library is small by design). */
async function allDocuments() {
  const out = [];
  for (let skip = 0; ; skip += 50) {
    const res = await api('POST', '/api/sales-rep/documents/search', { take: 50, skip });
    const rows = res?.results || [];
    out.push(...rows);
    if (rows.length < 50 || out.length >= (res?.totalCount ?? out.length)) break;
  }
  return out;
}

/** Match a live row to a spec by its stable business key: the stored display name. */
function findLive(live, spec) {
  const want = expectedDisplayName(spec);
  return live.find((d) => d.displayName === want || d.name === want) || null;
}

async function seedDocuments() {
  const specs = DOCUMENTS.filter((d) => !only || only === 'documents' || d.alias === only);
  const live = await allDocuments();
  log(`Library currently holds ${live.length} document(s)`);
  const writeback = {};
  let created = 0;

  for (const spec of specs) {
    let doc = findLive(live, spec);
    if (doc) {
      log(`Document exists: ${spec.alias} (${doc.id})`);
    } else {
      const bytes = buildFileBytes(spec);
      // Step (a): upload into the module's file-exp-api scope. Throws with a precise INVALID_SCOPE
      // diagnosis if the scope is missing from the deployment config — see the header note.
      const file = await uploadScopedFile(UPLOAD_SCOPE, spec.fileName, bytes, spec.contentType);
      verbose(`uploaded ${spec.fileName} → file ${file.id} (${file.size ?? bytes.length}B)`);
      // Step (b): claim it as a library document.
      doc = await api('POST', '/api/sales-rep/documents', buildCreateRequest(spec, file.id));
      created++;
      log(`Document created: ${spec.alias} (${doc?.id}) ${spec.contentType} ${bytes.length}B cat=${spec.category}`);
    }
    // Step (c): pin state is only ever these endpoints' concern — create forces IsPinned=false.
    if (doc && !doc._dryRun) {
      const wantPinned = !!spec.pinned;
      if (!!doc.isPinned !== wantPinned) {
        await api('POST', `/api/sales-rep/documents/${doc.id}/${wantPinned ? 'pin' : 'unpin'}`, {}, { expectStatus: [200, 204] });
        log(`  ${wantPinned ? 'pinned' : 'unpinned'} ${spec.alias}`);
      }
      writeback[spec.alias] = { id: doc.id, file_id: doc.fileId || '', url: doc.url || '' };
    }
  }
  writeEnvAliasOverride(writeback);
  log(`Documents: ${created} created, ${specs.length - created} reused`);
  return writeback;
}

// ---- teardown --------------------------------------------------------------

async function teardown() {
  // Documents first (they own blobs), then the reps — children before parents.
  if (wantDocs) {
    const live = await allDocuments();
    // Sweep by the AGENT-TEST- prefix, not by the current spec list: a spec removed from this file
    // would otherwise orphan its live row permanently (test-data-authoring.md section 6).
    const mine = live.filter(isSeededDocument)
      .filter((d) => !only || only === 'documents' || DOCUMENTS.some((s) => s.alias === only && expectedDisplayName(s) === (d.displayName || d.name)));
    if (mine.length > 0 && !DRY_RUN) {
      await api('DELETE', `/api/sales-rep/documents?${idsParam(mine.map((d) => d.id))}`, null, { expectStatus: [200, 204] });
    }
    log(`${DRY_RUN ? 'would delete' : 'deleted'} ${mine.length} ${SEED_PREFIX} document(s)`);
    if (!DRY_RUN) {
      const residue = await verifyRemoved(async () => (await allDocuments()).filter(isSeededDocument));
      log(residue === 0 ? '  documents: zero residue.' : `  WARN: ${residue} residual ${SEED_PREFIX} document(s)`);
    }
  }

  if (wantReps) {
    for (const row of repRows()) {
      const hit = await findRepByFullName(row.full_name);
      if (!hit?.id) { verbose(`rep ${row.rep_key} already absent`); continue; }
      if (!DRY_RUN) await api('DELETE', `/api/sales-rep?ids=${hit.id}`, null, { expectStatus: [200, 204] });
      log(`${DRY_RUN ? 'would delete' : 'deleted'} rep ${row.rep_key} (${hit.id})`);
    }
    if (!DRY_RUN) {
      const residue = await verifyRemoved(async () => {
        const names = new Set(repRows().map((r) => r.full_name));
        const res = await api('POST', '/api/sales-rep/search', { keyword: SEED_PREFIX, take: 100, skip: 0 });
        return (res?.results || []).filter((r) => names.has(r.fullName));
      });
      log(residue === 0 ? '  reps: zero residue.' : `  WARN: ${residue} residual rep(s)`);
    }
  }
  log('Teardown complete.');
}

// ---- main ------------------------------------------------------------------

async function main() {
  assertSafeTarget();
  await auth();

  // Fail fast and loudly on a CSV contract drift — every @td alias maps these columns by name.
  const header = Object.keys(loadCsv(REPS_CSV)[0] || {});
  const drift = DOC_REPS_COLUMNS.filter((c) => !header.includes(c));
  if (drift.length > 0) throw new Error(`${REPS_CSV} is missing column(s): ${drift.join(', ')} — run npm run td:validate:sales-rep-docs`);

  if (TEARDOWN) { await teardown(); return; }

  const roles = await roleIdsByName();
  if (wantReps) await seedReps(orgMap(), roles);
  if (wantDocs) await seedDocuments();

  log(DRY_RUN ? 'DRY RUN complete (no writes).' : 'Seed complete — runtime ids in aliases.<env>.json (re-commit it).');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
