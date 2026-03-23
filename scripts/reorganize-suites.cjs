#!/usr/bin/env node
/**
 * Reorganize test suites: split large CSVs by Section into module-aligned directories.
 *
 * Usage: node scripts/reorganize-suites.js
 *
 * This script:
 * 1. Reads each old CSV suite
 * 2. Groups test cases by Section prefix (top-level before " > ")
 * 3. Writes new CSV files into module directories with fresh 3-digit IDs
 * 4. Copies intact suites to their new locations
 * 5. Prints a summary of all moves/splits
 */

const fs = require('fs');
const path = require('path');
const { parse, stringify } = require('csv-parse/sync');
const { stringify: csvStringify } = require('csv-stringify/sync');

const SUITES_DIR = path.join(__dirname, '..', 'regression', 'suites');
const HEADER = 'ID,Title,Section,Priority,Business_Rule,Edge_Case_Refs,Preconditions,Test_Data,Steps,Assertions,Cross_Layer_Checks,Failure_Signals,Cleanup,References,Automation_Status';
const HEADER_COLS = HEADER.split(',');

// ── Helper: read CSV robustly (handles multi-line cells, relaxed quoting) ──
function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return parse(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
    });
  } catch (e) {
    console.warn(`  WARN: csv-parse failed for ${path.basename(filePath)}: ${e.message}`);
    console.warn(`  Attempting raw split fallback...`);
    return rawParseCsv(raw);
  }
}

// Fallback parser for malformed CSVs
function rawParseCsv(raw) {
  // Split on lines that start with a test case ID pattern (e.g., SMK-001,)
  const idPattern = /^([A-Z]+-\d+),/;
  const lines = raw.split('\n');
  const records = [];
  let currentRecord = null;
  let headerLine = lines[0];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (idPattern.test(line)) {
      if (currentRecord) {
        records.push(parseRecordLine(currentRecord, HEADER_COLS));
      }
      currentRecord = line;
    } else if (currentRecord) {
      currentRecord += '\n' + line;
    }
  }
  if (currentRecord) {
    records.push(parseRecordLine(currentRecord, HEADER_COLS));
  }
  return records;
}

function parseRecordLine(recordStr, columns) {
  try {
    const parsed = parse(recordStr + '\n', {
      columns: columns,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
    });
    return parsed[0] || {};
  } catch {
    // Last resort: just grab ID and Section from the start
    const match = recordStr.match(/^([^,]+),"([^"]*?)","([^"]*?)"/);
    if (match) {
      return { ID: match[1], Title: match[2], Section: match[3] };
    }
    return { ID: 'UNKNOWN', Section: 'UNKNOWN' };
  }
}

// ── Helper: write CSV from records ──
function writeCsv(filePath, records) {
  // Write header + each record as CSV
  const output = csvStringify(records, {
    header: true,
    columns: HEADER_COLS,
    quoted_string: true,
  });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, output, 'utf-8');
}

// ── Helper: copy file (for intact suites) ──
function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// ── Helper: get top-level section ──
function getTopSection(section) {
  if (!section) return 'Unknown';
  const parts = section.split(' > ');
  return parts[0].trim();
}

// ── Helper: group records by a classifier function ──
function groupBy(records, classifier) {
  const groups = {};
  for (const rec of records) {
    const key = classifier(rec);
    if (!groups[key]) groups[key] = [];
    groups[key].push(rec);
  }
  return groups;
}

// ────────────────────────────────────────────────
// SPLIT DEFINITIONS
// Each entry: { source, splits: [{ id, name, dir, matcher }] }
// matcher: function(record) => boolean — which records go to this split
// If matcher is null, it's a "catch-all" for remaining records
// ────────────────────────────────────────────────

