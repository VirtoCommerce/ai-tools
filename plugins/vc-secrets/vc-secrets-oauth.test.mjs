import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as m from "./vc-secrets.mjs";  // the launcher
import * as target from "./vc-secrets-target.mjs";  // the preload's target matcher
import * as cache from "./vc-secrets-cache.mjs";  // entries, expiry, the lock
import * as oauth from "./vc-secrets-oauth.mjs";  // the protocol
import * as probe from "./vc-secrets-probe.mjs";  // the initialize-handshake verification aid
import crypto from "node:crypto";
import http from "node:http";
import { stripComments, launcherSource, tmpDirs, socketTest, lockTest, channelTest } from "./test-support.mjs";
import {
    launcherEnv, trustedLauncherEnv, DECL_IDENTITY, loginDeps, seamsOf, definedSeams, CMD_LAUNCH_CFG,
} from "./test-fixtures.mjs";

test("vc-secrets-oauth throws the same VcSecretsError the launcher's exit-code path recognises", () => {
    // The whole reason VcSecretsError lives in its own module. Two same-named classes would both
    // print fine, but fail() reads `instanceof VcSecretsError` to pick the exit code, so a second
    // class silently degrades every oauth failure to a bare 1. That silent degrade is what this
    // pins. There is no cycle here to begin with — vc-secrets-error.mjs imports nothing, which is
    // the whole reason it exists. Measured on the arrangement it avoids (the class back in the
    // launcher, used only inside a function): that cycle loads clean from either entry, and ESM
    // throws only when the binding is dereferenced during module EVALUATION — so reintroducing one
    // would be quiet until something validates at load, and fatal from then on.
    assert.throws(() => oauth.parseTokenResponse(400, JSON.stringify({ error: "invalid_grant" }), 0), m.VcSecretsError);
});

test("exchange: the DEFAULT anchor source is os.uptime", () => {
    // Nothing else executes the default wiring — every other exchange test injects `uptime`. So
    // substituting Date.now for os.uptime there passes the whole suite, survives
    // parseTokenResponse's finiteness guard (a millisecond epoch is perfectly finite), and stamps
    // an anchor ~1.7e12 "seconds". At read time that delta is hugely negative, the reboot rule
    // discards it, and EVERY entry is silently unprotected — the exact outcome the guard's own
    // comment claims to prevent. Finiteness is not the property that matters; provenance is.
    return oauth.exchange("t", "grant_type=refresh_token", {
        request: async () => ({ status: 200,
            body: JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 60 }) }),
        now: () => 0,
    }).then((r) => {
        assert.ok(Math.abs(r.uptimeAtIssue - os.uptime()) < 5,
            `the anchor must come from os.uptime(): got ${r.uptimeAtIssue}, uptime is ${os.uptime()}`);
    });
});

test("exchange: a refresh-grant renewal that rotates nothing is not read as a code grant", () => {
    // exchange derives the grant from the body it was handed. Getting that wrong applies the
    // code grant's "refresh_token is required" rule to a renewal, aborting a call that succeeded.
    return oauth.exchange("t", oauth.buildTokenBody({ kind: "refresh", clientId: "c",
        redirectUri: "http://localhost:1/", refreshToken: "rt", scopes: ["a"] }), {
        request: async () => ({ status: 200, body: JSON.stringify({ access_token: "at", expires_in: 3600 }) }),
        now: () => 0,
    }).then((r) => {
        assert.equal(r.accessToken, "at");
        assert.equal(r.refreshToken, undefined);
    });
});

test("exchange: passes the body to the injected request and returns the parsed result", async () => {
    const seen = [];
    const r = await oauth.exchange("t", "grant_type=refresh_token", {
        request: async (url, body) => { seen.push([url, body]); return { status: 200,
            body: JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 60 }) }; },
        now: () => 0,
        uptime: () => 12_345,
    });
    assert.equal(seen[0][0], "https://login.microsoftonline.com/t/oauth2/v2.0/token");
    assert.equal(seen[0][1], "grant_type=refresh_token");
    assert.equal(r.accessToken, "at");
    assert.equal(r.uptimeAtIssue, 12_345,
        "exchange must stamp the monotonic reading it took, or every entry it writes is unprotected");
});

test("createPkcePair: S256 challenge is base64url of the verifier's digest", () => {
    const { verifier, challenge } = oauth.createPkcePair();
    const expected = crypto.createHash("sha256").update(verifier).digest("base64url");
    assert.equal(challenge, expected);
    assert.match(verifier, /^[A-Za-z0-9\-._~]{43,128}$/);
});

test("createPkcePair: two pairs never agree", () => {
    // The positive control for "createPkcePair: S256 challenge is base64url of the verifier's
    // digest", which also passes for a constant verifier: a fixed one would make every authorize
    // request replayable.
    assert.notEqual(oauth.createPkcePair().verifier, oauth.createPkcePair().verifier);
});

test("buildAuthorizeUrl: response_mode is query and the challenge method is S256", () => {
    const u = new URL(oauth.buildAuthorizeUrl({ tenantId: "t", clientId: "c", scopes: ["a", "b"],
        redirectUri: "http://localhost:1234/callback", state: "st", challenge: "ch" }));
    assert.equal(u.origin + u.pathname, "https://login.microsoftonline.com/t/oauth2/v2.0/authorize");
    assert.equal(u.searchParams.get("response_type"), "code");
    assert.equal(u.searchParams.get("response_mode"), "query");
    assert.equal(u.searchParams.get("code_challenge_method"), "S256");
    assert.equal(u.searchParams.get("scope"), "a b");
});

test("buildAuthorizeUrl: the verifier is never in the URL, only its digest", () => {
    const { verifier, challenge } = oauth.createPkcePair();
    const url = oauth.buildAuthorizeUrl({ tenantId: "t", clientId: "c", scopes: ["a"],
        redirectUri: "http://localhost:1/", state: "st", challenge });
    assert.ok(!url.includes(verifier), "PKCE is worthless if the verifier travels with the request");
});

// Five tests in this block are NOT ports, and they are interleaved with ported ones rather than
// contiguous. They stay because they pin the FIELD-LEVEL contract a caller's happy path does not
// exercise on its own: cmdLogin drives buildAuthorizeUrl, createPkcePair and buildTokenBody end to
// end, but its own tests assert that a login SUCCEEDS -- not that a dropped `code_challenge` or a
// leaked refresh_token on the code grant would be caught before it reached Entra. The refresh
// grant's token and the client_id/scope shared by both grants are exercised by oauthLaunchDeps's
// renewal path instead. The source's suite leaves all of these unpinned because there mcpw.js
// imports this module and a real `login` exercised most of them end to end.

test("buildAuthorizeUrl: the challenge itself travels, not only the method that advertises it", () => {
    // Measured: dropping `code_challenge` leaves the URL still advertising
    // code_challenge_method=S256. What Entra then does with such a request is not knowable from
    // this repository, and that is the risk — if it serves it as an ordinary non-PKCE sign-in, the
    // authorization code stops being bound to whoever asked for it and nothing local reports it.
    const u = new URL(oauth.buildAuthorizeUrl({ tenantId: "t", clientId: "c", scopes: ["a"],
        redirectUri: "http://localhost:1/", state: "st", challenge: "the-challenge" }));
    assert.equal(u.searchParams.get("code_challenge"), "the-challenge");
});

test("buildAuthorizeUrl: client_id, redirect_uri and state reach the request unaltered", () => {
    // The callback layer IS ported: listenForCallback and handleCallback exist, and handleCallback
    // compares the returned `state` against `expectedState` -- the consumer that would notice a
    // missing `state` is real now. This test still earns its place regardless: it pins the builder's OWN contract
    // independently of that consumer, the same way the other field-level tests in this block do.
    const u = new URL(oauth.buildAuthorizeUrl({ tenantId: "t", clientId: "the-client", scopes: ["a"],
        redirectUri: "http://localhost:1/", state: "the-state", challenge: "ch" }));
    assert.equal(u.searchParams.get("client_id"), "the-client");
    assert.equal(u.searchParams.get("redirect_uri"), "http://localhost:1/");
    assert.equal(u.searchParams.get("state"), "the-state");
});

test("buildTokenBody: code grant carries the verifier and the code", () => {
    const b = new URLSearchParams(oauth.buildTokenBody({ kind: "code", clientId: "c",
        redirectUri: "http://localhost:1/", code: "the-code", verifier: "the-verifier", scopes: ["a"] }));
    assert.equal(b.get("grant_type"), "authorization_code");
    assert.equal(b.get("code"), "the-code");
    assert.equal(b.get("code_verifier"), "the-verifier");
});

test("buildTokenBody: refresh grant carries no code and no verifier", () => {
    const b = new URLSearchParams(oauth.buildTokenBody({ kind: "refresh", clientId: "c",
        redirectUri: "http://localhost:1/", refreshToken: "rt", scopes: ["a"] }));
    assert.equal(b.get("grant_type"), "refresh_token");
    assert.equal(b.get("code"), null);
    assert.equal(b.get("code_verifier"), null);
});

test("buildTokenBody: the refresh grant carries the token it is refreshing", () => {
    // Its sibling above pins what the refresh body must NOT contain; nothing pinned the one field
    // it exists to carry. Dropping it still produces a well-formed grant_type=refresh_token body,
    // so the mistake leaves this package looking correct and surfaces only as whatever the token
    // endpoint says about a request that names no token.
    const b = new URLSearchParams(oauth.buildTokenBody({ kind: "refresh", clientId: "c",
        redirectUri: "http://localhost:1/", refreshToken: "the-token", scopes: ["a"] }));
    assert.equal(b.get("refresh_token"), "the-token");
});

