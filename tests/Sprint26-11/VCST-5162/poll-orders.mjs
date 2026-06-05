import { config } from 'dotenv';
config();
const BACK = process.env.BACK_URL;
const body = new URLSearchParams({
  grant_type: 'password', scope: 'offline_access',
  username: process.env.ADMIN || 'admin',
  password: process.env.ADMIN_PASSWORD || 'Password1!',
  storeId: process.env.STORE_ID || 'B2B-store',
});
const tr = await fetch(BACK + '/connect/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
});
const tj = await tr.json();
const tok = tj.access_token;
if (!tok) { console.log('TOKEN FAIL', tr.status, JSON.stringify(tj)); process.exit(1); }
const sr = await fetch(BACK + '/api/order/customerOrders/search', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
  body: JSON.stringify({ sort: 'createdDate:desc', take: 20, skip: 0 }),
});
console.log('search status:', sr.status);
const data = await sr.json();
const items = data.results || data.customerOrders || [];
console.log('totalCount:', data.totalCount, 'returned:', items.length);
// Flag NEW Authorize.Net orders created after the run start (15:05Z 2026-06-05) by pool/agent users.
const RUN_START = new Date('2026-06-05T15:05:00Z');
for (const o of items) {
  const pays = (o.inPayments || []).map(p => `${p.gatewayCode || p.paymentMethod?.code}:${p.status || p.paymentStatus}`).join(',');
  const tx = (o.inPayments || []).flatMap(p => p.transactions || []).map(t => t.id || t.gatewayCode).join('|');
  const isAN = (o.inPayments || []).some(p => (p.gatewayCode || p.paymentMethod?.code) === 'AuthorizeNetPaymentMethod');
  const created = new Date(o.createdDate);
  const flag = (isAN && created > RUN_START) ? '  <== NEW AN ORDER (this run)' : '';
  console.log(`${o.number} | ${o.createdDate} | cust=${o.customerName} (${o.customerId}) | ostatus=${o.status} | pays=[${pays}] | tx=[${tx}]${flag}`);
}
