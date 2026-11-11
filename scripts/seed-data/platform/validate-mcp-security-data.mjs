#!/usr/bin/env node
/**
 * scripts/seed-data/platform/validate-mcp-security-data.mjs
 *
 * STATIC drift guard for the VCST-6155 MCP back-office accounts (no network). `td:validate:mcp-security`.
 *   1. decidability — the four accounts still disagree on every permission a case reads
 *      (decidabilityProblems in mcp-security-specs.mjs): only the operator holds tool permissions,
 *      only the approver holds mcp:approve, only the manager holds mcp:manage, NOROLE holds nothing,
 *      four distinct users, none an administrator;
 *   2. the spec module and the aliases.json entries carry no runtime GUID;
 *   3. each alias is registered with the spec's email/login, role, password token, user type and
 *      admin flag, and its declared permission lists match the spec.
 * Exit 1 on any violation.
 */
import '../../lib/sync-stdio.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS, PASSWORD_TOKEN, decidabilityProblems, findGuidLeaks } from './mcp-security-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const same = (a = [], b = []) => [...a].sort().join(',') === [...b].sort().join(',');

console.log('=== validate MCP back-office security fixtures (static drift-guard) ===');

const d = decidabilityProblems();
if (d.length) d.forEach(fail); else ok('the four accounts disagree on every permission a case reads (operator/approver/manager/no-role)');

const spec = readFileSync(join(ROOT, 'scripts/seed-data/platform/mcp-security-specs.mjs'), 'utf8');
const specLeaks = findGuidLeaks(spec);
if (specLeaks.length) fail(`spec module leaks runtime GUID(s): ${specLeaks.join(', ')}`); else ok('spec module carries no runtime GUID');

const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
for (const a of ACCOUNTS) {
  const al = aliases[a.aliasName];
  if (!al) { fail(`alias ${a.aliasName} not registered in test-data/aliases.json`); continue; }
  const bad = [];
  if (al.email !== a.email || al.login !== a.email) bad.push(`email/login must be ${a.email}`);
  if ((al.role ?? null) !== (a.role?.role_name ?? null)) bad.push(`role "${al.role}" != spec "${a.role?.role_name ?? null}"`);
  if (al.password !== PASSWORD_TOKEN) bad.push(`password must be ${PASSWORD_TOKEN}`);
  if (al.user_type !== a.userType || al.is_administrator !== false) bad.push('must declare user_type Manager + is_administrator false');
  if (!same(al.permissions, a.required)) bad.push(`permissions [${al.permissions}] != spec [${a.required}]`);
  if (!same(al.excluded_permissions, a.excluded)) bad.push(`excluded_permissions [${al.excluded_permissions}] != spec [${a.excluded}]`);
  const leaks = findGuidLeaks(JSON.stringify(al));
  if (leaks.length) bad.push(`carries runtime GUID ${leaks.join(', ')} (belongs in aliases.<env>.json)`);
  if (bad.length) bad.forEach((b) => fail(`alias ${a.aliasName}: ${b}`));
  else ok(`alias ${a.aliasName} matches the spec (${a.email}, role ${a.role?.role_name ?? 'none'}, no GUID)`);
}

console.log(`\n${problems.length ? `FAILED — ${problems.length} problem(s)` : 'OK'}`);
process.exit(problems.length ? 1 : 0);
