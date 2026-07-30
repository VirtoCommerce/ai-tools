// Standard-storefront scenario — scripts the standard vc-frontend cart/order flow
// (clearCart -> addItemsCart -> getFullCart -> optional createOrderFromCart). Adapt the ops in
// ../queries/ if your project overrides the storefront schema; see ../README.md.
import { check } from 'k6';
import { getAuth, getAuthPool } from '../lib/auth.js';
import { gql, gqlQuiet } from '../lib/gql.js';
import { STORE } from '../config.js';

// Walking-skeleton L2 scenario (Class A + terminal order flow):
// per iteration — clear the cart, add ITEMS items, read the full cart, optionally create the
// order from the cart. Every MEASURED operation is a storefront-exact resolved document from
// ../queries/; the leading clear is a fixture step (see queries/clearCart.graphql) issued quietly,
// and it is what makes "a fresh cart" true rather than assumed.
//
// Knobs (env): PROFILE=smoke|steady · ITEMS=5 · RATE=5 (steady arrivals/s) ·
// ITERATIONS=3 (smoke iteration count — raise for a stable L3 attribution sample) ·
// PRODUCT_IDS (comma-separated; cycled across items) / PRODUCT_ID / PRODUCT_FILTER ·
// SKIP_ORDER=1 · BASE_URL · SUMMARY_PATH.

const Q = {
    clearCart: open('../queries/clearCart.graphql'),
    addItemsCart: open('../queries/addItemsCart.graphql'),
    getFullCart: open('../queries/getFullCart.graphql'),
    createOrderFromCart: open('../queries/createOrderFromCart.graphql'),
};

const BASE_URL = __ENV.BASE_URL || 'https://localhost:8090';
const SKIP_TLS = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE_URL);
const PROFILE = __ENV.PROFILE || 'smoke';
const ITEMS = Number(__ENV.ITEMS || 5);
const RATE = Number(__ENV.RATE || 5);
// createOrderFromCart requires a non-empty, valid cart. Whether an empty/default cart already
// satisfies your store's validation rules depends on your project — verify before enabling.
const SKIP_ORDER = __ENV.SKIP_ORDER !== '0';

// Multi-user concurrency pool (seeding mechanism is project-specific, see loadtests/README
// «User pool»). When USER_POOL>0, setup() authenticates that many seeded users and each VU
// picks one by __VU, so distinct carts hit the per-user save path concurrently. USER_POOL=0
// keeps the single-user (PERF_API_USER) behaviour.
const USER_POOL = Number(__ENV.USER_POOL || 0);
const SEED_PASSWORD = __ENV.SEED_PASSWORD || '';
const SEED_EMAIL_FORMAT = __ENV.SEED_EMAIL_FORMAT || 'loadtest+%d@example.test';
const HOLD = __ENV.HOLD || '120s';

// smoke = liveness (1 VU, 3 iterations); steady = open-model ramp → hold
// (ramping-arrival-rate keeps arrivals independent of response time).
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
    scenarios: { cartOrderLoop: profiles[PROFILE] },
    thresholds: {
        http_req_failed: ['rate<0.05'],
        checks: ['rate>0.95'],
        // Loose skeleton ceilings — tighten once a baseline exists.
        'http_req_duration{name:addItemsCart}': ['p(95)<3000'],
        'http_req_duration{name:getFullCart}': ['p(95)<3000'],
        'http_req_duration{name:createOrderFromCart}': ['p(95)<6000'],
    },
};

// Setup-only product discovery (not a measured operation, so a minimal
// document is fine here; measured ops use storefront-exact documents).
const SETUP_SEARCH = `query($storeId: String!, $userId: String!, $currencyCode: String!, $first: Int, $filter: String) {
  products(storeId: $storeId, userId: $userId, currencyCode: $currencyCode, first: $first, filter: $filter) {
    items { id code isConfigurable availabilityData { isBuyable } }
  }
}`;

