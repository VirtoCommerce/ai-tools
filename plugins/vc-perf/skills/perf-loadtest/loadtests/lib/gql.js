import http from 'k6/http';
import { check } from 'k6';

// GraphQL post helper. Measurement discipline: HTTP 200 with a
// GraphQL `errors` body is a FAILURE — both checks must pass for the iteration
// to count green. Each request is tagged with the operation name so
// `http_req_duration{name:...}` sub-metrics and thresholds attribute per-op.
export function gql(baseUrl, token, name, query, variables) {
    const res = post(baseUrl, token, name, query, variables);
    const body = safeJson(res);
    const ok = check(
        res,
        {
            [`${name}: HTTP 200`]: (r) => r.status === 200,
            [`${name}: no GraphQL errors`]: () => !(body && body.errors),
        },
        { name },
    );
    if (!ok && body && body.errors) {
        console.warn(`${name}: ${JSON.stringify(body.errors).slice(0, 400)}`);
    }

    return body ? body.data : null;
}

// Best-effort variant for cleanup/teardown calls: no checks, failures tolerated silently
// (e.g. a resource already removed by an earlier step in the same iteration).
export function gqlQuiet(baseUrl, token, name, query, variables) {
    const res = post(baseUrl, token, name, query, variables);
    const body = safeJson(res);
    // No `check()` — a quiet op must stay out of the measured thresholds. But a silent failure
    // here would masquerade as success, so still warn on a GraphQL errors body, same as gql().
    if (body && body.errors) {
        console.warn(`${name}: ${JSON.stringify(body.errors).slice(0, 400)}`);
    }

    return body ? body.data : null;
}

// Every GraphQL operation posts to the same `/graphql` path, so a server-side trace cannot tell
// `getFullCart` from `createOrderFromCart` — which makes per-operation work attribution impossible
// from spans alone. The query string travels onto the server span, so it is the cheapest way to
// label a request without touching the system under test (L3 `perftools/op_attrib.mjs` reads it).
//
// VERSION-DEPENDENT: verified present as the span attribute `url.query` on .NET 10 / Aspire
// (measured 2026-07-26), but ASP.NET Core has historically omitted url.query pending redaction
// support, so do not assume it on every runtime. `op_attrib.mjs` prints a loud
// "0 of N requests carried an op= label" warning when the attribute is absent, precisely because
// that output is otherwise indistinguishable from a correct run with OP_TAG unset.
//
// Default OFF so the measured request is byte-identical unless attribution is explicitly asked
// for. GraphQL ignores unknown query parameters — the harness's own "no GraphQL errors" check
// is what proves that on any given backend.
const OP_TAG = __ENV.OP_TAG === '1';

function post(baseUrl, token, name, query, variables) {
    const url = OP_TAG ? `${baseUrl}/graphql?op=${encodeURIComponent(name)}` : `${baseUrl}/graphql`;

    return http.post(url, JSON.stringify({ query, variables }), {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        tags: { name },
    });
}

function safeJson(res) {
    try {
        return res.json();
    } catch (_) {
        return null;
    }
}
