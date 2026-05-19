#!/usr/bin/env node
/**
 * Reverts B2B-store.catalog from the SEED-* virtual catalog back to the original
 * restored catalog fc596540864a41bf8ab78734ee7353a3. One-off recovery script for
 * the 2026-05-18 reseed. Safe to re-run (no-op if already reverted).
 */
import { config } from 'dotenv';
config();
const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const STORE_ID = process.env.STORE_ID || 'B2B-store';
const TARGET_CATALOG = 'fc596540864a41bf8ab78734ee7353a3';

async function main() {
  const authRes = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=password&username=${ADMIN}&password=${ADMIN_PASSWORD}`,
  });
  if (!authRes.ok) throw new Error(`Auth failed: ${authRes.status}`);
  const { access_token } = await authRes.json();
  const headers = { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' };

  const storeRes = await fetch(`${BACK_URL}/api/stores/${STORE_ID}`, { headers });
  if (!storeRes.ok) throw new Error(`GET store: ${storeRes.status}`);
  const store = await storeRes.json();
  const before = store.catalog;
  console.log(`Store ${STORE_ID} catalog before: ${before}`);
  if (before === TARGET_CATALOG) {
    console.log(`Already on ${TARGET_CATALOG} — nothing to do.`);
    return;
  }

  store.catalog = TARGET_CATALOG;
  const putRes = await fetch(`${BACK_URL}/api/stores`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(store),
  });
  if (!putRes.ok) {
    const txt = await putRes.text();
    throw new Error(`PUT store: ${putRes.status} ${txt.slice(0, 500)}`);
  }
  console.log(`PUT /api/stores → ${putRes.status}`);

  const verifyRes = await fetch(`${BACK_URL}/api/stores/${STORE_ID}`, { headers });
  const verify = await verifyRes.json();
  console.log(`Store ${STORE_ID} catalog after: ${verify.catalog}`);
  if (verify.catalog !== TARGET_CATALOG) throw new Error('Verification failed');
  console.log('✅ Reverted.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