export function setup() {
    if (USER_POOL > 0 && !SEED_PASSWORD) {
        throw new Error('SEED_PASSWORD is required when USER_POOL>0 (seeded-user pool password)');
    }
    // Multi-user pool (USER_POOL>0) or the single env user.
    const pool = USER_POOL > 0 ? getAuthPool(BASE_URL, USER_POOL, SEED_EMAIL_FORMAT, SEED_PASSWORD) : null;
    const auth = pool ? pool[0] : getAuth(BASE_URL);

    let productIds = __ENV.PRODUCT_IDS ? __ENV.PRODUCT_IDS.split(',') : __ENV.PRODUCT_ID ? [__ENV.PRODUCT_ID] : [];
    let code = '(PRODUCT_IDS/PRODUCT_ID from env)';
    if (!productIds.length) {
        const data = gql(BASE_URL, auth.token, 'setup:searchProducts', SETUP_SEARCH, {
            storeId: STORE.storeId,
            currencyCode: STORE.currencyCode,
            userId: auth.userId,
            first: 50,
            filter: __ENV.PRODUCT_FILTER || '',
        });
        const items = (data && data.products && data.products.items) || [];
        const pick = items.find((x) => x.availabilityData && x.availabilityData.isBuyable && !x.isConfigurable) || items[0];
        if (!pick) {
            throw new Error('setup: no product discovered — pass PRODUCT_IDS, PRODUCT_ID or PRODUCT_FILTER');
        }
        productIds = [pick.id];
        code = pick.code;
    }
    console.log(`setup: profile=${PROFILE} pool=${pool ? pool.length : 1} products=${code} items/iter=${ITEMS} skipOrder=${SKIP_ORDER}`);

    return { token: auth.token, userId: auth.userId, pool, productIds };
}

export default function (ctx) {
    // Per-VU auth: with a pool, each VU maps to a distinct seeded user (round-robin by __VU),
    // so carts and the per-user save path are hit concurrently. Without a pool, the single user.
    const auth = ctx.pool ? ctx.pool[(__VU - 1) % ctx.pool.length] : { token: ctx.token, userId: ctx.userId };
    const { token, userId, productIds } = { token: auth.token, userId: auth.userId, productIds: ctx.productIds };

    const cartItems = [];
    for (let i = 0; i < ITEMS; i++) {
        cartItems.push({ productId: productIds[i % productIds.length], quantity: 1 });
    }

    // Start every iteration from an EMPTY cart. `addItemsCart` carries no cartId, so x-cart
    // resolves the cart by (storeId, userId, cartName, currency, type) rather than by id, and
    // `clearCart` goes through the identical `CartCommandHandler.GetCartSearchCriteria`, so both
    // target the same cart. BL-CART-007 then sums the quantity of a repeated product. Without
    // this clear the cart grows by ITEMS every iteration: the itemsQuantity check below fails from
    // iteration 2 onward, and — worse, because it is silent — every measured operation runs
    // against a monotonically growing cart, so per-operation medians describe a moving target
    // instead of a cart of ITEMS. Quiet: clearing an already-empty cart is a no-op, not a failure.
    gqlQuiet(BASE_URL, token, 'clearCart', Q.clearCart, { command: { ...STORE, userId } });

    const added = gql(BASE_URL, token, 'addItemsCart', Q.addItemsCart, {
        command: { ...STORE, userId, cartItems },
    });
    const cartId = added && added.addItemsCart && added.addItemsCart.id;
    if (!cartId) {
        return; // creation failure already counted by the checks
    }

    const full = gql(BASE_URL, token, 'getFullCart', Q.getFullCart, { ...STORE, userId, cartId });
    // addItemsCart can settle async / silently no-op on a stale or disabled product id (see
    // ../README.md «PRODUCT_IDS drift») — assert against this settled read, not the mutation
    // response, so a silently-empty cart doesn't measure as a green iteration. Assert
    // itemsQuantity (total unit count), NOT items.length: per BL-CART-007, adding the same
    // product multiple times consolidates into one line with quantity summed, so items.length
    // varies with how many distinct products this iteration cycled through (1 by default) while
    // itemsQuantity is ITEMS — which holds only because the iteration starts from a cleared cart
    // AND runs one VU per user. The `steady` profile uses `ramping-arrival-rate` with
    // `preAllocatedVUs: 50` while `USER_POOL` defaults to 0, so with the default all VUs share one
    // user and therefore one cart: concurrent VUs interleave clear/add/read, and x-cart's per-user
    // lock serializes the mutations but does not stop one VU's read from observing a cart another
    // VU just cleared. The invariant needs a cleared cart AND one VU per user (`smoke`, or `steady`
    // with `USER_POOL` at least the VU count) — with the default shared cart, `steady` concurrent
    // clears still race.
    check(full, {
        'getFullCart: itemsQuantity matches ITEMS': (c) => !!c && !!c.cart && c.cart.itemsQuantity === ITEMS,
    }, { name: 'getFullCart' });

    if (!SKIP_ORDER) {
        gql(BASE_URL, token, 'createOrderFromCart', Q.createOrderFromCart, { command: { cartId } });
    }
}

export function handleSummary(data) {
    const out = { stdout: shortText(data) };
    if (__ENV.SUMMARY_PATH) {
        out[__ENV.SUMMARY_PATH] = JSON.stringify(data, null, 1);
    }

    return out;
}

function shortText(data) {
    const lines = ['', `── cart-order-loop · ${PROFILE} ──`];
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
