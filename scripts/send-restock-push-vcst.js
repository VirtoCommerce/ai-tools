/**
 * Demo 1b — Predictive Restocking push message.
 *
 * Creates a push message for John Mitchell targeting the carriage-bolt restocking
 * scenario and schedules it via the platform's PushMessages module. The platform
 * dispatches scheduled messages through Hangfire (visible at /hangfire), so setting
 * `startDate` to a future time IS the Hangfire job for the demo brief's
 * "Step 1 — Trigger: push notification" requirement.
 *
 *   Recipient: John Mitchell (contactId d0f765ba-...) on vcst-qa B2B-store
 *   Topic:     📦 Time to restock — 1" Carriage Bolts running low
 *   Content:   Markdown summary of the 4-order consumption pattern + reorder CTA
 *   Status:    Scheduled → Hangfire dispatches at startDate
 *
 * Usage:
 *   node scripts/send-restock-push-vcst.js                      # schedule 2 min from now
 *   node scripts/send-restock-push-vcst.js --schedule-in 5m     # 5 minutes
 *   node scripts/send-restock-push-vcst.js --schedule-in 1h     # 1 hour
 *   node scripts/send-restock-push-vcst.js --now                # immediate (status=New, no startDate)
 *   node scripts/send-restock-push-vcst.js --draft              # save as Draft (manual send later)
 *   node scripts/send-restock-push-vcst.js --dry-run            # print, don't POST
 */
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(ROOT, '.env.vcst'), override: true });
config({ path: join(ROOT, '.env.local'), override: true });

const BACK = process.env.BACK_URL;
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const NOW = args.includes('--now');
const DRAFT = args.includes('--draft');
const scheduleInArg = (args.find(a => a.startsWith('--schedule-in') || a === '--schedule-in') || '').split('=')[1]
  || (args.includes('--schedule-in') ? args[args.indexOf('--schedule-in') + 1] : null)
  || '2m';

// Recipient: John Mitchell. Push messages target by CONTACT id (`memberIds`).
const JOHN = {
  contactId: 'd0f765ba-3d2d-4f4e-a4b4-e3306e153178',
  email: 'test-john.mitchell-20260310@test-agent.com',
  fullName: 'John Mitchell',
};

// Storefront order URL pattern: /account/orders/{orderId} (GUID, not number).
// CO26050800121 — most recent 3-variant Carriage Bolt order ($2,115.40, 2026-05-11).
// Captured live from https://vcst-qa-storefront.govirto.com/account/orders → click row → URL.
const STOREFRONT = 'https://vcst-qa-storefront.govirto.com';
const REORDER_ORDER_ID = '7a8ee7fd-c6ca-4e91-bf1d-a16c763aa19a';
const REORDER_URL      = `${STOREFRONT}/account/orders/${REORDER_ORDER_ID}`;

// --- compute startDate ---
function parseSchedule(spec) {
  const m = /^(\d+)([smhd])$/.exec(spec);
  if (!m) throw new Error(`Bad --schedule-in: "${spec}". Use Nm | Nh | Nd | Ns.`);
  const n = parseInt(m[1], 10);
  const mult = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return new Date(Date.now() + n * mult);
}
// Hangfire only dispatches messages with status=Scheduled + startDate set.
// `--now` ≈ Scheduled 10s from now (gives Hangfire a moment to pick up the job).
const startDate = DRAFT ? null
  : NOW    ? new Date(Date.now() + 10_000)
           : parseSchedule(scheduleInArg);

// --- content (template) ---
// Markdown is supported by `shortMessage`.
const topic = '📦 Time to restock — 1" Carriage Bolts running low';
const body = [
  `Hi ${JOHN.fullName.split(' ')[0]},`,
  ``,
  `Based on your recent purchase pattern, you're projected to **run out of 1" Carriage Bolts (\`164W33\`)** within 5 days.`,
  ``,
  `**Your consumption (last 4 orders):**`,
  ``,
  `| Order | Date (implied) | Qty |`,
  `|-------|----------------|----:|`,
  `| CO260413-00091 | Apr 13 | 30 |`,
  `| CO260427-00091 | Apr 27 | 40 |`,
  `| CO260504-00091 | May 04 | 25 |`,
  `| CO26050800121  | May 11 | 25 |`,
  ``,
  `**Average:** 30 boxes/week · **120 units total**`,
  ``,
  `**Suggested reorder:** \`164W33\` × **30 boxes** @ $17.00 = **$510.00**`,
  `Arrives Wed, May 14 · In stock · Contract price applied.`,
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
console.log(`\n🔔 Predictive Restocking push${DRY ? ' [DRY RUN]' : ''}`);
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

// --- auth + send ---
const tokenRes = await fetch(`${BACK}/connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=password&username=${process.env.ADMIN}&password=${process.env.ADMIN_PASSWORD}&scope=offline_access`,
});
const { access_token } = await tokenRes.json();
const auth = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };

// VC pattern: POST creates as Draft, PUT updates with target status. Do both in one flow.
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

// PUT to transition to Scheduled / New
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
console.log(`📱 Storefront: bell icon for John on https://vcst-qa-storefront.govirto.com${status === 'Scheduled' ? ` will fire at ${startDate.toISOString()}` : ' should appear immediately'}\n`);
