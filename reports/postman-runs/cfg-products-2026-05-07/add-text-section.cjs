// Adds Text-section examples for CFG_RING (CFG-017, single REQUIRED Text section, maxLength=30).
// PR #114 contract: Text type uses customText (no option block); ConfigurationSectionKeyInput
// for Text omits option entirely (matched by sectionId+type only — see CFG-GQL-023).
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'collection.final.json');
const OUT = path.join(__dirname, 'collection.text.json');
const c = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// 1) Update 01 :: productConfiguration — Text Section maxLength (CFG-GQL-004) to ALSO capture the section id
const ringQuery = c.collection.item.find(i => i.name.includes('Text Section maxLength'));
if (ringQuery) {
  const ev = ringQuery.event.find(e => e.listen === 'test');
  ev.script.exec = [
    "pm.test('HTTP 200', () => pm.response.to.have.status(200));",
    "var d = pm.response.json();",
    "pm.test('No GraphQL errors', () => pm.expect(d.errors).to.be.undefined);",
    "var s = d.data.productConfiguration.configurationSections;",
    "pm.test('Single REQUIRED Text section', () => {",
    "  pm.expect(s).to.have.lengthOf(1);",
    "  pm.expect(s[0].type).to.eql('Text');",
    "  pm.expect(s[0].isRequired).to.be.true;",
    "});",
    "pm.test('maxLength = 30', () => pm.expect(s[0].maxLength).to.eql(30));",
    "pm.test('allowCustomText is true', () => pm.expect(s[0].allowCustomText).to.be.true);",
    "// Capture the text section id so downstream Text-section mutations (02-Preview, 03-Cart Setup, 04-Update, 05-Selection) can chain.",
    "pm.collectionVariables.set('sectionTextRingId', s[0].id);",
    "console.log('sectionTextRingId =', s[0].id);",
  ];
}

// 2) New requests
const previewText = {
  name: '02 :: createConfiguredLineItem — Text Section Preview (CFG_RING)',
  request: {
    description: "PR #114 Text-section payload shape: type='Text', customText (no option block). Preview only — does NOT mutate cart. Pairs with CFG-GQL-006 happy path but for Text instead of Product. {{cfgRingTextValue}} is a deterministic <30-char string sized for CFG_RING's maxLength=30 cap.",
    method: 'POST',
    url: '{{baseUrl}}/graphql',
    header: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Authorization', value: 'Bearer {{authToken}}' },
    ],
    body: {
      mode: 'graphql',
      graphql: {
        query: "mutation CreateConfiguredLineItem($configurationSections: [ConfigurationSectionInput]) {\n  createConfiguredLineItem(command: {\n    storeId: \"{{storeId}}\"\n    currencyCode: \"USD\"\n    cultureName: \"en-US\"\n    configurableProductId: \"{{cfgRingId}}\"\n    configurationSections: $configurationSections\n  }) {\n    id quantity\n    listPrice { amount currency { code } }\n    extendedPrice { amount currency { code } }\n    product { id name slug }\n  }\n}",
        variables: "{\n  \"configurationSections\": [\n    { \"sectionId\": \"{{sectionTextRingId}}\", \"type\": \"Text\", \"customText\": \"{{cfgRingTextValue}}\" }\n  ]\n}",
      },
    },
  },
  event: [{
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [
        "pm.test('HTTP 200', () => pm.response.to.have.status(200));",
        "var d = pm.response.json();",
        "pm.test('No GraphQL errors', () => pm.expect(d.errors).to.be.undefined);",
        "pm.test('Preview is non-null', () => pm.expect(d.data.createConfiguredLineItem).to.not.be.null);",
        "pm.test('Quantity = 1', () => pm.expect(d.data.createConfiguredLineItem.quantity).to.eql(1));",
        "pm.test('listPrice.amount > 0 (CFG_RING base = $150)', () => pm.expect(d.data.createConfiguredLineItem.listPrice.amount).to.be.above(0));",
        "// Note: id=null expected — preview is non-committable until persisted via addItem (CFG-GQL-007 contract).",
      ],
    },
  }],
};

