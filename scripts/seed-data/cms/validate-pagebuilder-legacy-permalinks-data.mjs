#!/usr/bin/env node
/**
 * scripts/seed-data/cms/validate-pagebuilder-legacy-permalinks-data.mjs — td:validate:pb-legacy-permalinks
 *
 * Static drift guard (no network) for the VCST-6443 legacy-invalid PageBuilder fixtures. It owns the
 * fixture's NON-VACUITY contract: every seeded page's permalink must break the PR #178 rule (a
 * "legacy-invalid" page with a valid permalink tests nothing), each page its own permalink (they are
 * terminal, one per scenario), the PCT page Published+visible (the storefront probe reads it), names
 * AGENT-TEST-prefixed, and no runtime id committed into aliases.json. The live proof — the same
 * permalink answers 400 on create-group-page — is the seeder's, not this file's.
 */
import "../../lib/sync-stdio.mjs";
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_ALIASES, USER_ALIAS, TICKET_PREFIX, STATUS, pageSpecs, ruleViolations, roleBody } from './pagebuilder-legacy-permalinks-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const errors = [];
const fail = (m) => errors.push(m);

let specs = [];
try { specs = pageSpecs(aliases); } catch (e) { fail(e.message); }
const seen = new Map();
for (const s of specs) {
  if (!String(s.name).startsWith(TICKET_PREFIX)) fail(`${s.alias}: name must start with "${TICKET_PREFIX}"`);
  if (!ruleViolations(s.permalink).length) fail(`${s.alias}: permalink ${JSON.stringify(s.permalink)} breaks no rule class — the fixture would be vacuous`);
  if (seen.has(s.permalink)) fail(`${s.alias}: permalink shared with ${seen.get(s.permalink)} — terminal fixtures need one each`);
  seen.set(s.permalink, s.alias);
  if (![STATUS.DRAFT, STATUS.PUBLISHED].includes(s.status)) fail(`${s.alias}: status ${s.status}`);
  if (!s.storeId || !s.culture) fail(`${s.alias}: store_id/culture missing`);
  if (!aliases[s.alias].invalid_because) fail(`${s.alias}: invalid_because missing`);
  if (GUID_RE.test(JSON.stringify({ ...aliases[s.alias], _notes: '' }))) fail(`${s.alias}: a runtime GUID is committed in aliases.json`);
  if (aliases[s.alias].seed !== 'seed:pb-legacy-permalinks') fail(`${s.alias}: seed field must name seed:pb-legacy-permalinks`);
}
const pct = specs.find((s) => s.alias === 'PB_6443_LEGACY_PCT');
if (pct && !(pct.status === STATUS.PUBLISHED && pct.visibility === true)) fail('PB_6443_LEGACY_PCT: must be Published + visibility true (storefront natural-URL probe)');
if (pct && !ruleViolations(pct.permalink).some((v) => v.includes('%'))) fail('PB_6443_LEGACY_PCT: permalink must carry a percent escape');
const lt = specs.find((s) => s.alias === 'PB_6443_LEGACY_LT');
if (lt && !/[<>]/.test(lt.permalink)) fail('PB_6443_LEGACY_LT: permalink must carry an angle bracket');

const u = aliases[USER_ALIAS];
if (!u) fail(`${USER_ALIAS}: not declared`);
else {
  const perms = roleBody(u).permissions.map((p) => p.name);
  if (perms.includes(u.excluded_permission)) fail(`${USER_ALIAS}: role grants the excluded ${u.excluded_permission}`);
  if (!perms.includes('builder:access')) fail(`${USER_ALIAS}: role lacks builder:access (403 would then be for the wrong reason)`);
  if (u.id) fail(`${USER_ALIAS}: id must be empty in aliases.json (runtime id belongs in aliases.<env>.json)`);
  if (u.password || /password\s*[:=]/i.test(u._notes || '')) fail(`${USER_ALIAS}: a password literal is committed`);
}

// Informational: which envs carry the runtime ids.
for (const env of ['vcst', 'vcptcore', 'virtostart', 'localhost']) {
  const p = join(ROOT, `test-data/aliases.${env}.json`);
  if (!existsSync(p)) continue;
  const o = JSON.parse(readFileSync(p, 'utf8'));
  const have = PAGE_ALIASES.filter((a) => o[a]?.id).length;
  if (have) console.log(`  info: aliases.${env}.json carries ${have}/${PAGE_ALIASES.length} legacy page id(s)${o[USER_ALIAS]?.id ? ' + user' : ''}`);
}

if (errors.length) { console.error(`td:validate:pb-legacy-permalinks FAILED (${errors.length}):\n  - ${errors.join('\n  - ')}`); process.exit(1); }
console.log(`td:validate:pb-legacy-permalinks OK — ${specs.length} legacy-invalid page(s), each breaking the rule, + ${USER_ALIAS}`);