test("buildTokenBody: both grants carry client_id and scope, and the code grant its redirect_uri", () => {
    // redirect_uri on the code grant is not a destination — nothing is redirected at exchange
    // time. It is the value the authorization-code grant is expected to repeat from the authorize
    // step, so a body that omits it is refused for a reason that names neither builder.
    const code = new URLSearchParams(oauth.buildTokenBody({ kind: "code", clientId: "the-client",
        redirectUri: "http://localhost:1/", code: "c0de", verifier: "v", scopes: ["a", "b"] }));
    assert.equal(code.get("client_id"), "the-client");
    assert.equal(code.get("redirect_uri"), "http://localhost:1/");
    assert.equal(code.get("scope"), "a b", "the code grant must ask for the scopes it was given");
    const refresh = new URLSearchParams(oauth.buildTokenBody({ kind: "refresh", clientId: "the-client",
        redirectUri: "http://localhost:1/", refreshToken: "rt", scopes: ["a", "b"] }));
    assert.equal(refresh.get("client_id"), "the-client");
    assert.equal(refresh.get("scope"), "a b", "a renewal that drops the scopes renews a narrower token");
    // The name above states a relation, so both halves need asserting: without this, moving
    // redirect_uri into the shared header — so both grants carry it — leaves the suite green.
    assert.equal(refresh.get("redirect_uri"), null, "the redirect belongs to the code grant alone");
});

test("buildTokenBody: the code grant carries no refresh token", () => {
    // The mirror of "refresh grant carries no code and no verifier", which had no counterpart.
    // The fixture supplies a refresh token it must not travel with: omitting it would leave the
    // assertion two causes — the branch never sets the field, or there was nothing to set — and
    // the realistic defect has the second shape. A maintainer adding a defensive
    // `if (refreshToken) { body.set(...) }` to the code branch survives an empty fixture — measured.
    // Posting a real token then needs a second change, a caller that passes refreshToken on the
    // code grant, which no call site does today; the fixture is what keeps the assertion able to
    // notice the first change before the second one arrives to make it matter.
    const b = new URLSearchParams(oauth.buildTokenBody({ kind: "code", clientId: "c",
        redirectUri: "http://localhost:1/", code: "c0de", verifier: "v",
        refreshToken: "rt-must-not-travel", scopes: ["a"] }));
    assert.equal(b.get("refresh_token"), null);
});

test("buildTokenBody: an unknown grant kind is refused rather than posted as a refresh", () => {
    // Falling through would post refresh_token=undefined to Entra and report whatever it says
    // about that, instead of the caller's actual mistake.
    assert.throws(() => oauth.buildTokenBody({ kind: "bogus", clientId: "c",
        redirectUri: "http://localhost:1/", scopes: ["a"] }), m.VcSecretsError);
});

test("parseTokenResponse: maps expires_in to an absolute stamp and keeps the lifetime", () => {
    const r = oauth.parseTokenResponse(200,
        JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600 }), 1_000, "code", 500);
    assert.equal(r.expiresAt, 1_000 + 3600_000);
    assert.equal(r.lifetimeMs, 3600_000);
    assert.equal(r.obtainedAt, 1_000);
    assert.equal(r.uptimeAtIssue, 500, "the monotonic reading must be taken with the wall clock, not later");
});

test("parseTokenResponse: the monotonic reading is required, not defaulted", () => {
    // Defaulting it would let a caller forget, and a missing anchor is invisible until a clock
    // moves — at which point the entry is exactly as unprotected as before the anchor existed.
    assert.throws(() => oauth.parseTokenResponse(200,
        JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600 }), 1_000, "code"),
    /uptime/i);
});

test("parseTokenResponse: a response with no usable expires_in is refused, not cached as never-expiring", () => {
    // Number(undefined) * 1000 is NaN, and `NaN <= MARGIN_MS` is false — so an entry stamped
    // with a NaN expiry reads as valid forever, and the launcher, which is deliberately out of
    // the data path and never sees a 401, keeps handing over a token that died an hour ago.
    for (const expires_in of [undefined, "soon", -5, 0]) {
        assert.throws(() => oauth.parseTokenResponse(200,
            JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in }), 0, "code"),
        /expires_in/, `expires_in=${JSON.stringify(expires_in)} must be refused`);
    }
});

test("parseTokenResponse: on the CODE grant, no refresh token is an error naming offline_access", () => {
    assert.throws(() => oauth.parseTokenResponse(200,
        JSON.stringify({ access_token: "at", expires_in: 60 }), 0, "code"), /offline_access/);
});

test("parseTokenResponse: on the REFRESH grant, no refresh token means keep the existing one", () => {
    // RFC 6749 section 6 makes refresh_token optional in a refresh-grant response — the
    // client keeps the one it has. Applying the code-grant rule here would abort a
    // renewal that succeeded and hand the developer a consent problem that does not
    // exist, sending them to an administrator over a valid response.
    const r = oauth.parseTokenResponse(200,
        JSON.stringify({ access_token: "at2", expires_in: 3600 }), 5_000, "refresh", 500);
    assert.equal(r.accessToken, "at2");
    assert.equal(r.refreshToken, undefined, "absent means unchanged, and the caller keeps its own");
});

test("parseTokenResponse: a rotated refresh token on the refresh grant is returned", () => {
    const r = oauth.parseTokenResponse(200,
        JSON.stringify({ access_token: "at2", refresh_token: "rt2", expires_in: 3600 }), 5_000, "refresh", 500);
    assert.equal(r.refreshToken, "rt2");
});

test("parseTokenResponse: a 2xx without a usable access token is an error, not a usable entry", () => {
    // Without this the "keep the existing refresh token" rule above degrades into accepting any
    // 2xx at all, and the caller caches an entry whose accessToken is undefined. The empty-string
    // case is what makes the second half of the check decide something: absent settles the type
    // half on its own, so without a blank fixture that half is deletable while the suite is green.
    for (const access_token of [undefined, ""]) {
        assert.throws(() => oauth.parseTokenResponse(200,
            JSON.stringify({ access_token, refresh_token: "rt", expires_in: 3600 }), 0, "refresh"),
        /access token/i, `access_token=${JSON.stringify(access_token)} must be refused`);
    }
});

test("parseTokenResponse: a non-JSON 2xx body names the endpoint and echoes nothing", () => {
    // Node embeds the first ten characters of the input in a JSON SyntaxError, so an
    // unwrapped parse both misreports and prints a token prefix.
    assert.throws(() => oauth.parseTokenResponse(200, "eyJhbGciOiJSUzI1NiJ9.oops", 0, "refresh"), (e) => {
        assert.match(e.message, /token endpoint/i);
        assert.doesNotMatch(e.message, /eyJhbGci/, "a SyntaxError would carry the first ten characters");

        return true;
    });
});

test("parseTokenResponse: an Entra error surfaces its code and the AADSTS number", () => {
    assert.throws(() => oauth.parseTokenResponse(400, JSON.stringify({ error: "invalid_grant",
        error_description: "AADSTS70008: expired", trace_id: "x" }), 0), /invalid_grant.*AADSTS70008/s);
});

test("parseTokenResponse: an error body's other fields do not travel into the message", () => {
    // The positive control for "parseTokenResponse: an Entra error surfaces its code and the
    // AADSTS number", which also passes for a message built by JSON.stringify of the whole body —
    // and an error body can carry a token hint.
    assert.throws(() => oauth.parseTokenResponse(400, JSON.stringify({ error: "invalid_grant",
        error_description: "AADSTS70008: expired", trace_id: "trace-must-not-leak" }), 0),
    (e) => !e.message.includes("trace-must-not-leak"));
});

test("parseTokenResponse: a non-JSON error body still reports the status without echoing it", () => {
    assert.throws(() => oauth.parseTokenResponse(502, "<html>eyJhbGciOi bad gateway</html>", 0, "refresh"), (e) => {
        assert.match(e.message, /502/);
        assert.doesNotMatch(e.message, /eyJhbGci/);

        return true;
    });
});

test("parseTokenResponse: only a judged grant is refused — a throttle or an outage is not", () => {
    // The whole point of the tag. A 503 tagged as a refusal tells the developer to sign in again,
    // which rotates a LIVE refresh token to fix an outage the next tick would have ridden out.
    const tag = (status, body) => {
        try {
            oauth.parseTokenResponse(status, body, 1000, "refresh", 5);
        } catch (e) {
            return e.refused;
        }

        return "did not throw";
    };
    assert.equal(tag(400, JSON.stringify({ error: "invalid_grant" })), true);
    assert.equal(tag(401, JSON.stringify({ error: "invalid_client" })), true);
    assert.equal(tag(503, "<html>gateway</html>"), false);
    assert.equal(tag(429, JSON.stringify({ error: "temporarily_unavailable" })), false);
    assert.equal(tag(408, ""), false);
    // A non-retryable status is NOT enough on its own. A captive portal, a corporate proxy or a
    // misrouted request answers 400 with an HTML page, and nothing in that exchange was Entra
    // judging the grant -- so tagging it a refusal sends the developer to sign in again and rotates
    // a live refresh token away over a network that was merely in the way. The status code cannot
    // tell these apart; only the body can.
    assert.equal(tag(400, "<html>sign in to the guest wifi</html>"), false);
    assert.equal(tag(401, "Proxy Authentication Required"), false);
});

