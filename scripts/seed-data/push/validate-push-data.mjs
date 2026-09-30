#!/usr/bin/env node
/**
 * validate-push-data.mjs — drift guard for the Push Messages inbox fixtures (`npm run td:validate:push`).
 *
 * STATIC by default (no network, no auth — safe in CI and inside td:validate:all / td:mutation-check).
 * `--live` adds a probe of the seeded state on TEST_ENV (`npm run seed:push:verify`).
 *
 * The question it answers: can this fixture set still make its cases FAIL?
 *   - the reader inbox is only discriminating while read AND unread both exist and it spans more
 *     than one storefront page — equal counts make the unread-count and pagination cases vacuous;
 *   - the bystander is only a control while nothing ever names it — one targeted send and the
 *     "reader receives, bystander does not" distinction is gone for good (Sent is irrevocable);
 *   - the empty account is only empty while NOTHING has reached it, hidden included.
 *
 * Static checks
 *   [1] spec shape: every role's alias is registered, send targets never meet PROTECTED (by alias and by
 *       CSV row), the four accounts are four different rows
 *   [2] thresholds are read from the aliases and still AGREE with the data model's required_state
 *   [3] non-vacuity: minRead ≥ 1, minUnread ≥ 1, minRead + minUnread ≤ minVisible, minVisible > page size
 *       (page size parsed from the data model constraint, never transcribed), bulk fresh ≥ 1
 *   [4] writeback wiring: recipient aliases filter on user_id and map platform_id (else syncEnvAliases
 *       is a silent no-op), their users.csv row names the alias in its `alias` column (contactId
 *       writeback), rows are seeded=true
 *   [5] org isolation: reader/bystander/bulk share the inbox org, no sales-rep CSV serves it, no
 *       organization-memberships row adds a member to it, its platform_id is pinned
 *   [6] runtime fields are declared in `fields` and EMPTY in the committed base (they live in the overlay)
 *   [7] the data model names seed:push as the executor of the two inbox states, and package.json has it
 *   [8] the link builder derives its href from the origin it is given; no http(s) host in the spec
 *   [9] (informational) which env overlays carry the recipient + writeback ids
 * Live checks (--live)
 *   [L1] reader inbox meets its thresholds and shows the link message
 *   [L2] bulk inbox (informational — it is consumed by design)
 *   [L3] PROTECTED accounts: bystander has no AGENT-TEST row and no message names it; the empty
 *        account's pushMessages(withHidden: true).totalCount is 0. FAILS loudly.
 *   [L4] overlay contactId equals the live me.memberId
 */
import '../../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  INBOXES, PROTECTED, SEND_CONTRACT_ALIAS, sendTargetAliases, linkMessageBody, isLinkMessage, isOurs, classifyInbox, LINK_ROUTE,
} from './push-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LIVE = process.argv.includes('--live');
const MODEL_PATH = 'test-data/models/push-messages.data-model.json';
const SEED_SCRIPT = 'seed:push';

const problems = [];
const warnings = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { warnings.push(m); console.log(`  ⚠ ${m}`); };
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const readCsv = (rel) => (existsSync(join(ROOT, rel))
  ? parse(readFileSync(join(ROOT, rel), 'utf8'), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true })
  : []);

const aliases = readJson('test-data/aliases.json');
const model = readJson(MODEL_PATH);
const reqById = new Map(model.requirements.map((r) => [r.id, r]));
const rowOf = (aliasName) => {
  const d = aliases[aliasName];
  if (!d?.file || !d.filter) return null;
  const [col, val] = Object.entries(d.filter)[0];
  return readCsv(`test-data/${d.file}.csv`).find((r) => r[col] === val) || null;
};
const num = (aliasName, field) => Number(aliases[aliasName]?.[field]);
const geq = (v) => { const m = /^\s*>=\s*(\d+)\s*$/.exec(String(v ?? '')); return m ? Number(m[1]) : null; };