const addItemRing = {
  name: '03 :: addItem — CFG_RING With Text Section (Captures ringCartId/ringLineItemId)',
  request: {
    description: "Adds CFG_RING qty=1 with the required Text section's customText. Captures ringCartId + ringLineItemId for the Text-section CRUD/Selection requests below. Independent from the CFG_LAPTOP cart in the original 03 setup — uses a separate lineItemId so both flows can coexist in the same cart.",
    method: 'POST',
    url: '{{baseUrl}}/graphql',
    header: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Authorization', value: 'Bearer {{authToken}}' },
    ],
    body: {
      mode: 'graphql',
      graphql: {
        query: "mutation AddItem($command: InputAddItemType!) {\n  addItem(command: $command) {\n    id itemsCount\n    items { id productId quantity\n      listPrice { amount currency { code } }\n      configurationItems { id sectionId type productId customText selectedForCheckout }\n    }\n  }\n}",
        variables: "{\n  \"command\": {\n    \"storeId\": \"{{storeId}}\",\n    \"userId\": \"{{userId}}\",\n    \"cartName\": \"default\",\n    \"cultureName\": \"en-US\",\n    \"currencyCode\": \"USD\",\n    \"productId\": \"{{cfgRingId}}\",\n    \"quantity\": 1,\n    \"configurationSections\": [\n      { \"sectionId\": \"{{sectionTextRingId}}\", \"type\": \"Text\", \"customText\": \"{{cfgRingTextValue}}\" }\n    ]\n  }\n}",
      },
    },
  },
  event: [{
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [
        "pm.test('HTTP 200', () => pm.response.to.have.status(200));",
        "var d = pm.response.json();",
        "pm.test('No GraphQL errors', () => pm.expect(d.errors).to.be.undefined);",
        "pm.test('Cart has at least one item', () => pm.expect(d.data.addItem.itemsCount).to.be.above(0));",
        "pm.collectionVariables.set('ringCartId', d.data.addItem.id);",
        "// Find the CFG_RING line item (cart may also contain CFG_LAPTOP from earlier 03 step)",
        "var ringLi = d.data.addItem.items.find(i => i.productId === pm.collectionVariables.get('cfgRingId'));",
        "pm.test('CFG_RING line item present', () => pm.expect(ringLi, 'expected a line item with productId = cfgRingId').to.not.be.undefined);",
        "if (ringLi) {",
        "  pm.collectionVariables.set('ringLineItemId', ringLi.id);",
        "  pm.test('Text section attached with customText echo', () => {",
        "    var txt = ringLi.configurationItems.find(c => c.sectionId === pm.collectionVariables.get('sectionTextRingId'));",
        "    pm.expect(txt, 'expected text configurationItem on ring line item').to.not.be.undefined;",
        "    pm.expect(txt.type).to.eql('Text');",
        "    pm.expect(txt.customText).to.eql(pm.collectionVariables.get('cfgRingTextValue'));",
        "  });",
        "  console.log('ringCartId =', d.data.addItem.id, 'ringLineItemId =', ringLi.id);",
        "}",
      ],
    },
  }],
};

const updateText = {
  name: '04 :: updateConfigurationItem — Text Section Replace customText (CFG_RING)',
  request: {
    description: "REPLACE semantics on Text section: pass a new customText to overwrite the previous value. Maps to CFG-GQL-009 pattern but for Text instead of Product. New text is the trailing 'v2' marker — still under maxLength=30.",
    method: 'POST',
    url: '{{baseUrl}}/graphql',
    header: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Authorization', value: 'Bearer {{authToken}}' },
    ],
    body: {
      mode: 'graphql',
      graphql: {
        query: "mutation UpdateConfigurationItem($configurationSection: ConfigurationSectionInput!) {\n  updateConfigurationItem(command: {\n    storeId: \"{{storeId}}\"\n    userId: \"{{userId}}\"\n    lineItemId: \"{{ringLineItemId}}\"\n    configurationSection: $configurationSection\n  }) {\n    id itemsCount\n    items { id\n      configurationItems { id sectionId type customText selectedForCheckout }\n    }\n  }\n}",
        variables: "{\n  \"configurationSection\": {\n    \"sectionId\": \"{{sectionTextRingId}}\",\n    \"type\": \"Text\",\n    \"customText\": \"{{cfgRingTextValue}}-v2\"\n  }\n}",
      },
    },
  },
  event: [{
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [
        "pm.test('HTTP 200', () => pm.response.to.have.status(200));",
        "var d = pm.response.json();",
        "pm.test('No GraphQL errors', () => pm.expect(d.errors).to.be.undefined);",
        "var li = d.data.updateConfigurationItem.items.find(i => i.id === pm.collectionVariables.get('ringLineItemId'));",
        "pm.test('Text section customText replaced with -v2 suffix', () => {",
        "  var txt = li.configurationItems.find(c => c.sectionId === pm.collectionVariables.get('sectionTextRingId'));",
        "  pm.expect(txt).to.not.be.undefined;",
        "  pm.expect(txt.type).to.eql('Text');",
        "  pm.expect(txt.customText).to.eql(pm.collectionVariables.get('cfgRingTextValue') + '-v2');",
        "});",
      ],
    },
  }],
};