socketTest("httpsPostForm: a connection dropped after the headers REJECTS, it does not hang", async () => {
    // The defect this pins was a hang, not a crash: node emits the error on the RESPONSE stream, and an
    // IncomingMessage with no listener swallows it, so the promise stayed pending forever. Measured.
    // What that costs is silence -- on the renewal path `renewing` never clears, so the launcher stops
    // renewing for the rest of its life and the server dies when its access token expires.
    //
    // Driven through the real wiring with http.request rather than an injected `request`, because an
    // injected transport exercises none of the code that was broken.
    let gotRequest = false;
    const server = http.createServer((req, res) => {
        gotRequest = true;
        req.resume();
        req.on("end", () => {
            res.writeHead(200, { "content-type": "application/json" });
            res.write('{"partial":');
            setTimeout(() => res.socket.destroy(), 20);
        });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
        const port = server.address().port;
        const attempt = oauth.httpsPostForm(`http://127.0.0.1:${port}/token`, "grant_type=refresh_token",
            { requestImpl: http.request });
        // Raced, so a regression FAILS instead of hanging the suite.
        const outcome = await Promise.race([
            attempt.then(() => "resolved", (e) => e),
            new Promise((r) => setTimeout(() => r("HUNG"), 4000)),
        ]);
        assert.notEqual(outcome, "HUNG", "the promise must settle; pending forever is the defect");
        assert.notEqual(outcome, "resolved", "a truncated body must not read as a token response");
        assert.ok(outcome instanceof m.VcSecretsError, `expected a VcSecretsError, got ${outcome}`);
        // The two below MUST stay below the three above. They read `outcome.message`, and when the
        // hang regresses `outcome` is the string "HUNG" — but because assert.match carries an
        // explicit message, Node reports that message rather than an argument-type error. Measured
        // by deleting res.on("error"): with these two first, the headline regression announced
        // "rejected through the request listener", which is false, and the sentence written for the
        // hang never ran. Order is the fix, not a tidy-up.
        //
        // Both are needed. `gotRequest` rules out a connect-time failure; it does not rule out a
        // socket dropped after the handler ran but before any response byte, which rejects through
        // req.on("error") and satisfies every other assertion here — measured. The match is
        // anchored because "response failed" is not reserved to this listener: rewording the OTHER
        // one to "response failed to open" defeated a floating match with the suite still green.
        // Matching on wording is the assertion here rather than a shortcut — the module's "a tag
        // rather than a message match" argument is about a branch taken at runtime, which fails
        // silently, whereas a test fails loudly. It holds only while this module stays a verbatim
        // transcription of mcpw-oauth.js; if that is ever allowed to diverge, this needs a tag.
        assert.ok(gotRequest, "the server never saw the request; the response path was not exercised");
        // The leak check goes ABOVE the prefix match, and that order is load-bearing for the same
        // reason as the block above. An edit that echoes the body AND rewords the prefix fails the
        // match first, so a refresh token sitting in the error text is reported as a wording
        // complaint and this line never runs. Measured.
        assert.doesNotMatch(outcome.message, /grant_type|refresh_token=/,
            "the request body carried a refresh token and must not be echoed");
        // Says what it observed, not what caused it: a missing prefix means the rejection did not
        // come from the response listener, OR that listener was reworded. Naming only the first
        // made the test announce a request-listener rejection on a reword that came through the
        // response listener — measured, and false.
        assert.match(outcome.message, /^token endpoint response failed: /,
            "no response-listener prefix: either the rejection came through the request listener, "
            + "or the response listener was reworded and this match must be updated with it");
    } finally {
        await new Promise((r) => server.close(r));
    }
});

const DECL = { ...DECL_IDENTITY };

// An access entry exactly as parseTokenResponse produces one, so every expiry assertion below
// runs against a state production can actually reach. Hand-writing the pair is what made the
// previous version of the clock check a tautology.
const UPTIME_AT_ISSUE = 1_000;   // seconds; an arbitrary "the host has been up a while"

function freshAccess(issuedAt, lifetimeSeconds = 3600, uptimeAtIssue = UPTIME_AT_ISSUE) {
    return oauth.parseTokenResponse(200, JSON.stringify({ access_token: "a", refresh_token: "r",
        expires_in: lifetimeSeconds }), issuedAt, "code", uptimeAtIssue);
}

function cacheAt(issuedAt, identity = DECL_IDENTITY) {
    return { refresh: { refreshToken: "r", ...identity }, access: freshAccess(issuedAt) };
}

// Reads the cache `elapsed` ms after issue. The two clocks agree unless a case deliberately
// separates them: `clockElapsed` is what the wall clock believes, `uptimeElapsed` is what the
// monotonic counter believes, and every interesting case is a disagreement between the two.
// (Parameter named `entryCache`, not `cache`: the module is imported as `cache` above, and
// shadowing it would turn every `cache.cacheStatus` call in this function into a call on whatever
// entry the caller passed -- loudly, but confusingly.)
function statusAfter(entryCache, elapsed, { clockElapsed = elapsed, uptimeElapsed = elapsed,
    issuedAt = 0, uptimeAtIssue = UPTIME_AT_ISSUE } = {}) {
    return cache.cacheStatus(entryCache, DECL, issuedAt + clockElapsed, uptimeAtIssue + uptimeElapsed / 1000);
}

// ---------------------------------------------------------------------------------------------
// vc-secrets-cache.mjs — two keystore entries, their expiry check, and the cross-process refresh
// lock. Ported from the upstream launcher's cache module and its suite: `c.` below becomes `cache.`,
// `m.McpwError` becomes `m.VcSecretsError`. `entryNames` has no test here — the source's own is
// not ported, because `oauthEntryKeys()` in lib/oauth-token.mjs already fills that role for this
// package, and a second incompatible name generator would be the defect.
// ---------------------------------------------------------------------------------------------

test("cacheStatus: absent when there is no refresh entry", () => {
    assert.equal(statusAfter({}, 1000).state, "absent");
});

test("cacheStatus: a usable access entry with no refresh entry is still absent", () => {
    // Deliberate, not an oversight: spending the access token and only then discovering there
    // is nothing to renew with trades a clear failure now for an opaque one inside the hour.
    assert.equal(statusAfter({ access: freshAccess(0) }, 60_000).state, "absent");
});

test("cacheStatus: a refresh entry with no access entry needs a refresh, not a login", () => {
    assert.equal(statusAfter({ refresh: { refreshToken: "r", ...DECL_IDENTITY } }, 0).state, "needs-refresh");
});

test("cacheStatus: identity is checked before the access entry, not after it", () => {
    // Not ported — the source's suite leaves the ORDER of the two checks unpinned, and every other
    // identity test here carries an access entry, so all of them pass if the access-entry check is
    // hoisted above the identity comparison. Measured: under that hoist this case answers
    // `needs-refresh` instead of `identity-mismatch`, and `needs-refresh` drives an exchange —
    // spending a refresh token issued for one tenant and client against a different declaration,
    // which is the outcome the identity check exists to prevent. An absent access entry is the
    // cheap, expected loss, so this is a state a real cache reaches routinely.
    const moved = { ...DECL_IDENTITY, tenantId: "00000000-0000-0000-0000-000000000000" };
    assert.equal(statusAfter({ refresh: { refreshToken: "r", ...moved } }, 0).state, "identity-mismatch");
});

test("cacheStatus: identity mismatch on each field of the declaration in turn", () => {
    // One fixture per operand. Without all three, a check comparing only the tenant passes
    // every test a check comparing all three would, and a moved clientId silently reuses a
    // refresh token issued to a different application.
    const moved = {
        tenantId: { ...DECL_IDENTITY, tenantId: "00000000-0000-0000-0000-000000000000" },
        clientId: { ...DECL_IDENTITY, clientId: "99999999-9999-9999-9999-999999999999" },
        scopes: { ...DECL_IDENTITY, scopes: [...DECL_IDENTITY.scopes, "extra/.default"] },
    };
    for (const [field, identity] of Object.entries(moved)) {
        assert.equal(statusAfter(cacheAt(0, identity), 60_000).state, "identity-mismatch",
            `a moved ${field} must not reuse the cached token`);
    }
});

test("cacheStatus: a tenant id that differs only in letter case is the same tenant, and a different GUID is not", () => {
    // Tenant GUIDs are case-insensitive: the declaration schema accepts either case and registrations are
    // matched folded, so a cache written under one spelling must survive the declaration being retyped in
    // the other -- and the fold must not turn a genuinely different tenant into the same one.
    const declared = { ...DECL, tenantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" };
    const statusFor = (tenantId) => cache.cacheStatus(cacheAt(0, { ...DECL_IDENTITY, tenantId }), declared, 60_000, UPTIME_AT_ISSUE + 60);
    assert.equal(statusFor("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE").state, "valid", "upper case of the same GUID");
    assert.equal(statusFor("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee").state, "valid", "the same spelling, as the control");
    assert.equal(statusFor("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeef").state, "identity-mismatch", "a different GUID still is");
    assert.equal(statusFor(undefined).state, "identity-mismatch", "and a cache with no tenant is not any tenant's");
});

test("cacheStatus: scope set compared as a set, not a string", () => {
    const reordered = { ...DECL_IDENTITY, scopes: [...DECL_IDENTITY.scopes].reverse() };
    assert.equal(statusAfter(cacheAt(0, reordered), 60_000).state, "valid");
});

test("cacheStatus: a scope list of the same length but different members is a mismatch", () => {
    // The positive control for the set comparison: sorting and joining also makes two lists
    // of equal length compare equal if only their lengths are checked.
    const swapped = { ...DECL_IDENTITY,
        scopes: DECL_IDENTITY.scopes.map((s, i) => (i === 0 ? "other/.default" : s)) };
    assert.equal(statusAfter(cacheAt(0, swapped), 60_000).state, "identity-mismatch");
});

test("cacheStatus: one scope holding a space is not the same set as the two it joins to", () => {
    // What the length comparison is for. Sorting and joining maps ["a b"] and ["a", "b"] to the
    // same string, so without the length check a single malformed scope entry matches a correct
    // two-scope declaration and the cached token is reused against a scope set nobody granted.
    const collided = { ...DECL_IDENTITY, scopes: [[...DECL_IDENTITY.scopes].sort().join(" ")] };
    assert.equal(collided.scopes.length, 1, "the fixture is only meaningful as a single element");
    assert.equal(statusAfter(cacheAt(0, collided), 60_000).state, "identity-mismatch");
});

test("cacheStatus: valid well inside the token's life", () => {
    const status = statusAfter(cacheAt(0), 60_000);
    assert.equal(status.state, "valid");
    assert.equal(status.accessToken, "a", "a valid status must hand over the token it validated");
});

test("cacheStatus: needs refresh inside the margin, and the margin boundary is inclusive", () => {
    const lifetime = 3600_000;
    assert.equal(statusAfter(cacheAt(0), lifetime - cache.MARGIN_MS).state, "needs-refresh",
        "exactly at the margin is already too late — the call it is about to make outlives it");
    assert.equal(statusAfter(cacheAt(0), lifetime - cache.MARGIN_MS - 1).state, "valid",
        "one millisecond outside the margin is still usable");
});

test("cacheStatus: an expired token is not valid", () => {
    assert.equal(statusAfter(cacheAt(0), 3600_001).state, "needs-refresh");
});

test("cacheStatus: a rollback landing inside the token's own lifetime is caught by the anchor", () => {
    // The case the wall clock alone cannot see, and the whole reason the anchor exists. The host
    // slept and came back half an hour behind: an hour of real time has passed, so the token is
    // spent, but the wall clock reports only thirty minutes of it. Before the anchor this read
    // `valid` and the launcher handed over a dead token.
    const spent = statusAfter(cacheAt(0), 3600_000, { clockElapsed: 1800_000 });
    assert.equal(spent.state, "needs-refresh");
    // And the wall clock alone still says it is fine, which is what makes the case discriminating.
    assert.equal(statusAfter(cacheAt(0), 1800_000).state, "valid");
});

test("cacheStatus: a rollback past the issue time no longer costs a needless exchange", () => {
    // Before the anchor this had to be treated as a rollback and refreshed, because a clock
    // reading earlier than the issue time was the only evidence available that something was
    // wrong. With a second source the truth is visible: one minute of real time has passed and
    // the token is young, so the wall clock being two hours out is no longer our problem.
    assert.equal(statusAfter(cacheAt(0), 60_000, { clockElapsed: -2 * 3600_000 }).state, "valid");
});

test("cacheStatus: a monotonic counter that missed a suspend is covered by the wall clock", () => {
    // WSL2 pauses the guest when the Windows host sleeps, so the guest's counter may not tick
    // across the pause — the anchor's own failure direction, and the reason elapsed is the MAX
    // of the two rather than the anchor alone. Here the counter believes one minute passed while
    // the wall clock, correctly, reports the whole hour.
    assert.equal(statusAfter(cacheAt(0), 3600_000, { uptimeElapsed: 60_000 }).state, "needs-refresh");
});

test("cacheStatus: after a reboot the anchor is ignored rather than believed", () => {
    // os.uptime() restarts at zero, so the stored reading is from a boot that no longer exists
    // and the difference goes negative. A negative elapsed would otherwise INFLATE the remaining
    // life and make an expired token look freshly issued.
    const rebooted = statusAfter(cacheAt(0), 3600_000, { uptimeElapsed: -UPTIME_AT_ISSUE * 1000 + 5_000 });
    assert.equal(rebooted.state, "needs-refresh", "the wall clock still says the hour is up");
    assert.equal(statusAfter(cacheAt(0), 60_000, { uptimeElapsed: -UPTIME_AT_ISSUE * 1000 + 5_000 }).state,
        "valid", "and a young token is still usable — a reboot is not itself a reason to re-exchange");
});

test("cacheStatus: a caller that omits the monotonic reading is stopped, not quietly downgraded", () => {
    // Omitting it makes byUptime NaN, NaN >= 0 is false, and the function falls back to exactly
    // the wall-clock-only rule the anchor replaced — no throw, no needs-refresh, nothing red.
    // oauthLaunchDeps' readCache is the production caller, so this is live
    // rather than latent. Not ensureFreshToken, which reaches this only through the injected seam.
    assert.throws(() => cache.cacheStatus(cacheAt(0), DECL, 60_000), /uptime/i);
    assert.throws(() => cache.cacheStatus(cacheAt(0), DECL, 60_000, NaN), /uptime/i);
    assert.throws(() => cache.cacheStatus(cacheAt(0), DECL, undefined, 1060), /now/i);
});

test("cacheStatus: an entry whose stamps are not real numbers is refused, never aged", () => {
    // Each of these is a number the arithmetic silently absorbs. Missing obtainedAt makes the
    // WALL term NaN, and Math.max propagates NaN, so a perfectly honest anchor is destroyed by
    // it: measured, an entry ten years past its expiry read as valid. `null` is what
    // JSON.stringify writes for a NaN, so it is reachable from a keystore blob, not only by hand.
    for (const [field, value] of [["obtainedAt", undefined], ["obtainedAt", null],
        ["lifetimeMs", null], ["uptimeAtIssue", null], ["uptimeAtIssue", "1000"]]) {
        const access = { ...freshAccess(0), [field]: value };
        const entryCache = { refresh: { refreshToken: "r", ...DECL_IDENTITY }, access };
        assert.equal(cache.cacheStatus(entryCache, DECL, 60_000, UPTIME_AT_ISSUE + 60).state, "needs-refresh",
            `${field}=${JSON.stringify(value)} must not be aged`);
    }
});

test("cacheStatus: an access entry with no lifetime is refused rather than half-checked", () => {
    const { lifetimeMs, ...noLifetime } = freshAccess(0);
    assert.equal(lifetimeMs, 3600_000, "the fixture is only meaningful if the field really was there");
    assert.equal(statusAfter({ refresh: { refreshToken: "r", ...DECL_IDENTITY }, access: noLifetime },
        60_000).state, "needs-refresh");
});

test("cacheStatus: an access entry written before the anchor existed is refused, not half-trusted", () => {
    // Such an entry cannot be checked against a rolled-back clock at all. One extra exchange is
    // the whole cost of refusing it; accepting it silently reinstates the hole the anchor closed.
    const { uptimeAtIssue, ...noAnchor } = freshAccess(0);
    assert.equal(uptimeAtIssue, UPTIME_AT_ISSUE, "the fixture is only meaningful if the field really was there");
    assert.equal(statusAfter({ refresh: { refreshToken: "r", ...DECL_IDENTITY }, access: noAnchor },
        60_000).state, "needs-refresh");
});

test("cacheStatus: a plausible clock nudge does not force a needless exchange", () => {
    // The guard must fire on a rollback, not on ordinary NTP correction, or every small
    // adjustment costs a refresh-token rotation. BOTH sources are nudged here: leaving the
    // anchor honest would let it decide the case, and the allowance itself would go untested.
    const nudge = -cache.SKEW_TOLERANCE_MS / 2;
    assert.equal(statusAfter(cacheAt(0), 0, { clockElapsed: nudge, uptimeElapsed: nudge }).state,
        "valid", "half a minute of correction is not a rollback");
    const past = -cache.SKEW_TOLERANCE_MS - 1;
    assert.equal(statusAfter(cacheAt(0), 0, { clockElapsed: past, uptimeElapsed: past }).state,
        "needs-refresh", "past the allowance, with nothing else to go on, it is a rollback again");
});

test("cacheStatus: a small negative anchor delta cannot rescue a badly rolled-back clock", () => {
    // Reboot shortly after the token was issued, plus a clock two hours behind. The anchor's
    // delta is then negative but TINY, so taking the max of the two would pick it and read the
    // age as a harmless nudge — turning a two-hour rollback into a token that looks freshly
    // issued. A negative delta has to be discarded outright, not merely lose a comparison.
    // Built by hand rather than through statusAfter: this case needs the STORED anchor small,
    // which is the one thing the helper's defaults fix.
    const justAfterBoot = 30;   // seconds of uptime when the token was issued
    const entryCache = { refresh: { refreshToken: "r", ...DECL_IDENTITY },
        access: freshAccess(0, 3600, justAfterBoot) };
    assert.equal(cache.cacheStatus(entryCache, DECL, -2 * 3600_000, justAfterBoot - 1).state, "needs-refresh");
});

test("serialize/parse: a refresh entry round-trips with its identity intact", () => {
    const entry = { refreshToken: "rt", ...DECL_IDENTITY };
    assert.deepEqual(cache.parseEntry(cache.serializeRefresh(entry)), { schema: 1, ...entry });
});

test("serialize/parse: an access entry round-trips with the fields the expiry check reads", () => {
    // The uptime is passed explicitly so that all four timing values differ. Under the default it
    // equals obtainedAt, and two fields carrying one value are one field as far as a transposition
    // between them is concerned -- the loop below would enumerate both and see nothing. Dropping the
    // field entirely is caught here too: an absent field reads back as undefined against a number.
    const access = freshAccess(1_000, 3600, 4_242);
    const back = cache.parseEntry(cache.serializeAccess(access));
    for (const field of ["accessToken", "expiresAt", "obtainedAt", "lifetimeMs", "uptimeAtIssue"]) {
        assert.equal(back[field], access[field], `${field} must survive the round trip`);
    }
});

test("parseEntry: rejects a schema version it does not know", () => {
    assert.throws(() => cache.parseEntry(JSON.stringify({ schema: 99 })), /schema/);
});

test("parseEntry: unreadable input is absent, and nothing about it is echoed", () => {
    // Never a rethrow: node embeds the first ten characters of the input in a JSON SyntaxError,
    // and this input is a keystore blob. Absent is also the actionable answer for whatever calls
    // this: ensureFreshToken treats an absent entry as "sign in", and the `login` verb overwrites it.
    assert.equal(cache.parseEntry("eyJhbGciOiJSUzI1NiJ9.truncated"), null);
    assert.equal(cache.parseEntry(""), null);
});

// lockPathFor now takes a PROJECT axis as well as the entry name (source had only the entry), so
// every test below is adapted rather than copied: every call takes the extra scope argument. The
// per-platform tests below and "two projects declaring the same entry name..." further down pin
// that the scope segment actually reaches the name and that two different scopes never collide on
// win32, darwin and linux respectively; the remaining tests carry the argument only to keep the
// call real, since their own subject is the user axis, the entry axis, or a name-injection
// boundary.

test("lockPathFor: an abstract name on linux, with no filesystem entry", () => {
    const p = cache.lockPathFor("azure-mcp", "proj", { platform: "linux", userInfo: () => ({ uid: 1000 }) });
    assert.equal(p[0], "\0", "a leading NUL is what puts the name in the abstract namespace");
    assert.ok(!p.includes("/"), "an abstract name must not look like a path");
    assert.ok(Buffer.byteLength(p) <= 100, "sun_path caps the whole name");
});

test("lockPathFor: two users do not collide on linux either", () => {
    // The abstract namespace is per network namespace, not per user, so it is machine-global
    // for the same reason a pipe name is: without the user in the name, one developer's
    // refresh locks every other account on the host out of theirs.
    const a = cache.lockPathFor("azure-mcp", "proj", { platform: "linux", userInfo: () => ({ uid: 1000 }) });
    const b = cache.lockPathFor("azure-mcp", "proj", { platform: "linux", userInfo: () => ({ uid: 1001 }) });
    assert.notEqual(a, b);
});

test("lockPathFor: a per-user pipe name on win32", () => {
    const p = cache.lockPathFor("azure-mcp", "proj", { platform: "win32", userInfo: () => ({ username: "dev" }) });
    assert.match(p, /^\\\\\.\\pipe\\/);
    assert.ok(p.includes("dev"), "pipe names are machine-global, so the user must be in the name");
    assert.ok(p.includes("proj"), "the project axis must reach the name, or two projects share one mutex");
    const other = cache.lockPathFor("azure-mcp", "other-proj",
        { platform: "win32", userInfo: () => ({ username: "dev" }) });
    assert.notEqual(p, other, "two different scopes must not collide on win32");
});

test("lockPathFor: two servers do not share one lock", () => {
    // The positive control for the per-user tests: a path built from the user alone would pass
    // all of them while serialising every server in the config against every other.
    const userInfo = () => ({ uid: 1000, username: "dev" });
    for (const platform of ["linux", "win32", "darwin"]) {
        assert.notEqual(cache.lockPathFor("azure-mcp", "proj", { platform, userInfo }),
            cache.lockPathFor("azure-monitor", "proj", { platform, userInfo }), `${platform} must key the lock by server`);
    }
});

test("lockPathFor: a separator in the user or server name cannot reshape the lock", () => {
    // A Windows domain login is DOMAIN\user, and a backslash left in it nests the pipe name
    // rather than naming one lock; on darwin a slash walks the lock out of /tmp entirely, and
    // the directory it lands in decides who may hold it.
    const win = cache.lockPathFor("azure-mcp", "proj", { platform: "win32", userInfo: () => ({ username: "CONTOSO\\dev" }) });
    assert.equal(win.slice("\\\\.\\pipe\\".length).includes("\\"), false,
        `a domain login must not nest the pipe name: ${win}`);
    const mac = cache.lockPathFor("../../escape", "proj", { platform: "darwin", userInfo: () => ({ uid: 1000 }) });
    assert.equal(mac.slice("/tmp/".length).includes("/"), false,
        `a lock must stay in the directory it was given: ${mac}`);
});

test("lockPathFor: the owner comes from the OS, so the environment cannot name someone else's lock", () => {
    // Both namespaces are machine-global, and USER/USERNAME are set by whoever starts the process.
    // Reading them made the lock name a claim rather than an identity: on a shared host an account
    // could name its lock after another user and hold that user's launches out to the ceiling.
    const spoofed = { USER: "victim", USERNAME: "victim" };
    const posix = cache.lockPathFor("azure-mcp", "proj", { platform: "linux", env: spoofed, userInfo: () => ({ uid: 1000 }) });
    assert.ok(posix.includes("1000"), `the uid decides the name: ${posix}`);
    assert.equal(posix.includes("victim"), false, "the environment must not reach the lock name");
    const win = cache.lockPathFor("azure-mcp", "proj",
        { platform: "win32", env: spoofed, userInfo: () => ({ username: "real" }) });
    assert.ok(win.includes("real") && !win.includes("victim"), `win32 reads the OS too: ${win}`);
});

test("lockPathFor: a uid with no passwd entry falls back to the environment rather than failing", () => {
    // os.userInfo() throws where the uid has no passwd entry — a container, a stripped image. A
    // launcher must not die there, so the environment stays as a last resort; the cost is that two
    // such accounts can share a name, wait out the ceiling and fail, which is why it is last.
    const p = cache.lockPathFor("azure-mcp", "proj", { platform: "linux", env: { USER: "dev" },
        userInfo: () => { throw Object.assign(new Error("no passwd entry"), { code: "ENOENT" }); } });
    assert.ok(p.includes("dev"), `the environment is the fallback, not the default: ${p}`);
});

test("two projects declaring the same entry name do not share one mutex", () => {
    // The source namespaces the lock by USER because both namespaces are machine-global. A
    // project is a second axis with the same property, and nothing in the source says so — it
    // never had two.
    const a = cache.lockPathFor("ado", "p1", { platform: "linux", userInfo: () => ({ uid: 1000 }) });
    const b = cache.lockPathFor("ado", "p2", { platform: "linux", userInfo: () => ({ uid: 1000 }) });
    assert.notEqual(a, b);
    assert.match(a, /^\0vc-secrets-1000-p1-ado\.lock$/);
});

// The socket tests below never execute where binding is refused, and a skipped test is not
// evidence. These drive the same decisions through the injection seam, so every branch —
// including the two macOS-only ones nobody here can reach — is settled by an assertion.
const inUse = () => Object.assign(new Error("bind: address already in use"), { code: "EADDRINUSE" });

// A server is `close` AND `on("connection")`. A fake carrying only close() is a server that can
// never have accepted anything -- so a release driven through it stays green whether or not the
// teardown severs, which is part of why the lock's own teardown went unnoticed until a real peer
// held it. These cases are about acquire and reclaim, so the listener is a no-op; what matters is
// that the fake no longer denies the seam a method the real one has.
const fakeServer = () => ({ close: (done) => done(), on: () => {} });

test("acquireLock: a free name yields a holder rather than HELD_BY_OTHER", async () => {
    const got = await cache.acquireLock("\0free", { bind: async () => fakeServer() });
    assert.notEqual(got, cache.HELD_BY_OTHER);
    await got.release();
});

test("acquireLock: an occupied abstract name or pipe means a live holder, with no reclaim", async () => {
    // The kernel frees both namespaces when the holder dies, so occupied cannot mean stale —
    // and probing or removing here is what would resurrect the two-holder race.
    for (const name of ["\0vc-secrets-dev-proj-azure-mcp.lock", "\\\\.\\pipe\\vc-secrets-dev-proj-azure-mcp-lock"]) {
        const calls = [];
        const got = await cache.acquireLock(name, {
            bind: async () => { throw inUse(); },
            probe: async () => { calls.push("probe"); return false; },
            remove: () => calls.push("remove"),
        });
        assert.equal(got, cache.HELD_BY_OTHER, name);
        assert.deepEqual(calls, [], `${name} must not be probed or unlinked`);
    }
});

test("acquireLock: an error that is not EADDRINUSE is raised, not read as contention", async () => {
    // EPERM or EACCES reported as "someone else holds it" would make the launcher wait out the
    // whole timeout and then blame a neighbour for a permission problem.
    await assert.rejects(() => cache.acquireLock("\0denied", {
        bind: async () => { throw Object.assign(new Error("listen EPERM"), { code: "EPERM" }); },
    }), /EPERM/);
});

test("acquireLock: on a path, a live holder is not evicted", async () => {
    const calls = [];
    const got = await cache.acquireLock("/tmp/vc-secrets-dev-proj-azure-mcp.lock", {
        bind: async () => { throw inUse(); },
        probe: async () => true,
        remove: () => calls.push("remove"),
    });
    assert.equal(got, cache.HELD_BY_OTHER);
    assert.deepEqual(calls, [], "unlinking a live holder's socket is the two-holder race");
});

test("acquireLock: on a path, a socket a killed holder left behind is reclaimed", async () => {
    let bound = 0;
    const removed = [];
    const got = await cache.acquireLock("/tmp/vc-secrets-dev-proj-azure-mcp.lock", {
        bind: async () => { if (bound++ === 0) { throw inUse(); } return fakeServer(); },
        probe: async () => false,
        remove: (p) => removed.push(p),
    });
    assert.notEqual(got, cache.HELD_BY_OTHER);
    assert.deepEqual(removed, ["/tmp/vc-secrets-dev-proj-azure-mcp.lock"]);
    assert.equal(bound, 2, "the reclaim must actually re-bind, not just unlink");
});

test("acquireLock: losing the reclaim race waits, it does not kill the launch", async () => {
    // An EADDRINUSE on the RE-bind is an ordinary contended outcome; escaping the try makes it an
    // unhandled rejection, which the launcher's run path turns into process.exit — so the server
    // never starts at all.
    const got = await cache.acquireLock("/tmp/vc-secrets-dev-proj-azure-mcp.lock", {
        bind: async () => { throw inUse(); },
        probe: async () => false,
        remove: () => {},
    });
    assert.equal(got, cache.HELD_BY_OTHER);
});

test("acquireLock: HELD_BY_OTHER cannot be mistaken for an absent lock", async () => {
    // A null or undefined sentinel would let a call site write `if (!lock)` and proceed to
    // exchange concurrently with the holder — the precise thing the lock exists to stop.
    const got = await cache.acquireLock("\0busy", { bind: async () => { throw inUse(); } });
    assert.ok(got, "the sentinel must be truthy");
    assert.equal(typeof cache.HELD_BY_OTHER, "symbol");
});

// The module URL every spawned-process test below imports by dynamic `import()` — computed once
// from this test file's own URL, so it resolves regardless of the process's working directory.
const cacheModuleUrl = new URL("./vc-secrets-cache.mjs", import.meta.url).href;

lockTest("acquireLock: a second acquisition while held reports the holder, not null", async () => {
    const p = cache.lockPathFor("t1-" + process.pid, "proj", { platform: process.platform, env: process.env });
    const first = await cache.acquireLock(p);
    assert.notEqual(first, cache.HELD_BY_OTHER);
    assert.equal(await cache.acquireLock(p), cache.HELD_BY_OTHER);
    await first.release();
});

// The same rule at the package's third server. It hung under measurement before the shared
// teardown reached it -- which is the whole argument for one teardown rather than three: with this
// site defective the suite was fully green, because a test named for a rule still only observes the
// server its body constructs.
lockTest("a teardown does not wait on a peer that only connected -- the refresh lock", async () => {
    const p = cache.lockPathFor("teardown-" + process.pid, "proj", { platform: process.platform, env: process.env });
    const held = await cache.acquireLock(p);
    assert.notEqual(held, cache.HELD_BY_OTHER);

    // Two, for the reason the sign-in listener's twin states: one peer pins the sever at a single
    // element and a loop that stops there passes.
    const peers = [];
    for (let i = 0; i < 2; i++) {
        const sock = net.connect({ path: p, allowHalfOpen: true });
        await new Promise((resolve) => sock.once("connect", resolve));
        peers.push(sock);
    }
    try {
        const outcome = await Promise.race([
            held.release().then(() => "released"),
            new Promise((resolve) => setTimeout(() => resolve("waited on the peer"), 1000)),
        ]);
        assert.equal(outcome, "released", "release() must not wait on a peer that sent no request");
    } finally {
        for (const sock of peers) {
            sock.destroy();
        }
    }
});

lockTest("acquireLock: succeeds again after release", async () => {
    const p = cache.lockPathFor("t2-" + process.pid, "proj", { platform: process.platform, env: process.env });
    const first = await cache.acquireLock(p);
    await first.release();
    const second = await cache.acquireLock(p);
    assert.notEqual(second, cache.HELD_BY_OTHER);
    await second.release();
});

lockTest("acquireLock: a holder killed without releasing does not block the next launch", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-lock-"));
    tmpDirs.push(dir);
    const script = path.join(dir, "holder.mjs");
    const name = "t3-" + process.pid;
    fs.writeFileSync(script, `
        import(${JSON.stringify(cacheModuleUrl)}).then((c) => {
            c.acquireLock(c.lockPathFor(${JSON.stringify(name)}, "proj", { platform: process.platform, env: process.env }))
                .then(() => { process.stdout.write("held\\n"); setInterval(() => {}, 1000); });
        });
    `);
    const holder = spawn(process.execPath, [script], { stdio: ["ignore", "pipe", "inherit"] });
    await new Promise((r) => holder.stdout.once("data", r));   // it holds the lock now
    holder.kill("SIGKILL");
    await new Promise((r) => holder.once("exit", r));
    const got = await cache.acquireLock(cache.lockPathFor(name, "proj", { platform: process.platform, env: process.env }));
    assert.notEqual(got, cache.HELD_BY_OTHER, "a killed holder must not lock the machine out");
    await got.release();
});

lockTest("acquireLock: exactly one of two racing processes holds it", async () => {
    // The single-process cases above cannot see the race that matters: two launchers arriving
    // at the same lock at the same moment. Two real processes can.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-lock-"));
    tmpDirs.push(dir);
    const script = path.join(dir, "racer.mjs");
    const name = "t4-" + process.pid;
    fs.writeFileSync(script, `
        import(${JSON.stringify(cacheModuleUrl)}).then((c) => {
            c.acquireLock(c.lockPathFor(${JSON.stringify(name)}, "proj", { platform: process.platform, env: process.env }))
                .then((r) => { process.stdout.write(r === c.HELD_BY_OTHER ? "lost" : "won");
                               setTimeout(() => process.exit(0), 400); })
                .catch((e) => { process.stdout.write("threw:" + e.code); process.exit(1); });
        });
    `);
    const run = () => new Promise((resolve) => {
        const p = spawn(process.execPath, [script], { stdio: ["ignore", "pipe", "inherit"] });
        let out = "";
        p.stdout.on("data", (d) => { out += d; });
        p.once("exit", () => resolve(out));
    });
    const outcomes = await Promise.all([run(), run()]);
    assert.equal(outcomes.filter((x) => x === "won").length, 1, `exactly one winner, got ${outcomes}`);
    assert.equal(outcomes.filter((x) => x === "lost").length, 1, `exactly one loser, got ${outcomes}`);
});

test("loginDeps: a seam handed in as undefined counts as NOT injected", () => {
    // The hole the key-presence check had. cmdLogin's destructuring default fires on undefined, so
    // this must read as absent — otherwise the guard blesses exactly the shape that deleted a live
    // sign-in.
    assert.ok(!definedSeams(loginDeps({ removeEntry: undefined }).deps).includes("removeEntry"));
    assert.ok(definedSeams(loginDeps().deps).includes("removeEntry"));
});

test("loginDeps: a seam handed in as null counts as NOT injected, as the body's ?? reads it", () => {
    // acquireLock and removeEntry both default to null and resolve the real thing with `??`, so a
    // null is the one shape that looks handed-in to a key check and behaves like an omission: it
    // binds the machine-global socket, or calls the real deleter.
    assert.ok(!definedSeams(loginDeps({ acquireLock: null }).deps).includes("acquireLock"));
    assert.ok(definedSeams(loginDeps().deps).includes("acquireLock"));
});

test("seamsOf: a seam declared without a default is still a seam", () => {
    // The parser is guilty until shown otherwise, because it feeds the deepEqual above and a parser
    // that quietly finds fewer names makes that assertion pass while covering less. Requiring an
    // `=` dropped a defaultless seam entirely -- and defaultless is the dangerous kind, since main
    // calls cmdLogin with no deps object at all.
    assert.deepEqual(seamsOf("async function f(a, cfg, {\n    withDefault = 1,\n    bare,\n} = {}) {"),
        ["withDefault", "bare"]);
});

test("seamsOf: a seam sharing a line with another is not dropped, and a line comment shadows nothing", () => {
    // The depth-aware split exists for the first of these; the comment strip for the second. Both
    // are ways for a name to go missing without the list looking wrong.
    assert.deepEqual(seamsOf("async function f(a, cfg, {\n    one = 1, two = 2,\n} = {}) {"), ["one", "two"]);
    assert.deepEqual(seamsOf("async function f(a, cfg, {\n    // why three is defaulted\n    three = 3,\n} = {}) {"),
        ["three"]);
});

test("seamsOf: a comma inside a line comment does not split a seam in two", () => {
    // Why the strip runs before the split rather than after. Prose commas are ordinary; this one
    // ends a part mid-sentence, so "not later" becomes the next part's leading word and reads as a
    // seam name while the real `listen` disappears. The guard then reports a list change nobody
    // made, and the reader hunts for a seam edit instead of the comment they just typed.
    assert.deepEqual(seamsOf("async function f(a, cfg, {\n    // bound here, not later\n    listen = x,\n} = {}) {"),
        ["listen"]);
});

test("seamsOf: a default containing a comma does not split into two seams", () => {
    // The whole reason the split is depth-aware: writeEntry's default is an arrow taking two
    // parameters, and a naive split on "," would report `name` and `value` as seams of their own.
    assert.deepEqual(seamsOf("async function f(a, cfg, {\n    w = (name, value) => g(name, value),\n    x = [1, 2],\n} = {}) {"),
        ["w", "x"]);
});

// -----
// The preload's target matcher (vc-secrets-target.mjs)

test("a target pattern anchors on the package AND its entry file", () => {
    const re = target.targetEntryPattern("@vendor/server");
    assert.equal(re.test("/x/node_modules/@vendor/server/dist/index.js"), true);
    assert.equal(re.test("/x/node_modules/@other/thing/dist/index.js"), false,
        "dist/index.js alone must not make every node process a candidate");
    assert.equal(re.test("/x/node_modules/some-other-pkg/dist/index.js"), false);
    assert.equal(re.test("/x/node_modules/@vendor/server/lib/util.js"), false,
        "the package path alone must not match every file under its tree");
});

test("a scoped package matches with a separator between scope and name", () => {
    // This is the Windows form npx resolves there, and the scope separator is the one a literal
    // "/" in the pattern would miss.
    assert.equal(target.isTargetEntry("C:\\x\\node_modules\\@vendor\\server\\dist\\index.js", "@vendor/server"), true);
});

test("a sibling package whose name merely starts the same is not a target", () => {
    // The boundary a substring match gets wrong, and the one that hands a credential to a process
    // nobody chose.
    const re = target.targetEntryPattern("@vendor/server");
    assert.equal(re.test("/x/node_modules/@vendor/server-extras/dist/index.js"), false);
});

test("a package name is matched from its first character, not as the tail of a longer name", () => {
    // Unscoped, because a scope's "@" always follows a separator and so hides this edge.
    assert.equal(target.isTargetEntry("/x/node_modules/server/dist/index.js", "server"), true);
    assert.equal(target.isTargetEntry("/x/node_modules/my-server/dist/index.js", "server"), false);
});

test("a bin name is matched from its first character, not as the tail of a longer name", () => {
    assert.equal(target.isTargetEntry("/x/node_modules/.bin/mcp-srv", "@vendor/server", "srv"), false);
});

test("a dot in a declared name matches only a dot", () => {
    assert.equal(target.isTargetEntry("/x/node_modules/socket.io/dist/index.js", "socket.io"), true);
    assert.equal(target.isTargetEntry("/x/node_modules/socketXio/dist/index.js", "socket.io"), false);
});

test("a declared bin name matches the .bin shim, which is the ordinary npx entry", () => {
    // A bin name is not derivable from a package name, which is why it travels as its own field.
    assert.equal(target.isTargetEntry("/x/node_modules/.bin/srv", "@vendor/server", "srv"), true);
    assert.equal(target.isTargetEntry("C:\\x\\node_modules\\.bin\\srv.cmd", "@vendor/server", "srv"), true);
});

test("with no declared bin, only the package entry is a target", () => {
    // The cost of leaving binName out, made visible here rather than at the one-hour mark.
    assert.equal(target.isTargetEntry("/x/node_modules/.bin/srv", "@vendor/server", null), false);
    assert.equal(target.isTargetEntry("/x/node_modules/.bin/srv", "@vendor/server", ""), false);
    // The builder treats "" as absent, as the preload's `|| null` does. A refused "" would also read
    // false above -- isTargetEntry swallows the refusal -- and only this line tells the two apart.
    assert.equal(target.isTargetEntry("/x/node_modules/@vendor/server/dist/index.js", "@vendor/server", ""), true);
});

test("a target name is constrained to the npm grammar, and undefined or null is not a name", () => {
    // undefined and null stringify to "undefined"/"null", which the grammar accepts.
    for (const bad of [".*", "@vendor/server|.*", "../../etc", "a b", undefined, null, 42]) {
        assert.throws(() => target.targetEntryPattern(bad), /package name/);
    }
    for (const bad of [".*", 42]) {
        assert.throws(() => target.targetEntryPattern("@vendor/server", bad), /bin name/);
    }
});

test("npm's own helper processes, and a process with no entrypoint, are not targets", () => {
    // NODE_OPTIONS reaches the whole subtree (measured at 3 processes on Windows, including an
    // npm helper), so being loaded is not evidence of being wanted.
    for (const entry of ["/usr/lib/node_modules/npm/bin/npx-cli.js",
        "/usr/lib/node_modules/npm/bin/npm-prefix.js", "", undefined]) {
        assert.equal(target.isTargetEntry(entry, "@vendor/server", "srv"), false);
    }
});

test("isTargetEntry never throws: a malformed target is simply not matched", () => {
    const entry = "/x/node_modules/@vendor/server/dist/index.js";
    for (const args of [[entry, ".*"], [entry, undefined], [entry, "@vendor/server", ".*"]]) {
        let result;
        assert.doesNotThrow(() => { result = target.isTargetEntry(...args); });
        assert.equal(result, false);
    }
});

const launcherModuleUrl = new URL("./vc-secrets.mjs", import.meta.url).href;

channelTest("cmdLaunch: the channel directory is removed when the launcher process exits", async (t) => {
    // dispose() is the SUITE's path, not production's: a real launch leaves through
    // child.on("close") -> process.exit or through fail(), where only an "exit" handler runs. A
    // filesystem socket outlives its process, so a launcher that cleans up anywhere else leaves
    // one directory per launch behind and no test would ever say so.
    if (process.platform === "win32") {
        t.skip("a named pipe has no directory to leak");

        return;
    }
    const scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-exit-"));
    tmpDirs.push(scriptDir);
    const script = path.join(scriptDir, "launch.mjs");
    fs.writeFileSync(script, `
        import * as m from ${JSON.stringify(launcherModuleUrl)};
        import path from "node:path";
        import { EventEmitter } from "node:events";
        const handle = await m.cmdLaunch("servers", "s", ${JSON.stringify(CMD_LAUNCH_CFG)}, {
            bindPlatform: "linux",
            readCache: async () => ({ state: "valid", accessToken: "t" }),
            childNodeVersion: () => "v20.11.0",
            spawnFn: () => new EventEmitter(),
        });
        process.stdout.write(path.dirname(handle.channel.path));
        process.exit(0);   // the production exit path: no dispose, no close
    `);
    const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
    assert.match(r.stdout, /^\/tmp\/vc-secrets-ch-/, `${r.stdout}${r.stderr}`);
    assert.equal(fs.existsSync(r.stdout), false, "one leftover directory per launch, otherwise");
});

// The child watches only the directories its own launch creates, through a spy on the default fs
// object (the launcher reads mkdtempSync off it at call time), not a listing of /tmp: /tmp is
// shared with every other process, and one making or removing a vc-secrets-ch- directory during
// the run would redden this test. `created === 1` is the half a bare "nothing left" cannot give:
// it fails if no channel is ever made, so the test cannot pass without having had one to leak.
channelTest("cmdLaunch: a spawn that throws leaves no channel directory behind", async () => {
    if (process.platform === "win32") {
        return;   // a named pipe has no directory to leak
    }
    const scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-leak-"));
    tmpDirs.push(scriptDir);
    const script = path.join(scriptDir, "launch.mjs");
    fs.writeFileSync(script, `
        import * as m from ${JSON.stringify(launcherModuleUrl)};
        import fs from "node:fs";
        const made = [];
        const real = fs.mkdtempSync;
        fs.mkdtempSync = (prefix, ...rest) => {
            const dir = real(prefix, ...rest);
            if (String(prefix).includes("vc-secrets-ch-")) {
                made.push(dir);
            }
            return dir;
        };
        m.cmdLaunch("servers", "s", ${JSON.stringify(CMD_LAUNCH_CFG)}, {
            bindPlatform: "linux",
            readCache: async () => ({ state: "valid", accessToken: "t" }),
            childNodeVersion: () => "v20.11.0",
            spawnFn: () => { throw new Error("spawn refused"); },
        }).catch(() => {
            process.on("exit", () => {
                fs.writeSync(1, JSON.stringify({ created: made.length, left: made.filter((d) => fs.existsSync(d)) }));
            });
            process.exit(1);   // what fail() does
        });
    `);
    const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(r.stdout), { created: 1, left: [] }, `${r.stdout}${r.stderr}`);
});