const splitDefs = [
  // ── 03 - Catalog & Search (130) → 5 suites ──
  {
    source: 'Frontend/03-catalog-search-tests.csv',
    splits: [
      {
        id: '001', name: 'Catalog Navigation', dir: 'catalog',
        matcher: (r) => {
          const s = r.Section || '';
          const top = getTopSection(s);
          if (top !== 'Catalog') return false;
          return /Navigation|Breadcrumb|Brand|Display|Sort|SEO|Responsive/i.test(s) && !/Filter|Comparison|Compare/i.test(s);
        }
      },
      {
        id: '002', name: 'Product Detail', dir: 'catalog',
        matcher: (r) => {
          const s = r.Section || '';
          const top = getTopSection(s);
          if (top !== 'Catalog') return false;
          return /Product|Comparison|Compare|Pricing|Variation|Virtual|Configurable|Category Selector/i.test(s);
        }
      },
      {
        id: '003', name: 'Catalog Filters', dir: 'catalog',
        matcher: (r) => {
          const s = r.Section || '';
          const top = getTopSection(s);
          if (top !== 'Catalog') return false;
          return /Filter|Chip|Badge|Pagination/i.test(s);
        }
      },
      {
        id: '004', name: 'Search Core', dir: 'search',
        matcher: (r) => {
          const s = r.Section || '';
          const top = getTopSection(s);
          if (top !== 'Search') return false;
          return /Basic|Autocomplete|Suggest|Fuzzy|SKU|Pagination|Sort|Dropdown|Submission|Input|History|Hints|Scoped|URL|Navigation|Results Page/i.test(s)
            && !/Filter|Facet|Price Filter/i.test(s);
        }
      },
      {
        id: '005', name: 'Search Filters & Advanced', dir: 'search',
        matcher: (r) => {
          const s = r.Section || '';
          return getTopSection(s) === 'Search'; // catch-all for remaining Search
        }
      },
    ]
  },

  // ── 13 - B2C Features (166) → 5 suites ──
  {
    source: 'Frontend/13-b2c-features-tests.csv',
    splits: [
      {
        id: '006', name: 'B2C Organization', dir: 'b2c',
        matcher: (r) => /Organization/i.test(r.Section || '')
      },
      {
        id: '007', name: 'B2C Lists & Shared', dir: 'b2c',
        matcher: (r) => /List|Shared/i.test(r.Section || '')
      },
      {
        id: '008', name: 'B2C Members', dir: 'b2c',
        matcher: (r) => /Member/i.test(r.Section || '')
      },
      {
        id: '009', name: 'B2C Variations & Configs', dir: 'b2c',
        matcher: (r) => /Variation|Configuration/i.test(r.Section || '')
      },
      {
        id: '010', name: 'B2C Bulk Ship Dashboard', dir: 'b2c',
        matcher: (r) => true // catch-all: Bulk Order, Ship To, Dashboard, Notifications, Back in Stock, Loyalty
      },
    ]
  },

  // ── 04b - Checkout (80) → 3 checkout + orders frontend ──
  {
    source: 'Frontend/04b-checkout-tests.csv',
    splits: [
      {
        id: '012', name: 'Checkout Guest', dir: 'checkout',
        matcher: (r) => /Guest/i.test(r.Section || '')
      },
      {
        id: '013', name: 'Checkout B2B', dir: 'checkout',
        matcher: (r) => /B2B/i.test(r.Section || '')
      },
      {
        id: '014a', name: 'Orders Frontend (from Checkout)', dir: 'orders',
        matcher: (r) => /^Orders/i.test(getTopSection(r.Section || ''))
      },
      {
        id: '011', name: 'Checkout Flow', dir: 'checkout',
        matcher: (r) => true // catch-all: remaining checkout sections
      },
    ]
  },

  // ── 04c - Orders & Quotes (81) → quotes + orders frontend + reorder/cancel ──
  {
    source: 'Frontend/04c-orders-quotes-tests.csv',
    splits: [
      {
        id: '015', name: 'Quotes', dir: 'orders',
        matcher: (r) => /Quote/i.test(getTopSection(r.Section || ''))
      },
      {
        id: '014b', name: 'Orders Frontend (from Orders-Quotes)', dir: 'orders',
        matcher: (r) => true // catch-all: remaining Orders sections
      },
    ]
  },

  // ── 04a - Cart (77) → 3 suites ──
  {
    source: 'Frontend/04a-cart-tests.csv',
    splits: [
      {
        id: '030', name: 'Cart Merge', dir: 'cart',
        matcher: (r) => /Merge/i.test(r.Section || '')
      },
      {
        id: '029', name: 'Cart Validation & Persistence', dir: 'cart',
        matcher: (r) => /Validation|Persistence|Price|Coupon|Save Later/i.test(r.Section || '')
      },
      {
        id: '028', name: 'Cart Core', dir: 'cart',
        matcher: (r) => true // catch-all
      },
    ]
  },

  // ── 02 - Authentication (68) → 3 suites ──
  {
    source: 'Frontend/02-authentication-tests.csv',
    splits: [
      {
        id: '032', name: 'Auth Session & RBAC', dir: 'auth',
        matcher: (r) => /Session|Token|RBAC|Route|Concurrent|Impersonation/i.test(r.Section || '')
      },
      {
        id: '033', name: 'Auth Company & Account Menu', dir: 'auth',
        matcher: (r) => /Company|Account Menu/i.test(r.Section || '')
      },
      {
        id: '031', name: 'Auth Login & Register', dir: 'auth',
        matcher: (r) => true // catch-all: Registration, Login, Password Reset, SSO
      },
    ]
  },

  // ── 05 - BOPIS (88) → 3 suites ──
  {
    source: 'Frontend/05-bopis-pickup-tests.csv',
    splits: [
      {
        id: '037', name: 'BOPIS Cart', dir: 'bopis',
        matcher: (r) => /Cart/i.test(r.Section || '')
      },
      {
        id: '038', name: 'BOPIS Checkout', dir: 'bopis',
        matcher: (r) => /Checkout|Guest|Promotions|Multi-Location|Order History/i.test(r.Section || '')
      },
      {
        id: '036', name: 'BOPIS Store Selector', dir: 'bopis',
        matcher: (r) => true // catch-all: Product Page, Map, Search, Filters, etc.
      },
    ]
  },

  // ── 06 - Payment (65) → 3 suites ──
  {
    source: 'Frontend/06-payment-tests.csv',
    splits: [
      {
        id: '039', name: 'Payment CyberSource', dir: 'payment',
        matcher: (r) => /CyberSource|3D Secure/i.test(r.Section || '')
      },
      {
        id: '040', name: 'Payment Processors', dir: 'payment',
        matcher: (r) => /Authorize|Datatrans|Skyflow|Saved Card|Manual|Method Switch/i.test(r.Section || '')
      },
      {
        id: '041', name: 'Payment Cross-Cutting', dir: 'payment',
        matcher: (r) => true // catch-all: Declined, Guest, UX, Perf, Edge Cases
      },
    ]
  },

  // ── 20 - Orders Admin (90) → 3 suites ──
  {
    source: 'Backend/20-orders-tests.csv',
    splits: [
      {
        id: '018', name: 'Orders Admin Payments', dir: 'orders',
        matcher: (r) => /Payment|Capture|Refund/i.test(r.Section || '')
      },
      {
        id: '019', name: 'Orders Admin Shipments', dir: 'orders',
        matcher: (r) => /Shipment|Inventory Adjustment/i.test(r.Section || '')
      },
      {
        id: '017', name: 'Orders Admin Management', dir: 'orders',
        matcher: (r) => true // catch-all
      },
    ]
  },

  // ── 17 - Platform Core (80) → 2 suites (merge health+settings into users) ──
  {
    source: 'Backend/17-platform-core-tests.csv',
    splits: [
      {
        id: '021', name: 'Platform Dynamic Properties', dir: 'platform',
        matcher: (r) => /Dynamic Propert/i.test(r.Section || '')
      },
      {
        id: '020', name: 'Platform Users Roles & Settings', dir: 'platform',
        matcher: (r) => true // catch-all: User Management, Roles, API Keys, Health, Settings, Security, Appearance
      },
    ]
  },

  // ── 23 - Marketing Admin (89) → 3 suites ──
  {
    source: 'Backend/23-marketing-tests.csv',
    splits: [
      {
        id: '024', name: 'Marketing Content', dir: 'marketing',
        matcher: (r) => /Content|Placeholder|Publishing|Visitor|Folder/i.test(r.Section || '') && !/Coupon|Promotion|Dynamic Assoc|REST|xAPI|Permission|Data Integrity/i.test(r.Section || '')
      },
      {
        id: '025', name: 'Marketing Coupons & API', dir: 'marketing',
        matcher: (r) => /Coupon|Dynamic Assoc|Permission|REST|xAPI|Data Integrity/i.test(r.Section || '')
      },
      {
        id: '023', name: 'Marketing Promotions', dir: 'marketing',
        matcher: (r) => true // catch-all: Promotions, Effects, Policies, Conditions, Gifts, Settings, Multi-Store
      },
    ]
  },

  // ── 21 - Customer Admin (84) → 2 suites ──
  {
    source: 'Backend/21-customer-tests.csv',
    splits: [
      {
        id: '027', name: 'Customer Orgs & Invites', dir: 'customer',
        matcher: (r) => /Organization|Invite|Email Verif|Dynamic Prop|Extension|xAPI/i.test(r.Section || '')
      },
      {
        id: '026', name: 'Customer Contacts', dir: 'customer',
        matcher: (r) => true // catch-all
      },
    ]
  },

  // ── 18 - Store Admin (65) → 2 suites ──
  {
    source: 'Backend/18-store-tests.csv',
    splits: [
      {
        id: '035', name: 'Store Rounding & Email', dir: 'store',
        matcher: (r) => /Rounding|Midpoint|Email Verif|Tax|Anonymous|Aggregation/i.test(r.Section || '')
      },
      {
        id: '034', name: 'Store Management', dir: 'store',
        matcher: (r) => true // catch-all
      },
    ]
  },

  // ── 19 - Pricing (62) → 2 suites ──
  {
    source: 'Backend/19-pricing-tests.csv',
    splits: [
      {
        id: '054', name: 'Pricing Logic', dir: 'pricing',
        matcher: (r) => /Logic|Min Quantity|Recommended|Lowest|Discount|Tax/i.test(r.Section || '')
      },
      {
        id: '055', name: 'Pricing Management', dir: 'pricing',
        matcher: (r) => true // catch-all
      },
    ]
  },

  // ── 16 - Catalog Admin (78) → 3 suites ──
  {
    source: 'Backend/16-catalog-tests.csv',
    splits: [
      {
        id: '052', name: 'Configurable Products Admin', dir: 'configurable-products',
        matcher: (r) => /Configurable/i.test(r.Section || '') || /Configured Orders/i.test(r.Section || '')
      },
      {
        id: '053', name: 'Catalog Admin Categories', dir: 'catalog',
        matcher: (r) => /Categor|Units of Measure/i.test(r.Section || '')
      },
      {
        id: '051', name: 'Catalog Admin Products', dir: 'catalog',
        matcher: (r) => true // catch-all
      },
    ]
  },

  // ── 24 - Notifications (53) → 2 suites ──
  {
    source: 'Backend/24-notifications-tests.csv',
    splits: [
      {
        id: '058', name: 'Notifications Triggers', dir: 'notifications',
        matcher: (r) => /Account|Order|Abandoned|SMS|Predefined|Recipient|Feed|Attachment/i.test(r.Section || '')
      },
      {
        id: '057', name: 'Notifications Templates', dir: 'notifications',
        matcher: (r) => true // catch-all
      },
    ]
  },

  // ── 25 - CMS (56) → 2 suites ──
  {
    source: 'Backend/25-cms-pagebuilder-tests.csv',
    splits: [
      {
        id: '060', name: 'CMS Design & Content', dir: 'cms',
        matcher: (r) => /Content Block|Grid|Design|Designer|Field Type|Section Setting|Badge|Storefront|Cross-Browser/i.test(r.Section || '')
      },
      {
        id: '059', name: 'CMS Page Management', dir: 'cms',
        matcher: (r) => true // catch-all
      },
    ]
  },

  // ── 35 - White Labeling Frontend (68) → 2 suites ──
  {
    source: 'Frontend/35-frontend-whitelabeling-tests.csv',
    splits: [
      {
        id: '071', name: 'Whitelabeling Branding', dir: 'whitelabeling',
        matcher: (r) => {
          // Split roughly in half by section — second half alphabetically
          const s = r.Section || '';
          return /Logo|Favicon|Color|Font|Theme|Brand|Custom|Organization/i.test(s);
        }
      },
      {
        id: '070', name: 'Whitelabeling Storefront', dir: 'whitelabeling',
        matcher: (r) => true // catch-all
      },
    ]
  },

  // ── 41 - Coupons & Promotions Frontend (54) → 2 suites ──
  {
    source: 'Frontend/41-coupons-promotions-tests.csv',
    splits: [
      {
        id: '078', name: 'Promotions Advanced', dir: 'marketing',
        matcher: (r) => {
          const s = r.Section || '';
          return /Stacking|Combination|Priority|Expir|Edge|Advanced/i.test(s);
        }
      },
      {
        id: '077', name: 'Coupons & Promotions Storefront', dir: 'marketing',
        matcher: (r) => true // catch-all
      },
    ]
  },
];