console.log('\n[1] spec shape');
const roleAliases = [...Object.values(INBOXES), ...Object.values(PROTECTED)].map((x) => x.recipientAlias);
for (const a of [...roleAliases, SEND_CONTRACT_ALIAS, ...Object.values(INBOXES).map((i) => i.thresholdsAlias)]) {
  if (!aliases[a]) fail(`alias ${a} is not registered in test-data/aliases.json`);
}
const protectedAliases = new Set(Object.values(PROTECTED).map((p) => p.recipientAlias));
const leaked = sendTargetAliases().filter((a) => protectedAliases.has(a));
if (leaked.length) fail(`send targets include PROTECTED account(s): ${leaked.join(', ')}`);
const rows = roleAliases.map((a) => ({ a, row: rowOf(a) }));
for (const { a, row } of rows) if (!row) fail(`${a}: its CSV row is missing`);
const emails = rows.filter((r) => r.row).map((r) => String(r.row.email).toLowerCase());
if (new Set(emails).size !== emails.length) fail(`two fixture roles resolve to the same account: ${emails.join(', ')}`);
const targetEmails = new Set(sendTargetAliases().map((a) => String(rowOf(a)?.email || '').toLowerCase()));
for (const p of protectedAliases) if (targetEmails.has(String(rowOf(p)?.email || '').toLowerCase())) fail(`${p} resolves to the same account as a send target`);
for (const [key, spec] of Object.entries(INBOXES)) if (!reqById.has(spec.requirement)) fail(`INBOXES.${key}.requirement ${spec.requirement} is not in ${MODEL_PATH}`);
for (const [key, spec] of Object.entries(PROTECTED)) if (!reqById.has(spec.requirement)) fail(`PROTECTED.${key}.requirement ${spec.requirement} is not in ${MODEL_PATH}`);
if (!problems.length) ok(`${roleAliases.length} roles registered, ${sendTargetAliases().length} send target(s), ${protectedAliases.size} protected — disjoint, four distinct accounts`);

console.log('\n[2] thresholds agree with the data model');
const reader = INBOXES.reader; const bulk = INBOXES.bulk;
const t = Object.fromEntries(Object.entries(reader.thresholds).map(([k, f]) => [k, num(reader.thresholdsAlias, f)]));
const fresh = num(bulk.thresholdsAlias, bulk.thresholds.fresh);
const readerReq = reqById.get(reader.requirement)?.required_state || {};
const bulkReq = reqById.get(bulk.requirement)?.required_state || {};
const pairs = [
  [`${reader.thresholdsAlias}.min_visible_messages`, t.minVisible, 'visible_sent_messages', geq(readerReq.visible_sent_messages)],
  [`${reader.thresholdsAlias}.min_read`, t.minRead, 'read', geq(readerReq.read)],
  [`${reader.thresholdsAlias}.min_unread`, t.minUnread, 'unread', geq(readerReq.unread)],
  [`${bulk.thresholdsAlias}.min_visible_unread`, fresh, 'visible_unread_messages', geq(bulkReq.visible_unread_messages)],
];
const before2 = problems.length;
for (const [aliasField, aliasVal, modelField, modelVal] of pairs) {
  if (!Number.isInteger(aliasVal)) fail(`${aliasField} is not an integer`);
  else if (modelVal === null) fail(`data model required_state.${modelField} is not of the form ">= N"`);
  else if (aliasVal !== modelVal) fail(`${aliasField}=${aliasVal} but the data model requires ${modelField} >= ${modelVal}`);
}
if (problems.length === before2) ok(`reader >= ${t.minVisible} visible / >= ${t.minRead} read / >= ${t.minUnread} unread; bulk >= ${fresh} fresh — alias == data model`);

console.log('\n[3] non-vacuity (the distinctions under test stay decidable)');
const pageMatch = /page size \((\d+)\)/.exec(String(reqById.get(reader.requirement)?.constraints?.visible_sent_messages || ''));
const pageSize = pageMatch ? Number(pageMatch[1]) : null;
const before3 = problems.length;
if (pageSize === null) fail(`data model constraints.visible_sent_messages names no "page size (N)" — pagination non-vacuity cannot be checked`);
else if (!(t.minVisible > pageSize)) fail(`min visible ${t.minVisible} does not exceed the storefront page size ${pageSize} — the pagination case would pass on one page`);
if (!(t.minRead >= 1)) fail('min_read < 1 — an all-unread inbox makes "the heading shows the UNREAD count" undecidable');
if (!(t.minUnread >= 1)) fail('min_unread < 1 — "Show unread only" would have nothing to show');
if (t.minRead + t.minUnread > t.minVisible) fail(`min_read + min_unread (${t.minRead + t.minUnread}) exceeds min visible (${t.minVisible})`);
if (!(fresh >= 1)) fail('bulk fresh < 1 — mark-all-read / clear-all would pass on a no-op');
if (problems.length === before3) ok(`read AND unread both required (unread < total), ${t.minVisible} > page size ${pageSize}, bulk ${fresh} fresh`);