const PROBE_PATH = fileURLToPath(new URL("./vc-secrets-probe.mjs", import.meta.url));

// Writes a single project-scope declaration file and returns its containing directory, exactly as
// tmpConfigDir in vc-secrets.test.mjs does -- kept local (that file is off-limits to import from,
// so it is not re-exported) but reusing this file's own tmpDirs/after() cleanup above rather than
// growing a second one.
function tmpProbeConfigDir(cfg) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-probe-"));
    tmpDirs.push(dir);
    fs.writeFileSync(path.join(dir, m.CONFIG_NAME), JSON.stringify(cfg));

    return dir;
}

// ---------------------------------------------------------------------------------------------
// vc-secrets-probe.mjs — the initialize-handshake verification aid. Ported from the upstream
// launcher's mcpw-probe.js and its suite: `mcpw` becomes `vc-secrets` throughout, including inside
// the LAUNCHER_LINE / TOKEN_REFUSAL patterns. Those were COPIED with the tool name substituted, then
// checked against this package's own messages one alternative at a time -- which is how "not signed
// in" came out, having no producer here that LAUNCHER_LINE can match.
// ---------------------------------------------------------------------------------------------

test("classifyProbeFailure: a launcher that could not get a token is not a broken server binary", () => {
    // The distinction the probe exists to make. Under OAuth "nobody has signed in" is routine and
    // "the server binary cannot start" is a regression; one message for both means the regression
    // reads exactly like the routine case.
    assert.equal(probe.classifyProbeFailure('vc-secrets: no usable token for "azure-mcp" -- run "vc-secrets login azure-mcp"'), "token");
    assert.equal(probe.classifyProbeFailure('vc-secrets: another vc-secrets is still refreshing the token for "azure-mcp"'), "token");
    assert.equal(probe.classifyProbeFailure("vc-secrets: token endpoint refused the request: invalid_grant"), "token");
});

