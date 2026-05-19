#!/usr/bin/env node
/**
 * Audits which B2B fixtures (orgs, users, contacts, BOPIS pickup locations, promotions)
 * survived the 2026-05-15 catalog wipe. Read-only — no writes. Outputs a structured
 * survival report to stdout.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
config();

const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') { fields.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    fields.push(cur);
    return Object.fromEntries(headers.map((h, i) => [h, fields[i] || '']));
  });
}

async function auth() {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=password&username=${ADMIN}&password=${ADMIN_PASSWORD}`,
  });
  if (!res.ok) throw new Error(`Auth: ${res.status}`);
  return (await res.json()).access_token;
}

async function probe(headers, path) {
  const res = await fetch(`${BACK_URL}${path}`, { headers });
  return { status: res.status, ok: res.ok };
}

async function probeBatch(headers, label, items, pathFn) {
  const results = { label, alive: [], dead: [], skipped: [] };
  for (const it of items) {
    if (!it.id) { results.skipped.push(it); continue; }
    try {
      const r = await probe(headers, pathFn(it));
      if (r.ok) results.alive.push(it);
      else results.dead.push({ ...it, status: r.status });
    } catch (e) {
      results.dead.push({ ...it, status: 'ERR:' + e.message });
    }
  }
  return results;
}

async function main() {
  const token = await auth();
  const headers = { 'Authorization': `Bearer ${token}` };

  const orgs = parseCsv(readFileSync('test-data/b2b/organizations.csv', 'utf-8'))
    .map(r => ({ id: r.platform_id, name: r.org_name, csvId: r.org_id }));
  const users = parseCsv(readFileSync('test-data/b2b/users.csv', 'utf-8'))
    .map(r => ({ id: r.platform_id, name: r.user_name, csvId: r.user_id }));
  const contacts = parseCsv(readFileSync('test-data/b2b/contacts.csv', 'utf-8'))
    .map(r => ({ id: r.platform_id, name: r.full_name, csvId: r.contact_id }));

  console.log('## Probing B2B orgs (/api/customer/members/{id})');
  const orgRes = await probeBatch(headers, 'orgs', orgs, o => `/api/members/${o.id}`);
  console.log(`  alive=${orgRes.alive.length} dead=${orgRes.dead.length} skipped=${orgRes.skipped.length}`);
  orgRes.dead.forEach(d => console.log(`    DEAD ${d.csvId} ${d.name} (${d.id}) → ${d.status}`));
  orgRes.skipped.forEach(s => console.log(`    SKIP ${s.csvId} ${s.name} (no platform_id)`));

  console.log('\n## Probing users (/api/platform/security/users/{id})');
  const userRes = await probeBatch(headers, 'users', users, u => `/api/platform/security/users/${u.id}`);
  console.log(`  alive=${userRes.alive.length} dead=${userRes.dead.length} skipped=${userRes.skipped.length}`);
  userRes.dead.forEach(d => console.log(`    DEAD ${d.csvId} ${d.name} (${d.id}) → ${d.status}`));

  console.log('\n## Probing contacts (/api/customer/members/{id})');
  const contactRes = await probeBatch(headers, 'contacts', contacts, c => `/api/members/${c.id}`);
  console.log(`  alive=${contactRes.alive.length} dead=${contactRes.dead.length} skipped=${contactRes.skipped.length}`);
  contactRes.dead.forEach(d => console.log(`    DEAD ${d.csvId} ${d.name} (${d.id}) → ${d.status}`));

  // Probe storefront-facing fixtures via xAPI
  console.log('\n## BOPIS fulfillmentCenters via xAPI');
  const fcQuery = `{ fulfillmentCenters(first:200){ totalCount items{id name code} } }`;
  const fcRes = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: fcQuery }),
  });
  const fcJson = await fcRes.json();
  console.log(`  totalCount=${fcJson.data?.fulfillmentCenters?.totalCount ?? 'error'}`);
  if (fcJson.data?.fulfillmentCenters?.items) {
    fcJson.data.fulfillmentCenters.items.slice(0, 5).forEach(fc => console.log(`    ${fc.code || '(no code)'} | ${fc.name} | ${fc.id}`));
  }

  console.log('\n## Promotions/coupons via REST');
  const promoRes = await fetch(`${BACK_URL}/api/marketing/promotions/search`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ take: 200 }),
  });
  if (promoRes.ok) {
    const promoJson = await promoRes.json();
    console.log(`  totalCount=${promoJson.totalCount ?? promoJson.results?.length ?? 0}`);
    const items = promoJson.results || promoJson.promotions || [];
    items.slice(0, 5).forEach(p => console.log(`    ${p.id} | ${p.name} | active=${p.isActive}`));
  } else {
    console.log(`  promotions endpoint: ${promoRes.status}`);
  }

  const couponRes = await fetch(`${BACK_URL}/api/marketing/coupons/search`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ take: 200 }),
  });
  if (couponRes.ok) {
    const couponJson = await couponRes.json();
    console.log(`  coupons totalCount=${couponJson.totalCount ?? 0}`);
  } else {
    console.log(`  coupons endpoint: ${couponRes.status}`);
  }

  console.log('\n## Summary');
  console.log(`  Orgs alive: ${orgRes.alive.length}/${orgs.length - orgRes.skipped.length}`);
  console.log(`  Users alive: ${userRes.alive.length}/${users.length - userRes.skipped.length}`);
  console.log(`  Contacts alive: ${contactRes.alive.length}/${contacts.length - contactRes.skipped.length}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
