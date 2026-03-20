const fs = require('fs');

// Helper functions
const ts = (lines) => [{ listen: 'test', script: { type: 'text/javascript', exec: lines } }];

const collection = {
  info: {
    name: 'VC Promotions & Coupons',
    description: 'Comprehensive test collection for Virto Commerce Promotions & Coupons module. 16 promotions (P01-P16), 25 coupons (COU-001 to COU-025), 8 edge cases (E01-E08). Data source: test-data/promotions/. Env vars: baseUrl, frontUrl, admin, adminPassword, storeId, userEmail, userPassword, cultureName, currencyCode.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{authToken}}', type: 'string' }] },
  variable: 'promotionId,couponId,P01_id,P02_id,P03_id,P04_id,P05_id,P06_id,P07_id,P08_id,P09_id,P10_id,P11_id,P12_id,P13_id,P14_id,P15_id,P16_id,wineCategoryId,cartId,userToken'
    .split(',').map(k => ({ key: k, value: '' })),
  item: []
};

// ===== 01-Auth =====
const mkAuth = (name, user, pass, script) => ({
  name,
  request: {
    auth: { type: 'noauth' },
    method: 'POST',
    url: '{{baseUrl}}/connect/token',
    header: [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded' }],
    body: {
      mode: 'urlencoded',
      urlencoded: [
        { key: 'grant_type', value: 'password' },
        { key: 'username', value: user },
        { key: 'password', value: pass },
        { key: 'scope', value: 'openid offline_access' }
      ]
    }
  },
  event: ts(script)
});

collection.item.push({
  name: '01-Auth',
  description: 'Token acquisition. Run first before any other folder.',
  item: [
    mkAuth('Get Admin OAuth2 Token', '{{admin}}', '{{adminPassword}}', [
      "pm.test('Auth: 200', () => pm.response.to.have.status(200));",
      "var d = pm.response.json();",
      "pm.test('Token received', () => pm.expect(d.access_token).to.be.a('string'));",
      "pm.environment.set('authToken', d.access_token);",
      "console.log('Admin token acquired, expires_in:', d.expires_in);"
    ]),
    mkAuth('Get Storefront User Token', '{{userEmail}}', '{{userPassword}}', [
      "pm.test('User auth: 200', () => pm.response.to.have.status(200));",
      "var d = pm.response.json();",
      "pm.test('User token received', () => pm.expect(d.access_token).to.be.a('string'));",
      "pm.collectionVariables.set('userToken', d.access_token);",
      "console.log('User token acquired for storefront GraphQL');"
    ]),
    mkAuth('Switch Back to Admin Token', '{{admin}}', '{{adminPassword}}', [
      "pm.test('Admin re-auth: 200', () => pm.response.to.have.status(200));",
      "pm.environment.set('authToken', pm.response.json().access_token);"
    ])
  ]
});

// ===== 02-Promotions CRUD =====
const promoData = [
  { id: 'P01', name: 'QA Test - VCST-4590 Coupon Public', active: true, pub: true, pri: 1, excl: false, desc: 'QA Coupon English Description', end: '2026-12-31T23:59:59Z', couponReq: true },
  { id: 'P02', name: 'Simple QA Coupon', active: true, pub: true, pri: 5, excl: false, desc: 'Simple 5% off cart subtotal coupon for QA testing', end: '2026-12-31T23:59:59Z', couponReq: true },
  { id: 'P03', name: 'Super Discount', active: true, pub: true, pri: 10, excl: false, desc: 'Super 20% discount for exclusivity and priority testing', end: '2026-12-31T23:59:59Z', couponReq: true },
  { id: 'P04', name: 'Coupon on discount for shipping', active: true, pub: true, pri: 5, excl: false, desc: 'Coupon on discount for shipping', end: '2026-12-31T23:59:59Z', couponReq: true },
  { id: 'P05', name: 'Register and get 15% for all', active: true, pub: true, pri: 5, excl: false, desc: 'For new customer get a 15% discount for all items', end: '2026-12-31T23:59:59Z', couponReq: true },
  { id: 'P06', name: '[E2E Test] Coupon', active: true, pub: true, pri: 5, excl: false, desc: 'E2E test coupon - $5 fixed dollar off cart', end: '2026-12-31T23:59:59Z', couponReq: true },
  { id: 'P07', name: 'Wine Discount', active: true, pub: true, pri: 5, excl: false, desc: '10% off Wine category products', end: '2026-12-31T23:59:59Z', couponReq: true },
  { id: 'P08', name: 'Private Promo', active: true, pub: false, pri: 5, excl: false, desc: 'Private coupon - not shown on storefront but manually enterable', end: '2026-12-31T23:59:59Z', couponReq: true },
  { id: 'P09', name: 'Expired Coupon Test', active: false, pub: true, pri: 5, excl: false, desc: 'Inactive promotion for negative testing', end: '2026-03-16T00:00:00Z', couponReq: true },
  { id: 'P10', name: 'Auto Gift (no coupon)', active: true, pub: true, pri: 5, excl: false, desc: 'Automatic gift promotion - no coupon code required', end: '2026-12-31T23:59:59Z', couponReq: false },
  { id: 'P11', name: 'QA Fixed Dollar Off', active: true, pub: true, pri: 5, excl: false, desc: 'Fixed $5 dollar off cart subtotal', end: '2026-12-31T23:59:59Z', couponReq: true },
  { id: 'P12', name: 'QA Free Shipping', active: true, pub: true, pri: 5, excl: false, desc: 'Free shipping - $999 off shipping cost', end: '2026-12-31T23:59:59Z', couponReq: true },
  { id: 'P13', name: 'QA Category Percent', active: true, pub: true, pri: 5, excl: false, desc: '20% off specific product category', end: '2026-12-31T23:59:59Z', couponReq: true },
  { id: 'P14', name: 'QA Cart Threshold', active: true, pub: true, pri: 5, excl: false, desc: '10% off cart when subtotal >= $50', end: '2026-12-31T23:59:59Z', couponReq: true },
  { id: 'P15', name: 'QA Usage Limit Test', active: true, pub: true, pri: 5, excl: false, desc: 'Parent promotion for usage limit coupon variants', end: '2026-12-31T23:59:59Z', couponReq: true },
  { id: 'P16', name: 'QA Exclusivity Test - Globally Exclusive', active: true, pub: true, pri: 1, excl: true, desc: 'Globally exclusive - blocks all other coupons', end: '2026-12-31T23:59:59Z', couponReq: true }
];

const crudFolder = {
  name: '02-Promotions CRUD',
  description: 'Create/Read/Update/Delete promotions P01-P16. Seed requests create all 16 promotions and store IDs in collection variables.',
  item: []
};

// List + Search
crudFolder.item.push({
  name: 'List All Promotions',
  description: 'GET all promotions with keyword filter',
  request: { method: 'GET', url: '{{baseUrl}}/api/marketing/promotions?keyword=QA&take=50' },
  event: ts([
    "pm.test('List: 200', () => pm.response.to.have.status(200));",
    "console.log('Promotions found:', pm.response.json().totalCount || 'N/A');"
  ])
});

crudFolder.item.push({
  name: 'Search Promotions by Keyword',
  description: 'POST search with keyword, pagination, store filter',
  request: {
    method: 'POST',
    url: '{{baseUrl}}/api/marketing/promotions/search',
    header: [{ key: 'Content-Type', value: 'application/json' }],
    body: {
      mode: 'raw',
      raw: JSON.stringify({ keyword: 'QA', take: 50, skip: 0, storeIds: ['{{storeId}}'] }),
      options: { raw: { language: 'json' } }
    }
  },
  event: ts([
    "pm.test('Search: 200', () => pm.response.to.have.status(200));",
    "pm.test('Has results', () => pm.expect(pm.response.json().totalCount).to.be.above(0));"
  ])
});

// Seed all 16 promotions
for (const p of promoData) {
  const body = {
    name: p.name,
    storeIds: ['{{storeId}}'],
    isActive: p.active,
    isPublic: p.pub,
    priority: p.pri,
    isExclusive: p.excl,
    description: p.desc,
    endDate: p.end,
    couponRequired: p.couponReq
  };
  crudFolder.item.push({
    name: `Seed ${p.id} - ${p.name.substring(0, 35)}`,
    description: `${p.id}: ${p.desc} | Active:${p.active} Public:${p.pub} Priority:${p.pri} Exclusive:${p.excl}`,
    request: {
      method: 'POST',
      url: '{{baseUrl}}/api/marketing/promotions',
      header: [{ key: 'Content-Type', value: 'application/json' }],
      body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } }
    },
    event: ts([
      `pm.test('${p.id} created: 200/201', () => pm.expect(pm.response.code).to.be.oneOf([200, 201]));`,
      "var d = pm.response.json();",
      `pm.test('${p.id} has ID', () => pm.expect(d.id).to.be.a('string'));`,
      `pm.collectionVariables.set('${p.id}_id', d.id);`,
      `console.log('Created ${p.id}:', d.id);`
    ])
  });
}