test("classifyProbeFailure: any other launcher refusal is named, not blamed on the server", () => {
    assert.equal(probe.classifyProbeFailure('vc-secrets: unknown server "ghost" -- not declared in vc-secrets.json'), "launcher");
    assert.equal(probe.classifyProbeFailure("vc-secrets: failed to spawn npx: ENOENT"), "launcher");
});

test("classifyProbeFailure: output that is not the launcher's belongs to the server", () => {
    assert.equal(probe.classifyProbeFailure("Error: Cannot find module '/x/dist/index.js'"), "server");
    assert.equal(probe.classifyProbeFailure(""), "server");
    assert.equal(probe.classifyProbeFailure(undefined), "server");
});

test("describeFailure: each kind produces a message a reader can act on, and the token branch echoes none", () => {
    const token = probe.describeFailure("azure-mcp",
        'vc-secrets: no usable token for "azure-mcp" -- run "vc-secrets login azure-mcp" [eyJhbGciOi.LEAKED]');
    assert.match(token, /token not obtainable/);
    // The name's second half. The token branch SYNTHESISES its message from the server name; only the
    // launcher branch echoes the launcher's line verbatim. Routing the token branch through that same
    // echo would put whatever the launcher printed into the summary, and the three matches above would
    // all still pass -- so the bound the name states needs its own assertion.
    assert.doesNotMatch(token, /LEAKED/, "the token branch must not echo the launcher's line");
    assert.match(probe.describeFailure("azure-mcp", 'vc-secrets: unknown server "ghost"'), /launcher refused: unknown server/);
    assert.match(probe.describeFailure("azure-mcp", "Error: Cannot find module"), /server exited before responding/);
});

