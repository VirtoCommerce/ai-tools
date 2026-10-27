#!/usr/bin/env node
/**
 * validate-mfa-fixtures-data.mjs — `npm run td:validate:mfa`. STATIC, no network.
 *
 * The drift guard for the VCST-5904 MFA creator (mfa-fixtures-specs.mjs). It FAILS when:
 *   [1] a kind stops DIFFERING from its sibling in the property it claims to discriminate
 *       (confirmed vs unconfirmed, Manager vs Customer with the same role, lockout on vs off, 2FA flag)
 *       — the pair would observe the same thing on both sides (`.claude/rules/test-data.md` §SECOND RULE);
 *       or it differs in ANY OTHER data field that is not an `allowedConfounds` entry with a reason (a
 *       confound: the pair could observe a difference for a reason it does not name), or an allowance
 *       is stale (its field no longer differs);
 *   [2] the baseline stops being the MFA-eligible account (data.auth.account.mfa-eligible);
 *   [3] an address leaves the RFC 2606 reserved domain (a back-office code would reach a real inbox),
 *       or the entity prefix stops being AGENT-TEST- (teardown would not sweep it);
 *   [4] the creator source gains a write path to the GLOBAL switch MultiFactorAuthentication.Enabled
 *       or a literal password — both are hard safety rules of this fixture set;
 *   [5] a cloned store would inherit (or be given a resolvable) url/secureUrl — it would capture a
 *       storefront host away from the shared store (observed 2026-10-23, ~7 min on vcst);
 *   [6] a contact body can be built without the bound store's currency + language (GOLDEN RULE: read
 *       from the store, never transcribed), or either source file carries a literal of them.
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { specProblems, KIND_NAMES, emailFor, storeIdFor, storeBody, contactBody, STOREFRONT_BINDING_FIELDS } from './mfa-fixtures-specs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const problems = [...specProblems()];

for (const k of KIND_NAMES) {
  const e = emailFor('abc123', k);
  if (!e.startsWith('agent-test-mfa-abc123-')) problems.push(`${k}: email ${e} does not carry the run marker`);
}
if (!storeIdFor('abc123').startsWith('AGENT-TEST-MFA-')) problems.push('store id does not carry the AGENT-TEST-MFA- prefix');

// [5] a cloned store must never inherit a storefront-binding field (host capture of the shared storefront).
const src0 = { url: 'https://shared.example', secureUrl: 'https://shared.example', catalog: 'c', currencies: ['USD'], languages: ['en-US'] };
const body = storeBody('abc123', src0, 'Enabled');
for (const f of STOREFRONT_BINDING_FIELDS) {
  if (body[f] === src0[f] || (body[f] && !/\.invalid$/.test(new URL(body[f]).hostname))) problems.push(`storeBody copies/sets a resolvable ${f} (${body[f]}) — it would capture a storefront host`);
}

// [6] contact defaults come from the bound store: no body without them, and no literal in either source.
let builtWithoutStore = true;
try { contactBody({ email: emailFor('abc123', 'customer-confirmed'), runId: 'abc123', kind: 'customer-confirmed' }); } catch { builtWithoutStore = false; }
if (builtWithoutStore) problems.push("contactBody builds a contact without the store's currency/language — a transcribed default crept back in");

const src = readFileSync(join(here, 'mfa-fixtures.mjs'), 'utf8');
const specSrc = readFileSync(join(here, 'mfa-fixtures-specs.mjs'), 'utf8');
for (const [file, text] of [['mfa-fixtures.mjs', src], ['mfa-fixtures-specs.mjs', specSrc]]) {
  if (/(currencyCode|defaultCurrency|defaultLanguage)\s*:\s*['"`]/.test(text)) problems.push(`${file} transcribes a currency/language literal — read it from the bound store`);
}
if (/MultiFactorAuthentication\.Enabled['"`]\s*[,}]|name:\s*['"`]MultiFactorAuthentication\.Enabled/.test(src)) {
  problems.push('mfa-fixtures.mjs writes MultiFactorAuthentication.Enabled — the global switch belongs to the orchestrator window, never to the creator');
}
if (/password:\s*['"`][^'"`{]/.test(src)) problems.push('mfa-fixtures.mjs carries a literal password — use process.env[PASSWORD_VAR]');

console.log(`\ntd:validate:mfa — ${KIND_NAMES.length} kinds\n`);
problems.forEach((p) => console.log(`  ✗ ${p}`));
console.log(problems.length ? `\n${problems.length} problem(s)` : '  ✓ every kind differs from its sibling in its discriminating property and only in declared confounds; prefixes, domain, store defaults and safety rules hold');
process.exit(problems.length ? 1 : 0);
