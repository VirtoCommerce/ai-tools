#!/usr/bin/env node
/**
 * validate-push-audience-data.mjs — DRIFT / DECIDABILITY GUARD for the Push Messages
 * audience-builder fixture (VCST-5944). STATIC only (no network). `npm run td:validate:push-audience`.
 *
 * There is no committed CSV/JSON fixture here — the fixture IS a live member graph, and its
 * committed half is the spec module plus the alias registrations. So this guard defends the four
 * things that can silently rot:
 *
 *   [1] DECIDABILITY (`.claude/rules/test-data.md` §SECOND RULE) — the three outcomes for the
 *       parent company must stay pairwise DISTINCT. This is the check that FAILS when the gap the
 *       fixture exists to probe collapses: equalise the counts, drop the second child contact, or
 *       give the login-less contact a login, and a non-recursive (or login-blind) implementation
 *       starts PASSING. A fixture that cannot fail is worse than no fixture.
 *   [2] ALIAS REGISTRATION — every alias the seeder writes back is declared in the committed
 *       `test-data/aliases.json` with its business key and an EMPTY id/platform_id. An alias the
 *       seeder writes but nobody declared resolves to nothing; an alias declared with a baked id
 *       is the DV-021 leak.
 *   [3] NO SECRET / NO GUID in anything committed — the password stays a `{{VAR}}` token
 *       (VCST-5406) and no runtime GUID appears in the spec or in the alias base.
 *   [4] OVERLAY LIVENESS (informational) — whether `aliases.<TEST_ENV>.json` currently carries
 *       ids, i.e. whether `@td()` resolves on this env today.
 *
 * It does NOT assert the live recipient counts — that is `--verify` on the seeder, which needs a
 * network and the feature's own `preview-recipients` endpoint.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEED_PREFIX, EMAIL_PREFIX, PASSWORD_VAR, ORGS, PEOPLE, ALIAS_NAMES, MEMBER_QUERY,
  expectedRecipients, nonRecursiveRecipients, loginBlindRecipients, expectedCompaniesExpanded,
  findDecidabilityProblems, findGuidLeaks,
} from './push-audience-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const TEST_ENV = process.env.TEST_ENV || 'vcst';

const problems = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => console.log(`  ⚠ ${m}`);
const ok = (m) => console.log(`  ✓ ${m}`);

const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
const overlayPath = join(ROOT, 'test-data', `aliases.${TEST_ENV}.json`);
const overlay = existsSync(overlayPath) ? JSON.parse(readFileSync(overlayPath, 'utf8')) : {};

const parent = ORGS.find((o) => !o.parentKey);
const child = ORGS.find((o) => o.parentKey);

console.log(`\nPush Messages audience fixture (VCST-5944) — static drift guard [TEST_ENV=${TEST_ENV}]`);

console.log('\n[1] decidability (SECOND RULE): the fixture must be able to FAIL');
findDecidabilityProblems().forEach(fail);
if (parent) {
  const correct = expectedRecipients(parent.key);
  const nonRec = nonRecursiveRecipients(parent.key);
  const blind = loginBlindRecipients(parent.key);
  if (!problems.length) {
    ok(`${parent.name}: correct=${correct} · non-recursive=${nonRec} · login-blind=${blind} — three DISTINCT numbers, so both wrong implementations are detectable`);
    ok(`${child.name}: correct=${expectedRecipients(child.key)} (login-blind would be ${loginBlindRecipients(child.key)}) — the control leg that proves the parent's ${correct} came from expansion`);
    ok(`companiesExpanded for ${parent.name} must reach ${expectedCompaniesExpanded(parent.key)} (itself + ${expectedCompaniesExpanded(parent.key) - 1} descendant company/ies)`);
  }
  const employee = PEOPLE.find((p) => p.memberType === 'Employee');
  if (employee && !employee.orgKey && employee.hasLogin) {
    ok(`Employee ${employee.email} holds a login and sits OUTSIDE the tree — '${MEMBER_QUERY.EVERYONE}' excluding it is an observation, not a tautology`);
  }
}

console.log('\n[2] alias registration: declared in the committed base, with an EMPTY runtime id');
for (const spec of [...ORGS, ...PEOPLE]) {
  const a = aliases[spec.alias];
  if (!a) { fail(`alias ${spec.alias} is not declared in test-data/aliases.json — the seeder's writeback would resolve to nothing`); continue; }
  if (!a._inline) fail(`alias ${spec.alias} is not marked \`_inline: true\` (this fixture has no backing CSV/JSON file)`);
  if (a.id) fail(`alias ${spec.alias} carries a baked id "${a.id}" in the committed base — runtime GUIDs belong in aliases.<env>.json (DV-021)`);
  if (a.platform_id) fail(`alias ${spec.alias} carries a baked platform_id in the committed base (DV-021)`);
  if (!('id' in a) || !('platform_id' in a)) fail(`alias ${spec.alias} must declare both \`id\` and \`platform_id\` (empty) so the overlay has a field to win over`);
  const businessKey = spec.email || spec.name;
  const declared = spec.email ? a.email : a.name;
  if (declared !== businessKey) fail(`alias ${spec.alias}: business key drift — spec says "${businessKey}", aliases.json says "${declared}"`);
  if (!a._notes) fail(`alias ${spec.alias} has no _notes — the next reader cannot tell what it decides`);
}
if (!problems.length) ok(`${ALIAS_NAMES.length} alias(es) declared, all with empty runtime ids: ${ALIAS_NAMES.join(', ')}`);

console.log('\n[3] no secret / no GUID in anything committed');
findGuidLeaks().forEach(fail);
if (!/^\{\{[A-Z0-9_]+\}\}$/.test(PASSWORD_VAR)) fail(`PASSWORD_VAR "${PASSWORD_VAR}" must be a {{VAR}} token, never a literal (VCST-5406)`);
for (const spec of [...ORGS, ...PEOPLE]) {
  const a = aliases[spec.alias];
  if (!a) continue;
  for (const [k, v] of Object.entries(a)) {
    if (k === '_notes') continue;
    if (typeof v === 'string' && GUID_RE.test(v)) fail(`aliases.json ${spec.alias}.${k} carries a runtime GUID`);
    if (k === 'password' && !/^\{\{[A-Z0-9_]+\}\}$/.test(v)) fail(`aliases.json ${spec.alias}.password is not a {{VAR}} token`);
  }
}
ok(`password token ${PASSWORD_VAR}; no GUID in the spec module or the alias base`);

console.log('\n[4] naming: teardown can sweep exactly what the seeder makes');
for (const o of ORGS) if (!o.name.startsWith(SEED_PREFIX)) fail(`org ${o.key} name "${o.name}" lacks the ${SEED_PREFIX} prefix`);
for (const p of PEOPLE) if (!p.email.startsWith(EMAIL_PREFIX)) fail(`person ${p.key} email "${p.email}" lacks the ${EMAIL_PREFIX} prefix`);
if (!problems.length) ok(`orgs prefixed "${SEED_PREFIX}", people prefixed "${EMAIL_PREFIX}"`);

console.log(`\n[5] overlay liveness (informational) — does @td() resolve on ${TEST_ENV} today?`);
const missing = ALIAS_NAMES.filter((n) => !overlay[n]?.id);
if (!existsSync(overlayPath)) warn(`no aliases.${TEST_ENV}.json — run: TEST_ENV=${TEST_ENV} npm run seed:push-audience`);
else if (missing.length) warn(`${missing.length}/${ALIAS_NAMES.length} alias(es) have no id on ${TEST_ENV}: ${missing.join(', ')} — re-seed before using them`);
else ok(`all ${ALIAS_NAMES.length} alias(es) resolve on ${TEST_ENV}`);

console.log('');
if (problems.length) {
  console.log(`✗ ${problems.length} problem(s) — the fixture is not shippable as-is.`);
  process.exit(1);
}
console.log('✓ push-audience fixture clean.');