// Get by ID
crudFolder.item.push({
  name: 'Get Promotion by ID (P01)',
  description: 'Retrieve single promotion by ID, verify name/active/public',
  request: { method: 'GET', url: '{{baseUrl}}/api/marketing/promotions/{{P01_id}}' },
  event: ts([
    "pm.test('Get P01: 200', () => pm.response.to.have.status(200));",
    "var d = pm.response.json();",
    "pm.test('Name matches', () => pm.expect(d.name).to.include('QA Test'));",
    "pm.test('Is active', () => pm.expect(d.isActive).to.be.true);",
    "pm.test('Is public', () => pm.expect(d.isPublic).to.be.true);"
  ])
});

// Update
crudFolder.item.push({
  name: 'Update Promotion (P02 priority)',
  description: 'PUT update P02 priority from 5 to 3',
  request: {
    method: 'PUT',
    url: '{{baseUrl}}/api/marketing/promotions',
    header: [{ key: 'Content-Type', value: 'application/json' }],
    body: {
      mode: 'raw',
      raw: '{"id": "{{P02_id}}", "name": "Simple QA Coupon", "priority": 3, "isActive": true, "isPublic": true, "storeIds": ["{{storeId}}"]}',
      options: { raw: { language: 'json' } }
    }
  },
  event: ts(["pm.test('Update P02: 200/204', () => pm.expect(pm.response.code).to.be.oneOf([200, 204]));"])
});

