// Standard-storefront scenario — scripts the standard vc-frontend cart read path
// (getFullCart in a loop). Adapt the ops in ../queries/ if your project overrides the
// storefront schema; see ../README.md.
import { getAuth, getAuthPool } from '../lib/auth.js';
import { gql, gqlQuiet } from '../lib/gql.js';
import { STORE } from '../config.js';

// Read-path L2 scenario (read/validation subjects): carts are built ONCE
// in setup() — one per pool user (or one for the single env user), cleared then filled with
// ITEMS items so a cart left behind by an earlier run cannot push the count past ITEMS —
// and the measured iteration is a pure `getFullCart` read. Isolates the unlocked read
// path (aggregate cache + GraphQL projection) from the per-user-locked mutation path
// that cart-order-loop.js exercises.
//
// Cart size is the primary knob for this subject (README «Cart-size band seeding»):
// run bands via ITEMS (e.g. 5 / 50 / 200) with otherwise identical knobs.
//
// Knobs (env): PROFILE=smoke|steady · ITEMS=5 (cart size, built in setup) ·
// RATE=5 (steady arrivals/s) · ITERATIONS=3 (smoke) · PRODUCT_IDS / PRODUCT_ID / PRODUCT_FILTER ·
// DISTINCT_PRODUCTS=0 (0 = all items share one product — max product-duplication;
// N > 0 = discover up to N distinct buyable products and cycle them across items —
// the realistic-mix band; fewer found than asked is logged, not fatal) ·
// USER_POOL=0 · BASE_URL · SUMMARY_PATH.

const Q = {
    clearCart: open('../queries/clearCart.graphql'),
    addItemsCart: open('../queries/addItemsCart.graphql'),
    getFullCart: open('../queries/getFullCart.graphql'),
};

const BASE_URL = __ENV.BASE_URL || 'https://localhost:8090';
const SKIP_TLS = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE_URL);
const PROFILE = __ENV.PROFILE || 'smoke';
const ITEMS = Number(__ENV.ITEMS || 5);
const RATE = Number(__ENV.RATE || 5);

const DISTINCT_PRODUCTS = Number(__ENV.DISTINCT_PRODUCTS || 0);
const USER_POOL = Number(__ENV.USER_POOL || 0);
const SEED_PASSWORD = __ENV.SEED_PASSWORD || '';
const SEED_EMAIL_FORMAT = __ENV.SEED_EMAIL_FORMAT || 'loadtest+%d@example.test';
// HOLD stretches the steady window (default 120s) — long holds host sequential L3
// trace captures inside ONE run, so all captures share identical knobs by construction.
const HOLD = __ENV.HOLD || '120s';

const profiles = {
    smoke: { executor: 'shared-iterations', vus: 1, iterations: Number(__ENV.ITERATIONS || 3), maxDuration: '30m' },
    steady: {
        executor: 'ramping-arrival-rate',
        startRate: 0,
        timeUnit: '1s',
        preAllocatedVUs: 50,
        stages: [
            { target: RATE, duration: '10s' },
            { target: RATE, duration: HOLD },
        ],
    },
};

export const options = {
    insecureSkipTLSVerify: SKIP_TLS, // only for a local dev cert; verify against real hosts
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'count'],
    // Cart building is serial in setup(): USER_POOL × ITEMS mutations at ~100ms each.
    setupTimeout: '15m',
    scenarios: { cartReadLoop: profiles[PROFILE] },
    thresholds: {
        http_req_failed: ['rate<0.05'],
        checks: ['rate>0.95'],
        'http_req_duration{name:getFullCart}': ['p(95)<3000'],
    },
};

// Setup-only product discovery (mirrors cart-order-loop.js — not a measured operation).
const SETUP_SEARCH = `query($storeId: String!, $userId: String!, $currencyCode: String!, $first: Int, $filter: String) {
  products(storeId: $storeId, userId: $userId, currencyCode: $currencyCode, first: $first, filter: $filter) {
    items { id code isConfigurable availabilityData { isBuyable } }
  }
}`;

