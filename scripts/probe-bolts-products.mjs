import { readFileSync, existsSync } from "node:fs";
const ENV = process.env.TEST_ENV || "vcst";
function load(p){ if(!existsSync(p)) return; for(const l of readFileSync(p,"utf-8").split(/\r?\n/)){ const m=l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2]; } }
load(".env.defaults"); load(`.env.${ENV}`); load(".env.local");
const BACK_URL=process.env.BACK_URL, STORE_ID=process.env.STORE_ID||"B2B-store";
async function tok(){ const r=await fetch(`${BACK_URL}/connect/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"password",scope:"offline_access",username:"test-john.mitchell-20260310@test-agent.com",password:"TestPass123!",storeId:STORE_ID}).toString()}); return (await r.json()).access_token; }
async function gql(q,v,t){const r=await fetch(`${BACK_URL}/graphql`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({query:q,variables:v})}); return r.json(); }
const t=await tok();
const cats = {
  "Bolts (parent)": "02fe37dcaeb2458a831011abe43fd335",
  "Flange Bolts": "3db665f7c95e46c3890c4a208d8af73d",
  "Eyebolts H1": "364e07799fa24acf95241e7dd5c33b1e",
  "Carriage Bolts": "4fbaca886f014767a52f3f38b9df648f",
  "Freight Car Bolts": "18b6de58c365495181d03375a20ff8d5",
};
for(const [name, id] of Object.entries(cats)){
  for(const f of [`category.subtree:${id}`, `categories.subtree:${id}`, `category.id:${id}`, `categories:${id}`]){
    const r=await gql(`query { products(storeId:"${STORE_ID}", cultureName:"en-US", filter:"${f}", first:3) { totalCount items { id code name } } }`,{},t);
    if(r.errors){ console.log(`  ${name.padEnd(20)} filter=${f.padEnd(40)} ERR ${r.errors[0].message.slice(0,50)}`); continue; }
    const tc=r.data?.products?.totalCount;
    if(tc>0){ console.log(`  ${name.padEnd(20)} filter=${f.padEnd(40)} totalCount=${tc}`); for(const p of r.data.products.items) console.log(`        • ${p.code}  ${p.name}`); break; }
    else console.log(`  ${name.padEnd(20)} filter=${f.padEnd(40)} totalCount=0`);
  }
}