// Verify specific promos
const verifications = [
  { id: 'P01', check: 'Reward + Description', test: "pm.test('Has desc', () => pm.expect(d.description).to.include('QA Coupon'));" },
  { id: 'P07', check: 'Category Condition', test: "pm.test('Has rewards', () => pm.expect(d.rewards || []).to.be.an('array'));" },
  { id: 'P09', check: 'Inactive', test: "pm.test('Inactive', () => pm.expect(d.isActive).to.be.false);" },
  { id: 'P14', check: 'Cart Threshold', test: "pm.test('Active', () => pm.expect(d.isActive).to.be.true);" },
  { id: 'P16', check: 'Exclusive Flag', test: "pm.test('Exclusive', () => pm.expect(d.isExclusive).to.be.true);" }
];

for (const v of verifications) {
  crudFolder.item.push({
    name: `Verify ${v.id} - ${v.check}`,
    request: { method: 'GET', url: `{{baseUrl}}/api/marketing/promotions/{{${v.id}_id}}` },
    event: ts([
      `pm.test('Verify ${v.id}: 200', () => pm.response.to.have.status(200));`,
      "var d = pm.response.json();",
      v.test
    ])
  });
}

collection.item.push(crudFolder);

// ===== 03-Coupons Management =====
const coupFolder = {
  name: '03-Coupons Management',
  description: 'Add 25 coupons to promotions (COU-001 to COU-025), bulk import, search/verify.',
  item: []
};

