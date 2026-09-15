// ad-hoc loyalty balance snapshot for the 083e run (org-mode corruption tracking)
import '../../config.js';
const B = process.env.BACK_URL;
const tok = async () => {
  const r = await fetch(B + '/connect/token', { method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'password',username:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
  if(!r.ok) throw new Error('token '+r.status);
  return (await r.json()).access_token;
};
const t = await tok(); const H = { Authorization: 'Bearer ' + t };
const v = JSON.parse((await import('node:fs')).readFileSync('test-data/aliases.vcst.json','utf8'));
const org = v.ORG_LOY_A.org_id;
const out = { capturedAt: new Date().toISOString(), label: process.argv[2] || 'snapshot', org, balances: {} };
const get = async (u) => { const r = await fetch(B+u,{headers:H}); return r.ok ? (await r.json()) : { error: r.status }; };
out.balances.organization = await get('/api/loyalty-program-operation-log/balance/organization/'+org);
for (const k of ['ORG_LOY_A','ORG_LOY_B','ORG_LOY_LOCKED','LOY_PERSONAL_NOORG'])
  out.balances[k] = await get('/api/loyalty-program-operation-log/balance/user/'+v[k].userId);
const store = await get('/api/stores/' + (process.env.STORE_ID || 'B2B-store'));
out.storeMode = (store.settings||[]).find(s=>s.name==='Loyalty.LoyaltyBalanceCalculationMode') ?? null;
const log = await get('/api/loyalty-program-operation-log/search?organizationId='+org);
out.orgRowCount = log?.totalCount ?? log?.results?.length ?? null;
console.log(JSON.stringify(out,null,2));
