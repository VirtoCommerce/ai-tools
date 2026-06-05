import { config } from 'dotenv';
config();
const BACK = process.env.BACK_URL;
const ORDER_NUMBER = process.argv[2];
const body = new URLSearchParams({
  grant_type: 'password', scope: 'offline_access',
  username: process.env.ADMIN || 'admin',
  password: process.env.ADMIN_PASSWORD || 'Password1!',
  storeId: process.env.STORE_ID || 'B2B-store',
});
const tok = (await (await fetch(BACK + '/connect/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
})).json()).access_token;
const sr = await fetch(BACK + '/api/order/customerOrders/search', {
  method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
  body: JSON.stringify({ keyword: ORDER_NUMBER, take: 5 }),
});
const found = ((await sr.json()).results || []).find(o => o.number === ORDER_NUMBER);
const o = await (await fetch(BACK + '/api/order/customerOrders/' + found.id, {
  headers: { Authorization: 'Bearer ' + tok },
})).json();
for (const p of (o.inPayments || [])) {
  // print the payment object keys + transactions array fully (trim big response blobs)
  const clone = JSON.parse(JSON.stringify(p));
  console.log('PAYMENT keys:', Object.keys(clone).join(','));
  console.log('  paymentMethod:', clone.paymentMethod?.code, '| gatewayCode:', clone.gatewayCode, '| status:', clone.status, '| paymentStatus:', clone.paymentStatus);
  console.log('  transactions:', JSON.stringify((clone.transactions||[]).map(t => ({ id: t.id, type: t.type, status: t.status, amount: t.amount, gatewayCode: t.gatewayCode, hasResp: !!t.responseData }))));
}