console.log('\n[4] writeback wiring');
const before4 = problems.length;
for (const a of roleAliases) {
  const d = aliases[a]; const row = rowOf(a);
  if (!d || !row) continue;
  if (String(row.seeded).toLowerCase() !== 'true') fail(`${a}: CSV row is seeded=${row.seeded} (the seeders skip it)`);
  if (d.file === 'b2b/users') {
    const key = Object.keys(d.filter)[0];
    if (key !== 'user_id') fail(`${a}: filter is on "${key}" — syncEnvAliases keys b2b users by user_id, so platform_id would never be written back`);
    if (d.fields?.platform_id !== 'platform_id') fail(`${a}: fields.platform_id must map to the platform_id column`);
    if (String(row.alias || '').trim() !== a) fail(`${a}: users.csv ${row.user_id} alias column is "${row.alias}" — its contactId (the memberIds value) would not be written back`);
  }
}
if (problems.length === before4) ok('recipient aliases filter on user_id, map platform_id, name themselves in users.csv `alias`; all rows seeded=true');

console.log('\n[5] org isolation');
const before5 = problems.length;
const inboxOrgAlias = aliases[reader.thresholdsAlias]?.org;
const inboxOrg = inboxOrgAlias ? rowOf(inboxOrgAlias) : null;
if (!inboxOrg) fail(`${reader.thresholdsAlias}.org does not resolve to an organizations.csv row`);
else {
  if (!/^[0-9a-f-]{36}$/i.test(inboxOrg.platform_id || '')) fail(`${inboxOrgAlias}: platform_id is not pinned in organizations.csv (seedOrgs forces it on create — without it the org GUID differs per env)`);
  for (const a of [reader.recipientAlias, bulk.recipientAlias, PROTECTED.bystander.recipientAlias]) {
    if (rowOf(a)?.org_id !== inboxOrg.org_id) fail(`${a} is not a member of ${inboxOrg.org_id} (${inboxOrg.org_name}) only — got "${rowOf(a)?.org_id}"`);
  }
  const srDir = join(ROOT, 'test-data/sales-rep');
  for (const f of existsSync(srDir) ? readdirSync(srDir).filter((x) => x.endsWith('.csv')) : []) {
    const hit = readCsv(`test-data/sales-rep/${f}`).find((r) => Object.values(r).some((v) => String(v).split(/[;,\s]+/).includes(inboxOrg.org_id)));
    if (hit) fail(`sales-rep/${f} references ${inboxOrg.org_id} — a rep serving the inbox org sends pushes to all its members`);
  }
  const mom = readCsv('test-data/b2b/organization-memberships.csv').find((r) => r.org_name === inboxOrg.org_name);
  if (mom) fail(`organization-memberships.csv ${mom.membership_id} adds a member to ${inboxOrg.org_name}`);
}
if (problems.length === before5) ok(`${inboxOrg?.org_name}: pinned, holds reader + bystander + bulk, served by no rep, no cross-org member`);

console.log('\n[6] runtime fields: declared, and empty in the committed base');
const before6 = problems.length;
for (const spec of Object.values(INBOXES)) {
  const d = aliases[spec.thresholdsAlias] || {};
  for (const f of spec.writeback) {
    if (d.fields?.[f] !== f) fail(`${spec.thresholdsAlias}.fields.${f} is not declared — the overlay value could never resolve`);
    if (d[f]) fail(`${spec.thresholdsAlias}.${f} carries "${d[f]}" in the committed base — runtime values belong in aliases.<env>.json`);
  }
}
if (problems.length === before6) ok(`${Object.values(INBOXES).flatMap((i) => i.writeback).join(', ')} declared and empty in the base`);

console.log('\n[7] the data model names seed:push, and it exists');
const before7 = problems.length;
const pkg = readJson('package.json');
if (!pkg.scripts?.[SEED_SCRIPT]) fail(`package.json has no "${SEED_SCRIPT}" script`);
for (const spec of Object.values(INBOXES)) {
  const r = reqById.get(spec.requirement);
  if (!r) continue;
  if (r.seed_capability !== SEED_SCRIPT) fail(`${spec.requirement}.seed_capability is "${r.seed_capability}", not ${SEED_SCRIPT}`);
  if (r.acquisition?.strategy !== 'CREATE' || r.acquisition?.executor !== 'seed') fail(`${spec.requirement}.acquisition must be {strategy: CREATE, executor: seed}`);
}
if (problems.length === before7) ok(`${Object.values(INBOXES).map((i) => i.requirement).join(', ')} → ${SEED_SCRIPT}`);