test("vc-secrets-probe: importing it spawns nothing -- the module is guarded", () => {
    // It used to run on load: reading argv and spawning a child. That is why none of the logic
    // above could have a test, and why the two failures went on being one message.
    const source = stripComments(fs.readFileSync(PROBE_PATH, "utf8"));
    // The gate is the launcher's isDirectRun, which resolves symlinks; the behaviour is pinned by the
    // symlinked-directory run in vc-secrets.test.mjs, and this keeps the call site inside it.
    assert.match(source, /if \(isDirectRun\(import\.meta\.url\)\)/);
    assert.equal(source.split("main(server);").length - 1, 1, "exactly one call site");
    assert.ok(source.indexOf("if (isDirectRun(import.meta.url))")
        < source.indexOf("main(server);"), "and it is inside the guard");
});

test("vc-secrets-probe: a launcher refusal is captured, classified, and still echoed to the developer", () => {
    // The classifier tests above are pure, so they would not notice if the stderr plumbing broke --
    // and the plumbing is the change: stderr used to be inherited, which let the developer read it
    // but left the probe unable to tell its two failures apart. Both halves matter, so both are
    // asserted through a real run.
    const dir = tmpProbeConfigDir({ secrets: {}, servers: {} });
    const r = spawnSync(process.execPath, [PROBE_PATH, "ghost"],
        { env: launcherEnv({ VC_SECRETS_CONFIG_DIR: dir }), encoding: "utf8" });
    assert.match(r.stderr, /probe: ghost -> launcher refused: unknown server/);
    assert.match(r.stderr, /^vc-secrets: unknown server/m, "the launcher's own line must still reach the developer");
    assert.equal(r.stdout, "", "the probe writes nothing on fd 1");
    assert.equal(r.status, 1);
});