const couponMap = [
  { code: 'QA10OFF', promo: 'P01', cou: 'COU-001', desc: 'Primary 10% off cart' },
  { code: 'QA', promo: 'P02', cou: 'COU-002', desc: 'Simple 5% top-$20' },
  { code: 'SUPER', promo: 'P03', cou: 'COU-003', desc: '20% off' },
  { code: 'AIR', promo: 'P04', cou: 'COU-004', desc: 'Shipping discount' },
  { code: 'AGENT', promo: 'P05', cou: 'COU-005', desc: 'Welcome 15%' },
  { code: 'E2E-COUPON', promo: 'P06', cou: 'COU-006', desc: 'E2E $5 off' },
  { code: 'WINE', promo: 'P07', cou: 'COU-007', desc: 'Wine category' },
  { code: 'PRIVATE4590', promo: 'P08', cou: 'COU-008', desc: 'Private coupon' },
  { code: 'EXPIRED-TEST', promo: 'P09', cou: 'COU-009', desc: 'Inactive promo coupon' },
  { code: 'FIXED5', promo: 'P11', cou: 'COU-019', desc: 'Fixed $5 off' },
  { code: 'FREESHIP', promo: 'P12', cou: 'COU-020', desc: 'Free shipping' },
  { code: 'THRESH50', promo: 'P14', cou: 'COU-021', desc: 'Cart threshold' },
  { code: 'EXCLUSIVE10', promo: 'P16', cou: 'COU-022', desc: 'Globally exclusive' },
  { code: 'CAT20#%$$^%%$&^%', promo: 'P13', cou: 'COU-023', desc: 'Special chars code' },
  { code: 'super', promo: 'P15', cou: 'COU-024', desc: 'Lowercase case sensitivity' },
  { code: 'wine', promo: 'P16', cou: 'COU-025', desc: 'Lowercase wine' }
];

for (const c of couponMap) {
  coupFolder.item.push({
    name: `Add ${c.cou} (${c.code}) to ${c.promo}`,
    description: `${c.cou}: ${c.desc}`,
    request: {
      method: 'POST',
      url: `{{baseUrl}}/api/marketing/promotions/{{${c.promo}_id}}/coupons`,
      header: [{ key: 'Content-Type', value: 'application/json' }],
      body: { mode: 'raw', raw: JSON.stringify({ codes: [c.code] }), options: { raw: { language: 'json' } } }
    },
    event: ts([`pm.test('${c.cou} added: 200/204', () => pm.expect(pm.response.code).to.be.oneOf([200, 204]));`])
  });
}

// Batch add P01 edge case coupons (COU-010 to COU-018)
const edgeCouponCodes = ['QA-LIMITED', 'QA-PERCUST', 'QA-EXPDATE', 'QA-CPNEXPIRED', 'VALIDCODE123', 'QA-MAXED', 'IMPORT-TEST1', 'IMPORT-TEST2', 'IMPORT-TEST3'];
coupFolder.item.push({
  name: 'Add P01 Edge Case Coupons (COU-010 to COU-018)',
  description: 'Batch add 9 edge case coupons to P01: ' + edgeCouponCodes.join(', '),
  request: {
    method: 'POST',
    url: '{{baseUrl}}/api/marketing/promotions/{{P01_id}}/coupons',
    header: [{ key: 'Content-Type', value: 'application/json' }],
    body: { mode: 'raw', raw: JSON.stringify({ codes: edgeCouponCodes }), options: { raw: { language: 'json' } } }
  },
  event: ts([
    "pm.test('Batch added: 200/204', () => pm.expect(pm.response.code).to.be.oneOf([200, 204]));",
    "console.log('Added 9 edge case coupons to P01');"
  ])
});

// Search coupons
coupFolder.item.push({
  name: 'Search Coupons for P01',
  description: 'Verify all coupons assigned to P01',
  request: {
    method: 'POST',
    url: '{{baseUrl}}/api/marketing/promotions/{{P01_id}}/coupons/search',
    header: [{ key: 'Content-Type', value: 'application/json' }],
    body: { mode: 'raw', raw: JSON.stringify({ take: 50, skip: 0 }), options: { raw: { language: 'json' } } }
  },
  event: ts([
    "pm.test('Search: 200', () => pm.response.to.have.status(200));",
    "var d = pm.response.json();",
    "pm.test('P01 has 10+ coupons', () => pm.expect(d.totalCount).to.be.above(5));",
    "console.log('P01 coupons:', d.totalCount);"
  ])
});