console.log('\n[8] link message derives its href');
const before8 = problems.length;
const origin = 'https://storefront.example.invalid';
const body = linkMessageBody({ marker: 'X', frontUrl: `${origin}/` });
if (!body.includes(`href="${origin}${LINK_ROUTE}"`)) fail(`linkMessageBody does not derive href from the origin it is given: ${body}`);
if (!isOurs(body) || !isLinkMessage(body)) fail('the link body is not recognised as ours / as the link message');
const specSrc = readFileSync(join(ROOT, 'scripts/seed-data/push/push-specs.mjs'), 'utf8');
const hosts = specSrc.match(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
if (hosts.length) fail(`push-specs.mjs hardcodes a host: ${hosts.join(', ')}`);
if (problems.length === before8) ok(`href = <FRONT_URL>${LINK_ROUTE}; no host literal in the spec`);

console.log('\n[9] env overlays (informational)');
for (const f of readdirSync(join(ROOT, 'test-data')).filter((x) => /^aliases\.[\w-]+\.json$/.test(x))) {
  const o = JSON.parse(readFileSync(join(ROOT, 'test-data', f), 'utf8'));
  const have = [...Object.values(INBOXES).map((i) => i.recipientAlias), PROTECTED.bystander.recipientAlias].filter((a) => o[a]?.contactId);
  const wb = Object.values(INBOXES).filter((i) => i.writeback.every((w) => o[i.thresholdsAlias]?.[w]));
  if (have.length || wb.length) console.log(`  · ${f}: recipients with contactId ${have.length}/3, inbox writebacks ${wb.map((i) => i.thresholdsAlias).join(', ') || 'none'}`);
}

if (LIVE) await live();

console.log(`\n=== Push Messages fixture validation${LIVE ? ' (static + live)' : ' (static)'} ===`);
console.log(`  problems: ${problems.length} | warnings: ${warnings.length}`);
if (problems.length) { console.log('\nFAIL — the push fixtures can no longer decide what their cases test.\n'); process.exit(1); }
console.log(`\nPush fixtures OK.${LIVE ? '' : ' (static only — `npm run seed:push:verify` probes the seeded state)'}\n`);

async function live() {
  const { auth, api, loadAliases } = await import('../../lib/seed-common.mjs');
  const { readThresholds, signInRecipient, fetchInbox, protectedStateReport, TEST_ENV } = await import('./push-live.mjs');
  console.log(`\n[L] live probe — TEST_ENV=${TEST_ENV}`);
  await auth();
  const al = loadAliases();
  const rt = readThresholds(al, reader.thresholdsAlias, reader.thresholds);
  for (const [key, spec] of Object.entries(INBOXES)) {
    const who = await signInRecipient(al, spec.recipientAlias);
    if (who.overlayContactId && who.overlayContactId !== who.memberId) fail(`[L4] ${spec.recipientAlias}: overlay contactId ${who.overlayContactId} != live memberId ${who.memberId}`);
    const s = classifyInbox((await fetchInbox(who.token)).items);
    const line = `${spec.recipientAlias}: visible=${s.visible} read=${s.read} unread=${s.unread} hidden(ours)=${s.hidden} link=${s.linkVisible ? 'yes' : 'no'} foreign=${s.total - s.ours}`;
    if (key === 'reader') {
      const bad = [s.visible < rt.minVisible && `visible<${rt.minVisible}`, s.read < rt.minRead && `read<${rt.minRead}`, s.unread < rt.minUnread && `unread<${rt.minUnread}`, !s.linkVisible && 'no link message'].filter(Boolean);
      if (bad.length) fail(`[L1] ${line} — ${bad.join(', ')} (run npm run seed:push)`); else ok(`[L1] ${line}`);
    } else {
      const want = readThresholds(al, spec.thresholdsAlias, spec.thresholds).fresh;
      if (s.unread < want) warn(`[L2] ${line} — fewer than ${want} unread: consumed since the last seed (expected after PUSH-021/029); re-run seed:push before the next run`);
      else ok(`[L2] ${line}`);
    }
  }
  for (const r of await protectedStateReport({ aliases: al, api, PROTECTED, isOurs })) {
    if (r.ok) ok(`[L3] ${r.alias}: ${r.detail}`);
    else fail(`[L3] PROTECTED STATE VIOLATED — ${r.alias} (${PROTECTED[r.key].requirement}): ${r.detail}`);
  }
}