test("vc-secrets-probe: a backend tool's multi-line failure is still a launcher refusal, not a dead server",
    { skip: process.platform === "win32"
        && "the stub is an extensionless #!/bin/sh script, which a win32 lookup never resolves as gpg" }, () => {
    // The classifier reads the LAST stderr line, and a tool's own stderr arrives embedded in the
    // launcher's message with its newlines intact. A locked gpg agent answers in three lines, so the
    // last one was "gpg: decryption failed ..." -- nobody's launcher prefix -- and the probe reported
    // "server exited before responding", the one outcome the doctor skill reads as a broken binary.
    // Asserting through the probe rather than on the line shape, because the verdict is what misled.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-multiline-"));
    tmpDirs.push(home);
    const secretPath = path.join(home, "vc-secrets", "secrets", "demo", "plain.gpg");
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, "ciphertext-placeholder");   // only has to exist for the pre-check
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-gpgfail-"));
    tmpDirs.push(binDir);
    fs.writeFileSync(path.join(binDir, "gpg"), '#!/bin/sh\n'
        + '>&2 echo "gpg: encrypted with 1 passphrase"\n'
        + '>&2 echo "gpg: public key decryption failed: No pinentry"\n'
        + '>&2 echo "gpg: decryption failed: No secret key"\n'
        + 'exit 2\n', { mode: 0o755 });
    const dir = tmpProbeConfigDir({
        projectId: "demo",
        secrets: { plain: { backend: "local" } },
        servers: { s: { command: "true", args: [], env: { OTHER: "secret:plain" } } },
    });

    const r = spawnSync(process.execPath, [PROBE_PATH, "s"], { encoding: "utf8",
        env: trustedLauncherEnv(dir, { XDG_CONFIG_HOME: home, VC_SECRETS_LOCAL_BACKEND: "gpg",
            PATH: `${binDir}${path.delimiter}${process.env.PATH}` }) });

    assert.match(r.stderr, /launcher refused/, `the probe must blame the launcher, not the server:\n${r.stderr}`);
    assert.doesNotMatch(r.stderr, /server exited before responding/);
    assert.match(r.stderr, /No secret key/, "the tool's own words must survive the collapse into one line");
});

