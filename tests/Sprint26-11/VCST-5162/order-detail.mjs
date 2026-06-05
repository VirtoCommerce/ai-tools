import { config } from 'dotenv';
config();
const BACK = process.env.BACK_URL;
const ORDER_NUMBER = process.argv[2]; // e.g. CO260605-00011
const body = new URLSearchParams({
  grant_type: 'password', scope: 'offline_access',
  username: process.env.ADMIN || 'admin',
  password: process.env.ADMIN_PASSWORD || 'Password1!',
  storeId: process.env.STORE_ID || 'B2B-store',
});
const tok = (await (await fetch(BACK + '/connect/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
})).json()).access_token;
// search by number to get id
const sr = await fetch(BACK + '/api/order/customerOrders/search', {
  method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
  body: JSON.stringify({ keyword: ORDER_NUMBER, take: 5 }),
});
const sd = await sr.json();
const found = (sd.results || []).find(o => o.number === ORDER_NUMBER);
if (!found) { console.log('NOT FOUND in search', ORDER_NUMBER); process.exit(0); }
const dr = await fetch(BACK + '/api/order/customerOrders/' + found.id, {
  headers: { Authorization: 'Bearer ' + tok },
});
const o = await dr.json();
console.log('Order:', o.number, 'status:', o.status, 'total:', o.total, o.currency);
for (const p of (o.inPayments || [])) {
  console.log(`  Payment: gateway=${p.gatewayCode} status=${p.status} authorized=${p.isApproved} sum=${p.sum} ${p.currency}`);
  for (const t of (p.transactions || [])) {
    console.log(`    Tx: id=${t.id} type=${t.type} status=${t.status} amount=${t.amount} gateway=${t.gatewayCode} response.has=${!!(t.responseData||t.rawResponse||t.responseCode)}`);
  }
  if (!(p.transactions || []).length) console.log('    Tx: (none on this payment)');
}
