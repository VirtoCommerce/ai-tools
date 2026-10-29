#!/usr/bin/env node
/**
 * scripts/seed-data/cms/validate-pb-legacy-org-members-data.mjs  (td:validate:pb-legacy-members)
 *
 * STATIC drift guard (no network) for the VCST-6442 legacy-page READERS
 * (./pb-legacy-org-members-specs.mjs). Owns the declared data (.claude/rules/test-data.md FOURTH RULE):
 *   1. spec coherence + NON-VACUITY (validateSpecs): unique aliases/emails/orgs, agent-test- prefix,
 *      every target is a >= 2-page tie, a group-targeted page's group is declared on the contact,
 *      the members do not collapse onto one organization, password is a {{VAR}} token;
 *   2. every alias is registered in test-data/aliases.json as an _inline alias whose email /
 *      org_name / user_group match the spec, and which carries no runtime GUID.
 * The LIVE half (sign-in, me.organizationId, the tie still on the store) is `seed:pb-legacy-members -- --verify`.
 */
import '../../lib/sync-stdio.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEMBERS, PASSWORD_TOKEN, validateSpecs } from './pb-legacy-org-members-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

console.log('=== validate PB legacy org members (VCST-6442, static drift guard) ===');

const spec = validateSpecs();
spec.forEach(fail);
if (!spec.length) ok(`${MEMBERS.length} members: coherent, AGENT-TEST scoped, every target a >=2-page tie, group-targeting covered, distinct orgs`);

const reg = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
for (const m of MEMBERS) {
  const a = reg[m.alias];
  if (!a) { fail(`${m.alias}: not registered in test-data/aliases.json`); continue; }
  if (a.email !== m.email) fail(`${m.alias}: aliases.json email ${a.email} != spec ${m.email}`);
  if (a.org_name !== m.orgName) fail(`${m.alias}: aliases.json org_name ${a.org_name} != spec ${m.orgName}`);
  if ((a.user_group || '') !== (m.groups[0] || '')) fail(`${m.alias}: aliases.json user_group ${a.user_group} != spec ${m.groups[0] || ''}`);
  if (a.password !== PASSWORD_TOKEN) fail(`${m.alias}: aliases.json password must be ${PASSWORD_TOKEN}`);
  if (GUID_RE.test(JSON.stringify(a))) fail(`${m.alias}: runtime GUID committed in aliases.json (belongs in aliases.<env>.json)`);
}
if (!problems.length) ok('aliases registered, consistent with the spec, GUID-free');

if (problems.length) { console.log(`\n✗ ${problems.length} problem(s)`); process.exit(1); }
console.log('\n✓ clean');