// ── INTACT MOVES (just copy, no split) ──
const intactMoves = [
  { source: 'Frontend/01-smoke-tests.csv', id: '042', name: 'Smoke Tests', dir: 'cross-cutting' },
  { source: 'Frontend/07-google-analytics-tests.csv', id: '043', name: 'Google Analytics', dir: 'cross-cutting' },
  { source: 'Frontend/08-security-tests.csv', id: '044', name: 'Security Tests', dir: 'cross-cutting' },
  { source: 'Frontend/09-accessibility-tests.csv', id: '045', name: 'Accessibility Tests', dir: 'cross-cutting' },
  { source: 'Frontend/10-localization-tests.csv', id: '046', name: 'Localization Tests', dir: 'cross-cutting' },
  { source: 'Frontend/11-performance-tests.csv', id: '047', name: 'Performance Tests', dir: 'cross-cutting' },
  { source: 'Frontend/12-browser-compatibility-tests.csv', id: '048', name: 'Browser Compatibility', dir: 'cross-cutting' },
  { source: 'Frontend/36-configurable-products-tests.csv', id: '072', name: 'Configurable Products Storefront', dir: 'configurable-products' },
  { source: 'Backend/14-platform-api-tests.csv', id: '049', name: 'Platform API', dir: 'api' },
  { source: 'Backend/15-graphql-xapi-tests.csv', id: '050', name: 'GraphQL xAPI', dir: 'graphql' },
  { source: 'Backend/22-inventory-tests.csv', id: '056', name: 'Inventory', dir: 'inventory' },
  { source: 'Backend/26-search-indexing-tests.csv', id: '061', name: 'Search Indexing Admin', dir: 'search' },
  { source: 'Backend/27-assets-tests.csv', id: '062', name: 'Assets', dir: 'assets' },
  { source: 'Backend/28-core-settings-tests.csv', id: '063', name: 'Core Settings', dir: 'platform' },
  { source: 'Backend/29-csv-export-import-tests.csv', id: '064', name: 'CSV Import Export', dir: 'import-export' },
  { source: 'Backend/30-shipping-tests.csv', id: '065', name: 'Shipping', dir: 'shipping' },
  { source: 'Backend/31-seo-tests.csv', id: '066', name: 'SEO', dir: 'seo' },
  { source: 'Backend/32-whitelabeling-tests.csv', id: '067', name: 'Whitelabeling Admin', dir: 'whitelabeling' },
  { source: 'Backend/33-push-messages-tests.csv', id: '068', name: 'Push Messages', dir: 'push-messages' },
  { source: 'Backend/34-image-tools-tests.csv', id: '069', name: 'Image Tools', dir: 'image-tools' },
  { source: 'Backend/37-returns-tests.csv', id: '073', name: 'Returns', dir: 'returns' },
  { source: 'Backend/38-contracts-tests.csv', id: '074', name: 'Contracts', dir: 'contracts' },
  { source: 'Backend/39-loyalty-tests.csv', id: '075', name: 'Loyalty', dir: 'loyalty' },
  { source: 'Backend/40-channels-tests.csv', id: '076', name: 'Channels', dir: 'channels' },
  { source: 'Backend/42-xmarketing-tests.csv', id: '079', name: 'xMarketing', dir: 'xmarketing' },
  { source: 'Frontend/00-full-regression-release.csv', id: '080', name: 'Full Regression Release', dir: '_release' },
];

