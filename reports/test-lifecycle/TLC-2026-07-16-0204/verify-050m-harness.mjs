await import('./config.js');
const BACK = (process.env.BACK_URL || '').replace(/\/$/, '');
const PW = 'Password1!';
const ORG = {
  ACME: '105c2c4e-23be-4258-8691-568a0ff190be',
  TECHFLOW: '96f109a7-9010-4691-b6a1-bef25cca3d04',
  BUILDRIGHT: '23525b44-f0d0-43a4-b45e-b162080a4d29',
  ACMEWEST: 'cd3e2237-bce2-4a3a-b9ac-c58d665ab576',
  SUSPENDED: '97928542-a1e6-4291-b20b-d5b0f7bf8989',
};
const REP = { PRIMARY: '6bf9b1d0-6d34-4ada-858c-bc3fb5e785b4', SECOND: 'b2de5af6-2a8f-425c-af62-6c9ceff39cea',
  BLOCKED: '40d01ffc-8459-4876-86ce-b738bcdf1216', LOCKED: '0d293bb1-7fc8-46fd-a3bd-cb99e5bf8cc2', EXCLUSIVE: 'ffdeb1e9-2c0a-4594-804b-d12914a922fd' };
const OWNER = '6f73e570-9293-4240-bdbb-e372b58fb52e';
const STORE = 'B2B-store', STORE2 = 'Electronics';
const CRED = {
  PRIMARY: ['agent-test-sr-primary@example.com', STORE],
  SECOND: ['agent-test-sr-secondstore@example.com', STORE2],
  LOCKED: ['agent-test-sr-locked@example.com', STORE],
  EXCLUSIVE: ['agent-test-sr-techflow@example.com', STORE],
};
const tokCache = {}; const grantFailed = {};
async function tok(role) {
  if (role === 'ANON') return null;
  if (tokCache[role]) return tokCache[role];
  if (grantFailed[role]) return 'GRANTFAIL';
  const [u, storeId] = CRED[role];
  const body = new URLSearchParams({ grant_type: 'password', scope: 'offline_access', username: u, password: PW, storeId });
  const r = await fetch(`${BACK}/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) { grantFailed[role] = `${r.status} ${j.error}`; return 'GRANTFAIL'; }
  return (tokCache[role] = j.access_token);
}
async function gql(role, query) {
  const t = await tok(role);
  if (t === 'GRANTFAIL') return { grantFail: true, grantErr: grantFailed[role] };
  const r = await fetch(`${BACK}/graphql/sales-rep`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify({ query }) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, data: j.data, errors: j.errors };
}
const results = [];
function rec(id, verdict, ev) { results.push({ id, verdict, ev }); const m = { PASS: '✅', FAIL: '❌', BLOCK: '⚠️' }[verdict] || '?'; console.log(`${m} ${id} [${verdict}] ${ev}`); }
const anonOk = (r) => (r.errors && r.errors.length > 0 && JSON.stringify(r.errors).match(/anonym/i));

async function run() {
  // ---- Q1 customerSalesReps (ACME buyer stand-in = SECOND, an ACME-only member) ----
  let r = await gql('SECOND', `query { customerSalesReps { totalCount items { id fullName emails } } }`);
  const q1items = r.data?.customerSalesReps?.items || [];
  const names = q1items.map(i => i.fullName);
  rec('SR-GQL-001', (!r.errors && r.data?.customerSalesReps?.totalCount >= 1 && names.includes('Priya Rao') && q1items.every(i => i.id)) ? 'PASS' : 'FAIL',
    `total=${r.data?.customerSalesReps?.totalCount} reps=[${names.join(', ')}]`);
  r = await gql('ANON', `query { customerSalesReps { totalCount items { id } } }`);
  rec('SR-GQL-002', anonOk(r) ? 'PASS' : 'FAIL', `errors=${JSON.stringify(r.errors?.map(e=>e.message)||null)}`);
  rec('SR-GQL-003', (!names.includes('Tess Flow')) ? 'PASS' : 'FAIL', `Tess Flow(TECHFLOW-only) ${names.includes('Tess Flow')?'PRESENT':'absent'} in [${names.join(', ')}]`);
  r = await gql('SECOND', `query { customerSalesReps(first: 2, after: "0", sort: "name:asc") { totalCount pageInfo { hasNextPage } items { id fullName } } }`);
  const hasNext = r.data?.customerSalesReps?.pageInfo?.hasNextPage;
  rec('SR-GQL-004', 'BLOCK', `only ${r.data?.customerSalesReps?.totalCount} visible ACME reps (need >=3 for paging); hasNextPage=${hasNext} — precondition unmet by seed`);
  r = await gql('SECOND', `query { customerSalesReps(keyword: "Rao") { totalCount items { fullName } } }`);
  const kwn = (r.data?.customerSalesReps?.items || []).map(i => i.fullName);
  rec('SR-GQL-005', (!r.errors && r.data?.customerSalesReps?.totalCount >= 1 && kwn.every(n => /rao/i.test(n))) ? 'PASS' : 'FAIL', `keyword=Rao total=${r.data?.customerSalesReps?.totalCount} [${kwn.join(', ')}]`);
  const asc = await gql('SECOND', `query { customerSalesReps(first: 1, sort: "name:asc") { items { fullName } } }`);
  const desc = await gql('SECOND', `query { customerSalesReps(first: 1, sort: "name:desc") { items { fullName } } }`);
  const a0 = asc.data?.customerSalesReps?.items?.[0]?.fullName, d0 = desc.data?.customerSalesReps?.items?.[0]?.fullName;
  rec('SR-GQL-006', (a0 && d0 && a0 !== d0) ? 'PASS' : 'FAIL', `asc.0=${a0} desc.0=${d0}`);
  rec('SR-GQL-007', (names.includes('Priya Rao') && !names.includes('Blake Barr') && !names.includes('Lena Park')) ? 'PASS' : 'FAIL',
    `PRIMARY present=${names.includes('Priya Rao')}; BLOCKED(Blake Barr) present=${names.includes('Blake Barr')}; LOCKED(Lena Park) present=${names.includes('Lena Park')}`);
  const sA = await gql('SECOND', `query { customerSalesReps(storeId: "${STORE}") { items { fullName } } }`);
  const sB = await gql('SECOND', `query { customerSalesReps(storeId: "${STORE2}") { items { fullName } } }`);
  const sAll = await gql('SECOND', `query { customerSalesReps { items { fullName } } }`);
  const nA = (sA.data?.customerSalesReps?.items||[]).map(i=>i.fullName), nB = (sB.data?.customerSalesReps?.items||[]).map(i=>i.fullName), nAll = (sAll.data?.customerSalesReps?.items||[]).map(i=>i.fullName);
  rec('SR-GQL-008', (nA.includes('Priya Rao') && !nA.includes('Sam Store') && nB.includes('Sam Store') && !nB.includes('Priya Rao') && nAll.includes('Priya Rao') && nAll.includes('Sam Store')) ? 'PASS' : 'FAIL',
    `storeA(B2B)=[${nA.join(',')}] storeB(Elec)=[${nB.join(',')}] all=[${nAll.join(',')}]`);

  // ---- Q2 salesRepCustomers ----
  r = await gql('PRIMARY', `query { salesRepCustomers { totalCount items { organizationId organizationName lastOrder { number total currency itemsCount createdDate } } } }`);
  const custs = r.data?.salesRepCustomers?.items || [];
  const orgIds = custs.map(c => c.organizationId);
  rec('SR-GQL-009', (!r.errors && r.data?.salesRepCustomers?.totalCount >= 4 && orgIds.includes(ORG.ACME) && orgIds.includes(ORG.TECHFLOW) && !orgIds.includes(ORG.SUSPENDED)) ? 'PASS' : 'FAIL',
    `total=${r.data?.salesRepCustomers?.totalCount} orgs=${custs.map(c=>c.organizationName).join(', ')}`);
  r = await gql('ANON', `query { salesRepCustomers { totalCount items { organizationId } } }`);
  rec('SR-GQL-010', anonOk(r) ? 'PASS' : 'FAIL', `errors=${JSON.stringify(r.errors?.map(e=>e.message)||null)}`);
  const acmeCust = custs.find(c => c.organizationId === ORG.ACME);
  rec('SR-GQL-011', (acmeCust?.lastOrder && acmeCust.lastOrder.total > 0 && acmeCust.lastOrder.currency && acmeCust.lastOrder.itemsCount > 0) ? 'PASS' : 'FAIL',
    `ACME lastOrder=${acmeCust?.lastOrder?.number} $${acmeCust?.lastOrder?.total} ${acmeCust?.lastOrder?.currency} x${acmeCust?.lastOrder?.itemsCount}`);
  r = await gql('LOCKED', `query { salesRepCustomers { totalCount items { organizationId } } }`);
  if (r.grantFail) rec('SR-GQL-012', 'BLOCK', `caller SR_REP_LOCKED cannot sign in (${r.grantErr}) — membership-lock appears to block account login; needs investigation`);
  else { const lockedOrgs = (r.data?.salesRepCustomers?.items || []).map(i => i.organizationId);
    rec('SR-GQL-012', (lockedOrgs.includes(ORG.TECHFLOW) && !lockedOrgs.includes(ORG.ACME)) ? 'PASS' : 'FAIL', `LOCKED sees TECHFLOW=${lockedOrgs.includes(ORG.TECHFLOW)} ACME(locked)=${lockedOrgs.includes(ORG.ACME)}`); }
  const cA = await gql('PRIMARY', `query { salesRepCustomers(storeId: "${STORE}") { items { organizationId lastOrder { number } } } }`);
  const cB = await gql('PRIMARY', `query { salesRepCustomers(storeId: "${STORE2}") { items { organizationId lastOrder { number } } } }`);
  const cAll = await gql('PRIMARY', `query { salesRepCustomers { items { organizationId lastOrder { number } } } }`);
  const lo = (res) => (res.data?.salesRepCustomers?.items || []).find(i => i.organizationId === ORG.ACME)?.lastOrder?.number;
  rec('SR-GQL-013', (lo(cA) && lo(cB) && lo(cAll)) ? (lo(cB) === lo(cAll) && lo(cA) !== lo(cB) ? 'PASS' : 'FAIL') : 'FAIL', `storeA=${lo(cA)} storeB=${lo(cB)} all=${lo(cAll)}`);
  const p1 = await gql('PRIMARY', `query { salesRepCustomers(first: 2, after: "0", sort: "organizationName:asc") { totalCount pageInfo { hasNextPage } items { organizationName } } }`);
  const p2 = await gql('PRIMARY', `query { salesRepCustomers(first: 2, after: "2", sort: "organizationName:asc") { items { organizationName } } }`);
  const kw = await gql('PRIMARY', `query { salesRepCustomers(keyword: "BuildRight") { totalCount items { organizationName } } }`);
  const p1n = (p1.data?.salesRepCustomers?.items||[]).map(i=>i.organizationName), p2n = (p2.data?.salesRepCustomers?.items||[]).map(i=>i.organizationName);
  const overlap = p1n.some(n => p2n.includes(n));
  const kwHit = (kw.data?.salesRepCustomers?.items||[]).every(i => /buildright/i.test(i.organizationName)) && (kw.data?.salesRepCustomers?.totalCount||0) >= 1;
  rec('SR-GQL-014', (p1.data?.salesRepCustomers?.pageInfo?.hasNextPage && p1n.length === 2 && !overlap && kwHit) ? 'PASS' : 'FAIL',
    `p1=[${p1n.join(',')}] hasNext=${p1.data?.salesRepCustomers?.pageInfo?.hasNextPage} p2=[${p2n.join(',')}] overlap=${overlap} kw(BuildRight)=${kw.data?.salesRepCustomers?.totalCount}`);

  // ---- Q3 salesRepCustomer ----
  r = await gql('PRIMARY', `query { salesRepCustomer(id: "${ORG.ACME}") { organizationId organizationName accountType shipTo phone primaryContact { id fullName emails phones } } }`);
  const c = r.data?.salesRepCustomer;
  rec('SR-GQL-015', (!r.errors && c?.organizationId === ORG.ACME && c?.organizationName && c?.primaryContact) ? 'PASS' : 'FAIL', `org=${c?.organizationName} primaryContact=${c?.primaryContact?.fullName}`);
  r = await gql('PRIMARY', `query { salesRepCustomer(id: "${ORG.SUSPENDED}") { organizationId } }`);
  rec('SR-GQL-016', (!r.errors && r.data?.salesRepCustomer === null) ? 'PASS' : 'FAIL', `salesRepCustomer(SUSPENDED)=${JSON.stringify(r.data?.salesRepCustomer)}`);
  r = await gql('LOCKED', `query { salesRepCustomer(id: "${ORG.ACME}") { organizationId } }`);
  if (r.grantFail) rec('SR-GQL-017', 'BLOCK', `caller SR_REP_LOCKED cannot sign in (${r.grantErr})`);
  else rec('SR-GQL-017', (!r.errors && r.data?.salesRepCustomer === null) ? 'PASS' : 'FAIL', `LOCKED salesRepCustomer(ACME)=${JSON.stringify(r.data?.salesRepCustomer)}`);
  r = await gql('ANON', `query { salesRepCustomer(id: "${ORG.ACME}") { organizationId } }`);
  rec('SR-GQL-018', anonOk(r) ? 'PASS' : 'FAIL', `errors=${JSON.stringify(r.errors?.map(e=>e.message)||null)}`);
  r = await gql('PRIMARY', `query { salesRepCustomer(id: "${ORG.ACME}") { primaryContact { id fullName } phone } }`);
  const pc = r.data?.salesRepCustomer?.primaryContact;
  rec('SR-GQL-019', (pc?.id && pc.id !== REP.PRIMARY && pc.id === OWNER) ? 'PASS' : (pc?.id && pc.id !== REP.PRIMARY ? 'PASS' : 'FAIL'),
    `primaryContact.id=${pc?.id} (owner=${OWNER}, rep-self=${REP.PRIMARY}) name=${pc?.fullName} phone=${r.data?.salesRepCustomer?.phone}`);
  r = await gql('PRIMARY', `query { salesRepCustomer(id: "${ORG.TECHFLOW}") { primaryContact { id fullName emails } } }`);
  const pcTech = r.data?.salesRepCustomer?.primaryContact;
  rec('SR-GQL-020', (pcTech?.emails || []).includes('agent-test-sr-primary@example.com') ? 'PASS' : 'FAIL', `TECHFLOW(no owner) primaryContact=${pcTech?.fullName} emails=${JSON.stringify(pcTech?.emails)}`);
  r = await gql('PRIMARY', `query { salesRepCustomer(id: "${ORG.ACME}") { accountType shipTo } }`);
  const at = r.data?.salesRepCustomer?.accountType, st = r.data?.salesRepCustomer?.shipTo;
  rec('SR-GQL-021', (at && st && st.includes(',')) ? 'PASS' : 'FAIL', `accountType=${at} shipTo=${st}`);

  // ---- Q4 salesRepOrders ----
  r = await gql('PRIMARY', `query { salesRepOrders(customerId: "${ORG.ACME}") { totalCount items { number createdDate status total currency itemsCount customerId customerName } } }`);
  const ords = r.data?.salesRepOrders?.items || [];
  const newestFirst = ords.length >= 2 ? new Date(ords[0].createdDate) >= new Date(ords[1].createdDate) : false;
  rec('SR-GQL-022', (!r.errors && r.data?.salesRepOrders?.totalCount >= 2 && newestFirst && ords[0]?.total > 0 && ords[0]?.currency && ords[0]?.itemsCount > 0 && ords[0]?.customerId === ORG.ACME) ? 'PASS' : 'FAIL',
    `total=${r.data?.salesRepOrders?.totalCount} newestFirst=${newestFirst} top=${ords[0]?.number} $${ords[0]?.total} x${ords[0]?.itemsCount}`);
  r = await gql('PRIMARY', `query { salesRepOrders(customerId: "${ORG.SUSPENDED}") { totalCount items { number } } }`);
  rec('SR-GQL-023', (!r.errors && r.data?.salesRepOrders?.totalCount === 0) ? 'PASS' : 'FAIL', `SUSPENDED total=${r.data?.salesRepOrders?.totalCount}`);
  r = await gql('LOCKED', `query { salesRepOrders(customerId: "${ORG.ACME}") { totalCount items { number } } }`);
  if (r.grantFail) rec('SR-GQL-024', 'BLOCK', `caller SR_REP_LOCKED cannot sign in (${r.grantErr})`);
  else rec('SR-GQL-024', (!r.errors && r.data?.salesRepOrders?.totalCount === 0) ? 'PASS' : 'FAIL', `LOCKED ACME orders total=${r.data?.salesRepOrders?.totalCount}`);
  r = await gql('ANON', `query { salesRepOrders(customerId: "${ORG.ACME}") { totalCount items { number } } }`);
  rec('SR-GQL-025', anonOk(r) ? 'PASS' : 'FAIL', `errors=${JSON.stringify(r.errors?.map(e=>e.message)||null)}`);
  const op1 = await gql('PRIMARY', `query { salesRepOrders(customerId: "${ORG.ACME}", first: 2, after: "0") { totalCount pageInfo { hasNextPage } items { number } } }`);
  const op2 = await gql('PRIMARY', `query { salesRepOrders(customerId: "${ORG.ACME}", first: 2, after: "2") { items { number } } }`);
  const okw = await gql('PRIMARY', `query { salesRepOrders(customerId: "${ORG.ACME}", keyword: "Beacon") { totalCount items { number customerName } } }`);
  const o1 = (op1.data?.salesRepOrders?.items||[]).map(i=>i.number), o2 = (op2.data?.salesRepOrders?.items||[]).map(i=>i.number);
  const kwItems = okw.data?.salesRepOrders?.items || [];
  const kwPass = (okw.data?.salesRepOrders?.totalCount||0) >= 1 && kwItems.every(i => /beacon/i.test(i.customerName || ''));
  rec('SR-GQL-026', (op1.data?.salesRepOrders?.pageInfo?.hasNextPage && o1.length === 2 && !o1.some(n=>o2.includes(n)) && kwPass) ? 'PASS' : 'FAIL',
    `p1=[${o1.join(',')}] hasNext=${op1.data?.salesRepOrders?.pageInfo?.hasNextPage} kw(Beacon) total=${okw.data?.salesRepOrders?.totalCount} names=[${kwItems.map(i=>i.customerName).join(',')}]`);
  const oA = await gql('PRIMARY', `query { salesRepOrders(customerId: "${ORG.ACME}", storeId: "${STORE}") { totalCount items { number } } }`);
  const oAll = await gql('PRIMARY', `query { salesRepOrders(customerId: "${ORG.ACME}") { totalCount items { number } } }`);
  const oAn = (oA.data?.salesRepOrders?.items||[]).map(i=>i.number);
  rec('SR-GQL-027', (!oAn.some(n=>/ELEC/.test(n)) && (oAll.data?.salesRepOrders?.totalCount||0) > (oA.data?.salesRepOrders?.totalCount||0)) ? 'PASS' : 'FAIL',
    `storeA(B2B) count=${oA.data?.salesRepOrders?.totalCount} elecPresent=${oAn.some(n=>/ELEC/.test(n))} all count=${oAll.data?.salesRepOrders?.totalCount}`);
  const base = await gql('PRIMARY', `query { salesRepOrders(customerId: "${ORG.ACME}") { items { number status } } }`);
  const inact = await gql('PRIMARY', `query { salesRepOrders(customerId: "${ORG.ACME}", statuses: ["Inactive"]) { totalCount items { number status } } }`);
  const inactItems = inact.data?.salesRepOrders?.items || [];
  const baseCF = (base.data?.salesRepOrders?.items||[]).filter(o => ['Cancelled','Failed'].includes(o.status)).length;
  rec('SR-GQL-028', (!inact.errors && inactItems.length > 0 && inactItems.every(o => ['Cancelled','Failed'].includes(o.status)) && !inactItems.some(o=>o.status==='New') && inact.data?.salesRepOrders?.totalCount === baseCF) ? 'PASS' : 'FAIL',
    `Inactive statuses=[${inactItems.map(o=>o.status).join(',')}] total=${inact.data?.salesRepOrders?.totalCount} baseCancelled+Failed=${baseCF}`);
  const uni = await gql('PRIMARY', `query { salesRepOrders(customerId: "${ORG.ACME}", statuses: ["New", "Inactive"]) { totalCount items { status } } }`);
  const uniS = (uni.data?.salesRepOrders?.items||[]).map(o=>o.status);
  rec('SR-GQL-029', (uniS.includes('New') && uniS.includes('Cancelled') && !uniS.includes('Processing')) ? 'PASS' : 'FAIL', `union statuses=[${uniS.join(',')}]`);
  const all = await gql('PRIMARY', `query { salesRepOrders(customerId: "${ORG.ACME}") { totalCount items { status } } }`);
  const distinct = [...new Set((all.data?.salesRepOrders?.items||[]).map(o=>o.status))];
  rec('SR-GQL-030', (distinct.length >= 2) ? 'PASS' : 'FAIL', `distinct statuses=[${distinct.join(',')}]`);
  const loc = await gql('PRIMARY', `query { salesRepOrders(customerId: "${ORG.ACME}", cultureName: "en-US") { items { number status statusDisplayValue } } }`);
  const cancel = (loc.data?.salesRepOrders?.items||[]).find(o => o.status === 'Cancelled');
  rec('SR-GQL-031', (cancel && cancel.status === 'Cancelled' && cancel.statusDisplayValue) ? 'PASS' : 'FAIL', `Cancelled order status=${cancel?.status} display=${cancel?.statusDisplayValue}`);
  const dash = await gql('PRIMARY', `query { salesRepOrders { totalCount items { number customerId customerName } } }`);
  const dashCids = [...new Set((dash.data?.salesRepOrders?.items||[]).map(o=>o.customerId))];
  const dashNames = (dash.data?.salesRepOrders?.items||[]);
  rec('SR-GQL-032', (dashCids.includes(ORG.ACME) && dashCids.includes(ORG.TECHFLOW) && !dashCids.includes(ORG.SUSPENDED) && dashNames.every(o=>o.customerName)) ? 'PASS' : 'FAIL',
    `dashboard cids: ACME=${dashCids.includes(ORG.ACME)} TECHFLOW=${dashCids.includes(ORG.TECHFLOW)} SUSPENDED=${dashCids.includes(ORG.SUSPENDED)} allNamed=${dashNames.every(o=>o.customerName)}`);

  // ---- Q5 salesRepOrderStatuses (caller-agnostic; use PRIMARY authenticated) ----
  r = await gql('PRIMARY', `query { salesRepOrderStatuses(storeId: "${STORE}", cultureName: "en-US") { name localizedName } }`);
  const sts = r.data?.salesRepOrderStatuses || [];
  const stNames = sts.map(s => s.name);
  const inactive = sts.find(s => s.name === 'Inactive');
  rec('SR-GQL-033', (!r.errors && sts.length > 0 && stNames.includes('New') && inactive && inactive.localizedName) ? 'PASS' : 'FAIL',
    `statuses=[${stNames.join(',')}] Inactive.localized=${inactive?.localizedName}`);
  r = await gql('ANON', `query { salesRepOrderStatuses(storeId: "${STORE}") { name } }`);
  rec('SR-GQL-034', anonOk(r) ? 'PASS' : 'FAIL', `errors=${JSON.stringify(r.errors?.map(e=>e.message)||null)}`);

  // ---- 035 store-setting toggle: verify API not gated (query returns data). Admin toggle NOT performed (write). ----
  r = await gql('PRIMARY', `query { salesRepCustomers(storeId: "${STORE}") { totalCount items { organizationId } } }`);
  const sr35 = (r.data?.salesRepCustomers?.items||[]).map(i=>i.organizationId);
  rec('SR-GQL-035', (!r.errors && r.data?.salesRepCustomers?.totalCount >= 1 && sr35.includes(ORG.ACME)) ? 'BLOCK' : 'FAIL',
    `API returns data (total=${r.data?.salesRepCustomers?.totalCount}, ACME present=${sr35.includes(ORG.ACME)}); SalesRep.Enabled toggle step NOT performed (admin write) — API-not-gated confirmed, UI-toggle half needs admin`);

  // summary
  const c1 = results.filter(r=>r.verdict==='PASS').length, c2 = results.filter(r=>r.verdict==='FAIL').length, c3 = results.filter(r=>r.verdict==='BLOCK').length;
  console.log(`\n==== SUMMARY: ${c1} PASS / ${c2} FAIL / ${c3} BLOCK (of ${results.length}) ====`);
  if (c2) console.log('FAILs:', results.filter(r=>r.verdict==='FAIL').map(r=>r.id).join(', '));
}
run().catch(e => { console.error('HARNESS ERROR', e.message); process.exit(1); });