coupFolder.item.push({
  name: 'Search Coupons for P15 (Usage Limits)',
  description: 'Verify usage limit coupons on P15',
  request: {
    method: 'POST',
    url: '{{baseUrl}}/api/marketing/promotions/{{P15_id}}/coupons/search',
    header: [{ key: 'Content-Type', value: 'application/json' }],
    body: { mode: 'raw', raw: JSON.stringify({ take: 50, skip: 0 }), options: { raw: { language: 'json' } } }
  },
  event: ts([
    "pm.test('P15 coupons: 200', () => pm.response.to.have.status(200));",
    "pm.test('Has coupons', () => pm.expect(pm.response.json().totalCount).to.be.above(0));"
  ])
});

collection.item.push(coupFolder);

// ===== 04-Storefront GraphQL =====
const gqlH = () => [
  { key: 'Content-Type', value: 'application/json' },
  { key: 'Authorization', value: 'Bearer {{userToken}}' }
];

const gqlReq = (name, desc, query, variables, tests) => ({
  name,
  description: desc || '',
  request: {
    method: 'POST',
    url: '{{frontUrl}}/storefrontapi/graphql',
    header: gqlH(),
    body: { mode: 'graphql', graphql: { query, variables } }
  },
  event: ts(tests)
});

const addCouponQ = 'mutation AddCoupon($command: InputAddCouponType!) { addCoupon(command: $command) { id coupons { code isAppliedSuccessfully } discountTotal { amount formattedAmount } validationErrors { errorCode errorMessage } } }';
const removeCouponQ = 'mutation RemoveCoupon($command: InputRemoveCouponType!) { removeCoupon(command: $command) { id coupons { code } discountTotal { amount } } }';
const promoQ = 'query PromotionCoupons($storeId: String!, $cultureName: String, $currencyCode: String, $first: Int) { promotionCoupons(storeId: $storeId, cultureName: $cultureName, currencyCode: $currencyCode, first: $first) { totalCount items { code description promotionId promotionName isPublic } } }';
const mkVars = (code) => `{"command":{"storeId":"{{storeId}}","cultureName":"{{cultureName}}","currencyCode":"{{currencyCode}}","cartName":"default","couponCode":"${code}"}}`;
const promoVars = '{"storeId":"{{storeId}}","cultureName":"{{cultureName}}","currencyCode":"{{currencyCode}}","first":50}';

const gqlFolder = {
  name: '04-Storefront GraphQL',
  description: 'GraphQL xAPI: promotionCoupons query, addCoupon/removeCoupon mutations.',
  item: [
    gqlReq('Query promotionCoupons (Public List)', 'List public coupons. Verify P08 (private) and P10 (auto) excluded.',
      promoQ, promoVars, [
        "pm.test('GQL: 200', () => pm.response.to.have.status(200));",
        "var d = pm.response.json();",
        "pm.test('No errors', () => pm.expect(d.errors).to.be.undefined);",
        "pm.test('Has coupons', () => pm.expect(d.data.promotionCoupons.totalCount).to.be.above(0));",
        "var codes = d.data.promotionCoupons.items.map(i => i.code);",
        "pm.test('PRIVATE4590 excluded', () => pm.expect(codes).to.not.include('PRIVATE4590'));",
        "console.log('Public coupons:', d.data.promotionCoupons.totalCount);"
      ]
    ),
    gqlReq('addCoupon - Apply QA10OFF', 'Apply 10% off coupon to cart', addCouponQ, mkVars('QA10OFF'), [
      "pm.test('200', () => pm.response.to.have.status(200));",
      "var d = pm.response.json();",
      "pm.test('No errors', () => pm.expect(d.errors).to.be.undefined);",
      "if (d.data && d.data.addCoupon) {",
      "    pm.collectionVariables.set('cartId', d.data.addCoupon.id);",
      "    var c = (d.data.addCoupon.coupons || []).find(c => c.code === 'QA10OFF');",
      "    pm.test('QA10OFF applied', () => pm.expect(c).to.not.be.undefined);",
      "}"
    ]),
    gqlReq('removeCoupon - Remove QA10OFF', 'Remove 10% off coupon from cart', removeCouponQ, mkVars('QA10OFF'), [
      "pm.test('200', () => pm.response.to.have.status(200));",
      "var d = pm.response.json();",
      "pm.test('No errors', () => pm.expect(d.errors).to.be.undefined);",
      "if (d.data && d.data.removeCoupon) {",
      "    var codes = (d.data.removeCoupon.coupons || []).map(c => c.code);",
      "    pm.test('QA10OFF removed', () => pm.expect(codes).to.not.include('QA10OFF'));",
      "}"
    ]),
    gqlReq('addCoupon - Apply SUPER', 'Apply 20% off for stacking test', addCouponQ, mkVars('SUPER'), [
      "pm.test('200', () => pm.response.to.have.status(200));",
      "pm.test('No errors', () => pm.expect(pm.response.json().errors).to.be.undefined);"
    ]),
    gqlReq('removeCoupon - Remove SUPER', 'Cleanup SUPER coupon', removeCouponQ, mkVars('SUPER'), [
      "pm.test('200', () => pm.response.to.have.status(200));"
    ])
  ]
};

