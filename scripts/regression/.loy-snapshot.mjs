// ad-hoc loyalty balance snapshot for the 083e run (org-mode corruption tracking)
//
// Reads the ORG_LOY_* pooled balance, the per-user balances, the store's
// Loyalty.LoyaltyBalanceCalculationMode and the org ledger row count, so a run can assert
// RELATIVE DELTAS (a loyalty balance cannot be reset — the operation log is read-only).
//
// TWO BUGS FIXED 2026-09-16, both of which failed SILENTLY rather than erroring:
//   1. The alias file was hardcoded to `test-data/aliases.vcst.json`. Run under any other
//      TEST_ENV it queried VCST GUIDs against a different backend, every lookup 404'd, and it
//      printed a plausible all-zero baseline. Caught on a localhost run of 083e where the true
//      pool was 131,665. Per .claude/rules/test-data.md GOLDEN RULE the env is now derived,
//      never transcribed, and a missing alias file is a loud failure.
//   2. The ledger search was a GET with a querystring; the endpoint is POST + JSON body. The GET
//      404'd and `?? null` swallowed it into `orgRowCount: null`, which reads as "no rows" —
//      indistinguishable from an empty ledger, which is exactly the precondition LOYORG-E2E-002
//      turns on.
import '../../config.js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Resolve off import.meta.url, not process.cwd(), so the helper works from any directory.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const B = process.env.BACK_URL;
const TEST_ENV = process.env.TEST_ENV || 'vcst';
const errors = [];

const aliasPath = join(REPO, 'test-data', `aliases.${TEST_ENV}.json`);
if (!existsSync(aliasPath)) {
  console.error(`FATAL: no alias file for TEST_ENV=${TEST_ENV} at ${aliasPath}`);
  console.error('Refusing to fall back to another environment — a baseline read against the wrong');
  console.error("backend's GUIDs returns zeros that look like a real reading.");
  process.exit(1);
}

const tok = async () => {
  const r = await fetch(B + '/connect/token', { method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'password',username:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
  if(!r.ok) throw new Error('token '+r.status);
  return (await r.json()).access_token;
};
const t = await tok(); const H = { Authorization: 'Bearer ' + t };
const v = JSON.parse(readFileSync(aliasPath,'utf8'));

for (const k of ['ORG_LOY_A','ORG_LOY_B','ORG_LOY_LOCKED','LOY_PERSONAL_NOORG'])
  if (!v[k]) errors.push(`alias ${k} absent from aliases.${TEST_ENV}.json — is the loyalty fixture set seeded on this env?`);
if (errors.length) { console.error('FATAL:\n  ' + errors.join('\n  ')); process.exit(1); }

const org = v.ORG_LOY_A.org_id;
const out = { capturedAt: new Date().toISOString(), label: process.argv[2] || 'snapshot', env: TEST_ENV, org, balances: {} };

const get = async (u) => {
  const r = await fetch(B+u,{headers:H});
  if (!r.ok) { errors.push(`GET ${u} -> ${r.status}`); return { error: r.status }; }
  return r.json();
};

out.balances.organization = await get('/api/loyalty-program-operation-log/balance/organization/'+org);
for (const k of ['ORG_LOY_A','ORG_LOY_B','ORG_LOY_LOCKED','LOY_PERSONAL_NOORG'])
  out.balances[k] = await get('/api/loyalty-program-operation-log/balance/user/'+v[k].userId);

const store = await get('/api/stores/' + (process.env.STORE_ID || 'B2B-store'));
out.storeMode = (store.settings||[]).find(s=>s.name==='Loyalty.LoyaltyBalanceCalculationMode') ?? null;
if (!out.storeMode)
  errors.push(`store setting Loyalty.LoyaltyBalanceCalculationMode is ABSENT on ${TEST_ENV} — the deployed VirtoCommerce.Loyalty build does not declare it (it ships in PR #17), so org-mode cases are NOT_DEPLOYED here, not failing`);

// POST + JSON body. A GET here 404s and the miss used to be swallowed into orgRowCount: null.
const logRes = await fetch(B+'/api/loyalty-program-operation-log/search',
  { method:'POST', headers:{...H,'Content-Type':'application/json'}, body: JSON.stringify({ organizationId: org, take: 1 }) });
if (!logRes.ok) { errors.push(`POST /api/loyalty-program-operation-log/search -> ${logRes.status}`); out.orgRowCount = null; }
else { const log = await logRes.json(); out.orgRowCount = log?.totalCount ?? log?.results?.length ?? null; }

console.log(JSON.stringify(out,null,2));
if (errors.length) {
  console.error('\nWARNINGS — this snapshot is INCOMPLETE, do not use it as a baseline:\n  ' + errors.join('\n  '));
  process.exit(1);
}
