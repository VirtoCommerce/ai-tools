/**
 * seed-loyalty.mjs — Standalone loyalty seeder (loyalty programs).
 *
 * Ensures an active ProductPoints loyalty program exists for the loyalty suites
 * (075 / 083) and mixed-cart (VCST-5101). A loyalty program carries a complex
 * `dynamicExpression` condition/reward tree (same family as promotion reward trees —
 * see reference_promotion_reward_tree_shape), so this seeder **clones an existing
 * program as a template** (reusing a known-valid tree) rather than hand-building one.
 *
 * Conventions: scripts/lib/seed-common.mjs (ENV_RISK prod-guard, auth, api, loadCsv).
 * No hardcoded GUIDs/store ids. Program name carries AGENT-TEST- for safe teardown.
 * Idempotent: reuses an existing AGENT-TEST loyalty program if present.
 * API (confirmed via Swagger): POST/PUT/DELETE /api/loyalty-programs, POST /api/loyalty-programs/search.
 *
 * Usage:
 *   node scripts/seed-loyalty.mjs              # clone a template program → AGENT-TEST ProductPoints program
 *   node scripts/seed-loyalty.mjs --dry-run -v
 *   node scripts/seed-loyalty.mjs --teardown   # delete AGENT-TEST-* loyalty programs
 */
import {
  STORE_ID, DATE_STAMP, DRY_RUN, TEARDOWN, VERBOSE,
  log, verbose, assertSafeTarget, auth, api, loadCsv, writeResults,
} from './lib/seed-common.mjs';

const NAME_PREFIX = 'AGENT-TEST';

async function searchPrograms() {
  const r = await api('POST', '/api/loyalty-programs/search', { take: 100 }, { expectStatus: [200, 201] });
  return r?.results || r?.items || [];
}

async function seed() {
  const rows = loadCsv('test-data/loyalty/programs.csv');
  const row = rows[0] || { name: 'Product Points', program_type: 'ProductPoints', is_active: 'true', store_id: STORE_ID, priority: '10' };
  const targetName = `${NAME_PREFIX} ${row.name}`.replace(/^AGENT-TEST AGENT-TEST/, 'AGENT-TEST');
  const storeId = row.store_id || STORE_ID;

  const programs = DRY_RUN ? [] : await searchPrograms();
  const existing = programs.find((p) => p.name === targetName);
  if (existing) { log(`Reusing loyalty program ${targetName} (${existing.id})`); return; }

  // Pick a template program to clone (reuse a valid dynamicExpression tree).
  const template = programs.find((p) => p.programType === (row.program_type || 'ProductPoints')) || programs[0];
  if (!template && !DRY_RUN) {
    log('⚠ no existing loyalty program to clone as a template — cannot synthesize a valid dynamicExpression here.');
    log('  Create one program manually in Admin (Loyalty) once, then re-run; this seeder clones it. Aborting cleanly.');
    return;
  }

  if (DRY_RUN) { log(`[DRY] would clone a ${row.program_type} template → ${targetName} (store ${storeId})`); return; }

  // Deep-clone template, strip identity/audit, rename, retarget store.
  const clone = JSON.parse(JSON.stringify(template));
  delete clone.id; delete clone.createdDate; delete clone.modifiedDate; delete clone.createdBy; delete clone.modifiedBy;
  clone.name = targetName;
  clone.storeId = storeId;
  clone.isActive = String(row.is_active).toLowerCase() !== 'false';
  clone.priority = Number(row.priority) || 10;
  if (clone.dynamicExpression && clone.dynamicExpression.id) delete clone.dynamicExpression.id; // let server re-key the tree

  const r = await api('POST', '/api/loyalty-programs', clone, { expectStatus: [200, 201] });
  log(`Created loyalty program ${targetName} (${r.id}) [${clone.programType}, active=${clone.isActive}]`);
  writeResults(`test-data/loyalty/_seed-results-loyalty-${DATE_STAMP}.json`, {
    seededAt: new Date().toISOString(), storeId, program: { id: r.id, name: targetName, type: clone.programType }, clonedFrom: template.id,
  });
}

async function teardown() {
  log(`Teardown: deleting ${NAME_PREFIX}-* loyalty programs`);
  const programs = await searchPrograms();
  const ids = programs.filter((p) => (p.name || '').startsWith(NAME_PREFIX)).map((p) => p.id);
  if (!ids.length) { log('  none to delete'); return; }
  if (DRY_RUN) { log(`  [DRY] would delete ${ids.length}`); return; }
  await api('DELETE', `/api/loyalty-programs?ids=${ids.join(',')}`, null, { expectStatus: [200, 204, 404] });
  log(`  ✓ deleted ${ids.length} loyalty program(s)`);
}

(async () => {
  console.log(`🎁 Seed Loyalty${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  assertSafeTarget();
  await auth();
  if (TEARDOWN) await teardown(); else await seed();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