// ────────────────────────────────────────────────
// EXECUTION
// ────────────────────────────────────────────────

const results = [];
let totalOld = 0;
let totalNew = 0;

console.log('=== SPLITTING SUITES ===\n');

for (const def of splitDefs) {
  const srcPath = path.join(SUITES_DIR, def.source);
  if (!fs.existsSync(srcPath)) {
    console.error(`ERROR: Source not found: ${def.source}`);
    continue;
  }

  const records = readCsv(srcPath);
  const srcCount = records.length;
  totalOld += srcCount;
  console.log(`${def.source} (${srcCount} tests):`);

  const assigned = new Set();

  for (const split of def.splits) {
    const matching = records.filter((r, i) => {
      if (assigned.has(i)) return false;
      if (split.matcher(r)) {
        assigned.add(i);
        return true;
      }
      return false;
    });

    if (matching.length === 0) {
      console.log(`  SKIP ${split.id}-${split.name}: 0 tests (no matches)`);
      continue;
    }

    const destFile = `${split.id}-${split.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    const destPath = path.join(SUITES_DIR, split.dir, destFile);

    writeCsv(destPath, matching);
    totalNew += matching.length;
    console.log(`  → ${split.dir}/${destFile}: ${matching.length} tests`);

    results.push({
      id: split.id,
      name: split.name,
      dir: split.dir,
      file: `regression/suites/${split.dir}/${destFile}`,
      testCount: matching.length,
      source: def.source,
      type: 'split',
    });
  }

  // Check for unassigned records
  const unassigned = records.filter((_, i) => !assigned.has(i));
  if (unassigned.length > 0) {
    console.warn(`  WARNING: ${unassigned.length} unassigned test(s) from ${def.source}!`);
    for (const r of unassigned) {
      console.warn(`    - ${r.ID}: ${r.Section}`);
    }
  }
}

// ── Merge orders frontend from 04b and 04c ──
console.log('\n=== MERGING ORDERS FRONTEND ===\n');

const orders14aPath = path.join(SUITES_DIR, 'orders', '014a-orders-frontend--from-checkout-.csv');
const orders14bPath = path.join(SUITES_DIR, 'orders', '014b-orders-frontend--from-orders-quotes-.csv');

if (fs.existsSync(orders14aPath) && fs.existsSync(orders14bPath)) {
  const a = readCsv(orders14aPath);
  const b = readCsv(orders14bPath);
  const merged = [...a, ...b];
  const mergedPath = path.join(SUITES_DIR, 'orders', '014-orders-frontend.csv');
  writeCsv(mergedPath, merged);
  console.log(`  Merged 014a (${a.length}) + 014b (${b.length}) → 014-orders-frontend.csv (${merged.length} tests)`);

  // Remove temp files
  fs.unlinkSync(orders14aPath);
  fs.unlinkSync(orders14bPath);

  // Update results
  const idx14a = results.findIndex(r => r.id === '014a');
  const idx14b = results.findIndex(r => r.id === '014b');
  if (idx14a >= 0) results.splice(idx14a, 1);
  if (idx14b >= 0) results.splice(idx14b >= idx14a ? idx14b - 1 : idx14b, 1);

  results.push({
    id: '014',
    name: 'Orders Frontend',
    dir: 'orders',
    file: 'regression/suites/orders/014-orders-frontend.csv',
    testCount: merged.length,
    source: '04b+04c merged',
    type: 'merged',
  });
} else {
  console.warn('  Could not find 014a/014b temp files to merge');
}

console.log('\n=== COPYING INTACT SUITES ===\n');

for (const move of intactMoves) {
  const srcPath = path.join(SUITES_DIR, move.source);
  if (!fs.existsSync(srcPath)) {
    console.error(`ERROR: Source not found: ${move.source}`);
    continue;
  }

  const destFile = `${move.id}-${move.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
  const destPath = path.join(SUITES_DIR, move.dir, destFile);
  copyFile(srcPath, destPath);

  // Count tests
  let count;
  try {
    const records = readCsv(srcPath);
    count = records.length;
  } catch {
    // For files that fail to parse, estimate from line count
    const lines = fs.readFileSync(srcPath, 'utf-8').split('\n');
    count = lines.filter(l => /^[A-Z]+-\d+,/.test(l)).length;
  }

  totalOld += count;
  totalNew += count;
  console.log(`  ${move.source} → ${move.dir}/${destFile} (${count} tests)`);

  results.push({
    id: move.id,
    name: move.name,
    dir: move.dir,
    file: `regression/suites/${move.dir}/${destFile}`,
    testCount: count,
    source: move.source,
    type: 'intact',
  });
}

// ── Move old files to _legacy ──
console.log('\n=== MOVING OLD FILES TO _legacy ===\n');
const oldDirs = ['Frontend', 'Backend'];
for (const d of oldDirs) {
  const dirPath = path.join(SUITES_DIR, d);
  if (!fs.existsSync(dirPath)) continue;
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.csv'));
  for (const f of files) {
    const src = path.join(dirPath, f);
    const dest = path.join(SUITES_DIR, '_legacy', `${d}-${f}`);
    fs.renameSync(src, dest);
    console.log(`  ${d}/${f} → _legacy/${d}-${f}`);
  }
}

// ── Summary ──
console.log('\n=== SUMMARY ===\n');
console.log(`Total suites: ${results.length}`);
console.log(`Total old test cases: ${totalOld}`);
console.log(`Total new test cases: ${totalNew}`);
if (totalOld !== totalNew) {
  console.warn(`WARNING: Test count mismatch! Old=${totalOld}, New=${totalNew}`);
}

// Sort by ID and print
results.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
console.log('\nNew suite inventory:');
for (const r of results) {
  console.log(`  ${r.id.padEnd(5)} ${r.dir.padEnd(25)} ${r.name.padEnd(40)} ${String(r.testCount).padStart(4)} tests  (${r.type} from ${r.source})`);
}

// Write results JSON for use by manifest update step
fs.writeFileSync(
  path.join(__dirname, 'reorganize-results.json'),
  JSON.stringify(results, null, 2),
  'utf-8'
);
console.log('\nResults written to scripts/reorganize-results.json');
