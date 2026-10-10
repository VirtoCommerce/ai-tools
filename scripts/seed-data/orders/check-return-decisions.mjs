#!/usr/bin/env node
/**
 * check-return-decisions.mjs — the live RECONCILE probe for the VCST-5883 return-decision fixtures.
 *
 * Read-only. Per seeded fixture (aliases.<env>.json, written by seed-return-decisions.mjs):
 *   1. returnableItems(orderId) as the buyer — each line's returnableQuantity against
 *      expectedReturnableAfterSeed() (delivered − what the undecided returns hold);
 *   2. every seeded return's live status against SEEDED_STATUS (Requested / New) and its languageCode;
 *   3. the notification journal (tenant = the return) — how many ReturnRegisteredEmailNotification
 *      rows exist and in which status (Sent vs Error: an env with no SMTP records Error, and that is
 *      still proof the notification was RAISED);
 *   4. push messages whose topic is the return number.
 *
 * IT REPORTS, IT DOES NOT ENFORCE the feature: a disagreement is printed and exits 1 so a pipeline
 * notices, but the fixtures are never adjusted to make the feature agree.
 *
 * Usage: TEST_ENV=<env> npm run returns:decisions:check [-- --only <KEY|ALIAS>]
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertSafeTarget, auth, api, log, ROOT, BACK_URL, STORE_ID, ONLY } from '../../lib/seed-common.mjs';
import { LINE_ROLE_X, LINE_ROLE_Y } from './orders-specs.mjs';
import {
  RETURN_DECISION_FIXTURES, SEEDED_STATUS, VIA_XAPI, expectedReturnableAfterSeed, rolesOf, DECISION_BUYER,
} from './return-decisions-specs.mjs';

const TARGET_ENV = process.env.TEST_ENV || 'vcst';
const LETTER = { [LINE_ROLE_X]: 'A', [LINE_ROLE_Y]: 'B' };

async function buyerToken() {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    // The dedicated buyer the seeder owns every fixture by (DECISION_BUYER), never the env persona USER.
    body: new URLSearchParams({ grant_type: 'password', username: DECISION_BUYER.email, password: process.env[DECISION_BUYER.passwordVar] || '', scope: 'offline_access', storeId: STORE_ID }),
  });
  if (!res.ok) throw new Error(`buyer ${DECISION_BUYER.email} sign-in failed: ${res.status}`);
  return (await res.json()).access_token;
}
async function gql(query, variables, token) {
  const res = await fetch(`${BACK_URL}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ query, variables }) });
  return res.json();
}

async function main() {
  assertSafeTarget();
  await auth();
  const p = join(ROOT, 'test-data', `aliases.${TARGET_ENV}.json`);
  if (!existsSync(p)) throw new Error(`aliases.${TARGET_ENV}.json absent — seed first`);
  const overlay = JSON.parse(readFileSync(p, 'utf8'));
  const token = await buyerToken();
  const specs = RETURN_DECISION_FIXTURES.filter((s) => !ONLY || s.key === ONLY || s.alias === ONLY);
  const issues = [];

  // Journal + push are read once and filtered client-side by tenant id / topic.
  const since = specs.map((s) => overlay[s.alias]?.seededAt).filter(Boolean).sort()[0] || new Date(Date.now() - 7 * 86400000).toISOString();
  const journal = (await api('POST', '/api/notifications/journal', { startDate: since, take: 500 }))?.results || [];
  const pushes = (await api('POST', '/api/push-message/search', { take: 200, sort: 'createdDate:desc' }))?.results || [];

  for (const spec of specs) {
    const a = overlay[spec.alias];
    console.log(`\n── ${spec.key} · ${spec.alias}`);
    if (!a?.orderId) { console.log('   NOT SEEDED'); issues.push(`${spec.key}: not seeded`); continue; }
    const ri = await gql(`query($id:String!){ returnableItems(orderId:$id){ orderLineItemId sku measureUnit orderedQuantity deliveredQuantity returnableQuantity isReturnable ineligibilityReason } }`, { id: a.orderId }, token);
    const rows = ri?.data?.returnableItems || [];
    const expected = expectedReturnableAfterSeed(spec);
    for (const role of rolesOf(spec)) {
      const L = LETTER[role];
      const row = rows.find((r) => r.orderLineItemId === a[`line${L}ItemId`]);
      const exp = expected[role];
      const got = row?.returnableQuantity;
      const mark = got === exp ? '✓' : '✗';
      console.log(`   ${mark} line ${L} ${row?.sku ?? '?'} ordered ${row?.orderedQuantity} delivered ${row?.deliveredQuantity} returnable ${got} (expected ${exp}) isReturnable=${row?.isReturnable} reason=${row?.ineligibilityReason} unit=${row?.measureUnit}`);
      if (got !== exp) issues.push(`${spec.key} line ${L}: returnable ${got} != ${exp}`);
    }
    for (let i = 0; i < spec.returns.length; i++) {
      const rs = spec.returns[i];
      const pfx = i === 0 ? 'return' : `return${i + 1}`;
      const id = a[`${pfx}Id`];
      const live = id ? await api('GET', `/api/return/${id}`, null, { expectStatus: [200, 404] }) : null;
      const exp = SEEDED_STATUS[rs.via];
      const regs = journal.filter((m) => m.tenantIdentity?.id === id && m.notificationType === 'ReturnRegisteredEmailNotification');
      const others = journal.filter((m) => m.tenantIdentity?.id === id && m.notificationType !== 'ReturnRegisteredEmailNotification');
      const push = pushes.filter((m) => m.topic === a[`${pfx}Number`]);
      const byStatus = (list) => Object.entries(list.reduce((o, m) => ({ ...o, [m.status]: (o[m.status] || 0) + 1 }), {})).map(([k, v]) => `${v}×${k}`).join(',') || '0';
      console.log(`   ${live?.status === exp ? '✓' : '✗'} ${pfx} ${a[`${pfx}Number`]} status ${live?.status} (expected ${exp}) languageCode ${live?.languageCode}${rs.cultureName ? ` (submitted with cultureName ${rs.cultureName}; order ${a.orderLanguageCode})` : ''}`);
      console.log(`     ReturnRegisteredEmailNotification: ${regs.length} [${byStatus(regs)}] lang ${[...new Set(regs.map((m) => m.languageCode))].join(',') || '-'}${others.length ? ` | other: ${others.map((m) => `${m.notificationType}/${m.status}`).join(', ')}` : ''}`);
      console.log(`     push messages (topic = return number): ${push.length} [${byStatus(push)}] ${push.map((m) => JSON.stringify(m.shortMessage)).join(' | ')}`);
      if (live?.status !== exp) issues.push(`${spec.key}/${rs.ref}: status ${live?.status} != ${exp}`);
      if (rs.via === VIA_XAPI) {
        if (regs.length !== 1) issues.push(`${spec.key}/${rs.ref}: ${regs.length} ReturnRegisteredEmailNotification row(s), expected 1`);
        if (push.length !== 1) issues.push(`${spec.key}/${rs.ref}: ${push.length} push message(s), expected 1`);
      }
    }
  }
  console.log(`\n${issues.length ? `✗ ${issues.length} disagreement(s):\n  - ${issues.join('\n  - ')}` : '✓ every fixture reconciles.'}`);
  if (issues.length) process.exitCode = 1;
  log('');
}

main().catch((e) => { console.error('CHECK FAILED:', e.message); process.exit(1); });
