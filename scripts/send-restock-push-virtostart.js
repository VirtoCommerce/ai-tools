/**
 * Demo 1b — Predictive Restocking push message (VirtoStart edition).
 *
 * Mirrors scripts/send-restock-push-vcst.js but targets the virtostart B2B-store
 * John Mitchell account (AGENT-TEST-Org-AcmeCorp). Uses LIPTON ICE TEA SPARKLING
 * CRATE (SKU 261082) as the recurring office-consumable, mined from his 20 orders
 * on virtostart — 5 LIPTON orders, 35 crates total.
 *
 *   Recipient: John Mitchell (contactId 08f73abb-...) on virtostart B2B-store
 *   Topic:     📦 Time to restock — Office consumables running low
 *   Content:   Markdown summary of the 5-order LIPTON consumption + reorder CTA
 *   Status:    Scheduled → Hangfire dispatches at startDate
 *
 * Usage:
 *   node scripts/send-restock-push-virtostart.js                  # schedule 2 min from now
 *   node scripts/send-restock-push-virtostart.js --schedule-in 5m
 *   node scripts/send-restock-push-virtostart.js --now            # immediate (Scheduled, +10s)
 *   node scripts/send-restock-push-virtostart.js --draft          # save as Draft
 *   node scripts/send-restock-push-virtostart.js --dry-run        # print, don't POST
 */
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(ROOT, '.env.virtostart'), override: true });
config({ path: join(ROOT, '.env.local'), override: true });

// Promote *_VIRTOSTART suffixed vars to base names (matches seed-orders-virtostart.js).
for (const [k, v] of Object.entries(process.env)) {
  if (k.endsWith('_VIRTOSTART') && v) process.env[k.slice(0, -'_VIRTOSTART'.length)] = v;
}

const BACK = process.env.BACK_URL;
const ADMIN = process.env.ADMIN_VIRTO || process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_VIRTO_PASSWORD
  || process.env.ADMIN_PASSWORD_VIRTOSTART
  || process.env.ADMIN_PASSWORD;

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const NOW = args.includes('--now');
const DRAFT = args.includes('--draft');
const scheduleInArg = (args.find(a => a.startsWith('--schedule-in') || a === '--schedule-in') || '').split('=')[1]
  || (args.includes('--schedule-in') ? args[args.indexOf('--schedule-in') + 1] : null)
  || '2m';

// Recipient: John Mitchell on virtostart (from _seed-results-orders-virtostart.json).
const JOHN = {
  contactId: '08f73abb-3a81-4531-be3b-2718259519d3',
  userId:    'f2f838d8-2195-4a36-8d8d-01de34ae66c3',
  email: 'test-john.mitchell-20260508@test-agent.com',
  fullName: 'John Mitchell',
};

// Storefront order URL pattern: /account/orders/{orderId} (GUID, not number).
// CO26050800106 — LIPTON-only order, 9 crates × $9 = $91. Clean reorder target.
const STOREFRONT = 'https://virtostart-demo-store.govirto.com';
const REORDER_ORDER_ID = '2683f825-1488-424f-9ec7-0161688668d4'; // CO26050800106
const REORDER_URL      = `${STOREFRONT}/account/orders/${REORDER_ORDER_ID}`;

// --- compute startDate ---
function parseSchedule(spec) {
  const m = /^(\d+)([smhd])$/.exec(spec);
  if (!m) throw new Error(`Bad --schedule-in: "${spec}". Use Nm | Nh | Nd | Ns.`);
  const n = parseInt(m[1], 10);
  const mult = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return new Date(Date.now() + n * mult);
}
const startDate = DRAFT ? null
  : NOW    ? new Date(Date.now() + 10_000)
           : parseSchedule(scheduleInArg);

