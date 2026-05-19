// Probe configuration update endpoints to figure out how to set dependsOnSectionId
import { config } from 'dotenv';
config();
const BACK_URL = process.env.BACK_URL;
const r = await fetch(`${BACK_URL}/connect/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'password', username: process.env.ADMIN, password: process.env.ADMIN_PASSWORD, scope: 'offline_access' }),
});
const { access_token } = await r.json();
const h = { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' };

const cfgId = '8514ef1e-0a5d-4672-b52f-4e01591b0463';
const get = await fetch(`${BACK_URL}/api/catalog/products/configurations/${cfgId}`, { headers: h });
const cfg = await get.json();
const ramId = cfg.sections.find(s => s.name === 'RAM').id;
const storageId = cfg.sections.find(s => s.name === 'Storage').id;

const modified = JSON.parse(JSON.stringify(cfg));
modified.sections.find(s => s.name === 'Storage').dependsOnSectionId = ramId;

// Try several methods
const tries = [
  { m: 'POST', p: '/api/catalog/products/configurations', body: modified },
  { m: 'PATCH', p: `/api/catalog/products/configurations/${cfgId}`, body: [{ op: 'replace', path: `/sections/1/dependsOnSectionId`, value: ramId }] },
  { m: 'PUT', p: `/api/catalog/products/configurations/${cfgId}`, body: modified },
];
for (const t of tries) {
  const res = await fetch(`${BACK_URL}${t.p}`, {
    method: t.m, headers: h, body: JSON.stringify(t.body),
  });
  const text = await res.text();
  console.log(`${t.m} ${t.p} → ${res.status}  ${text.slice(0, 120)}`);
  if (res.ok) {
    const verify = await fetch(`${BACK_URL}/api/catalog/products/configurations/${cfgId}`, { headers: h });
    const vj = await verify.json();
    const storage = vj.sections.find(s => s.name === 'Storage');
    console.log(`  → After: Storage.dependsOnSectionId = ${storage.dependsOnSectionId}`);
    if (storage.dependsOnSectionId === ramId) {
      console.log('  ✓ Stuck! Cleaning up...');
      const clear = JSON.parse(JSON.stringify(vj));
      clear.sections.find(s => s.name === 'Storage').dependsOnSectionId = null;
      await fetch(`${BACK_URL}${t.p}`, { method: t.m, headers: h, body: JSON.stringify(clear) });
      return;
    }
  }
}