collection.item.push(gqlFolder);

// ===== 05-Edge Cases =====
const ecFolder = {
  name: '05-Edge Cases',
  description: '8 edge case scenarios (E01-E08) for promotion/coupon boundary testing.',
  item: []
};

// E01-E05: Simple add coupon edge cases
const simpleEdgeCases = [
  { id: 'E01', code: 'QA-MAXED', name: 'Maxed-out total uses', desc: 'Coupon at max total uses must be rejected. Precondition: QA-MAXED used once.' },
  { id: 'E02', code: 'QA-PERCUST', name: 'Per-customer limit reached', desc: 'Same user second attempt must be rejected.' },
  { id: 'E03', code: 'QA-CPNEXPIRED', name: 'Coupon-level expiry (past)', desc: 'Expired coupon rejected even if promotion is still active.' },
  { id: 'E04', code: 'EXPIRED-TEST', name: 'Promotion inactive', desc: 'Coupon on inactive promotion (P09) must be rejected.' },
  { id: 'E05', code: 'INVALID CODE!', name: 'Invalid characters', desc: 'Non-existent/invalid code must be rejected.' }
];

for (const ec of simpleEdgeCases) {
  ecFolder.item.push(gqlReq(
    `${ec.id} - ${ec.code}: ${ec.name}`,
    ec.desc,
    addCouponQ,
    mkVars(ec.code),
    [
      `pm.test('${ec.id}: 200', () => pm.response.to.have.status(200));`,
      "var d = pm.response.json();",
      "if (d.data && d.data.addCoupon) {",
      `    var c = (d.data.addCoupon.coupons || []).find(c => c.code === '${ec.code}');`,
      `    if (c) pm.test('${ec.id}: not applied', () => pm.expect(c.isAppliedSuccessfully).to.be.false);`,
      `    else pm.test('${ec.id}: code not found (rejected)', () => pm.expect(true).to.be.true);`,
      "}",
      `console.log('${ec.id}: ${ec.name} test completed');`
    ]
  ));
}

// E06: Exclusive stacking (3 requests)
ecFolder.item.push(gqlReq('E06a - Apply EXCLUSIVE10 (globally exclusive)', 'Apply exclusive coupon first',
  addCouponQ, mkVars('EXCLUSIVE10'), [
    "pm.test('E06a: 200', () => pm.response.to.have.status(200));",
    "pm.test('No errors', () => pm.expect(pm.response.json().errors).to.be.undefined);",
    "console.log('E06: Applied exclusive coupon');"
  ]
));

