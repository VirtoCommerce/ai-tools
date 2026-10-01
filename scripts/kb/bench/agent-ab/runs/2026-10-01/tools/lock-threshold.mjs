// How many wrong passwords lock LOCKOUT_TEST_EMAIL on this deployment? Wrong attempts one at a time,
// reading lockoutEnd + accessFailedCount after each, then the bench's reset (unlock + one good sign-in).
import { pathToFileURL } from 'node:url';
const R = new URL('../../../../../../../', import.meta.url).href;
await import(new URL('config.js', R).href);
const up = await import(new URL('scripts/lib/user-provision.mjs', R).href);
await up.authenticate();
const email = process.env.LOCKOUT_TEST_EMAIL;
const B = process.env.BACK_URL.replace(/\/+$/, '');
const tok = (pw) => fetch(`${B}/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'password', scope: 'offline_access', storeId: process.env.STORE_ID, username: email, password: pw }) });
const state = async () => { const u = await up.findUserByEmail(email); return { id: u.id, failed: u.accessFailedCount, end: u.lockoutEnd }; };
let s = await state();
console.log('start', s.failed, s.end);
for (let i = 1; i <= 6; i++) {
  const r = await tok('definitely-wrong-' + i);
  const body = await r.json().catch(() => ({}));
  s = await state();
  const locked = s.end && new Date(s.end).getTime() > Date.now();
  console.log(`attempt ${i}: HTTP ${r.status} code=${body.code ?? body.error} count=${body.count ?? '-'} | accessFailedCount=${s.failed} lockoutEnd=${s.end} locked=${locked}`);
  if (locked) break;
}
// A good password while locked: what does the endpoint say?
const g = await tok(process.env.LOCKOUT_TEST_PASSWORD); const gb = await g.json().catch(() => ({}));
console.log(`correct password while locked: HTTP ${g.status} code=${gb.code ?? gb.error ?? 'token'}`);
// Reset
await up.getApi()('POST', `/api/platform/security/users/${s.id}/unlock`, {}, { expectStatus: [200, 201, 204] });
const ok = await tok(process.env.LOCKOUT_TEST_PASSWORD);
s = await state();
console.log(`reset: good sign-in ${ok.status}, accessFailedCount=${s.failed}, lockoutEnd=${s.end}`);
