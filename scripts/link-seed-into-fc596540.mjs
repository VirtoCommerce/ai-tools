#!/usr/bin/env node
/**
 * Links the 3 SEED-20260518 root categories into the restored virtual catalog
 * `fc596540864a41bf8ab78734ee7353a3` so the 42 standard SEED-* products become
 * storefront-visible after the binding revert. One-off recovery for 2026-05-18.
 */
import { config } from 'dotenv';
config();

const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const RESTORED_CATALOG = 'fc596540864a41bf8ab78734ee7353a3';

const ROOT_CATEGORIES = [
  { id: '8024956b-2616-4e15-9145-b343e70b88d5', name: 'SEED-20260518-Electronics' },
  { id: '731deaf9-7db1-40e9-a0d4-f5706af8ceff', name: 'SEED-20260518-Industrial Supplies' },
  { id: '69ea1e90-5e0d-4b26-bed4-553e2b253f48', name: 'SEED-20260518-Office Supplies' },
];

async function main() {
  const authRes = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=password&username=${ADMIN}&password=${ADMIN_PASSWORD}`,
  });
  if (!authRes.ok) throw new Error(`Auth failed: ${authRes.status}`);
  const { access_token } = await authRes.json();
  const headers = { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' };

  const links = ROOT_CATEGORIES.map(c => ({
    listEntryId: c.id,
    listEntryType: 'category',
    catalogId: RESTORED_CATALOG,
  }));

  const res = await fetch(`${BACK_URL}/api/catalog/listentrylinks`, {
    method: 'POST',
    headers,
    body: JSON.stringify(links),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST listentrylinks: ${res.status} ${txt.slice(0, 500)}`);
  }
  console.log(`POST /api/catalog/listentrylinks → ${res.status}`);
  console.log(`Linked ${ROOT_CATEGORIES.length} categories into ${RESTORED_CATALOG}`);

  // Trigger reindex so products appear in storefront search
  const reindex = await fetch(`${BACK_URL}/api/search/indexes/index`, {
    method: 'POST',
    headers,
    body: JSON.stringify([
      { documentType: 'CatalogProduct', rebuild: true },
      { documentType: 'Category', rebuild: true },
    ]),
  });
  console.log(`Reindex → ${reindex.status}`);
  if (!reindex.ok) {
    const txt = await reindex.text();
    console.warn(`Reindex body: ${txt.slice(0, 300)}`);
  }
  console.log('✅ SEED products linked. Wait ~30-60s for indexer.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
