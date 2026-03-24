/**
 * Fix-up script: Set prices, inventory, and configurations for phone_case and custom_bike products
 * that were created by the batch endpoint but missed in the initial ID resolution.
 */
import https from 'https';

const BACK_URL = 'https://vcst-qa.govirto.com';
const PRICELIST_ID = '732f3fc9-e02f-4839-b69a-5ff7feaf7950';
const FFC_ID = '142ba5568ae4454aad553ece41b9c3b5';

let TOKEN = '';

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

async function getToken() {
  return new Promise((resolve, reject) => {
    const postData = 'grant_type=password&scope=offline_access&username=admin&password=Password1!';
    const options = {
      method: 'POST',
      hostname: 'vcst-qa.govirto.com',
      path: '/connect/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) },
      rejectUnauthorized: false,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const j = JSON.parse(data);
        if (j.access_token) resolve(j.access_token);
        else reject(new Error('Auth failed'));
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Product IDs from search results
const ids = {
  phone_case: 'f10b9acb-5062-48bd-b798-6672c918f4de',
  phone_case_clear: '02ff0e11-9253-413b-bc35-ec2bdb0a9101',
  phone_case_matte: 'bc957dc9-44e3-4437-90b0-4a3b29cb9a0c',
  phone_case_gloss: '194dace7-a616-4d8a-909e-2ba41de88b09',
  phone_case_ring: '101819df-3f31-4d63-a238-20025c15a584',
  phone_case_stand: 'c2bd51b2-ca04-4c13-bd61-a3ed18ba65e4',
  custom_bike: '39868188-8d2d-4387-8a50-690179b65ad1',
  cbike_frame_alu: 'c28a649a-f462-4600-b70a-07fa7f5d9197',
  cbike_frame_carbon: 'b151e698-568c-4f4c-9997-9fd6a9c1847b',
  cbike_frame_steel: '0288a6c0-2729-4271-a773-6ba685bce246',
  cbike_wheel_std: '9e5c6612-3183-45f8-bf53-2ab919d118dc',
  cbike_wheel_sport: '13fd1e5b-9071-4e1f-80f0-767f411234b2',
  cbike_wheel_pro: '5e871e07-aaaf-4d19-836d-a815cc3875a3',
  cbike_seat_basic: '2831d18e-07b8-49fe-8e98-8edb5195da5a',
  cbike_seat_comfort: '3ef48c98-c621-4ac4-b6bc-d6bb4614101b',
  cbike_seat_racing: '9dba40b6-4cf3-4ec8-8699-527bdf4bcd3f',
};

const PRICES = {
  phone_case: { list: 30 },
  phone_case_clear: { list: 0 },
  phone_case_matte: { list: 5 },
  phone_case_gloss: { list: 8 },
  phone_case_ring: { list: 10 },
  phone_case_stand: { list: 12 },
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

const INVENTORY = {
  phone_case: 50, phone_case_clear: 50, phone_case_matte: 40, phone_case_gloss: 30,
  phone_case_ring: 20, phone_case_stand: 15,
  custom_bike: 20, cbike_frame_alu: 20, cbike_frame_carbon: 10, cbike_frame_steel: 15,
  cbike_wheel_std: 20, cbike_wheel_sport: 15, cbike_wheel_pro: 8,
  cbike_seat_basic: 20, cbike_seat_comfort: 15, cbike_seat_racing: 10,
};

async function main() {
  TOKEN = await getToken();
  console.log('Auth: OK');

  // Step 1: Set prices
  console.log('\n=== Setting prices ===');
  const priceEntries = Object.entries(PRICES).map(([key, priceInfo]) => ({
    productId: ids[key],
    prices: [{
      pricelistId: PRICELIST_ID,
      currency: 'USD',
      productId: ids[key],
      list: priceInfo.list,
      minQuantity: 1,
    }],
  }));

  await request('PUT', '/api/products/prices', priceEntries);
  console.log('Prices set OK');

  // Step 2: Set inventory
  console.log('\n=== Setting inventory ===');
  const invEntries = Object.entries(INVENTORY).map(([key, qty]) => ({
    fulfillmentCenterId: FFC_ID,
    productId: ids[key],
    inStockQuantity: qty,
    reservedQuantity: 0,
  }));

  await request('PUT', '/api/inventory/plenty', invEntries);
  console.log('Inventory set OK');

  // Step 3: Create configurations
  console.log('\n=== Creating configurations ===');

  // Phone Case: 3 sections (required Product, optional Product, optional Text)
  const phoneConfig = {
    productId: ids.phone_case,
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
          { productId: ids.phone_case_clear, quantity: 1 },
          { productId: ids.phone_case_matte, quantity: 1 },
          { productId: ids.phone_case_gloss, quantity: 1 },
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
          { productId: ids.phone_case_ring, quantity: 1 },
          { productId: ids.phone_case_stand, quantity: 1 },
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
  };

  const phoneResult = await request('POST', '/api/catalog/products/configurations', phoneConfig);
  console.log('Phone Case config:', phoneResult?.id || 'OK');

  // Custom Bike: 3 sections (2 required, 1 optional)
  const bikeConfig = {
    productId: ids.custom_bike,
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
          { productId: ids.cbike_frame_alu, quantity: 1 },
          { productId: ids.cbike_frame_carbon, quantity: 1 },
          { productId: ids.cbike_frame_steel, quantity: 1 },
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
          { productId: ids.cbike_wheel_std, quantity: 1 },
          { productId: ids.cbike_wheel_sport, quantity: 1 },
          { productId: ids.cbike_wheel_pro, quantity: 1 },
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
          { productId: ids.cbike_seat_basic, quantity: 1 },
          { productId: ids.cbike_seat_comfort, quantity: 1 },
          { productId: ids.cbike_seat_racing, quantity: 1 },
        ],
      },
    ],
  };

  const bikeResult = await request('POST', '/api/catalog/products/configurations', bikeConfig);
  console.log('Custom Bike config:', bikeResult?.id || 'OK');

  // Verify
  console.log('\n=== Verification ===');
  for (const key of ['phone_case', 'custom_bike']) {
    const prices = await request('GET', `/api/catalog/products/${ids[key]}/pricelists`);
    const priceList = (Array.isArray(prices) ? prices : []).find(pl => pl.name === '[E2E Test] Electronics');
    const price = priceList?.prices?.[0];
    console.log(`${key}: price list=${price?.list}`);

    const configSearch = await request('POST', '/api/catalog/products/configurations/search', {
      productId: ids[key], take: 1,
    });
    const config = configSearch.results?.[0];
    console.log(`${key}: config active=${config?.isActive}, sections=${config?.sections?.length}`);
  }

  console.log('\nDone!');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