test("classifyProbeFailure: a launcher line followed by a server death is the server's failure", () => {
    // "channel client refused" can only be printed by a launcher whose server is already RUNNING,
    // and the timing line is emitted on the success path -- so blaming either for a crash
    // reintroduces the conflation, reversed.
    // "Segmentation fault" is a SHELL's message and was unreachable here: the probe spawns the
    // launcher directly and the launcher spawns the server with no shell, so nothing in this pipeline
    // can print it. Replaced with a line the runtime really does emit on its way down.
    assert.equal(probe.classifyProbeFailure("vc-secrets: channel client refused (nonce)\nFATAL ERROR: Reached heap limit Allocation failed"), "server");
    assert.equal(probe.classifyProbeFailure("vc-secrets: resolve phase took 812 ms\nError: Cannot find module"), "server");
});

test("classifyProbeFailure: an exit code the launcher cannot produce itself is the server's, whatever the last line said", () => {
    // Every launcher-fatal exit on the run path is 1 -- fail() uses a VcSecretsError's exitCode and
    // every one in the package leaves it at the default -- and the launcher's only other exit relays
    // the server's code. So a non-1 code proves the launcher did not refuse. Without it, a benign
    // launcher line printed last swallowed a silent server death: measured, with the timing knob set,
    // `probe: silent -> launcher refused: resolve phase took 0 ms`.
    assert.equal(probe.classifyProbeFailure("vc-secrets: resolve phase took 0 ms", 3), "server");
    assert.equal(probe.classifyProbeFailure('vc-secrets: no usable token for "ado" -- run "vc-secrets login ado"', 3), "server");

    // Code 1 cannot separate a launcher failure from a server that also exited 1, so the text rule
    // still decides there -- and so does an absent code, for a caller that has none. Both are
    // asserted because either silently becoming "server" would disable the classifier outright.
    assert.equal(probe.classifyProbeFailure('vc-secrets: no usable token for "ado" -- run "vc-secrets login ado"', 1), "token");
    assert.equal(probe.classifyProbeFailure('vc-secrets: no usable token for "ado" -- run "vc-secrets login ado"'), "token");
});

test("vc-secrets-probe: a silent server death stays the server's even with the launcher's timing knob set", () => {
    // The end-to-end shape both guards exist for, measured as a defect before either: a server that
    // exits without printing, plus VC_SECRETS_TIMING=1, left the launcher's benign timing line last
    // and the probe blamed the launcher. Two independent discriminators cover it -- the knob is
    // dropped from the child's environment, and the relayed exit code is not 1 -- but this test pins
    // only the FIRST: restoring the knob's inheritance reddens it. The exit-code half is pinned by
    // "classifyProbeFailure: an exit code the launcher cannot produce itself is the server's,
    // whatever the last line said", and measured -- deleting that branch leaves THIS test green, because
    // with the knob dropped there is no benign line left for it to misread.
    const dir = tmpProbeConfigDir({ projectId: "p", secrets: {},
        servers: { silent: { command: process.execPath, args: ["-e", "setTimeout(()=>process.exit(3),80)"], env: {} } } });
    const r = spawnSync(process.execPath, [PROBE_PATH, "silent"],
        { env: trustedLauncherEnv(dir, { VC_SECRETS_TIMING: "1" }), encoding: "utf8" });
    assert.match(r.stderr, /probe: silent -> server exited before responding/);
    assert.doesNotMatch(r.stderr, /resolve phase took/, "the timing knob must not reach the launcher the probe spawns");
});

test("classifyProbeFailure: token wording from the SERVER is not the launcher's refusal", () => {
    // The server is an auth-heavy process that emits its own credential-flavoured failures, and the
    // message this used to produce -- "the server binary was never reached" -- was simply false.
    assert.equal(probe.classifyProbeFailure("FATAL: token endpoint returned 500 while starting"), "server");
    assert.equal(probe.classifyProbeFailure("could not sign in: not signed in to Azure"), "server");
});

test("vc-secrets-probe: every verdict is written synchronously, or a slow reader loses it", () => {
    // Measured on the previous version: with 2 MB of child stderr and a reader that sleeps, exactly
    // one pipe buffer arrived and the classification line -- the entire deliverable -- never did.
    // process.exit abandons pending writes, which is why this file's neighbours use writeSync.
    // The ABSENCE check reads raw source on purpose: stripping could only hide an occurrence, turning
    // a doesNotMatch into a silent pass. The positive match reads stripped, so a comment quoting the
    // line cannot satisfy it.
    const source = fs.readFileSync(PROBE_PATH, "utf8");
    assert.ok(!source.includes("process.stderr.write"), "an async write before process.exit can be dropped");
    assert.match(stripComments(source), /fs\.writeSync\(2, `\$\{describeFailure/);
});

test("vc-secrets-probe kills the process TREE at every call site", () => {
    // Two claims, and only the second is independent of how many sites there are: every termination
    // goes through the shared helper, AND each path that terminates still has one. A count FLOOR
    // cannot express the second -- this diff added a THIRD termination (the interrupt handler) while
    // the floor stayed at 2, so deleting that handler, which is the whole of the orphan fix, passed
    // green. Measured. Asserted per PATH instead, so a fourth fails loudly rather than riding a floor.
    const source = stripComments(fs.readFileSync(PROBE_PATH, "utf8"));
    for (const [where, pattern] of [
        ["the 30 s timeout", /TIMEOUT \(30 s\)[\s\S]{0,140}?killProcessTree\(/],
        ["the interrupt handler", /for \(const signal of forwardedSignalsFor\(\)\)[\s\S]{0,260}?killProcessTree\(/],
        ["the answered-handshake path", /serverInfo\.name[\s\S]{0,240}?killProcessTree\(/],
    ]) {
        assert.match(source, pattern, `${where} must terminate the child through the shared tree kill`);
    }
    const kills = source.match(/\b\w+\.kill\(|killProcessTree\(/g) ?? [];
    assert.deepEqual(kills.filter((k) => k !== "killProcessTree("), [],
        "and no termination may bypass it");
});

test("a child killProcessTree signals is spawned detached, and its parent handles the signals that then miss it", () => {
    // killProcessTree signals `-child.pid` -- the child's process GROUP, which is the child's own only
    // if it was spawned detached. Sharing the parent's group instead makes the call name a group the
    // child is not in: usually absent, so it throws and the fallback covers it, but a recycled pid
    // makes it somebody ELSE's group, the group kill SUCCEEDS, the child is never signalled, and a
    // stranger's group takes the follow-up SIGKILL.
    //
    // Named for the rule rather than for either call site, because the rule has two sites and had no
    // test at all -- a site-named test leaves the next site to repeat this. Asserted on source text
    // because the pgid that decides it belongs to a grandchild no test here can reach; comments are
    // stripped first, so restoring the option in prose cannot satisfy it.
    // The second half is the PRICE of the first, and was missed once: detached also takes the child
    // out of the terminal's foreground group, so Ctrl-C stops reaching it. Measured -- a detached
    // child survives a SIGINT sent to its parent's group and a non-detached one does not -- so with
    // no handler the parent dies and orphans the tree that detached was adopted to let it kill.
    // The launcher names its list, because it is also what dispose() removes; the probe takes the same
    // list from forwardedSignalsFor, so the two cannot disagree about which signals they install for.
    for (const [file, read, installs] of [
        ["vc-secrets-probe.mjs", () => fs.readFileSync(fileURLToPath(new URL("./vc-secrets-probe.mjs", import.meta.url)), "utf8"),
            /for \(const signal of forwardedSignalsFor\(\)\)\s*\{\s*process\.on\(/],
        ["the launcher", launcherSource, /for \(const signal of forwardedSignals\)\s*\{\s*process\.on\(/],
    ]) {
        const source = stripComments(read());
        assert.match(source, /detached: process\.platform !== "win32"/, `${file} must spawn detached`);
        // `process.on`, not merely the loop: cmdLaunch's dispose() REMOVES the same handlers with a
        // loop spelled identically to the one that installs them, so a match on the loop alone is
        // satisfied by the removal and says nothing about the install. Measured -- deleting the
        // install loop left the looser pattern matching the dispose one, green.
        assert.match(source, installs,
            `${file} must INSTALL handlers for the signals detached diverts away from its child`);
    }
});

test("describeFailure: the token remedy is the launcher's own, naming the oauth entry and not the server", () => {
    // Deviation from the ported source, which stopped at "token not obtainable". The remedy is lifted
    // from the launcher's line rather than composed here, because `vc-secrets login` resolves
    // cfg.oauth[name]: composed from the server name it names a command that exits "unknown oauth
    // entry", contradicting the correct remedy printed one line above it. Measured end to end.
    //
    // The two names differ in this fixture ON PURPOSE. Every other fixture in this file uses one name
    // for both slots, which cannot tell "reads its argument" from "reads the right identifier".
    const message = probe.describeFailure("azure-devops",
        'vc-secrets: no usable token for "ado" -- run "vc-secrets login ado"');
    assert.match(message, /run "vc-secrets login ado"/);
    assert.doesNotMatch(message, /login azure-devops/,
        "a remedy composed from the server name sends the developer to a command that fails");
});

test("describeFailure: a token refusal that carries no remedy gets none invented for it", () => {
    // The two token-class failures the launcher prints WITHOUT a remedy: a concurrent refresh, and a
    // RETRYABLE endpoint failure. A refused endpoint is NOT one of them -- "invalid_grant" arrives at
    // HTTP 400, which the launcher tags refused and does append a remedy to, so a fixture using it
    // would encode a shape this pipeline does not produce. Inventing a remedy here would be the
    // wrong-verb defect with an extra step.
    for (const line of ['vc-secrets: another vc-secrets is still refreshing the token for "ado"',
        "vc-secrets: token endpoint refused the request: HTTP 503 with an unrecognised body"]) {
        const message = probe.describeFailure("azure-devops", line);
        assert.match(message, /token not obtainable/);
        assert.doesNotMatch(message, /vc-secrets login/, `no remedy may be invented for: ${line}`);
    }
});
