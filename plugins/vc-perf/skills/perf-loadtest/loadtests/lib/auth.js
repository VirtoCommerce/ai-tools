import http from 'k6/http';
import { b64decode } from 'k6/encoding';
import { STORE } from '../config.js';

// Token dance for explicit credentials: acquire in setup(), reuse across VUs.
// Returns { token, userId } with userId decoded from the JWT `sub`/`nameid` claim.
// NOTE: tokens are acquired once and never refreshed — keep a run's total duration under the
// backend's access-token TTL (long soak runs would need a refresh path; not implemented).
export function getAuthForUser(baseUrl, username, password) {
    const res = http.post(
        `${baseUrl}/connect/token`,
        {
            grant_type: 'password',
            username,
            password,
            scope: 'offline_access',
            storeId: STORE.storeId,
        },
        { tags: { name: 'auth' } },
    );
    if (res.status !== 200) {
        throw new Error(`auth failed for ${username}: HTTP ${res.status}`);
    }
    const token = res.json('access_token');
    if (!token) {
        throw new Error(`auth failed for ${username}: no access_token in response`);
    }
    const payload = JSON.parse(b64decode(token.split('.')[1], 'rawurl', 's'));
    const userId = payload.sub || payload.nameid;
    if (!userId) {
        throw new Error(`auth: cannot resolve userId for ${username}`);
    }

    return { token, userId };
}

// Single-user auth from the environment (PERF_API_USER / PERF_API_PASSWORD). userId
// overridable via USER_ID. The default path when no seeded pool is used.
export function getAuth(baseUrl) {
    const { token, userId } = getAuthForUser(baseUrl, __ENV.PERF_API_USER, __ENV.PERF_API_PASSWORD);

    return { token, userId: __ENV.USER_ID || userId };
}

// Authenticate a pool of seeded load-test users (loadtest+{i}@example.test by default) for
// multi-user concurrency: each VU later picks one, so carts — and the per-user cart save
// path — are exercised concurrently rather than serialized behind one shared cart. Tokens
// are acquired once in setup() and reused. emailFormat uses `%d` for the zero-based index.
export function getAuthPool(baseUrl, count, emailFormat, password) {
    const pool = [];
    for (let i = 0; i < count; i++) {
        pool.push(getAuthForUser(baseUrl, emailFormat.replace('%d', i), password));
    }
    if (pool.length === 0) {
        throw new Error('getAuthPool: pool is empty — pass USER_POOL > 0');
    }

    return pool;
}
