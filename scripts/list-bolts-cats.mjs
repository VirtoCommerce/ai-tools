import { readFileSync, existsSync } from "node:fs";
const ENV = process.env.TEST_ENV || "vcst";
function load(p){ if(!existsSync(p)) return; for(const l of readFileSync(p,"utf-8").split(/\r?\n/)){ const m=l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2]; } }
load(".env.defaults"); load(`.env.${ENV}`); load(".env.local");
const BACK_URL=process.env.BACK_URL, STORE_ID=process.env.STORE_ID||"B2B-store";
async function tok(){ const r=await fetch(`${BACK_URL}/connect/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"password",scope:"offline_access",username:"test-john.mitchell-20260310@test-agent.com",password:"TestPass123!",storeId:STORE_ID}).toString()}); return (await r.json()).access_token; }
async function gql(q,v,t){const r=await fetch(`${BACK_URL}/graphql`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({query:q,variables:v})}); return r.json(); }
const t=await tok();
const r=await gql(`query { categories(storeId:"${STORE_ID}", cultureName:"en-US", first: 500) { totalCount items { id code name slug level parent { id name slug } } } }`,{},t);
if(r.errors){ console.log("errors:", JSON.stringify(r.errors,null,2).slice(0,500)); }
const items=(r.data?.categories?.items||[]).filter(Boolean);
console.log(`items=${items.length} totalCount=${r.data?.categories?.totalCount}`);
const bolts=items.filter(c => ((c.name||"").toLowerCase().includes("bolt")||(c.slug||"").toLowerCase().includes("bolt")));
console.log(`\nBolt-related (${bolts.length}):`);
for(const c of bolts) console.log(`  ${c.id}  level=${c.level}  slug=${c.slug}  name="${c.name}"  parent=${c.parent?.name||"-"}`);