const flipText = {
  name: '05 :: changeCartConfigurationItemSelected — Text Section Flip (CFG-GQL-023, no option in key)',
  request: {
    description: "PR #114 ConfigurationSectionKeyInput for Text type OMITS option entirely — Text/File use (Type, SectionId) discrimination, NOT option.productId. Flips ring's Text section selectedForCheckout=false. Cart subTotal/total cascade fires even if Text contributes 0 to listPrice (RecalculateAsync still runs).",
    method: 'POST',
    url: '{{baseUrl}}/graphql',
    header: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Authorization', value: 'Bearer {{authToken}}' },
    ],
    body: {
      mode: 'graphql',
      graphql: {
        query: "mutation ChangeCartConfigurationItemSelected($configurationSection: ConfigurationSectionKeyInput!, $selectedForCheckout: Boolean!) {\n  changeCartConfigurationItemSelected(command: {\n    storeId: \"{{storeId}}\"\n    userId: \"{{userId}}\"\n    lineItemId: \"{{ringLineItemId}}\"\n    configurationSection: $configurationSection\n    selectedForCheckout: $selectedForCheckout\n  }) {\n    id itemsCount\n    subTotal { amount currency { code } }\n    total { amount currency { code } }\n    items { id productId quantity\n      listPrice { amount currency { code } }\n      configurationItems { id sectionId type customText selectedForCheckout }\n    }\n  }\n}",
        variables: "{\n  \"configurationSection\": {\n    \"sectionId\": \"{{sectionTextRingId}}\",\n    \"type\": \"Text\"\n  },\n  \"selectedForCheckout\": false\n}",
      },
    },
  },
  event: [{
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [
        "pm.test('HTTP 200', () => pm.response.to.have.status(200));",
        "var d = pm.response.json();",
        "pm.test('No GraphQL errors', () => pm.expect(d.errors).to.be.undefined);",
        "var li = d.data.changeCartConfigurationItemSelected.items.find(i => i.id === pm.collectionVariables.get('ringLineItemId'));",
        "pm.test('Text configurationItem flipped to selectedForCheckout=false', () => {",
        "  var txt = li.configurationItems.find(c => c.sectionId === pm.collectionVariables.get('sectionTextRingId'));",
        "  pm.expect(txt).to.not.be.undefined;",
        "  pm.expect(txt.selectedForCheckout).to.be.false;",
        "});",
        "pm.test('Cart subTotal cascade fired (non-null)', () => pm.expect(d.data.changeCartConfigurationItemSelected.subTotal.amount).to.be.a('number'));",
      ],
    },
  }],
};

const cleanupRing = {
  name: '06 :: removeCart — Teardown (Ring Cart)',
  request: {
    description: "Teardown for the ring-cart variant. Independent from the main cart in 06 :: removeCart since storefront xAPI carts are scoped per (userId, storeId, cartName) — but if both 03 setups landed in the SAME default cart, ringCartId and cartId will be identical and one removal handles both.",
    method: 'POST',
    url: '{{baseUrl}}/graphql',
    header: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Authorization', value: 'Bearer {{authToken}}' },
    ],
    body: {
      mode: 'graphql',
      graphql: {
        query: "mutation RemoveCart($command: InputRemoveCartType!) {\n  removeCart(command: $command)\n}",
        variables: "{\n  \"command\": { \"userId\": \"{{userId}}\", \"cartId\": \"{{ringCartId}}\" }\n}",
      },
    },
  },
  event: [{
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [
        "pm.test('HTTP 200', () => pm.response.to.have.status(200));",
        "var d = pm.response.json();",
        "pm.test('removeCart returns boolean', () => pm.expect(typeof d.data.removeCart === 'boolean').to.be.true);",
        "pm.collectionVariables.set('ringCartId', '');",
        "pm.collectionVariables.set('ringLineItemId', '');",
      ],
    },
  }],
};

// 3) Insert new items at logical positions to preserve overall order
const items = c.collection.item;
function findIndex(predicate) { return items.findIndex(predicate); }

// previewText: after CFG-GQL-007 (createConfiguredLineItem empty draft)
let idx = findIndex(i => i.name.includes('Empty Required Sections Draft id=null'));
items.splice(idx + 1, 0, previewText);

// addItemRing: after CFG_LAPTOP addItem (03 :: addItem)
idx = findIndex(i => i.name.startsWith('03 :: addItem'));
items.splice(idx + 1, 0, addItemRing);

// updateText: after CFG-GQL-010 bulk update (logical Text update spot)
idx = findIndex(i => i.name.includes('Bulk Both to UPGRADE (CFG-GQL-010)'));
items.splice(idx + 1, 0, updateText);

// flipText: after CFG-GQL-019 unSelectAll (before validation/no-op tests)
idx = findIndex(i => i.name.includes('Flip All FALSE (CFG-GQL-019)'));
items.splice(idx + 1, 0, flipText);

// cleanupRing: after the existing 06 :: removeCart
idx = findIndex(i => i.name === '06 :: removeCart — Teardown');
items.splice(idx + 1, 0, cleanupRing);

// 4) Add collection variables
const newVars = [
  { key: 'sectionTextRingId', value: '', description: 'Captured by 01 :: productConfiguration — Text Section maxLength (CFG_RING).' },
  { key: 'ringCartId', value: '', description: 'Captured by 03 :: addItem — CFG_RING With Text Section.' },
  { key: 'ringLineItemId', value: '', description: 'Captured by 03 :: addItem — CFG_RING With Text Section.' },
  { key: 'cfgRingTextValue', value: 'Sprint26-08-test-input', description: 'Deterministic test text for CFG_RING (length 22, fits maxLength=30). From CFG_TEXT_INPUTS.customValue alias.' },
];
const existingKeys = new Set((c.collection.variable || []).map(v => v.key));
for (const v of newVars) {
  if (!existingKeys.has(v.key)) c.collection.variable.push(v);
}

fs.writeFileSync(OUT, JSON.stringify(c.collection, null, 2));
console.log('Items:', items.length, '— wrote', OUT);
