/**
 * Seed 10 configurable products for regression suite 072b.
 *
 * Creates base products + option products, prices, inventory, and configurations.
 * Uses AGENT-TEST- prefix with date for safe teardown.
 *
 * Usage: node scripts/seed-configurable-products.mjs
 */

import https from 'https';

const BACK_URL = 'https://vcst-qa.govirto.com';
const CATALOG_ID = '7f840fe0-f141-471c-9bad-97d33ee5e87d'; // Configurable products catalog
const CATEGORY_ID = '15ba0fac-fb4d-4ca4-8f3f-5611a61a4f45'; // Build the bike of your dreams
const TEXT_CATEGORY_ID = '9e6a6b98-8150-475a-a13c-d409ae2e98f6'; // Configurations with text
const PRICELIST_ID = '732f3fc9-e02f-4839-b69a-5ff7feaf7950'; // [E2E Test] Electronics USD
const FFC_ID = '142ba5568ae4454aad553ece41b9c3b5'; // Chicago Branch
const DATE_STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');

let TOKEN = '';

// --- HTTP helper ---
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BACK_URL);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      rejectUnauthorized: false,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} ${method} ${path}: ${data.substring(0, 500)}`));
        } else {
          try { resolve(data ? JSON.parse(data) : null); }
          catch { resolve(data); }
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// --- Auth ---
async function getToken() {
  return new Promise((resolve, reject) => {
    const postData = 'grant_type=password&scope=offline_access&username=admin&password=Password1!';
    const options = {
      method: 'POST',
      hostname: 'vcst-qa.govirto.com',
      path: '/connect/token',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
      rejectUnauthorized: false,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const j = JSON.parse(data);
        if (j.access_token) resolve(j.access_token);
        else reject(new Error('Auth failed: ' + data));
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// --- Product definitions ---
function makeProduct(name, sku, categoryId = CATEGORY_ID) {
  return {
    name: `AGENT-TEST-${name}-${DATE_STAMP}`,
    code: `AGENT-TEST-${sku}-${DATE_STAMP}`,
    productType: 'Physical',
    catalogId: CATALOG_ID,
    categoryId,
    isActive: true,
    isBuyable: true,
    trackInventory: true,
    startDate: new Date().toISOString(),
  };
}

// All products to create (base + options)
const PRODUCTS = {
  // --- Product 1: Test Config Bike (E2E Scenario 1) ---
  bike: makeProduct('Config-Bike', 'BIKE-CFG'),
  bike_none: makeProduct('Config-Bike-None', 'BIKE-NONE'),
  bike_basic_seat: makeProduct('Config-Bike-Basic-Seat', 'BIKE-BASIC'),
  bike_premium_seat: makeProduct('Config-Bike-Premium-Seat', 'BIKE-PREMIUM'),
  bike_racing_seat: makeProduct('Config-Bike-Racing-Seat', 'BIKE-RACING'),

  // --- Product 2: Test Config Laptop (E2E Scenario 2) ---
  laptop: makeProduct('Config-Laptop', 'LAPTOP-CFG'),
  laptop_8gb: makeProduct('Config-Laptop-8GB', 'LAPTOP-8GB'),
  laptop_16gb: makeProduct('Config-Laptop-16GB', 'LAPTOP-16GB'),
  laptop_32gb: makeProduct('Config-Laptop-32GB', 'LAPTOP-32GB'),
  laptop_256gb: makeProduct('Config-Laptop-256GB', 'LAPTOP-256SSD'),
  laptop_512gb: makeProduct('Config-Laptop-512GB', 'LAPTOP-512SSD'),
  laptop_1tb: makeProduct('Config-Laptop-1TB', 'LAPTOP-1TBSSD'),

  // --- Product 3: Sale Bike (E2E Scenario 3) ---
  sale_bike: makeProduct('Config-Sale-Bike', 'BIKE-SALE-CFG'),
  sale_bike_standard: makeProduct('Config-Sale-Standard-Handlebar', 'BIKE-SALE-STD'),
  sale_bike_dropbar: makeProduct('Config-Sale-Drop-Bar', 'BIKE-SALE-DROP'),
  sale_bike_none: makeProduct('Config-Sale-None-Handlebar', 'BIKE-SALE-NONE'),

  // --- Product 4: OOS Bike (E2E Scenario 4) ---
  oos_bike: makeProduct('Config-OOS-Bike', 'BIKE-OOS-CFG'),
  oos_bike_red: makeProduct('Config-OOS-Red', 'BIKE-OOS-RED'),
  oos_bike_blue: makeProduct('Config-OOS-Blue', 'BIKE-OOS-BLUE'),
  oos_bike_black: makeProduct('Config-OOS-LtdBlack', 'BIKE-OOS-BLK'),
  oos_bike_silver: makeProduct('Config-OOS-Silver', 'BIKE-OOS-SLV'),

  // --- Product 5: Checkout Bike (E2E Scenario 5) ---
  checkout_bike: makeProduct('Config-Checkout-Bike', 'BIKE-CHK-CFG'),
  checkout_bike_std_wheels: makeProduct('Config-Checkout-Std-Wheels', 'BIKE-CHK-STD'),
  checkout_bike_sport_wheels: makeProduct('Config-Checkout-Sport-Wheels', 'BIKE-CHK-SPT'),

  // --- Product 6: Engraved Ring (Text section, E2E-017) ---
  ring: makeProduct('Config-Engraved-Ring', 'RING-TXT-CFG', TEXT_CATEGORY_ID),

  // --- Product 7: Custom Jersey (Dropdown/Product section) ---
  jersey: makeProduct('Config-Custom-Jersey', 'JERSEY-CFG'),
  jersey_small: makeProduct('Config-Jersey-Small', 'JERSEY-SM'),
  jersey_medium: makeProduct('Config-Jersey-Medium', 'JERSEY-MD'),
  jersey_large: makeProduct('Config-Jersey-Large', 'JERSEY-LG'),

  // --- Product 8: Gift Box (Optional text section, E2E-019) ---
  gift_box: makeProduct('Config-Gift-Box', 'GIFT-TXT-CFG', TEXT_CATEGORY_ID),

  // --- Product 9: Phone Case (Mixed required/optional sections) ---
  phone_case: makeProduct('Config-Phone-Case', 'PHONE-CFG'),
  phone_case_clear: makeProduct('Config-Phone-Clear', 'PHONE-CLEAR'),
  phone_case_matte: makeProduct('Config-Phone-Matte', 'PHONE-MATTE'),
  phone_case_gloss: makeProduct('Config-Phone-Gloss', 'PHONE-GLOSS'),
  phone_case_ring: makeProduct('Config-Phone-Ring-Holder', 'PHONE-RING'),
  phone_case_stand: makeProduct('Config-Phone-Stand', 'PHONE-STAND'),

  // --- Product 10: Custom Bike (Complex multi-section, 3+ sections) ---
  custom_bike: makeProduct('Config-Custom-Bike', 'CBIKE-CFG'),
  cbike_frame_alu: makeProduct('Config-CBike-Aluminum-Frame', 'CBIKE-ALU'),
  cbike_frame_carbon: makeProduct('Config-CBike-Carbon-Frame', 'CBIKE-CARB'),
  cbike_frame_steel: makeProduct('Config-CBike-Steel-Frame', 'CBIKE-STEEL'),
  cbike_wheel_std: makeProduct('Config-CBike-Standard-Wheels', 'CBIKE-WSTD'),
  cbike_wheel_sport: makeProduct('Config-CBike-Sport-Wheels', 'CBIKE-WSPT'),
  cbike_wheel_pro: makeProduct('Config-CBike-Pro-Wheels', 'CBIKE-WPRO'),
  cbike_seat_basic: makeProduct('Config-CBike-Basic-Seat', 'CBIKE-SBSC'),
  cbike_seat_comfort: makeProduct('Config-CBike-Comfort-Seat', 'CBIKE-SCMF'),
  cbike_seat_racing: makeProduct('Config-CBike-Racing-Seat', 'CBIKE-SRCG'),
};

// Prices: { key: { list, sale? } }  — sale is optional (list only = no sale price)
const PRICES = {
  // Bike base and options
  bike: { list: 200 },
  bike_none: { list: 0 },
  bike_basic_seat: { list: 15 },
  bike_premium_seat: { list: 45 },
  bike_racing_seat: { list: 95 },

  // Laptop base and options
  laptop: { list: 999 },
  laptop_8gb: { list: 0 },
  laptop_16gb: { list: 100 },
  laptop_32gb: { list: 250 },
  laptop_256gb: { list: 0 },
  laptop_512gb: { list: 75 },
  laptop_1tb: { list: 150 },

  // Sale Bike (has both list and sale prices)
  sale_bike: { list: 300, sale: 250 },
  sale_bike_standard: { list: 50, sale: 40 },
  sale_bike_dropbar: { list: 100, sale: 80 },
  sale_bike_none: { list: 0, sale: 0 },

  // OOS Bike
  oos_bike: { list: 500 },
  oos_bike_red: { list: 0 },
  oos_bike_blue: { list: 0 },
  oos_bike_black: { list: 50 },
  oos_bike_silver: { list: 25 },

  // Checkout Bike
  checkout_bike: { list: 150 },
  checkout_bike_std_wheels: { list: 0 },
  checkout_bike_sport_wheels: { list: 50 },

  // Engraved Ring (text section, no product options)
  ring: { list: 150 },

  // Custom Jersey
  jersey: { list: 75 },
  jersey_small: { list: 0 },
  jersey_medium: { list: 0 },
  jersey_large: { list: 5 },

  // Gift Box (text section)
  gift_box: { list: 50 },

  // Phone Case
  phone_case: { list: 30 },
  phone_case_clear: { list: 0 },
  phone_case_matte: { list: 5 },
  phone_case_gloss: { list: 8 },
  phone_case_ring: { list: 10 },
  phone_case_stand: { list: 12 },

  // Custom Bike
  custom_bike: { list: 500 },
  cbike_frame_alu: { list: 0 },
  cbike_frame_carbon: { list: 200 },
  cbike_frame_steel: { list: 50 },
  cbike_wheel_std: { list: 0 },
  cbike_wheel_sport: { list: 75 },
  cbike_wheel_pro: { list: 150 },
  cbike_seat_basic: { list: 0 },
  cbike_seat_comfort: { list: 30 },
  cbike_seat_racing: { list: 60 },
};

// Inventory quantities
const INVENTORY = {
  bike: 50, bike_none: 50, bike_basic_seat: 30, bike_premium_seat: 20, bike_racing_seat: 10,
  laptop: 50, laptop_8gb: 50, laptop_16gb: 30, laptop_32gb: 10, laptop_256gb: 50, laptop_512gb: 25, laptop_1tb: 15,
  sale_bike: 30, sale_bike_standard: 30, sale_bike_dropbar: 20, sale_bike_none: 30,
  oos_bike: 50, oos_bike_red: 10, oos_bike_blue: 5, oos_bike_black: 0, oos_bike_silver: 8, // black = OOS
  checkout_bike: 25, checkout_bike_std_wheels: 25, checkout_bike_sport_wheels: 10,
  ring: 30,
  jersey: 40, jersey_small: 40, jersey_medium: 40, jersey_large: 40,
  gift_box: 25,
  phone_case: 50, phone_case_clear: 50, phone_case_matte: 40, phone_case_gloss: 30, phone_case_ring: 20, phone_case_stand: 15,
  custom_bike: 20, cbike_frame_alu: 20, cbike_frame_carbon: 10, cbike_frame_steel: 15,
  cbike_wheel_std: 20, cbike_wheel_sport: 15, cbike_wheel_pro: 8,
  cbike_seat_basic: 20, cbike_seat_comfort: 15, cbike_seat_racing: 10,
};

// Stored IDs after creation
const productIds = {};

// ========== STEP 1: Create all products ==========
async function createProducts() {
  console.log('\n=== STEP 1: Creating products ===');
  const allProducts = Object.entries(PRODUCTS).map(([key, prod]) => ({ ...prod, _key: key }));

  // Create in batches of 10
  for (let i = 0; i < allProducts.length; i += 10) {
    const batch = allProducts.slice(i, i + 10);
    const batchPayload = batch.map(p => {
      const { _key, ...prod } = p;
      return prod;
    });

    console.log(`  Creating batch ${Math.floor(i/10)+1}: ${batch.map(b=>b.code).join(', ')}`);

    // The batch endpoint expects an array
    const result = await request('POST', '/api/catalog/products/batch', batchPayload);

    // The batch endpoint may not return IDs — we need to search for them
    console.log(`  Batch response type: ${typeof result}, ${Array.isArray(result) ? 'array len=' + result.length : ''}`);
  }

  // Now search for all created products to get their IDs
  console.log('  Fetching created product IDs...');
  const searchResult = await request('POST', '/api/catalog/search/products', {
    catalogId: CATALOG_ID,
    keyword: `AGENT-TEST-`,
    take: 100,
  });

  const items = searchResult.items || searchResult.results || [];
  console.log(`  Found ${items.length} AGENT-TEST products`);

  for (const item of items) {
    // Match by code
    for (const [key, prod] of Object.entries(PRODUCTS)) {
      if (item.code === prod.code) {
        productIds[key] = item.id;
        break;
      }
    }
  }

  const found = Object.keys(productIds).length;
  const total = Object.keys(PRODUCTS).length;
  console.log(`  Mapped ${found}/${total} product IDs`);

  if (found < total) {
    const missing = Object.keys(PRODUCTS).filter(k => !productIds[k]);
    console.log(`  Missing: ${missing.join(', ')}`);

    // Try individual creation for missing ones
    for (const key of missing) {
      console.log(`  Creating individually: ${PRODUCTS[key].name}`);
      try {
        const result = await request('POST', '/api/catalog/products', PRODUCTS[key]);
        if (result && result.id) {
          productIds[key] = result.id;
          console.log(`    Created: ${result.id}`);
        } else {
          // Search again for this specific product
          const search = await request('POST', '/api/catalog/search/products', {
            catalogId: CATALOG_ID,
            keyword: PRODUCTS[key].code,
            take: 5,
          });
          const found = (search.items || []).find(i => i.code === PRODUCTS[key].code);
          if (found) {
            productIds[key] = found.id;
            console.log(`    Found via search: ${found.id}`);
          }
        }
      } catch (e) {
        console.error(`    FAILED: ${e.message}`);
      }
    }
  }

  console.log(`  Final count: ${Object.keys(productIds).length}/${total} products`);
}

// ========== STEP 2: Set prices ==========
async function setPrices() {
  console.log('\n=== STEP 2: Setting prices ===');

  const priceEntries = [];
  for (const [key, priceInfo] of Object.entries(PRICES)) {
    const pid = productIds[key];
    if (!pid) {
      console.log(`  SKIP price for ${key}: no product ID`);
      continue;
    }
    const entry = {
      productId: pid,
      prices: [{
        pricelistId: PRICELIST_ID,
        currency: 'USD',
        productId: pid,
        list: priceInfo.list,
        minQuantity: 1,
      }],
    };
    if (priceInfo.sale !== undefined) {
      entry.prices[0].sale = priceInfo.sale;
    }
    priceEntries.push(entry);
  }

  // Use PUT /api/products/prices to update prices in bulk
  console.log(`  Setting prices for ${priceEntries.length} products...`);

  // Process in batches of 10
  for (let i = 0; i < priceEntries.length; i += 10) {
    const batch = priceEntries.slice(i, i + 10);
    try {
      await request('PUT', '/api/products/prices', batch);
      console.log(`  Price batch ${Math.floor(i/10)+1} OK (${batch.length} products)`);
    } catch (e) {
      console.error(`  Price batch ${Math.floor(i/10)+1} FAILED: ${e.message}`);
      // Try individually
      for (const entry of batch) {
        try {
          await request('PUT', '/api/products/prices', [entry]);
          console.log(`    Individual price OK: ${entry.productId}`);
        } catch (e2) {
          console.error(`    Individual price FAILED: ${entry.productId}: ${e2.message}`);
        }
      }
    }
  }
}

// ========== STEP 3: Set inventory ==========
async function setInventory() {
  console.log('\n=== STEP 3: Setting inventory ===');

  const inventoryEntries = [];
  for (const [key, qty] of Object.entries(INVENTORY)) {
    const pid = productIds[key];
    if (!pid) {
      console.log(`  SKIP inventory for ${key}: no product ID`);
      continue;
    }
    inventoryEntries.push({
      fulfillmentCenterId: FFC_ID,
      productId: pid,
      inStockQuantity: qty,
      reservedQuantity: 0,
    });
  }

  console.log(`  Setting inventory for ${inventoryEntries.length} products...`);
  try {
    await request('PUT', '/api/inventory/plenty', inventoryEntries);
    console.log('  Inventory bulk update OK');
  } catch (e) {
    console.error(`  Inventory bulk FAILED: ${e.message}`);
    // Try individually
    for (const entry of inventoryEntries) {
      try {
        await request('PUT', `/api/inventory/products/${entry.productId}`, [entry]);
        console.log(`    Individual inventory OK: ${entry.productId}`);
      } catch (e2) {
        console.error(`    Individual inventory FAILED: ${entry.productId}: ${e2.message}`);
      }
    }
  }
}

// ========== STEP 4: Create configurations ==========
async function createConfigurations() {
  console.log('\n=== STEP 4: Creating configurations ===');

  const configs = [
    // 1. Test Config Bike — 1 optional radio section
    {
      productId: productIds.bike,
      isActive: true,
      sections: [{
        name: 'Choose Upgrade',
        type: 'Product',
        isRequired: false,
        displayOrder: 0,
        allowCustomText: false,
        allowPredefinedOptions: false,
        options: [
          { productId: productIds.bike_none, quantity: 1 },
          { productId: productIds.bike_basic_seat, quantity: 1 },
          { productId: productIds.bike_premium_seat, quantity: 1 },
          { productId: productIds.bike_racing_seat, quantity: 1 },
        ],
      }],
    },

    // 2. Test Config Laptop — 2 required sections
    {
      productId: productIds.laptop,
      isActive: true,
      sections: [
        {
          name: 'RAM',
          type: 'Product',
          isRequired: true,
          displayOrder: 0,
          allowCustomText: false,
          allowPredefinedOptions: false,
          options: [
            { productId: productIds.laptop_8gb, quantity: 1 },
            { productId: productIds.laptop_16gb, quantity: 1 },
            { productId: productIds.laptop_32gb, quantity: 1 },
          ],
        },
        {
          name: 'Storage',
          type: 'Product',
          isRequired: true,
          displayOrder: 1,
          allowCustomText: false,
          allowPredefinedOptions: false,
          options: [
            { productId: productIds.laptop_256gb, quantity: 1 },
            { productId: productIds.laptop_512gb, quantity: 1 },
            { productId: productIds.laptop_1tb, quantity: 1 },
          ],
        },
      ],
    },

    // 3. Sale Bike — optional section with sale prices
    {
      productId: productIds.sale_bike,
      isActive: true,
      sections: [{
        name: 'Handlebars',
        type: 'Product',
        isRequired: false,
        displayOrder: 0,
        allowCustomText: false,
        allowPredefinedOptions: false,
        options: [
          { productId: productIds.sale_bike_none, quantity: 1 },
          { productId: productIds.sale_bike_standard, quantity: 1 },
          { productId: productIds.sale_bike_dropbar, quantity: 1 },
        ],
      }],
    },

    // 4. OOS Bike — required section with one OOS option
    {
      productId: productIds.oos_bike,
      isActive: true,
      sections: [{
        name: 'Frame Color',
        type: 'Product',
        isRequired: true,
        displayOrder: 0,
        allowCustomText: false,
        allowPredefinedOptions: false,
        options: [
          { productId: productIds.oos_bike_red, quantity: 1 },
          { productId: productIds.oos_bike_blue, quantity: 1 },
          { productId: productIds.oos_bike_black, quantity: 1 },
          { productId: productIds.oos_bike_silver, quantity: 1 },
        ],
      }],
    },

    // 5. Checkout Bike — required section for checkout flow
    {
      productId: productIds.checkout_bike,
      isActive: true,
      sections: [{
        name: 'Wheels',
        type: 'Product',
        isRequired: true,
        displayOrder: 0,
        allowCustomText: false,
        allowPredefinedOptions: false,
        options: [
          { productId: productIds.checkout_bike_std_wheels, quantity: 1 },
          { productId: productIds.checkout_bike_sport_wheels, quantity: 1 },
        ],
      }],
    },

    // 6. Engraved Ring — Required text section
    {
      productId: productIds.ring,
      isActive: true,
      sections: [{
        name: 'Engraving Text',
        type: 'Text',
        isRequired: true,
        displayOrder: 0,
        allowCustomText: true,
        allowPredefinedOptions: false,
        maxLength: 30,
        options: [],
      }],
    },

    // 7. Custom Jersey — Product section (dropdown style)
    {
      productId: productIds.jersey,
      isActive: true,
      sections: [{
        name: 'Size',
        type: 'Product',
        isRequired: true,
        displayOrder: 0,
        allowCustomText: false,
        allowPredefinedOptions: false,
        options: [
          { productId: productIds.jersey_small, quantity: 1 },
          { productId: productIds.jersey_medium, quantity: 1 },
          { productId: productIds.jersey_large, quantity: 1 },
        ],
      }],
    },

    // 8. Gift Box — Optional text section
    {
      productId: productIds.gift_box,
      isActive: true,
      sections: [{
        name: 'Gift Message',
        type: 'Text',
        isRequired: false,
        displayOrder: 0,
        allowCustomText: true,
        allowPredefinedOptions: false,
        maxLength: 100,
        options: [],
      }],
    },

    // 9. Phone Case — Mixed required + optional sections
    {
      productId: productIds.phone_case,
      isActive: true,
      sections: [
        {
          name: 'Case Style',
          type: 'Product',
          isRequired: true,
          displayOrder: 0,
          allowCustomText: false,
          allowPredefinedOptions: false,
          options: [
            { productId: productIds.phone_case_clear, quantity: 1 },
            { productId: productIds.phone_case_matte, quantity: 1 },
            { productId: productIds.phone_case_gloss, quantity: 1 },
          ],
        },
        {
          name: 'Accessories',
          type: 'Product',
          isRequired: false,
          displayOrder: 1,
          allowCustomText: false,
          allowPredefinedOptions: false,
          options: [
            { productId: productIds.phone_case_ring, quantity: 1 },
            { productId: productIds.phone_case_stand, quantity: 1 },
          ],
        },
        {
          name: 'Custom Name',
          type: 'Text',
          isRequired: false,
          displayOrder: 2,
          allowCustomText: true,
          allowPredefinedOptions: false,
          maxLength: 20,
          options: [],
        },
      ],
    },

    // 10. Custom Bike — 3 required product sections
    {
      productId: productIds.custom_bike,
      isActive: true,
      sections: [
        {
          name: 'Frame',
          type: 'Product',
          isRequired: true,
          displayOrder: 0,
          allowCustomText: false,
          allowPredefinedOptions: false,
          options: [
            { productId: productIds.cbike_frame_alu, quantity: 1 },
            { productId: productIds.cbike_frame_carbon, quantity: 1 },
            { productId: productIds.cbike_frame_steel, quantity: 1 },
          ],
        },
        {
          name: 'Wheels',
          type: 'Product',
          isRequired: true,
          displayOrder: 1,
          allowCustomText: false,
          allowPredefinedOptions: false,
          options: [
            { productId: productIds.cbike_wheel_std, quantity: 1 },
            { productId: productIds.cbike_wheel_sport, quantity: 1 },
            { productId: productIds.cbike_wheel_pro, quantity: 1 },
          ],
        },
        {
          name: 'Seat',
          type: 'Product',
          isRequired: false,
          displayOrder: 2,
          allowCustomText: false,
          allowPredefinedOptions: false,
          options: [
            { productId: productIds.cbike_seat_basic, quantity: 1 },
            { productId: productIds.cbike_seat_comfort, quantity: 1 },
            { productId: productIds.cbike_seat_racing, quantity: 1 },
          ],
        },
      ],
    },
  ];

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    if (!config.productId) {
      console.log(`  SKIP config ${i+1}: no product ID`);
      continue;
    }

    const productKey = Object.entries(productIds).find(([k, v]) => v === config.productId)?.[0] || 'unknown';
    console.log(`  Creating config ${i+1}/10: ${productKey} (${config.sections.length} sections)...`);

    try {
      const result = await request('POST', '/api/catalog/products/configurations', config);
      console.log(`    OK: config ID = ${result?.id || 'returned'}`);
    } catch (e) {
      console.error(`    FAILED: ${e.message}`);
    }
  }
}

// ========== STEP 5: Trigger reindex ==========
async function triggerReindex() {
  console.log('\n=== STEP 5: Triggering search reindex ===');
  try {
    // Search index endpoints
    const result = await request('POST', '/api/search/indexes/index', {
      documentType: 'KnownDocumentTypes.Product',
    });
    console.log('  Reindex triggered:', result);
  } catch (e) {
    console.log(`  Reindex via documentType failed: ${e.message}`);
    // Try alternative
    try {
      const result = await request('POST', '/api/search/indexes/index', [{
        documentType: 'Product',
      }]);
      console.log('  Reindex alternative OK:', result);
    } catch (e2) {
      console.log(`  Alternative also failed: ${e2.message}`);
      console.log('  NOTE: Reindex may need to be triggered manually from Admin > Search Index');
    }
  }
}

// ========== STEP 6: Verify ==========
async function verify() {
  console.log('\n=== STEP 6: Verification ===');

  // Verify a few products have prices
  for (const key of ['bike', 'laptop', 'ring', 'custom_bike']) {
    const pid = productIds[key];
    if (!pid) continue;

    try {
      const prices = await request('GET', `/api/catalog/products/${pid}/pricelists`);
      const priceList = (Array.isArray(prices) ? prices : []).find(pl => pl.name === '[E2E Test] Electronics');
      const price = priceList?.prices?.[0];
      console.log(`  ${key}: price list=${price?.list}, sale=${price?.sale || 'none'}`);
    } catch (e) {
      console.log(`  ${key}: price check failed: ${e.message}`);
    }
  }

  // Verify configurations
  for (const key of ['bike', 'laptop', 'phone_case', 'custom_bike']) {
    const pid = productIds[key];
    if (!pid) continue;

    try {
      const search = await request('POST', '/api/catalog/products/configurations/search', {
        productId: pid,
        take: 1,
      });
      const config = search.results?.[0];
      console.log(`  ${key}: config active=${config?.isActive}, sections=${config?.sections?.length || 0}`);
    } catch (e) {
      console.log(`  ${key}: config check failed: ${e.message}`);
    }
  }
}

// ========== MAIN ==========
async function main() {
  console.log('=== Configurable Products Seed Script ===');
  console.log(`Date stamp: ${DATE_STAMP}`);
  console.log(`Catalog: ${CATALOG_ID}`);
  console.log(`Category: ${CATEGORY_ID}`);
  console.log(`Price list: ${PRICELIST_ID}`);
  console.log(`Total products to create: ${Object.keys(PRODUCTS).length}`);

  TOKEN = await getToken();
  console.log('Auth: OK');

  await createProducts();
  await setPrices();
  await setInventory();
  await createConfigurations();
  await triggerReindex();
  await verify();

  // Print summary
  console.log('\n=== SUMMARY ===');
  console.log('Created product IDs:');
  const baseProducts = ['bike', 'laptop', 'sale_bike', 'oos_bike', 'checkout_bike', 'ring', 'jersey', 'gift_box', 'phone_case', 'custom_bike'];
  for (const key of baseProducts) {
    console.log(`  ${PRODUCTS[key]?.name}: ${productIds[key] || 'MISSING'}`);
  }

  console.log(`\nTotal products created: ${Object.keys(productIds).length}/${Object.keys(PRODUCTS).length}`);
  console.log('Prefix: AGENT-TEST-');
  console.log(`Date: ${DATE_STAMP}`);
  console.log('\nDone!');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