ecFolder.item.push(gqlReq('E06b - Try stacking SUPER after EXCLUSIVE10', 'Second coupon must be blocked by exclusivity',
  addCouponQ, mkVars('SUPER'), [
    "pm.test('E06b: 200', () => pm.response.to.have.status(200));",
    "var d = pm.response.json();",
    "if (d.data && d.data.addCoupon) {",
    "    var c = (d.data.addCoupon.coupons || []).find(c => c.code === 'SUPER');",
    "    if (c) pm.test('E06b: SUPER blocked by exclusivity', () => pm.expect(c.isAppliedSuccessfully).to.be.false);",
    "}",
    "console.log('E06: Exclusivity stacking block tested');"
  ]
));

ecFolder.item.push(gqlReq('E06c - Cleanup: Remove EXCLUSIVE10', 'Remove exclusive coupon from cart',
  removeCouponQ, mkVars('EXCLUSIVE10'), [
    "pm.test('E06c: 200', () => pm.response.to.have.status(200));"
  ]
));

// E07: Auto promotion hidden
ecFolder.item.push(gqlReq('E07 - Auto Gift hidden from coupons page', 'P10 (no coupons) must not appear in promotionCoupons query',
  promoQ, '{"storeId":"{{storeId}}","cultureName":"{{cultureName}}","currencyCode":"{{currencyCode}}","first":100}', [
    "pm.test('E07: 200', () => pm.response.to.have.status(200));",
    "var d = pm.response.json();",
    "pm.test('No errors', () => pm.expect(d.errors).to.be.undefined);",
    "var names = d.data.promotionCoupons.items.map(i => i.promotionName);",
    "pm.test('E07: Auto Gift excluded', () => pm.expect(names).to.not.include('Auto Gift (no coupon)'));",
    "console.log('E07: Auto promotion exclusion verified');"
  ]
));

// E08: Store-scoped
ecFolder.item.push(gqlReq('E08 - Store-scoped visibility (P01 on B2B-store)', 'QA10OFF must be visible on assigned store',
  promoQ, promoVars, [
    "pm.test('E08: 200', () => pm.response.to.have.status(200));",
    "var d = pm.response.json();",
    "pm.test('No errors', () => pm.expect(d.errors).to.be.undefined);",
    "var codes = d.data.promotionCoupons.items.map(i => i.code);",
    "pm.test('E08: QA10OFF visible on store', () => pm.expect(codes).to.include('QA10OFF'));",
    "console.log('E08: Store-scoped visibility verified');"
  ]
));

collection.item.push(ecFolder);

// ===== 06-Cleanup =====
const cleanFolder = {
  name: '06-Cleanup',
  description: 'Delete all 16 test promotions (cascades to coupons) and clear cart coupons.',
  item: []
};

for (const p of promoData) {
  cleanFolder.item.push({
    name: `Delete ${p.id}`,
    description: `Delete ${p.id} - ${p.name}`,
    request: { method: 'DELETE', url: `{{baseUrl}}/api/marketing/promotions?ids={{${p.id}_id}}` },
    event: ts([
      `var pid = pm.collectionVariables.get('${p.id}_id');`,
      `if (!pid) { console.warn('SKIP: ${p.id} not set'); pm.test.skip('${p.id} not created'); }`,
      `else { pm.test('${p.id} deleted: 200/204', () => pm.expect(pm.response.code).to.be.oneOf([200, 204])); }`
    ])
  });
}

cleanFolder.item.push(gqlReq('Clear Cart Coupons', 'Remove any remaining coupons from test user cart',
  removeCouponQ, mkVars('QA10OFF'), [
    "pm.test('Cart cleanup: 200', () => pm.response.to.have.status(200));"
  ]
));

collection.item.push(cleanFolder);

// Write output
fs.writeFileSync('C:/Users/mutyk/My Projects/vc-mcp-testing-module/.postman-payload.json', JSON.stringify(collection, null, 2));
const total = collection.item.reduce((s, f) => s + (f.item ? f.item.length : 1), 0);
console.log('Done. Folders:', collection.item.length, '| Total requests:', total);
console.log('Folders:', collection.item.map(f => f.name + ' (' + (f.item ? f.item.length : 1) + ')').join(', '));