// --- content (template) ---
// LIPTON consumption pattern across John's 5 orders on virtostart (35 crates total).
const topic = '📦 Time to restock — Office beverages running low';
const body = [
  `Hi ${JOHN.fullName.split(' ')[0]},`,
  ``,
  `Based on AcmeCorp's recent purchase pattern, the office is projected to **run out of LIPTON Ice Tea Sparkling Crate (\`261082\`)** within 6 days.`,
  ``,
  `**Your team's consumption (last 5 orders):**`,
  ``,
  `| Order | Date | Qty |`,
  `|-------|------|----:|`,
  `| CO26050800106 | Apr 22 | 9 |`,
  `| CO26050800110 | Apr 29 | 9 |`,
  `| CO26050800114 | May 04 | 7 |`,
  `| CO26050800115 | May 07 | 5 |`,
  `| CO26050800116 | May 10 | 5 |`,
  ``,
  `**Average:** 7 crates/week · **35 crates** total over the last 5 weeks`,
  ``,
  `**Suggested reorder:** \`261082\` × **9 crates** @ $9.00 = **$81.00**`,
  `Arrives Fri, May 15 · In stock · AcmeCorp contract price applied.`,
  ``,
  `[Review & reorder →](${REORDER_URL}) · [Adjust quantity](${REORDER_URL}) · [Skip this cycle](${STOREFRONT}/account/notifications)`,
  ``,
  `*Auto-detected by your AI restocking assistant. Reply STOP to unsubscribe.*`,
].join('\n');

const status = DRAFT ? 'Draft' : 'Scheduled';

const payload = {
  topic,
  shortMessage: body,
  startDate: startDate ? startDate.toISOString() : null,
  status,
  trackNewRecipients: false,
  memberQuery: null,
  memberIds: [JOHN.contactId],
};

// --- summary ---
console.log(`\n🔔 Predictive Restocking push (virtostart)${DRY ? ' [DRY RUN]' : ''}`);
console.log(`   Target:    ${BACK}`);
console.log(`   Recipient: ${JOHN.fullName} (${JOHN.email})`);
console.log(`   contactId: ${JOHN.contactId}`);
console.log(`   Topic:     ${topic}`);
console.log(`   Status:    ${status}`);
console.log(`   Scheduled: ${startDate ? `${startDate.toISOString()} (${NOW ? '~10s — --now' : `in ${scheduleInArg}`})` : '— (draft)'}`);
console.log(`   Length:    ${body.length} chars, ${body.split('\n').length} lines\n`);

if (DRY) {
  console.log('--- payload preview ---');
  console.log(JSON.stringify(payload, null, 2));
  console.log('\n[DRY RUN] — no POST issued.');
  process.exit(0);
}

if (!BACK || !ADMIN || !ADMIN_PASSWORD) {
  console.error('Missing BACK_URL, ADMIN_VIRTO, or ADMIN_VIRTO_PASSWORD. Check .env.virtostart + .env.local');
  process.exit(1);
}

// --- auth + send ---
const tokenRes = await fetch(`${BACK}/connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=password&username=${encodeURIComponent(ADMIN)}&password=${encodeURIComponent(ADMIN_PASSWORD)}&scope=offline_access`,
});
if (!tokenRes.ok) {
  console.error(`✗ Auth → ${tokenRes.status}: ${(await tokenRes.text()).slice(0, 400)}`);
  process.exit(1);
}
const { access_token } = await tokenRes.json();
const auth = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

// VC pattern: POST creates as Draft, PUT updates with target status.
const postRes = await fetch(`${BACK}/api/push-message`, {
  method: 'POST', headers: auth, body: JSON.stringify({ ...payload, status: 'Draft' }),
});
if (!postRes.ok) {
  console.error(`✗ POST → ${postRes.status}: ${(await postRes.text()).slice(0, 400)}`);
  process.exit(1);
}
const created = await postRes.json();
console.log(`✓ POST  → id=${created.id}  status=${created.status}`);

if (DRAFT) {
  console.log(`\nDraft saved. Send later via admin UI: ${BACK}/#/pushMessages/${created.id}`);
  process.exit(0);
}

const putBody = { ...created, status: payload.status, startDate: payload.startDate, memberIds: payload.memberIds };
const putRes = await fetch(`${BACK}/api/push-message`, {
  method: 'PUT', headers: auth, body: JSON.stringify(putBody),
});
if (!putRes.ok) {
  console.error(`✗ PUT → ${putRes.status}: ${(await putRes.text()).slice(0, 400)}`);
  process.exit(1);
}
const updated = await putRes.json();
console.log(`✓ PUT   → status=${updated.status}  startDate=${updated.startDate || '—'}`);

console.log(`\n📋 Admin: ${BACK}/#/pushMessages/${created.id}`);
console.log(`🕐 Hangfire: ${BACK}/hangfire/jobs/scheduled (look for the dispatch job)`);
console.log(`📱 Storefront: bell icon for John on ${STOREFRONT}${status === 'Scheduled' ? ` will fire at ${startDate.toISOString()}` : ' should appear immediately'}\n`);