export function setup() {
    if (USER_POOL > 0 && !SEED_PASSWORD) {
        throw new Error('SEED_PASSWORD is required when USER_POOL>0 (seeded-user pool password)');
    }
    const pool = USER_POOL > 0 ? getAuthPool(BASE_URL, USER_POOL, SEED_EMAIL_FORMAT, SEED_PASSWORD) : null;
    const users = pool || [getAuth(BASE_URL)];

    let productIds = __ENV.PRODUCT_IDS ? __ENV.PRODUCT_IDS.split(',') : __ENV.PRODUCT_ID ? [__ENV.PRODUCT_ID] : [];
    let code = '(PRODUCT_IDS/PRODUCT_ID from env)';
    if (!productIds.length) {
        const data = gql(BASE_URL, users[0].token, 'setup:searchProducts', SETUP_SEARCH, {
            storeId: STORE.storeId,
            currencyCode: STORE.currencyCode,
            userId: users[0].userId,
            first: Math.max(50, DISTINCT_PRODUCTS),
            filter: __ENV.PRODUCT_FILTER || '',
        });
        const items = (data && data.products && data.products.items) || [];
        const buyable = items.filter((x) => x.availabilityData && x.availabilityData.isBuyable && !x.isConfigurable);
        if (DISTINCT_PRODUCTS > 0) {
            productIds = buyable.slice(0, DISTINCT_PRODUCTS).map((x) => x.id);
            code = `${productIds.length} distinct buyable products (asked ${DISTINCT_PRODUCTS})`;
        } else {
            const pick = buyable[0] || items[0];
            if (pick) {
                productIds = [pick.id];
                code = pick.code;
            }
        }
        if (!productIds.length) {
            throw new Error('setup: no product discovered — pass PRODUCT_IDS, PRODUCT_ID or PRODUCT_FILTER');
        }
    }

    // Build one cart per user, ITEMS items each. These carts live for the whole run;
    // the measured loop only reads them.
    const carts = users.map((auth, i) => {
        const cartItems = [];
        for (let n = 0; n < ITEMS; n++) {
            cartItems.push({ productId: productIds[n % productIds.length], quantity: 1 });
        }
        // Clear first: `addItemsCart` carries no cartId/cartName, so x-cart resolves this user's
        // EXISTING cart rather than creating one, and BL-CART-007 sums repeated products. A cart
        // left behind by an earlier run would push itemsQuantity past ITEMS and abort setup at the
        // check below — so a second run against the same seeded users would never start.
        gqlQuiet(BASE_URL, auth.token, 'setup:clearCart', Q.clearCart, {
            command: { ...STORE, userId: auth.userId },
        });

        const added = gql(BASE_URL, auth.token, 'setup:addItemsCart', Q.addItemsCart, {
            command: { ...STORE, userId: auth.userId, cartItems },
        });
        const cartId = added && added.addItemsCart && added.addItemsCart.id;
        if (!cartId) {
            throw new Error(`setup: cart creation failed for user ${i}`);
        }

        // addItemsCart can settle async / silently no-op on a stale or disabled product id (see
        // ../README.md «PRODUCT_IDS drift») — verify the settled item count before handing this
        // cart to the measured read loop, so the whole run doesn't silently measure the wrong
        // cart-size band. Verify itemsQuantity (total unit count), NOT items.length: per
        // BL-CART-007, adding the same product multiple times consolidates into one line with
        // quantity summed, so items.length depends on DISTINCT_PRODUCTS (1 by default) while
        // itemsQuantity is always ITEMS regardless of consolidation.
        const full = gql(BASE_URL, auth.token, 'setup:getFullCart', Q.getFullCart, {
            ...STORE, userId: auth.userId, cartId,
        });
        const settledQuantity = full && full.cart && full.cart.itemsQuantity;
        if (settledQuantity !== ITEMS) {
            throw new Error(
                `setup: cart for user ${i} has itemsQuantity=${settledQuantity ?? 0}/${ITEMS} after settling — a stale/disabled PRODUCT_IDS entry silently no-ops (see ../README.md)`,
            );
        }

        return { token: auth.token, userId: auth.userId, cartId };
    });

    console.log(`setup: profile=${PROFILE} pool=${users.length} carts=${carts.length} items/cart=${ITEMS} distinct=${productIds.length} product=${code}`);

    return { carts };
}

export default function (ctx) {
    // Each VU reads "its" cart (round-robin by __VU) — with a pool that is N distinct
    // aggregates; without one, all VUs share a single cached aggregate.
    const cart = ctx.carts[(__VU - 1) % ctx.carts.length];

    gql(BASE_URL, cart.token, 'getFullCart', Q.getFullCart, { ...STORE, userId: cart.userId, cartId: cart.cartId });
}

export function handleSummary(data) {
    const out = { stdout: shortText(data) };
    if (__ENV.SUMMARY_PATH) {
        out[__ENV.SUMMARY_PATH] = JSON.stringify(data, null, 1);
    }

    return out;
}

function shortText(data) {
    const lines = ['', `── cart-read-loop · ${PROFILE} · ITEMS=${ITEMS} ──`];
    const m = data.metrics || {};
    const fmt = (v) => (v == null ? '—' : `${Math.round(v)}ms`);
    for (const key of Object.keys(m).sort()) {
        if (!key.startsWith('http_req_duration{name:')) {
            continue;
        }
        const v = m[key].values || {};
        const name = key.replace(/^http_req_duration\{name:/, '').replace(/\}$/, '');
        lines.push(`  ${name.padEnd(22)} p95 ${fmt(v['p(95)'])}  avg ${fmt(v.avg)}  n=${m[key].values.count ?? '—'}`);
    }
    const failed = m.http_req_failed && m.http_req_failed.values;
    const checks = m.checks && m.checks.values;
    const iters = m.iterations && m.iterations.values;
    lines.push(`  http_req_failed ${failed ? (failed.rate * 100).toFixed(2) : '—'}%  checks ${checks ? (checks.rate * 100).toFixed(2) : '—'}%  iterations ${iters ? iters.count : '—'}`);
    lines.push('');

    return lines.join('\n');
}
