#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
const ENV = process.env.TEST_ENV || "vcst";
function load(p) { if (!existsSync(p)) return; for (const l of readFileSync(p,"utf-8").split(/\r?\n/)) { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } }
load(".env.defaults"); load(`.env.${ENV}`); load(".env.local");
const BACK_URL = process.env.BACK_URL, STORE_ID = process.env.STORE_ID || "B2B-store";
async function tok() {
  const r = await fetch(`${BACK_URL}/connect/token`, { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body: new URLSearchParams({grant_type:"password", scope:"offline_access", username:"test-john.mitchell-20260310@test-agent.com", password:"TestPass123!", storeId: STORE_ID}).toString() });
  return (await r.json()).access_token;
}
async function gql(q, v, t) {
  const r = await fetch(`${BACK_URL}/graphql`, { method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${t}`}, body: JSON.stringify({query:q, variables:v}) });
  return r.json();
}
const t = await tok();
const r = await gql(`query { orders(sort: "createdDate:desc", first: 50) { totalCount items { id number status createdDate organizationId organizationName total { amount currency { code } } items { sku name } } } }`, {}, t);
if (r.errors) { console.error(JSON.stringify(r.errors, null, 2)); process.exit(1); }
const orders = r.data?.orders?.items ?? [];
console.log(`John has ${r.data?.orders?.totalCount ?? orders.length} order(s) total. Latest ${orders.length}:`);
for (const o of orders) {
  const created = new Date(o.createdDate).toISOString().replace("T"," ").slice(0,19);
  const skus = o.items?.map(i => i.sku).join(", ") || "?";
  console.log(`  ${o.number}  ${created}  ${o.status.padEnd(10)}  $${o.total?.amount} ${o.total?.currency?.code}  org=${(o.organizationId||"").slice(0,8)}  items=[${skus}]`);
}
