import { test, after } from "node:test";
import assert from "node:assert/strict";
import * as m from "./vc-secrets.mjs";              // the launcher
import * as oauth from "./vc-secrets-oauth.mjs";     // the protocol
import * as cache from "./vc-secrets-cache.mjs";     // entries, expiry, the lock
import * as target from "./vc-secrets-target.mjs";   // the preload's target matcher
import * as probe from "./vc-secrets-probe.mjs";     // the initialize-handshake verification aid
import crypto from "node:crypto";
import os from "node:os";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";

// Two of the acquireLock socket tests below spawn a real second process to race or kill, and each
// writes its own throwaway script into a fresh tmp dir. Removed here rather than per-test so a
// thrown assertion still leaves nothing behind.
const tmpDirs = [];
after(() => {
    for (const dir of tmpDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

// The environment for a spawned launcher or probe: the developer's own without any VC_SECRETS_* knob
// (a VC_SECRETS_CONFIG_DIR in their shell would point `doctor` or a probe at their real declarations,
// secret reads and `az`) and with HOME, USERPROFILE and XDG_CONFIG_HOME on a fresh directory, so no
// FILE-based state a run reaches is theirs. The operating system's own stores -- the wcm and keychain
// entries -- are not under those variables, so a test that can touch one pins the backend in `extra`
// rather than relying on this. The same scrub runEntry applies, matched without regard to case; `extra`
// lands last, so a test that means to use a fixture home passes it there.
function launcherEnv(extra = {}) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-launcher-home-"));
    tmpDirs.push(home);
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
        if (/^VC_SECRETS_/i.test(key)) {
            delete env[key];
        }
    }

    return { ...env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: home, ...extra };
}

// A spawned launcher refuses a repository's launchable until a trust record says otherwise. Written
// through the launcher's own writeTrustState under the env the launcher will read it from, and built
// from the config itself with launchShape, so the record follows the declaration under test. Kept local
// like tmpProbeConfigDir below: this file does not import from the other suite.
function trustedLauncherEnv(dir, extra = {}) {
    const env = launcherEnv({ VC_SECRETS_CONFIG_DIR: dir, ...extra });
    const cfg = m.loadConfig(m.configPaths(env, dir));
    const record = { trustedAt: "2000-01-01T00:00:00.000Z", projectId: cfg.projectId, servers: {}, tasks: {} };
    for (const kind of ["servers", "tasks"]) {
        for (const [name, launchable] of Object.entries(cfg[kind])) {
            if (launchable.home !== "user") {
                record[kind][name] = m.launchShape(launchable);
            }
        }
    }
    m.writeTrustState(env, { schemaVersion: 1, repositories: { [cfg.projectRoot]: record } });

    return env;
}

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

// Measured on this machine: a bind that is refused does NOT throw from listen() — it emits
// an 'error' event, and an unattached one aborts the whole process instead of failing one test.
// So the probe attaches a handler, which makes it async, which is why the skip decision happens
// inside each test rather than in a module-level constant.
//
// Adapted from the source's unix-domain-socket probe: the capability under test here is a
// loopback TCP bind, covering httpsPostForm's socket-drop behaviour, so the probe binds one
// instead of a unix socket — probing the wrong permission would answer confidently either way.
// The lock-file tests that need a real unix-socket bind get their own gate and probe further
// down (canBindLocks/lockTest), because they exercise a different privilege than this one.
let bindProbe = null;
function canBindSockets() {
    bindProbe ??= new Promise((resolve) => {
        const probe = net.createServer();
        probe.once("error", () => resolve(false));
        probe.once("listening", () => probe.close(() => resolve(true)));
        probe.listen(0, "127.0.0.1");
    });

    return bindProbe;
}

// This is the only coverage httpsPostForm's socket-drop behaviour has. Measured on this machine:
// a loopback TCP bind is permitted both inside and outside the Claude Code sandbox — it is the
// unix-socket bind the sandbox refuses, which is what the source's probe tested and why this one
// was changed. So the expected outcome here is RUN, not skip: a run reporting it skipped means a
// broken probe or an unusually restricted host, and either way the skip is a signal.
const socketTest = (name, fn) => test(name, async (t) => {
    if (!(await canBindSockets())) {
        t.skip("needs an environment that permits a loopback TCP bind");

        return;
    }
    await fn(t);
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

// ---------------------------------------------------------------------------------------------
// vc-secrets-cache.mjs — two keystore entries, their expiry check, and the cross-process refresh
// lock. Ported from the upstream launcher's cache module and its suite: `c.` below becomes `cache.`,
// `m.McpwError` becomes `m.VcSecretsError`. `entryNames` has no test here — the source's own is
// not ported, because `oauthEntryKeys()` in vc-secrets.mjs already fills that role for this
// package, and a second incompatible name generator would be the defect.
// ---------------------------------------------------------------------------------------------

// The identity a cache entry must carry to match the OAuth declaration these tests exercise.
const DECL_IDENTITY = { tenantId: "t", clientId: "c", scopes: ["scope-a", "scope-b"] };
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
    // `valid` and the launcher handed over a dead token — measured, not argued.
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

test("lockPathFor: a filesystem path on darwin, outside the secrets directory", () => {
    // The source additionally asserted the path excluded the substring "mcpw/secrets", justified
    // by that repository's own permissions.deny patterns matching that substring — a rule that
    // lives in a repository this package does not ship to, so that half of the check is not
    // carried over verbatim. The INVARIANT behind it is not void, though: this package has its
    // own secretsDir() (vc-secrets.mjs), where the gpg-encrypted blobs actually live, and a lock
    // file must not fall inside it.
    const p = cache.lockPathFor("azure-mcp", "proj", { platform: "darwin", userInfo: () => ({ uid: 1000 }) });
    assert.equal(p[0], "/");
    // Above the length bound deliberately: a relocation into a deep secrets directory trips the
    // byte count first, and that assertion carries no diagnosis. Order decides which of the two
    // gets to explain the failure.
    assert.ok(!p.startsWith(m.secretsDir()), `the lock must not fall inside the secrets directory: ${p}`);
    assert.ok(Buffer.byteLength(p) <= 100, `sun_path is ~104 bytes on darwin; this is ${Buffer.byteLength(p)}: ${p}`);
    assert.ok(p.includes("proj"), "the project axis must reach the name, or two projects share one mutex");
    const other = cache.lockPathFor("azure-mcp", "other-proj",
        { platform: "darwin", userInfo: () => ({ uid: 1000 }) });
    assert.notEqual(p, other, "two different scopes must not collide on darwin");
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
    // The branch a previous draft got wrong. An EADDRINUSE on the RE-bind is an ordinary
    // contended outcome; escaping the try makes it an unhandled rejection, which the launcher's
    // run path turns into process.exit — so the server never starts at all.
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

test("LOCK_WAIT_MS outlasts the holder's whole critical section, not just its exchange", () => {
    // The holder cannot release before both keystore entries are written — releasing earlier
    // hands the waiter a refresh token Entra has already rotated away. So the waiter has to
    // cover the exchange AND both writes; covering only the exchange abandons a neighbour who
    // was two slow keystore calls from publishing. The three constants live in three modules
    // and nothing but this line relates them.
    assert.ok(cache.LOCK_WAIT_MS > oauth.TIMEOUT_OAUTH_MS + 2 * m.TIMEOUT_LOCAL_MS,
        `LOCK_WAIT_MS=${cache.LOCK_WAIT_MS} must exceed ${oauth.TIMEOUT_OAUTH_MS} + 2 * ${m.TIMEOUT_LOCAL_MS}`);
});

test("the margin covers the tick, the exchange, the skew allowance and both keystore writes", () => {
    // Four terms live in three modules and nothing else connects them: RENEWAL_TICK_MS (this
    // launcher) is how late entering the margin can be noticed; TIMEOUT_OAUTH_MS (the protocol) is
    // the exchange the margin must still have time for; SKEW_TOLERANCE_MS (the cache) is the
    // ordinary clock-correction allowance cacheStatus absorbs before calling it a rollback;
    // TIMEOUT_LOCAL_MS (this launcher) is one keystore call, counted twice because the renewal
    // writes the refresh entry and then the access entry after the exchange -- the same pair
    // LOCK_WAIT_MS's own relation above has to cover.
    assert.ok(cache.MARGIN_MS >= m.RENEWAL_TICK_MS + oauth.TIMEOUT_OAUTH_MS + cache.SKEW_TOLERANCE_MS
            + 2 * m.TIMEOUT_LOCAL_MS,
        `MARGIN_MS=${cache.MARGIN_MS} must be at least RENEWAL_TICK_MS(${m.RENEWAL_TICK_MS}) + `
        + `TIMEOUT_OAUTH_MS(${oauth.TIMEOUT_OAUTH_MS}) + SKEW_TOLERANCE_MS(${cache.SKEW_TOLERANCE_MS}) + `
        + `2 * TIMEOUT_LOCAL_MS(${m.TIMEOUT_LOCAL_MS})`);
});

// acquireLock binds a UNIX socket (abstract on linux, a filesystem path on darwin) — a different
// privilege from socketTest's loopback TCP probe above. Measured on this sandbox: TCP loopback
// bind is permitted, both an abstract AND a filesystem unix-socket bind are EPERM. So reusing
// socketTest here would answer "can bind" and every lockTest case would then fail EPERM, reading as
// a regression rather than a sandbox restriction — a probe of the wrong privilege answers
// confidently either way. This exact defect has already been fixed once in this file, in the
// OTHER direction: socketTest's own probe was adapted FROM a unix-domain-socket probe TO a TCP
// one, because at the time this file had no lock-file tests to gate at all.
let lockBindProbe = null;
function canBindLocks() {
    lockBindProbe ??= new Promise((resolve) => {
        const probe = net.createServer();
        probe.once("error", () => resolve(false));
        probe.once("listening", () => probe.close(() => resolve(true)));
        probe.listen(cache.lockPathFor("selftest-" + process.pid, "proj",
            { platform: process.platform, env: process.env }));
    });

    return lockBindProbe;
}

// Unlike socketTest, a skip here is NOT a signal that the probe is broken — it is the expected
// outcome in the Claude Code sandbox, where a unix-domain-socket bind IS refused (EPERM). All
// four lockTest cases skip there, and a green in-sandbox run proves less than it looks like:
// measured, a mutation where release() never closes the server is fully green in-sandbox and
// only dies when the suite runs outside it.
const lockTest = (name, fn) => test(name, async (t) => {
    if (!(await canBindLocks())) {
        t.skip("needs an environment that permits a unix-domain-socket bind");

        return;
    }
    await fn(t);
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

// The same rule at the package's third server. It was found by a review pass reading the fix for the
// second one, and it hung under measurement before the shared teardown reached it -- which is the
// whole argument for one teardown rather than three: with this site defective the suite was fully
// green, because a test named for a rule still only observes the server its body constructs.
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

// ---------------------------------------------------------------------------------------------
// ensureFreshToken / acquireTokenLock / oauthLaunchDeps / tokenLockFor — the port of the
// launcher's single locked read→exchange→write refresh path. Ported from the upstream launcher
// (mcpw.js) and its suite: `m.McpwError` becomes `m.VcSecretsError`, and "mcpw"/"mcpw login" in
// every user-facing string becomes "vc-secrets"/"vc-secrets login". tokenLockFor and
// oauthLaunchDeps take a `decl`/`cfg` pair the source never needed, because this package's
// keystore keys are three-segment ("vc-secrets:<scope>:<name>") and carry a project scope the
// source's bare entry names never had — see the comments on tokenLockFor and oauthLaunchDeps
// themselves for why the scope key has to agree with keyFor's.
// ---------------------------------------------------------------------------------------------

const DEPS = (over = {}) => ({
    serverName: "azure-mcp",
    readCache: async () => ({ state: "valid", accessToken: "cached" }),
    writeCache: async () => {},
    exchange: async () => ({ accessToken: "fresh", refreshToken: "r2" }),
    acquireLock: async () => ({ release: async () => {} }),
    now: () => 1_000,
    sleep: async () => {},
    ...over,
});

test("ensureFreshToken: a valid cached token is used without contacting Entra", async () => {
    let exchanged = 0;
    const t = await m.ensureFreshToken(DEPS({ exchange: async () => { exchanged++; } }));
    assert.equal(t, "cached");
    assert.equal(exchanged, 0);
});

test("ensureFreshToken: inside the margin it exchanges once, under the lock, and persists", async () => {
    const order = [];
    await m.ensureFreshToken(DEPS({
        readCache: async () => ({ state: "needs-refresh", refreshToken: "r1" }),
        acquireLock: async () => { order.push("lock"); return { release: async () => { order.push("release"); } }; },
        exchange: async () => { order.push("exchange"); return { accessToken: "fresh", refreshToken: "r2" }; },
        writeCache: async () => order.push("write"),
    }));
    assert.deepEqual(order, ["lock", "exchange", "write", "release"]);
});

test("ensureFreshToken: the loser of the race uses the winner's token, never exchanges", async () => {
    let exchanged = 0, polls = 0;
    const t = await m.ensureFreshToken(DEPS({
        readCache: async () => (++polls < 3 ? { state: "needs-refresh", refreshToken: "r1" }
                                            : { state: "valid", accessToken: "neighbours" }),
        acquireLock: async () => cache.HELD_BY_OTHER,
        exchange: async () => { exchanged++; },
    }));
    assert.equal(t, "neighbours");
    assert.equal(exchanged, 0, "two exchanges would rotate the refresh token twice");
});

test("ensureFreshToken: waiting on a neighbour that never finishes names the neighbour", async () => {
    let elapsed = 0;
    await assert.rejects(() => m.ensureFreshToken(DEPS({
        readCache: async () => ({ state: "needs-refresh", refreshToken: "r1" }),
        acquireLock: async () => cache.HELD_BY_OTHER,
        sleep: async (ms) => { elapsed += ms; },
        now: () => 1_000 + elapsed,
    })), (e) => /another vc-secrets/i.test(e.message) && !/vc-secrets login/.test(e.message));
    assert.ok(elapsed >= cache.LOCK_WAIT_MS, `must wait the full deadline, waited ${elapsed}`);
});

test("ensureFreshToken: the lock is released even when the exchange throws", async () => {
    let released = 0;
    await assert.rejects(() => m.ensureFreshToken(DEPS({
        readCache: async () => ({ state: "needs-refresh", refreshToken: "r1" }),
        acquireLock: async () => ({ release: async () => { released++; } }),
        exchange: async () => { throw new Error("network down"); },
    })));
    assert.equal(released, 1, "a leaked lock blocks every other session on this machine, permanently");
});

test("ensureFreshToken: absent cache fails naming the login verb, and never exchanges", async () => {
    let exchanged = 0;
    await assert.rejects(() => m.ensureFreshToken(DEPS({
        readCache: async () => ({ state: "absent" }),
        exchange: async () => { exchanged++; },
    })), /vc-secrets login azure-mcp/);
    assert.equal(exchanged, 0);
});

test("ensureFreshToken: an identity mismatch is treated as absent, not as a refreshable cache", async () => {
    let exchanged = 0;
    await assert.rejects(() => m.ensureFreshToken(DEPS({
        readCache: async () => ({ state: "identity-mismatch" }),
        exchange: async () => { exchanged++; },
    })), /vc-secrets login azure-mcp/);
    assert.equal(exchanged, 0);
});

test("ensureFreshToken: a REFUSED exchange names the login verb; an unreachable endpoint does not", async () => {
    // The two are not the same failure. A refusal means the refresh token is dead and signing in
    // again is the remedy; a timeout means the network is down and telling the developer to sign
    // in sends them to a browser that cannot help either.
    const refused = Object.assign(new m.VcSecretsError("token endpoint refused the request: invalid_grant"), { refused: true });
    await assert.rejects(() => m.ensureFreshToken(DEPS({
        readCache: async () => ({ state: "needs-refresh", refreshToken: "r1" }),
        exchange: async () => { throw refused; },
    })), (e) => /invalid_grant/.test(e.message) && /vc-secrets login azure-mcp/.test(e.message));

    await assert.rejects(() => m.ensureFreshToken(DEPS({
        readCache: async () => ({ state: "needs-refresh", refreshToken: "r1" }),
        exchange: async () => { throw new m.VcSecretsError("token endpoint unreachable: ENETUNREACH"); },
    })), (e) => /ENETUNREACH/.test(e.message) && !/vc-secrets login/.test(e.message));
});

test("ensureFreshToken: a cache that stops being refreshable while we wait for the lock is not exchanged", async () => {
    // A logout landing between the two reads. Trusting the first verdict hands `undefined` to
    // the exchange, and Entra's answer to that names nothing the developer can act on.
    //
    // The exchange stub returns a real-shaped token rather than undefined: if the guard right
    // below (`again.state !== "needs-refresh"`) is ever removed, exchange still succeeds and
    // ensureFreshToken RESOLVES instead of throwing, so assert.rejects fails on its own terms (no
    // rejection happened) instead of on an incidental "Cannot read properties of undefined
    // (reading 'accessToken')" TypeError that names nothing about the guard actually missing.
    let exchanged = 0, reads = 0;
    await assert.rejects(() => m.ensureFreshToken(DEPS({
        readCache: async () => (++reads === 1 ? { state: "needs-refresh", refreshToken: "r1" } : { state: "absent" }),
        exchange: async () => { exchanged++; return { accessToken: "must-not-be-used", refreshToken: "must-not-be-used" }; },
    })), /vc-secrets login azure-mcp/);
    assert.equal(exchanged, 0);
    assert.equal(reads, 2, "the re-read under the lock is what makes this decidable");
});

test("ensureFreshToken: a neighbour that released WITHOUT publishing is overtaken, not waited out", async () => {
    // The winner's access-entry write is best-effort by design, and its exchange can fail
    // outright — so "the lock is free again" and "a valid token appeared" are different events.
    // Waiting only on the cache burns the whole 45 s deadline and then blames a neighbour that
    // released seconds after taking it, for a token this launcher could have exchanged itself.
    let held = true, exchanged = 0, elapsed = 0;
    const t = await m.ensureFreshToken(DEPS({
        // The clock advances even though nothing sleeps for real: with a frozen clock an
        // implementation that never breaks out of the wait spins forever, and a hanging test
        // reports as neither pass nor fail.
        sleep: async (ms) => { elapsed += ms; },
        now: () => 1_000 + elapsed,
        readCache: async () => ({ state: "needs-refresh", refreshToken: "r1" }),
        acquireLock: async () => {
            if (held) {
                held = false;   // the neighbour releases after our first look

                return cache.HELD_BY_OTHER;
            }

            return { release: async () => {} };
        },
        exchange: async () => { exchanged++; return { accessToken: "ours", refreshToken: "r2" }; },
    }));
    assert.equal(t, "ours");
    assert.equal(exchanged, 1);
    // "not waited out" is the title's second half, and `elapsed` was accumulated without ever being
    // read: an implementation that burned the whole deadline and then exchanged would satisfy both
    // assertions above. One poll is enough here -- the neighbour releases after the first look.
    assert.ok(elapsed < cache.LOCK_WAIT_MS, `overtaken, not waited out: burned ${elapsed} ms`);
});

// The keystore side of the launch path. ensureFreshToken's own tests inject every seam, so
// without these the code that actually reads and writes the cache entries has no coverage at
// all — and both of its interesting cases are silent when wrong.
//
// LAUNCH_DECL carries scope: "project" and LAUNCH_CFG a projectId, which the source's bare
// LAUNCH_DECL/entryName never needed: oauthEntryKeys resolves the keystore key from decl.scope
// and cfg.projectId (see keyFor), and a decl with no scope would produce a
// key with the literal segment "undefined" long before any of these tests reached the assertion
// they are named for.
const LAUNCH_DECL = { ...DECL_IDENTITY, scope: "project" };
const LAUNCH_CFG = { projectId: "launch-p1" };
const LAUNCH_KEYS = m.oauthEntryKeys("azure-mcp", LAUNCH_DECL, LAUNCH_CFG);
const refreshBlob = () => cache.serializeRefresh({ refreshToken: "r1", ...DECL_IDENTITY });
const accessBlob = (over = {}) => cache.serializeAccess({ accessToken: "a1", expiresAt: 9e15,
    obtainedAt: Date.now(), lifetimeMs: 3600_000, uptimeAtIssue: os.uptime(), ...over });

function keychainMiss() {
    return Object.assign(new Error("security: item not found"), { toolExitCode: 44 });
}

test("oauthLaunchDeps.readCache: a missing refresh entry answers absent without reading the access entry", async () => {
    // The fail-fast path has a latency budget on it, and on Credential Manager every read is a
    // PowerShell P/Invoke worth one to three seconds. Reading the second entry to learn nothing
    // is what puts that budget out of reach.
    const asked = [];
    const deps = m.oauthLaunchDeps("azure-mcp", LAUNCH_DECL, LAUNCH_CFG, { backend: "keychain",
        run: (spec) => { asked.push(spec.args.at(-2)); throw keychainMiss(); } });
    assert.deepEqual(await deps.readCache(), { state: "absent" });
    assert.equal(asked.length, 1, `one read, asked for ${asked}`);
});

test("oauthLaunchDeps.readCache: needs-refresh carries the refresh token the exchange will spend", async () => {
    const deps = m.oauthLaunchDeps("azure-mcp", LAUNCH_DECL, LAUNCH_CFG, { backend: "keychain",
        run: (spec) => (spec.args.at(-2).endsWith("-refresh") ? refreshBlob() : Promise.reject(keychainMiss())) });
    const status = await deps.readCache();
    assert.equal(status.state, "needs-refresh", "no access entry → the launcher must exchange");
    assert.equal(status.refreshToken, "r1", "cacheStatus returns a state only; without this the exchange gets undefined");
});

test("oauthLaunchDeps.readCache: a valid access entry is reported valid and carries no refresh token", async () => {
    const deps = m.oauthLaunchDeps("azure-mcp", LAUNCH_DECL, LAUNCH_CFG, { backend: "keychain",
        run: (spec) => (spec.args.at(-2).endsWith("-refresh") ? refreshBlob() : accessBlob()) });
    const status = await deps.readCache();
    assert.equal(status.state, "valid");
    assert.equal(status.accessToken, "a1");
    // The title's second half. Without this line readCache's ternary could attach a refresh token to
    // the valid verdict and nothing would notice -- the name would still read as a guard.
    assert.equal(status.refreshToken, undefined, "a valid verdict carries no refresh token");
});

test("oauthLaunchDeps.readCache: a corrupt stored entry is named, not silently treated as absent", async (t) => {
    // Backwards before this: the BENIGN case -- an entry a newer vc-secrets wrote, which parseEntry
    // throws for -- got a line on fd 2, while a damaged blob returned null and vanished. One is a
    // version skew a developer can reason about; the other is a keystore entry that has been
    // corrupted, and it was the silent one.
    //
    // Both still resolve to absent, which is the right ANSWER: the next launch signs in or
    // exchanges either way. What was missing is that it happened at all.
    const stderr = [];
    t.mock.method(fs, "writeSync", (fd, str) => {
        if (fd !== 2) {
            throw new Error(`unexpected fs.writeSync(${fd}, ...) in this test`);
        }
        stderr.push(str);

        return Buffer.byteLength(str);
    });
    const deps = m.oauthLaunchDeps("azure-mcp", LAUNCH_DECL, LAUNCH_CFG, { backend: "keychain",
        run: async () => "ZZCORRUPTSENTINELZZ{{{" });
    assert.deepEqual(await deps.readCache(), { state: "absent" });
    assert.equal(stderr.length, 1, `expected exactly one notice, got ${JSON.stringify(stderr)}`);
    assert.match(stderr[0], /not readable JSON/);
    // The reason parseEntry returns null instead of throwing: node embeds the first ten characters
    // of its input in a JSON SyntaxError, and that input is a keystore blob. A notice built from
    // the rethrown message would have carried a token prefix into the developer's terminal.
    assert.doesNotMatch(stderr[0], /ZZCORRUPTSENTINELZZ/, "no byte of the stored value may appear");
});

test("oauthLaunchDeps.writeCache: a renewal that issues no new refresh token leaves the stored one alone", async () => {
    // RFC 6749 section 6 makes refresh_token optional on the refresh grant. Writing the entry
    // anyway serialises `undefined` over a LIVE refresh token, and the next launch then demands
    // a sign-in that nothing had invalidated — a session lost to a renewal that SUCCEEDED.
    //
    // ADAPTED assertion: the source asserted the bare entry name ["oauth-azure-mcp-access"].
    // `write` here receives the full three-segment keystore key oauthEntryKeys produces (Part
    // B3 — never a bare entry name), so the value that must appear is LAUNCH_KEYS.access.
    const written = [];
    // A throwaway XDG_CONFIG_HOME although this test asserts nothing about markers: writeCache
    // clears the oversize marker on the success path this test drives, so without an env here the
    // rmSync lands in the DEVELOPER'S OWN config directory. It survives only because the deletion
    // of an absent file is swallowed, which is a property of clearOversizeMarker rather than of
    // this fixture.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-write-"));
    tmpDirs.push(dir);
    const deps = m.oauthLaunchDeps("azure-mcp", LAUNCH_DECL, LAUNCH_CFG, { backend: "keychain",
        env: { XDG_CONFIG_HOME: dir, USER: "u" },
        write: async (key) => { written.push(key); } });
    await deps.writeCache({ accessToken: "a2", expiresAt: 9e15, obtainedAt: 1, lifetimeMs: 3600_000, uptimeAtIssue: 1 });
    assert.deepEqual(written, [LAUNCH_KEYS.access]);
});

test("oauthLaunchDeps.writeCache: a refresh token that cannot be stored names the entry and the remedy", async () => {
    // The one irreversible step: Entra killed the previous refresh token when it issued this one,
    // so a failure here IS a signed-out state, and reporting the tool's own words would name a
    // keystore problem instead of the sign-in that fixes it.
    //
    // `remove` is injected although this test asserts nothing about it: the failure below now takes
    // the clearing branch, and the default seam DELETES for real — an `fs.rmSync` on gpg, a spawned
    // `security` here. Left out, this test would reach the developer's own keystore from a run that
    // reports nothing but a pass, which is how the same omission cost a live sign-in once already.
    const deps = m.oauthLaunchDeps("azure-mcp", LAUNCH_DECL, LAUNCH_CFG, { backend: "keychain",
        write: async () => { throw new Error("security: SecKeychainItemCreateFromContent failed"); },
        remove: async () => {} });
    await assert.rejects(() => deps.writeCache({ accessToken: "a2", refreshToken: "r2",
        expiresAt: 9e15, obtainedAt: 1, lifetimeMs: 3600_000, uptimeAtIssue: 1 }),
        (e) => e instanceof m.VcSecretsError && /oauth-azure-mcp-refresh/.test(e.message)
            && /vc-secrets login azure-mcp/.test(e.message));
});

test("oauthLaunchDeps.writeCache: a failed refresh write clears both entries, so the timer stops spending a dead token", async () => {
    // The renewal path used to throw and clear nothing, while cmdLogin cleared on the identical
    // condition with the reasoning written out. The asymmetry matters because of who is watching:
    // `login` throws at a human, but this throw is caught by the renewal interval into one line on
    // fd 2 and the interval keeps running -- so every subsequent tick exchanges a refresh token
    // Entra killed when it issued the one that could not be stored. Cleared, the next tick reads
    // absent and names the sign-in instead.
    const removed = [];
    const deps = m.oauthLaunchDeps("azure-mcp", LAUNCH_DECL, LAUNCH_CFG, { backend: "keychain",
        write: async () => { throw new Error("security: SecKeychainItemCreateFromContent failed"); },
        remove: async (key) => { removed.push(key); } });
    await assert.rejects(() => deps.writeCache({ accessToken: "a2", refreshToken: "r2",
        expiresAt: 9e15, obtainedAt: 1, lifetimeMs: 3600_000, uptimeAtIssue: 1 }));
    assert.deepEqual(removed, [LAUNCH_KEYS.access, LAUNCH_KEYS.refresh]);
});

test("oauthLaunchDeps.writeCache: an oversize access entry is recorded on the renewal path too", async () => {
    // This is the path where an oversize entry actually HURTS. RENEWAL_TICK_MS fires every five
    // minutes and the tick decides from the STORE, so an access entry that never lands means an
    // exchange -- and, since Entra rotates on use, a refresh-token rotation -- every five minutes
    // for as long as the session runs. Before the marker that was one line on fd 2 per tick and
    // nothing that said the condition was permanent.
    //
    // Real file IO against a throwaway XDG_CONFIG_HOME rather than a double: the seam here is `env`,
    // and driving the actual writer is what proves the path it computes is the one doctor reads.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-marker-renew-"));
    tmpDirs.push(dir);
    const env = { XDG_CONFIG_HOME: dir, USER: "u" };
    const deps = m.oauthLaunchDeps("azure-mcp", LAUNCH_DECL, LAUNCH_CFG, { backend: "wcm", env,
        write: async (key) => {
            if (key.endsWith("-access")) {
                throw Object.assign(new m.VcSecretsError("too large for Credential Manager"), { toolExitCode: 4 });
            }
        } });
    await deps.writeCache({ accessToken: "a2", refreshToken: "r2", expiresAt: 9e15,
        obtainedAt: 1, lifetimeMs: 3600_000, uptimeAtIssue: 1 });
    const marker = m.readOversizeMarker(LAUNCH_KEYS.access, env);
    assert.equal(marker.backend, "wcm");
    assert.equal(marker.limit, m.WCM_BLOB_LIMIT);
    assert.equal(marker.key, LAUNCH_KEYS.access);
});

test("oauthLaunchDeps.writeCache: a transient access failure leaves no marker, and a success clears one", async () => {
    // The two halves that keep the marker honest, driven through the real writer in one test
    // because they are the same claim from both sides: only a deterministic failure may record, and
    // any success must erase. Recording unconditionally, or never clearing, both leave doctor
    // reporting a permanent problem that is not there -- and both look identical from a green run.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-marker-clear-"));
    tmpDirs.push(dir);
    const env = { XDG_CONFIG_HOME: dir, USER: "u" };
    const fresh = { accessToken: "a2", refreshToken: "r2", expiresAt: 9e15,
        obtainedAt: 1, lifetimeMs: 3600_000, uptimeAtIssue: 1 };

    const transient = m.oauthLaunchDeps("azure-mcp", LAUNCH_DECL, LAUNCH_CFG, { backend: "wcm", env,
        write: async (key) => {
            if (key.endsWith("-access")) { throw new m.VcSecretsError("the keystore was busy"); }
        } });
    await transient.writeCache(fresh);
    assert.equal(m.readOversizeMarker(LAUNCH_KEYS.access, env), null,
        "a failure that can succeed next time may not be recorded as permanent");

    m.recordOversizeMarker(LAUNCH_KEYS.access, { backend: "wcm", bytes: 2588, limit: m.WCM_BLOB_LIMIT, env });
    const ok = m.oauthLaunchDeps("azure-mcp", LAUNCH_DECL, LAUNCH_CFG, { backend: "wcm", env,
        write: async () => {} });
    await ok.writeCache(fresh);
    assert.equal(m.readOversizeMarker(LAUNCH_KEYS.access, env), null,
        "a successful write must erase the marker, or doctor reports a problem that is fixed");
});

test("oauthLaunchDeps.writeCache: a delete that fails too does not displace the write error", async () => {
    // The clearing is best effort and the write failure is the actionable one: it is what names the
    // entry and the `login` that fixes it. A delete error surfacing instead would send the developer
    // to diagnose the keystore removal that failed rather than the renewal that did.
    const deps = m.oauthLaunchDeps("azure-mcp", LAUNCH_DECL, LAUNCH_CFG, { backend: "keychain",
        write: async () => { throw new Error("security: SecKeychainItemCreateFromContent failed"); },
        remove: async () => { throw new Error("security: item could not be removed"); } });
    await assert.rejects(() => deps.writeCache({ accessToken: "a2", refreshToken: "r2",
        expiresAt: 9e15, obtainedAt: 1, lifetimeMs: 3600_000, uptimeAtIssue: 1 }),
        (e) => e instanceof m.VcSecretsError && /vc-secrets login azure-mcp/.test(e.message));
});

test("oauthLaunchDeps.writeCache: forwards env to both the refresh and the access write", async () => {
    // Measured hazard (gpg, a custom XDG_CONFIG_HOME): readEntry resolves paths through
    // keyToPath(key, env) using the CALLER's env, but writeCache's two write(...) calls omitted
    // env, so writeSecretValue fell back to process.env. Reads and writes then land in two
    // different homes, readCache never sees what writeCache just wrote, and EVERY launch
    // re-exchanges -- rotating the refresh token a second time on top of the rotation Entra
    // already did the moment it issued the one just stored. Unreachable as things stand (no
    // production caller passes a custom env yet), so this test is what keeps env from being
    // dropped again.
    const seenEnvs = [];
    const customEnv = { USER: "u", XDG_CONFIG_HOME: "/custom/home" };
    const deps = m.oauthLaunchDeps("azure-mcp", LAUNCH_DECL, LAUNCH_CFG, { backend: "keychain", env: customEnv,
        write: async (key, value, opts) => { seenEnvs.push(opts && opts.env); } });
    await deps.writeCache({ accessToken: "a2", refreshToken: "r2", expiresAt: 9e15,
        obtainedAt: 1, lifetimeMs: 3600_000, uptimeAtIssue: 1 });
    assert.equal(seenEnvs.length, 2, `expected one write for the refresh entry and one for the access entry, got ${seenEnvs.length}`);
    assert.ok(seenEnvs.every((e) => e === customEnv),
        `both writes must forward the caller's env, not fall back to process.env: got ${JSON.stringify(seenEnvs)}`);
});

test("oauthLaunchDeps.writeCache: a failed ACCESS write is a warning, not a lost renewal", async (t) => {
    // Asymmetric on purpose: losing the access entry costs one exchange next launch, so failing
    // the renewal over it would throw away a refresh token that was just successfully rotated.
    //
    // The warning is the ONLY signal that the write failed -- deleting the fs.writeSync(2, ...)
    // line leaves this test green otherwise, since not-throwing is not evidence the warning
    // fired. Captured here by mocking fs.writeSync itself (what the production code actually
    // calls, on fd 2), since this path runs in-process rather than through a spawned CLI whose
    // stderr a subprocess capture could read instead.
    const stderr = [];
    t.mock.method(fs, "writeSync", (fd, str) => {
        if (fd !== 2) {
            throw new Error(`unexpected fs.writeSync(${fd}, ...) in this test`);
        }
        stderr.push(str);

        return Buffer.byteLength(str);
    });
    // A throwaway XDG_CONFIG_HOME although this test asserts nothing about markers: the `write`
    // double injected here throws a plain `Error`, which carries no toolExitCode, so as this
    // fixture stands it never reaches the marker. It is the cost of being
    // wrong that decides this: change that error to an exit 4, or widen the marker's condition, and
    // without an env here the marker write lands in the DEVELOPER'S OWN config directory -- measured,
    // by mutating exactly that condition, which left a real file under ~/.config/vc-secrets/state.
    // The same omission on the delete seam once destroyed a live sign-in from a green run.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-warn-"));
    tmpDirs.push(dir);
    const deps = m.oauthLaunchDeps("azure-mcp", LAUNCH_DECL, LAUNCH_CFG, { backend: "keychain",
        env: { XDG_CONFIG_HOME: dir, USER: "u" },
        write: async (name) => { if (name.endsWith("-access")) { throw new Error("full"); } } });
    await deps.writeCache({ accessToken: "a2", refreshToken: "r2", expiresAt: 9e15,
        obtainedAt: 1, lifetimeMs: 3600_000, uptimeAtIssue: 1 });
    assert.equal(stderr.length, 1, `expected exactly one stderr warning, got ${stderr.length}`);
    assert.match(stderr[0], /the access entry could not be stored \(full\); the next launch will exchange one/);
});

// ---------------------------------------------------------------------------------------------
// New coverage this task adds (not a port): acquireTokenLock had no DIRECT test in the source —
// every source case drove it through cmdLogin/cmdLogout instead. cmdLogin and cmdLogout are now
// both ported (Tasks 14/15), and a handful of their own tests exercise this loop too — but
// without these seven, acquireTokenLock would still have no coverage of its own that survives a
// change to either verb's wiring.
// ---------------------------------------------------------------------------------------------

test("acquireTokenLock: a clean acquisition returns the lock, without waiting or logging", async () => {
    const logged = [];
    const result = await m.acquireTokenLock({
        acquireLock: async () => ({ release: async () => {} }),
        now: () => 0,
        sleep: async () => { throw new Error("must not sleep: nothing is contended"); },
        log: (line) => logged.push(line),
    });
    assert.ok(result.lock, "a free lock must come back as the holder, not a reason");
    assert.equal(result.reason, undefined);
    assert.deepEqual(logged, [], "a clean acquisition has nothing to wait out and nothing to announce");
});

test("acquireTokenLock: a holder that never clears is reported busy, bounded by the poll cap", async () => {
    // Mirrors the source's frozen-clock regression (mcpw.test.js): with now() frozen the
    // deadline never advances, and only MAX_LOCK_POLLS stops the loop from spinning forever.
    // Verified here directly rather than through cmdLogin: acquireTokenLock is exported and
    // callable on its own, so no vehicle was ever needed -- driving it through cmdLogin would pin
    // the verb's wiring rather than this loop.
    let polls = 0;
    const result = await m.acquireTokenLock({
        acquireLock: async () => cache.HELD_BY_OTHER,
        now: () => 0,
        sleep: async () => { polls += 1; },
        log: () => {},
    });
    assert.deepEqual(result, { lock: null, reason: "busy" });
    assert.ok(polls > 0 && polls <= 64, `the wait must end by the poll cap, not the clock: ${polls}`);
});

test("acquireTokenLock: an error that is not a refused bind is not laundered into one", async () => {
    // The carve-out covers ONE measured condition. An unfiltered catch turned a broken wiring and
    // an fd exhaustion into "the sandbox refused the bind" — acquireTokenLock decides nothing
    // about a failure to get the lock, so this must reach the caller unchanged, never come back as
    // {lock: null, reason: "unbindable"}.
    //
    // Two shapes, not one: an EMFILE (a `code` that is simply not EPERM/EACCES) and a bare
    // TypeError from broken wiring (no `code` property at all). Narrowing the guard from
    // `e.code !== "EPERM" && e.code !== "EACCES"` to `e.code && e.code !== "EPERM" && e.code !==
    // "EACCES"` reads the TypeError's undefined `code` as "falsy, so don't rethrow" and launders
    // it into {lock: null, reason: "unbindable"} — leaving the suite green on the first case alone
    // (mirrors the source's mcpw.test.js, which loops over the same two shapes).
    for (const boom of [Object.assign(new Error("too many open files"), { code: "EMFILE" }),
        new TypeError("acquireLock is not a function")]) {
        await assert.rejects(() => m.acquireTokenLock({
            acquireLock: async () => { throw boom; },
            now: () => 0,
            sleep: async () => {},
            log: () => {},
        }), (e) => e === boom, `${boom.code ?? boom.name} must reach the caller unchanged`);
    }
});

// ---------------------------------------------------------------------------------------------
// Review fix round: acquireTokenLock's OWN wait was completely unpinned. Measured by the
// reviewer: lowering MAX_LOCK_POLLS from 64 to 1 left the whole suite green. Root cause: every
// test above drives a FROZEN clock or a small, controlled number of attempts, so none of them
// can tell "the deadline ended the wait" apart from "the poll cap ended the wait". The first two
// tests below close that gap, driving an ADVANCING clock; the other two pin the classification and
// the log line, for which a frozen clock is the right instrument. All four drive acquireTokenLock
// DIRECTLY — no vehicle needed, it is exported and callable on its own.
// ---------------------------------------------------------------------------------------------

test("acquireTokenLock: the poll cap is a backstop, not the terminator of the wait", async () => {
    // Under an advancing clock the LOCK_WAIT_MS deadline must be what ends the wait; the poll cap
    // must never fire first. Must go red when MAX_LOCK_POLLS is lowered enough to end the loop
    // before the deadline is reached (measured: 64 -> 1 does this).
    let elapsed = 0;
    const result = await m.acquireTokenLock({
        acquireLock: async () => cache.HELD_BY_OTHER,
        now: () => 1_000 + elapsed,
        sleep: async (ms) => { elapsed += ms; },
        log: () => {},
    });
    assert.deepEqual(result, { lock: null, reason: "busy" });
    assert.ok(elapsed >= cache.LOCK_WAIT_MS,
        `the deadline must be what ends the wait, not the poll cap: waited only ${elapsed}, need >= ${cache.LOCK_WAIT_MS}`);
});

test("acquireTokenLock: seed, doubling and ceiling of its own wait", async () => {
    // Declared locally rather than imported, same discipline as the source's own pinned-copy
    // test: the point is to pin the numbers this loop actually PRODUCES, not to track whatever
    // the module constant currently says. Driven directly (not through ensureFreshToken, which has
    // its own, separate loop pinned by "ensureFreshToken: the contended wait's backoff and ceiling
    // bound the deadline it enforces") -- a change to acquireTokenLock's seed/ceiling alone must
    // redden only this test, not the other loop's.
    const LOCK_POLL_SEED = 250;
    const LOCK_POLL_CEILING = 2_000;
    const slept = [];
    let elapsed = 0;
    const result = await m.acquireTokenLock({
        acquireLock: async () => cache.HELD_BY_OTHER,
        now: () => 1_000 + elapsed,
        sleep: async (ms) => { slept.push(ms); elapsed += ms; },
        log: () => {},
    });
    assert.deepEqual(result, { lock: null, reason: "busy" });
    assert.deepEqual(slept.slice(0, 4), [LOCK_POLL_SEED, LOCK_POLL_SEED * 2, LOCK_POLL_SEED * 4, LOCK_POLL_CEILING],
        `backoff seed, doubling, ceiling: got ${slept.slice(0, 4)}`);
    assert.ok(slept.every((ms) => ms <= LOCK_POLL_CEILING), "the ceiling must hold for the whole wait");
    assert.ok(elapsed >= cache.LOCK_WAIT_MS && elapsed < cache.LOCK_WAIT_MS + LOCK_POLL_CEILING,
        `the wait ended at ${elapsed}, outside [${cache.LOCK_WAIT_MS}, ${cache.LOCK_WAIT_MS + LOCK_POLL_CEILING})`);
});

test("acquireTokenLock: sawHolder survives a later unbindable attempt -- still busy, not unbindable", async () => {
    // Once HELD_BY_OTHER has been seen, a LATER bind failure (EPERM/EACCES) must still classify
    // as "busy", not "unbindable" -- the diagnosis is "another session is refreshing", not "the
    // sandbox refused the bind". Must go red when `|| sawHolder` is dropped from classify.
    let calls = 0;
    const eperm = Object.assign(new Error("Operation not permitted"), { code: "EPERM" });
    const result = await m.acquireTokenLock({
        acquireLock: async () => {
            calls += 1;
            if (calls === 1) {
                return cache.HELD_BY_OTHER;
            }
            throw eperm;
        },
        now: () => 0,
        sleep: async () => {},
        log: () => {},
    });
    assert.deepEqual(result, { lock: null, reason: "busy" },
        `a holder seen once must keep classifying a later unbindable attempt as busy, got ${JSON.stringify(result)}`);
    assert.ok(calls >= 2, `the second, unbindable attempt must actually run: only ${calls} call(s)`);
});

test("acquireTokenLock: a contended bind announces itself through the log seam", async () => {
    let calls = 0;
    const logged = [];
    const result = await m.acquireTokenLock({
        acquireLock: async () => {
            calls += 1;

            return calls === 1 ? cache.HELD_BY_OTHER : { release: async () => {} };
        },
        now: () => 0,
        sleep: async () => {},
        log: (line) => logged.push(line),
    });
    assert.ok(result.lock, "the lock must be granted once the holder clears");
    assert.ok(logged.some((l) => /waiting for an in-flight token renewal/.test(l)),
        `the wait must announce itself through the log seam: got ${JSON.stringify(logged)}`);
});

test("ensureFreshToken: the contended wait's backoff and ceiling bound the deadline it enforces", async () => {
    // Behavioural in place of a source-text match. The plan for this test was
    // `assert.match(m.ensureFreshToken.toString(), /LOCK_WAIT_MS/)` — a comment containing the
    // name satisfies that just as well as the real reference does, and it stays green with the
    // constant deleted from the loop. This instead DRIVES the loop and pins the numbers it must
    // actually produce: the backoff seed, the doubling, the ceiling, and the window the deadline
    // falls in — the same shape as the source's own pinned-copy test (mcpw.test.js), driven
    // through ensureFreshToken rather than cmdLogout: cmdLogout is ported now and pins
    // the same numbers on its own call to acquireTokenLock (see the cmdLogout tests below), but
    // this one is kept because it is the one that drives ensureFreshToken's OWN call to the loop —
    // a change that broke only that call site would go unnoticed without it.
    const LOCK_POLL_SEED = 250;
    const LOCK_POLL_CEILING = 2_000;
    const slept = [];
    let ms = 0;
    await assert.rejects(() => m.ensureFreshToken({
        serverName: "azure-mcp",
        readCache: async () => ({ state: "needs-refresh", refreshToken: "r1" }),
        writeCache: async () => {},
        exchange: async () => { throw new Error("must not exchange: the neighbour never releases"); },
        acquireLock: async () => cache.HELD_BY_OTHER,
        now: () => ms,
        sleep: async (d) => { slept.push(d); ms += d; },
    }), /still refreshing/);
    assert.deepEqual(slept.slice(0, 4), [LOCK_POLL_SEED, LOCK_POLL_SEED * 2, LOCK_POLL_SEED * 4, LOCK_POLL_CEILING],
        "backoff seed, doubling, ceiling");
    assert.ok(slept.every((d) => d <= LOCK_POLL_CEILING), "the ceiling holds for the whole wait");
    // The boundary, not a tally: it must outlast the ceiling, and overshoot by at most one poll.
    assert.ok(ms >= cache.LOCK_WAIT_MS && ms < cache.LOCK_WAIT_MS + LOCK_POLL_CEILING,
        `the wait ended at ${ms}, outside [${cache.LOCK_WAIT_MS}, ${cache.LOCK_WAIT_MS + LOCK_POLL_CEILING})`);
});

lockTest("tokenLockFor: project scope keys the lock exactly the way keyFor keys the keystore entry", async () => {
    // tokenLockFor has no return value carrying the scope key it computed, and cache.acquireLock/
    // cache.lockPathFor are read-only ES module exports — this file cannot substitute them the way
    // the source's CJS test does (mcpw.test.js, `c.acquireLock = ...`). Proven instead by
    // PRE-occupying the exact path keyFor's own rule predicts (decl.scope === USER_SCOPE ?
    // USER_SCOPE : cfg.projectId) and observing tokenLockFor collide with it:
    // if tokenLockFor computed its scope key some other way, this would either fail to collide (the
    // pre-occupied path is not the one it binds) or collide with the WRONG project below.
    const decl = { scope: "project" };
    const entryName = "predict-entry-" + process.pid;
    const cfgA = { projectId: "predict-a-" + process.pid };
    const cfgB = { projectId: "predict-b-" + process.pid };
    const pathFor = (cfg) => cache.lockPathFor(entryName, cfg.projectId,
        { platform: process.platform, env: process.env });

    const holderA = await cache.acquireLock(pathFor(cfgA));
    // Released defensively (not just on the happy path): under a WRONG scope key, either got*
    // comes back as a real, live-listening lock instead of HELD_BY_OTHER, and an un-released
    // listener keeps the process alive long after the assertion has already failed — the test
    // then reports correctly but the run never exits on its own.
    let gotA = null, gotB = null;
    try {
        gotA = await m.tokenLockFor(entryName, decl, cfgA)();
        assert.equal(gotA, cache.HELD_BY_OTHER,
            "the same projectId must collide on the path keyFor's own rule predicts");

        gotB = await m.tokenLockFor(entryName, decl, cfgB)();
        assert.notEqual(gotB, cache.HELD_BY_OTHER,
            "a different projectId must not collide with project A's lock");
    } finally {
        if (gotA && gotA !== cache.HELD_BY_OTHER) { await gotA.release(); }
        if (gotB && gotB !== cache.HELD_BY_OTHER) { await gotB.release(); }
        await holderA.release();
    }
});

lockTest("tokenLockFor: user scope keys the lock on USER_SCOPE, ignoring cfg.projectId", async () => {
    const decl = { scope: "user" };
    const entryName = "predict-entry-user-" + process.pid;
    const predictedUserPath = cache.lockPathFor(entryName, "user",
        { platform: process.platform, env: process.env });

    const holder = await cache.acquireLock(predictedUserPath);
    // Collected and released defensively, for the reason "tokenLockFor: project scope keys the lock
    // exactly the way keyFor keys the keystore entry" gives: a WRONG scope key gives back a real,
    // live-listening lock instead of HELD_BY_OTHER, and leaving it unreleased keeps the process
    // alive after the assertion has already failed.
    const got = [];
    try {
        // Two configs that disagree about projectId: at user scope keyFor ignores cfg.projectId
        // entirely, so both must still collide with the SAME pre-occupied "user" path, or a
        // renewal running under one project's config would fail to serialise against one running
        // under another's for the very same personal token.
        for (const cfg of [{ projectId: "predict-a-" + process.pid }, { projectId: "predict-b-" + process.pid }]) {
            const lock = await m.tokenLockFor(entryName, decl, cfg)();
            got.push(lock);
            assert.equal(lock, cache.HELD_BY_OTHER,
                `a user-scope entry must lock on "user" regardless of cfg.projectId=${cfg.projectId}`);
        }
    } finally {
        for (const lock of got) {
            if (lock && lock !== cache.HELD_BY_OTHER) { await lock.release(); }
        }
        await holder.release();
    }
});

// ---------------------------------------------------------------------------------------------
// Review fix round: the restored keychain line-length refusal (buildLocalWrite's `security -i`
// stdinCommand branch) and its EAGER check in writeSecretValue, before any process is spawned.
// security(1) reads that command line into a fixed buffer and, past the limit, SPLITS rather
// than refusing: the first half stores a TRUNCATED value and the tail runs as a second command.
// ---------------------------------------------------------------------------------------------

test("buildLocalWrite(keychain).stdinCommand: composes up to the line limit, refuses one byte past it", () => {
    // The limit mirrors SECURITY_LINE_LIMIT in vc-secrets.mjs — declared with the stdin-composition
    // constants near COMMAND_ON_STDIN, not next to the buildLocalWrite branch that enforces it
    // (not exported, so restated here -- same discipline as the lock tests' locally-declared
    // backoff constants above: pin the value the guard actually enforces, not a re-export of it).
    //
    // The boundary is DERIVED, not hardcoded: the composed overhead (the account, the key, and
    // the fixed "add-generic-password ..." text) is measured here from the real builder with a
    // short known-length filler, so a change to the key shape (e.g. a longer project id) moves
    // the boundary this test pins right along with it, instead of silently under- or over-testing.
    const SECURITY_LINE_LIMIT = 4095;
    const env = { USER: "u" };
    const key = "vc-secrets:demo-project:oauth-azure-mcp-refresh";
    const spec = m.buildLocalWrite("keychain", key, env, { value: "x" });

    // A filler value whose every byte is plain ASCII (no quote/backslash to escape) contributes
    // exactly its own length to the composed line; everything else is the fixed overhead.
    const probeLen = 16;
    const overhead = Buffer.byteLength(spec.stdinCommand("x".repeat(probeLen))) - probeLen;
    const maxValueLen = SECURITY_LINE_LIMIT - overhead;

    const atLimit = spec.stdinCommand("x".repeat(maxValueLen));
    assert.equal(Buffer.byteLength(atLimit), SECURITY_LINE_LIMIT,
        `the largest composing value must land exactly on the limit, got ${Buffer.byteLength(atLimit)} bytes`);

    assert.throws(() => spec.stdinCommand("x".repeat(maxValueLen + 1)), (e) => {
        assert.ok(e instanceof m.VcSecretsError, `expected a VcSecretsError, got ${e}`);
        assert.ok(e.message.includes(key), `must name the entry: ${e.message}`);
        assert.ok(e.message.includes(String(SECURITY_LINE_LIMIT + 1)), `must carry the composed byte count: ${e.message}`);
        assert.ok(e.message.includes(String(SECURITY_LINE_LIMIT)), `must carry the limit: ${e.message}`);

        return true;
    });
});

test("writeSecretValue: an oversize keychain value is refused before the runner is ever reached", async () => {
    // The refusal itself is pinned by "buildLocalWrite(keychain).stdinCommand: composes up to the
    // line limit, refuses one byte past it"; what this pins is that it happens EARLY. The
    // runner composes spec.stdinCommand only AFTER it has spawned, so without writeSecretValue's own
    // validating call an oversize value leaves an orphaned `security -i` waiting on a stdin that
    // never arrives, until the runner's timeout kills it.
    //
    // Asserted through the INJECTED runner rather than by watching for a real process: a spawn can
    // only be observed after it has already happened, so "no marker file yet" is a race that reports
    // success most of the time while the child ran every time. The fake runner mimics the real one --
    // record the call, and only then compose -- so deleting the early call fails THIS assertion
    // rather than the rejection, which the downstream guard would satisfy either way.
    const runnerCalls = [];
    const run = async (spec, { stdinValue } = {}) => {
        runnerCalls.push(spec);
        if (spec.stdinCommand) {
            spec.stdinCommand(stdinValue);
        }
    };
    const key = "vc-secrets:demo-project:oauth-azure-mcp-refresh";
    const oversized = "x".repeat(5000);   // past the limit regardless of the composed overhead
    await assert.rejects(
        () => m.writeSecretValue(key, oversized, { backend: "keychain", env: { USER: "u" }, run }),
        (e) => e instanceof m.VcSecretsError && /too large for the keychain/.test(e.message));
    assert.equal(runnerCalls.length, 0, "the runner must never be reached once the guard has refused");
});

// ---------------------------------------------------------------------------------------------
// The callback surface -- the loopback listener, handleCallback, the two HTML pages,
// and the browser opener. Ported from the launcher's own suite (source ranges resolved 2026-09-11).
// ---------------------------------------------------------------------------------------------

// The opener probe is injected rather than left to the real PATH. With a real `commandOnPath` the
// linux case asserts whatever this machine happens to have installed: it passes here because
// wslview and powershell.exe are absent, and would fail on a WSL box that has wslview — an
// environment-dependent test that reports the machine, not the code.
const onPath = (...present) => (tool) => present.includes(tool);

// The win32 branch resolves cmd.exe to an absolute path, so its tests stand a resolver in rather than
// lean on whichever PATH and filesystem the machine running them has.
const WIN_CMD = "C:\\Windows\\System32\\cmd.exe";
const resolvesCmd = (name) => ({ kind: "direct", cmd: name === "cmd.exe" ? WIN_CMD : name });

test("buildBrowserCommand: one command per platform", () => {
    assert.deepEqual(m.buildBrowserCommand("linux", {}, "http://x/", onPath("xdg-open")),
        { cmd: "xdg-open", args: ["http://x/"] });
    assert.deepEqual(m.buildBrowserCommand("darwin", {}, "http://x/", onPath()),
        { cmd: "open", args: ["http://x/"] });
    assert.equal(m.buildBrowserCommand("win32", {}, "http://x/", onPath(), resolvesCmd).cmd, WIN_CMD,
        "the resolved absolute cmd.exe, never the bare name libuv would look for in the cwd first");
});

test("buildBrowserCommand: win32 with no resolvable cmd.exe has no opener, and never falls back to a bare name", () => {
    const unresolvable = () => { throw new m.VcSecretsError("cmd.exe: not found on PATH"); };
    assert.equal(m.buildBrowserCommand("win32", {}, "http://x/", onPath(), unresolvable), null);
    // The default resolver, over an env whose only PATH entry holds no cmd.exe.
    assert.equal(m.buildBrowserCommand("win32", { Path: "C:\\vc-secrets-no-such-dir" }, "http://x/", onPath()), null);
});

test("buildBrowserCommand: on WSL the interop opener is preferred over xdg-open", () => {
    // xdg-open inside WSL opens a Linux browser that may not exist, or nothing at all; wslview
    // and powershell.exe hand the URL to the Windows default browser, which is where the
    // developer is actually signed in.
    assert.equal(m.buildBrowserCommand("linux", {}, "http://x/", onPath("wslview", "xdg-open")).cmd, "wslview");
    assert.equal(m.buildBrowserCommand("linux", {}, "http://x/", onPath("powershell.exe", "xdg-open")).cmd,
        "powershell.exe");
});

test("buildBrowserCommand: no opener at all is a supported path, not a failure", () => {
    // Measured on one of our machines: no /mnt/c, no cmd.exe on PATH. cmdLogin prints the URL
    // and keeps waiting on the listener, so sign-in still completes by hand.
    assert.equal(m.buildBrowserCommand("linux", { VC_SECRETS_WSL_NO_INTEROP: "1" }, "http://x/",
        onPath("wslview", "xdg-open")), null, "the override must win over anything on PATH");
    assert.equal(m.buildBrowserCommand("linux", {}, "http://x/", onPath()), null);
});

test("buildBrowserCommand: a URL carrying & or | survives to the browser on every platform", () => {
    // The property, stated per platform, because it is not the same property. On linux and darwin the
    // URL is its own argv element and nothing re-parses it. On win32 that is NOT enough and the
    // previous version of this test asserted it anyway: cmd.exe re-parses everything after /c, so the
    // element boundary the assertion checked is invisible to it and the URL truncated at the first &.
    // Green test, broken launch, measured only when a real sign-in reached a real Windows browser.
    const nasty = "http://127.0.0.1:1/?code=a&b=c|whoami";
    for (const platform of ["linux", "darwin"]) {
        const built = m.buildBrowserCommand(platform, {}, nasty, onPath("xdg-open"));
        assert.ok(built.args.includes(nasty), `${platform} must pass the URL as one argument`);
    }
    const win = m.buildBrowserCommand("win32", {}, nasty, onPath(), resolvesCmd);
    assert.deepEqual(win.args, [`/c start "" "${nasty}"`], "one verbatim line, with the URL quoted");
    assert.equal(win.opts.windowsVerbatimArguments, true,
        "without this node re-quotes the line and the quotes stop protecting anything");
    assert.match(win.args[0], /\?code=a&b=c\|whoami"$/, "everything after the & must still be there");
    // A third property, again not the same one. powershell.exe joins everything after -Command back
    // into script text, so the argv element is as invisible to it as it is to cmd.exe -- and & is an
    // argument-mode metacharacter anywhere in a token. Asserting the element would pass on the broken
    // form, which is exactly how the win32 assertion stayed green while the launch was broken.
    const wsl = m.buildBrowserCommand("linux", {}, nasty, onPath("powershell.exe"));
    const script = wsl.args.slice(wsl.args.indexOf("-Command") + 1).join(" ");
    assert.equal(script, `Start-Process '${nasty}'`, "the URL must reach PowerShell as a single-quoted literal");
    assert.match(script, /&b=c\|whoami'$/, "everything after the & must still be there");
});

test("buildBrowserCommand: a URL carrying the quote character its shell's form relies on is refused, not quoted anyway", () => {
    // The win32 form embeds the URL in a quoted string, so a quote inside it would end that string
    // early and hand the rest to cmd.exe as syntax. Cannot happen from outside today — guids,
    // base64url and configured scopes — so this keeps it that way rather than trusting it stays.
    assert.throws(() => m.buildBrowserCommand("win32", {}, 'http://127.0.0.1:1/?a="&calc', onPath()),
        m.VcSecretsError);
    // The WSL branch embeds the URL in a single-quoted PowerShell literal, so there it is the single
    // quote that would end the string early. Same invariant, the other shell's quoting character.
    assert.throws(() => m.buildBrowserCommand("linux", {}, "http://127.0.0.1:1/?a='&calc", onPath("powershell.exe")),
        m.VcSecretsError);
});

test("openBrowser: the spawn options the builder asked for actually reach spawn", async () => {
    // The other half of the same defect: the win32 spec carries windowsVerbatimArguments and the
    // inline default dropped spec.opts, so the builder was right and the launch was not. A spec field
    // nothing reads is worse than no field at all.
    let seen = null;
    const spec = { cmd: "cmd", args: ['/c start "" "http://x/?a=1&b=2"'], opts: { windowsVerbatimArguments: true } };
    m.openBrowser(spec, { spawnProcess: (cmd, args, opts) => {
        seen = { cmd, args, opts };

        return { unref() {}, on() {} };
    } });
    assert.equal(seen.opts.windowsVerbatimArguments, true);
    assert.equal(seen.opts.detached, true, "and the defaults it does not override are still there");
    assert.deepEqual(seen.args, spec.args);
});

test("openBrowser: a missing opener is reported, not thrown", () => {
    // spawn fails ASYNCHRONOUSLY, so by the time `error` arrives the caller's try/catch is gone and an
    // unhandled one would end the sign-in on a stack trace -- with the listener already waiting and
    // the URL already printable. A degradation must read as one.
    const logged = [];
    let emit = null;
    m.openBrowser({ cmd: "xdg-open", args: ["http://x/"] }, {
        log: (line) => logged.push(line),
        spawnProcess: () => ({ unref() {}, on(event, fn) { if (event === "error") { emit = fn; } } }),
    });
    assert.ok(emit, "openBrowser must subscribe to the child's error");
    emit(Object.assign(new Error("spawn xdg-open ENOENT"), { code: "ENOENT" }));
    assert.match(logged.join(""), /could not open a browser \(ENOENT\)/);
    assert.match(logged.join(""), /by hand/, "and must say what the developer can still do");
});

test("openBrowser: an opener that spawned and then failed is reported too", () => {
    // `error` covers only a spawn that never happened, and that is the RARER shape. wslview with
    // interop off, xdg-open on a headless host and a policy-blocked powershell each spawn cleanly
    // and exit non-zero -- so the sign-in went on waiting for a browser that was never going to
    // appear, with nothing printed and no timeout to end it.
    const logged = [];
    const handlers = {};
    m.openBrowser({ cmd: "wslview", args: ["http://x/"] }, {
        log: (line) => logged.push(line),
        spawnProcess: () => ({ unref() {}, on(event, fn) { handlers[event] = fn; } }),
    });
    assert.ok(handlers.close, "openBrowser must subscribe to the child's close");
    handlers.close(1);
    assert.match(logged.join(""), /exited with code 1/);
    assert.match(logged.join(""), /by hand/, "and must say what the developer can still do");
});

test("openBrowser: a clean exit and a killed opener say nothing", () => {
    // Exit 0 is the ordinary case: an opener hands the URL to the browser and returns. `null` is
    // what a signal gives -- an opener the developer killed, or one that execs into the browser and
    // dies with it. Neither is the opener reporting a failure of its own, and a line on either
    // would land AFTER a sign-in that worked, which is worse than silence.
    const logged = [];
    const handlers = {};
    m.openBrowser({ cmd: "xdg-open", args: ["http://x/"] }, {
        log: (line) => logged.push(line),
        spawnProcess: () => ({ unref() {}, on(event, fn) { handlers[event] = fn; } }),
    });
    handlers.close(0);
    handlers.close(null);
    assert.deepEqual(logged, []);
});

test("withDeadline: a promise that wins leaves no timer behind", async (t) => {
    // The half that is easy to omit and impossible to see. A bare Promise.race keeps the loser's
    // timer pending, and node holds the process open until it fires -- so a sign-in that finished
    // in ten seconds would leave the CLI sitting for the rest of the ten minutes, which is exactly
    // the hang the deadline was added to end. Ticking past the deadline AFTER the win is what
    // distinguishes a cleared timer from one that merely has not fired yet.
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let fired = false;
    const value = await m.withDeadline(Promise.resolve("arrived"), m.LOGIN_WAIT_MS,
        () => { fired = true; return "late"; });
    assert.equal(value, "arrived");
    t.mock.timers.tick(m.LOGIN_WAIT_MS);
    assert.equal(fired, false, "the timer must have been cleared, not merely outrun");
});

test("withDeadline: the deadline wins when nothing ever arrives", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const raced = m.withDeadline(new Promise(() => {}), m.LOGIN_WAIT_MS, () => "deadline");
    t.mock.timers.tick(m.LOGIN_WAIT_MS);
    assert.equal(await raced, "deadline");
});

const GET = (url) => ({ url, method: "GET" });

test("handleCallback: a mismatched state decides nothing, and says so", () => {
    // It used to END the sign-in with "state_mismatch". Anything that can reach this port can send
    // that, so the abort was available to anybody and the message named a cause the developer did not
    // have. Ignored now -- and reported, so that an error Entra sends without echoing state is still
    // visible rather than a silent wait.
    const r = m.handleCallback(GET("/callback?code=abc&state=WRONG"), "RIGHT", "/callback");
    assert.equal(r.ignore, true);
    assert.match(r.notice, /state that is not this sign-in/);
    assert.equal(r.code, undefined, "and the code is not carried forward");
    assert.equal(r.error, undefined, "nor turned into a failure the caller would report");
});

test("handleCallback: an Entra error carries its AADSTS code into the result", () => {
    // Entra redirects here when the user is not in the assigned group or declines. Without this
    // the best `login` can say is "no code received", and the AADSTS string a developer can
    // actually act on never reaches them.
    const r = m.handleCallback(
        GET("/callback?error=access_denied&error_description=AADSTS50105%3A+not+assigned&state=RIGHT"),
        "RIGHT", "/callback");
    assert.match(r.error, /access_denied/);
    assert.match(r.description, /AADSTS50105/);
    assert.equal(r.code, undefined);
});

test("handleCallback: an error beats the code, but only once the state matches", () => {
    // Both halves of a reversed decision. The goal of the old order is kept: with a matching state an
    // error is reported before the code is looked at, so a developer reads their AADSTS code and not a
    // generic "no code received". What the old order also permitted is gone: an error whose state does
    // not match no longer ends anything, because that abort was available to any local process.
    const real = m.handleCallback(
        GET("/callback?error=access_denied&error_description=AADSTS50105&code=abc&state=RIGHT"),
        "RIGHT", "/callback");
    assert.match(real.error, /access_denied/);
    assert.match(real.description, /AADSTS50105/);

    const forged = m.handleCallback(
        GET("/callback?error=access_denied&error_description=AADSTS50105&state=WRONG"), "RIGHT", "/callback");
    assert.equal(forged.ignore, true);
    assert.equal(forged.error, undefined);
});

test("handleCallback: a request to another path is ignored, not treated as a failed sign-in", () => {
    // A browser fetching /favicon.ico for the "you can close this tab" page must not abort a
    // sign-in that is about to succeed.
    assert.equal(m.handleCallback(GET("/favicon.ico"), "RIGHT", "/callback").ignore, true);
    // What the path check actually decides, and the reason the line above does not pin it: a
    // NON-callback path carrying ANY of code, error or state. /favicon.ico is turned away by the
    // stray-request branch below whatever the path check does, so deleting the check left the whole
    // suite green. One of the three parameters is enough to disarm that branch; with a matching
    // state and a code, as here, the code is accepted from a path Entra never redirected to.
    assert.equal(m.handleCallback(GET("/evil?code=abc&state=RIGHT"), "RIGHT", "/callback").ignore, true);
});

test("handleCallback: a stray request on the callback path is ignored, not read as an attack", () => {
    // The callback moved to "/" to match the registered bare `http://localhost`, so the path no
    // longer filters anything out. A port scanner, or a browser asking for the root, would reach
    // the state check and end the wait with "state_mismatch" — aborting a sign-in that was about
    // to succeed, and telling the developer they are under attack. Under WSL the loopback relay
    // makes the port reachable from Windows, so this is not hypothetical.
    assert.equal(m.handleCallback(GET("/"), "RIGHT", "/").ignore, true);
    assert.equal(m.handleCallback(GET("/?probe=1"), "RIGHT", "/").ignore, true);
    // The "not read as an attack" half of the title, which nothing asserted: the verdict is the same
    // with the branch removed, because the state check also ignores. What changes is the DIAGNOSIS --
    // every browser request for "/" then prints the notice below, which names a state that is not
    // this sign-in's. Deleting the branch left the suite green; this is the line that reddens.
    assert.equal(m.handleCallback(GET("/"), "RIGHT", "/").notice, undefined,
        "a browser asking for the root is not something to warn the developer about");
    // A request that claims to be a callback but carries someone else's state is ignored WITH a
    // notice -- it neither ends the sign-in nor disappears.
    const wrongState = m.handleCallback(GET("/?code=abc&state=WRONG"), "RIGHT", "/");
    assert.equal(wrongState.ignore, true);
    assert.ok(wrongState.notice, "and it must not be silent");
    // And the real redirect still gets through on the root path — the case no other test covers,
    // because every one of them passes the old "/callback".
    assert.deepEqual(m.handleCallback(GET("/?code=abc&state=RIGHT"), "RIGHT", "/"), { code: "abc" });
});

test("handleCallback: an error carries every other parameter Entra sent, except a code", () => {
    // Measured: `access_denied` arrived with no error_description at all, and reporting two fixed
    // fields threw away whatever Entra had sent instead. `code` is excluded rather than assumed
    // absent — it has no business on an error redirect, and echoing one into a page or a log is the
    // one thing this must never do.
    const r = m.handleCallback(
        GET("/?error=access_denied&error_subcode=cancel&trace_id=t-1&code=SECRET&state=RIGHT"),
        "RIGHT", "/");
    assert.equal(r.error, "access_denied");
    assert.deepEqual(r.extras, [["error_subcode", "cancel"], ["trace_id", "t-1"], ["state", "RIGHT"]]);
    assert.ok(!JSON.stringify(r).includes("SECRET"), "a code must not survive into the error verdict");
});

test("the tab title names which sign-in the tab belongs to", () => {
    // A machine can hold more than one: entries are named per organisation, so two projects can each
    // have a tab open, and "vc-secrets" on both is the one thing that cannot tell them apart.
    const title = (html) => /<title>([^<]*)<\/title>/.exec(html)[1];
    assert.equal(title(m.closeTabPage("ado-oauth-org")), "Signed in - ado-oauth-org");
    assert.equal(title(m.failedPage({ error: "access_denied", description: "", extras: [] }, "ado-oauth-org")),
        "Sign-in failed - ado-oauth-org");
    // Without a name it still says what happened rather than the tool's own name.
    assert.equal(title(m.closeTabPage()), "Signed in");
    assert.equal(title(m.failedPage({ error: "x", description: "", extras: [] })), "Sign-in failed");
    // And the failure title must not read as a success at a glance, which is where a tab title is read.
    assert.doesNotMatch(title(m.failedPage({ error: "x", description: "", extras: [] }, "org")), /signed in/i);
    // The name is escaped although it is validated `[a-z0-9-]+` at load, because the page must not
    // depend on a check made somewhere else -- and nothing asserted that until now: removing
    // escapeHtml from BOTH titles left the whole suite green, since every name above is one that
    // escaping does not change. Asserted on the raw HTML rather than through `title()`: its `[^<]*`
    // cannot span an unescaped bracket, so on a regression the match fails outright and the helper
    // throws a TypeError on `exec(...)[1]` -- a failure that names nothing about escaping.
    const hostile = "a<script>&\"x";
    assert.match(m.closeTabPage(hostile), /<title>Signed in - a&lt;script&gt;&amp;&quot;x<\/title>/);
    assert.match(m.failedPage({ error: "x", description: "", extras: [] }, hostile),
        /<title>Sign-in failed - a&lt;script&gt;&amp;&quot;x<\/title>/);
});

test("failedPage: renders the reason, and escapes it because the sender chose it", () => {
    // Anything that can reach the loopback port during a sign-in picks these values, so an
    // unescaped one would execute as script on this page's own origin.
    const html = m.failedPage({ error: "bad<x>", description: 'a "quoted" & odd one', extras: [["k", "<v>"]] });
    assert.ok(html.includes("bad&lt;x&gt;"), html);
    assert.ok(html.includes("&quot;quoted&quot;"), html);
    assert.ok(html.includes("&amp; odd"), html);
    assert.ok(html.includes("&lt;v&gt;"), html);
    assert.ok(!/<x>|<v>/.test(html), "no raw angle brackets from the query may reach the page");
});

test("forTerminal: a control byte from the redirect cannot reach the terminal as a command", () => {
    // The HTML sink escapes; this is the same sender with a different alphabet. CSI would move the
    // cursor and overwrite what is already on screen, OSC can reach the window title or the
    // clipboard — and unlike a bad tag, none of it is visible in the text that carried it.
    const nasty = `a\u001b[2Jb\u0007c\u009bd`;
    const safe = m.forTerminal(nasty);
    assert.ok(!/[\u0000-\u001f\u007f-\u009f]/.test(safe), `control bytes survived: ${JSON.stringify(safe)}`);
    assert.match(safe, /^a\?\[2Jb\?c\?d$/, "and the replacement itself must be ASCII");
});

test("forTerminal: an unbounded value is truncated", () => {
    assert.equal(m.forTerminal("x".repeat(1000), 10), "xxxxxxxxxx...");
    assert.equal(m.forTerminal("short", 10), "short");
});

test("handleCallback: the parameter list a redirect can carry is bounded", () => {
    // Whatever can reach this port can send thousands. Bounding it in the verdict means the page and
    // the terminal message inherit one limit instead of each needing its own.
    const many = Array.from({ length: 100 }, (unused, i) => `p${i}=v${i}`).join("&");
    const r = m.handleCallback(GET(`/?error=access_denied&state=RIGHT&${many}`), "RIGHT", "/");
    assert.equal(r.extras.length, m.MAX_ERROR_PARAMS);
});

test("failedPage: names the usual causes, because a bare access_denied is not actionable", () => {
    // The first cause is the measured one: opening the printed URL in a browser that carries no work
    // account returns a bare `access_denied`, and its own page asks for an account to be added to the
    // browser profile. That is the likely case precisely when the URL is printed, because the
    // developer then opens it somewhere other than their usual browser.
    const html = m.failedPage({ error: "access_denied", description: "", extras: [] });
    assert.match(html, /no work\s+account/i);
    assert.match(html, /declined consent/i);
    assert.match(html, /not assigned/i);
    assert.doesNotMatch(html, /signed in/i, "still must not read as a success at a glance");
});

test("handleCallback: a non-GET request is ignored", () => {
    assert.equal(m.handleCallback({ url: "/callback?code=abc&state=RIGHT", method: "POST" },
        "RIGHT", "/callback").ignore, true);
});

test("handleCallback: the right path with neither code nor error is an error, not a wait", () => {
    assert.equal(m.handleCallback(GET("/callback?state=RIGHT"), "RIGHT", "/callback").error, "no_code");
});

socketTest("listenForCallback: binds loopback only, so the code cannot arrive from the network", async () => {
    // The authorization code travels in this request. A listener on 0.0.0.0 would accept it from
    // anywhere routable, and nothing about the successful case would look different — which is
    // why the one-word change from 127.0.0.1 needs an assertion rather than only a comment.
    const server = await m.listenForCallback("STATE");
    try {
        const addresses = Object.values(os.networkInterfaces()).flat()
            .filter((i) => i.family === "IPv4" && !i.internal).map((i) => i.address);
        if (addresses.length === 0) {
            return;   // nothing routable to probe from; the negative below would prove nothing
        }
        const refused = await new Promise((resolve) => {
            const probe = net.connect({ host: addresses[0], port: server.port });
            probe.once("connect", () => { probe.destroy(); resolve(false); });
            probe.once("error", () => resolve(true));
        });
        assert.equal(refused, true, `the listener answered on ${addresses[0]}, not just loopback`);
    } finally {
        await server.close();
    }
});

socketTest("listenForCallback: a refused sign-in does not tell the browser it succeeded", async () => {
    // The browser is where the developer is looking. "Signed in." after Entra refused them sends
    // them away from the terminal holding the AADSTS code — defeating the error-before-state
    // ordering that exists precisely so that code reaches them.
    const server = await m.listenForCallback("STATE");
    try {
        const waiting = server.next();
        const res = await fetch(`http://127.0.0.1:${server.port}${m.REDIRECT_PATH}`
            + "?error=access_denied&error_description=AADSTS50105&state=STATE");
        assert.equal(res.status, 400);
        const body = await res.text();
        assert.match(body, /failed/i);
        assert.doesNotMatch(body, /signed in/i, "the page must not claim a sign-in that did not happen");
        assert.equal((await waiting).error, "access_denied");
    } finally {
        await server.close();
    }
});

socketTest("listenForCallback: a forged error is reported and waited past, not obeyed", async () => {
    // The wiring, not the verdict: handleCallback's decision is unit-tested above, and what this proves
    // is that an ignore-with-notice really keeps the listener waiting AND really reaches the developer.
    // Anything on this machine can send that request -- under WSL mirrored, anything on the Windows
    // side too -- so obeying it would hand every local process an abort button on someone's sign-in.
    const logged = [];
    const server = await m.listenForCallback("STATE", { log: (line) => logged.push(line) });
    try {
        const waiting = server.next();
        const forged = await fetch(`http://127.0.0.1:${server.port}${m.REDIRECT_PATH}?error=access_denied`);
        assert.equal(forged.status, 404, "a request that decides nothing must not be answered as a callback");
        assert.match(logged.join(""), /state that is not this sign-in/);
        // And the real one still lands, which is the half that proves the listener was never settled.
        const real = await fetch(`http://127.0.0.1:${server.port}${m.REDIRECT_PATH}?code=abc&state=STATE`);
        assert.equal(real.status, 200);
        assert.deepEqual(await waiting, { code: "abc" });
    } finally {
        await server.close();
    }
});

socketTest("listenForCallback: a stray request is answered and waited past, the callback ends the wait", async () => {
    // handleCallback's verdicts are unit-tested; what this proves is the WIRING — that an
    // `ignore` verdict really does keep the listener waiting rather than resolving with it. A
    // browser fetching /favicon.ico for the close-this-tab page would otherwise end the sign-in
    // with no code, and the failure would look like Entra never redirected.
    const server = await m.listenForCallback("STATE");
    try {
        const waiting = server.next();
        const stray = await fetch(`http://127.0.0.1:${server.port}/favicon.ico`);
        assert.equal(stray.status, 404);
        const settled = await Promise.race([waiting, new Promise((r) => setTimeout(() => r("still-waiting"), 50))]);
        assert.equal(settled, "still-waiting", "a 404 must not end the sign-in");

        const ok = await fetch(`http://127.0.0.1:${server.port}${m.REDIRECT_PATH}?code=abc&state=STATE`);
        assert.equal(ok.status, 200);
        assert.match(await ok.text(), /close this tab/i);
        assert.deepEqual(await waiting, { code: "abc" });
    } finally {
        await server.close();
    }
});

// A browser opens speculative connections to the redirect URI and can leave one carrying no request
// at all. `server.close()` severs an IDLE connection but not that one -- a connection that never
// completed a request is not idle, so close() waits on it for as long as the browser holds it, and
// cmdLogin's `finally` never returns although the tokens are already stored. Measured on Windows: the
// verb hung past 88 s with one accepted socket alive, and closing the browser tab did not release it.
//
// The connection is opened deliberately here rather than driven through a browser, because whether a
// browser leaves such a socket is the browser's business: on Linux it does not, and a test that waited
// for one would be green on the platform where the defect is invisible.
//
// Named for the rule rather than for listenForCallback: createChannel already severs its sockets
// before closing and says why in its own comment, so this is the second site of one rule, and a third
// listener must be in scope without anyone remembering to widen a test.
socketTest("a teardown does not wait on a peer that only connected -- the sign-in listener", async () => {
    const server = await m.listenForCallback("STATE");
    const arrived = server.next();

    // TWO lingering peers, and allowHalfOpen on each. Both details are what let this test fail for
    // the right reason, and each was measured: with one peer, a sever loop that stops after its first
    // element passes and the production hang returns; without allowHalfOpen, the client closes on FIN
    // so a teardown weakened from destroy() to end() also passes. Plural is what the field produced
    // too -- the Windows capture that started this showed two accepted sockets.
    const lingering = [];
    for (let i = 0; i < 2; i++) {
        const sock = net.connect({ port: server.port, host: "127.0.0.1", allowHalfOpen: true });
        await new Promise((resolve) => sock.once("connect", resolve));
        lingering.push(sock);
    }

    const callback = net.connect(server.port, "127.0.0.1");
    await new Promise((resolve) => callback.once("connect", resolve));
    callback.write(`GET ${m.REDIRECT_PATH}?code=abc&state=STATE HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
    assert.deepEqual(await arrived, { code: "abc" });

    try {
        const outcome = await Promise.race([
            server.close().then(() => "closed"),
            new Promise((resolve) => setTimeout(() => resolve("waited on the preconnect"), 1000)),
        ]);
        assert.equal(outcome, "closed", "close() must not wait on a connection that sent no request");
    } finally {
        // In a finally, not after the race: an assertion above throws on a wiring regression and
        // would otherwise leak this listener and its sockets into the rest of the run.
        for (const sock of lingering) {
            sock.destroy();
        }
        callback.destroy();
    }
});

// ---------------------------------------------------------------------------------------------
// cmdLogin — the port of the interactive sign-in verb. Ported from the upstream launcher's
// suite (mcpw.test.js): `m.McpwError` becomes `m.VcSecretsError`, and every "mcpw"/"mcpw login" in
// a user-facing string becomes "vc-secrets"/"vc-secrets login". `cache.entryNames(serverName)`
// becomes `oauthEntryKeys(serverName, decl, cfg)` — both return { refresh, access }, but the
// values here are the full three-segment keystore keys keyFor produces, not the source's bare
// entry names, so an assertion on a written/removed name reads it off LOGIN_KEYS below instead of
// a literal "oauth-azure-mcp-*" string.
//
// cmdLogin refuses a project-scope entry whose app registration the user file has not acknowledged,
// so every test below runs on an acknowledged one and LOGIN_CFG carries the block. It grants
// nothing: the verb's gate reads whether the registration is acknowledged at all, and WHICH
// launchable may then consume the token is resolveEnvEntries' decision, not this verb's — a block
// with contents would imply this fixture pins a relation it does not.
// ---------------------------------------------------------------------------------------------

// `kind: "oauth"` is what the merge stamps on every entry in the oauth section -- it is the
// discriminator authorizationFor branches on -- and `declaredName` names the key it was found
// under. A hand-built declaration omitting either is not one this package can ever see, and the
// two consumers of authorizationFor disagree about what its `null` means: cmdLogin reads `.block`
// off it and dies with a TypeError, while resolveEnvEntries tests
// `source !== null` and takes it as "needs no authorization". Fail-closed at one site and
// permissive at the other is the reason to match the merge rather than to guard the null.
const LOGIN_DECL = { ...DECL_IDENTITY, kind: "oauth", scope: "project", home: "project", declaredName: "azure-mcp" };
const LOGIN_CFG = { oauth: { "azure-mcp": LOGIN_DECL }, projectId: "login-p1",
    registrations: { [DECL_IDENTITY.tenantId]: { [DECL_IDENTITY.clientId]: {} } } };
const LOGIN_KEYS = m.oauthEntryKeys("azure-mcp", LOGIN_DECL, LOGIN_CFG);

// UNACKNOWLEDGED_CFG differs from LOGIN_CFG in exactly one property, so a test driven by it fails
// for the reason its name gives. USER_CFG differs in two -- the declaration's home AND the absent
// registrations block -- and has to: the whole claim is that the first makes the second irrelevant.
const UNACKNOWLEDGED_CFG = { ...LOGIN_CFG, registrations: {} };
const USER_DECL = { ...DECL_IDENTITY, kind: "oauth", scope: "user", home: "user", declaredName: "azure-mcp" };
const USER_CFG = { oauth: { "azure-mcp": USER_DECL }, projectId: "login-p1" };
const USER_KEYS = m.oauthEntryKeys("azure-mcp", USER_DECL, USER_CFG);

// cmdLogin's network, browser and listener are injected, which leaves its actual decisions —
// the order of the two writes above all — as ordinary assertions. This verb is ultimately proved
// by a live sign-in, and that run was blocked on an app registration for a while; the
// irreversible step inside it should not have to wait for an administrator to be covered.
function loginDeps(overrides = {}) {
    const written = [];
    const opened = [];
    const logged = [];
    const lock = [];
    const removed = [];
    const marked = [];
    const cleared = [];
    const deps = {
        listen: async () => ({ port: 51234, next: async () => ({ code: "the-code" }), close: async () => {} }),
        open: (cmd) => { opened.push(cmd); },
        // All four timing fields differ, and expiresAt is obtainedAt + lifetimeMs rather than a
        // repeat of one of them. The source's stub leaves obtainedAt at 0, which makes expiresAt and
        // lifetimeMs the same number -- and a whole-object assertion then cannot see those two
        // transposed, which is the one transposition among the four a degenerate fixture hides.
        exchange: async () => ({ refreshToken: "new-rt", accessToken: "at", expiresAt: 1_703_600_000,
            obtainedAt: 1_700_000_000, lifetimeMs: 3600_000, uptimeAtIssue: 1000 }),
        writeEntry: async (name, value) => { written.push([name, value]); },
        randomState: () => "STATE",
        log: (line) => { logged.push(line); },
        backend: "gpg",
        // Injected like every other seam here, and not left to the default: that one binds a REAL
        // machine-global socket, so every login test would serialise against every other and
        // against any other invocation of this tool running on this machine.
        acquireLock: async () => { lock.push("acquire"); return { release: async () => { lock.push("release"); } }; },
        // Same reason as acquireLock, and it was missed here once at a real cost: the default is
        // the REAL deleteEntryIo, so a test whose refresh write fails cleared a developer's
        // live sign-in out of the actual keystore. From a GREEN run -- a delete that succeeds
        // looks like nothing at all. Measured 2026-08-20: both oauth entries for the affected
        // server were present before the run and gone after, with every other test still passing.
        removeEntry: async (name) => { removed.push(name); },
        // Injected for exactly the reason removeEntry is, and it was written down there first: the
        // default WRITES and DELETES a file under the developer's own config directory, and both
        // halves run on ordinary paths -- `clear` on every successful login. Left to default, every
        // login test would litter a real machine from a green run.
        oversize: { record: (key, info) => { marked.push([key, info]); }, clear: (key) => { cleared.push(key); } },
        ...overrides,
    };

    return { deps, written, opened, logged, lock, removed, marked, cleared };
}

// Depth-aware rather than line-anchored: the first version of this matched only a seam standing
// alone at an indent of exactly four, so a new seam sharing a line with another was dropped
// silently, and the guard passed covering nothing for the very case it exists for.
function seamsOf(source) {
    const raw = source.slice(source.indexOf("{", source.indexOf("cfg,")) + 1, source.indexOf("} = {}) {"));
    // Line comments go BEFORE the split, not after it. Prose contains commas, and the comma is what
    // the split acts on: one part would end mid-sentence and the next would begin with an ordinary
    // word that reads as a seam name -- losing the real seam and inventing a phantom in its place.
    const block = raw.replace(/\/\/.*$/gm, "");
    const parts = [];
    let depth = 0;
    let current = "";
    for (const ch of block) {
        if ("([{".includes(ch)) { depth += 1; }
        if (")]}".includes(ch)) { depth -= 1; }
        if (ch === "," && depth === 0) { parts.push(current); current = ""; continue; }
        current += ch;
    }
    parts.push(current);

    // The name, whether or not a default follows it. Requiring the `=` was the same hole in a
    // second costume: a seam added WITHOUT a default vanished from the list, so the deepEqual below
    // passed and the one production call site -- main, which calls
    // cmdLogin(arg, cfg) with no deps object at all -- would hand it `undefined`.
    return parts.map((part) => (/^\s*(\w+)/.exec(part) ?? [])[1]).filter(Boolean);
}

function cmdLoginSeams() {
    return seamsOf(m.cmdLogin.toString());
}

// One per verb, because `seamsOf` takes a function's text and nothing generalises across the two.
// cmdLogout's own comment used to claim cmdLoginSeams covered it; it does not, and the whole suite
// stayed green with a bogus seam in cmdLogout's parameter list.
function cmdLogoutSeams() {
    return seamsOf(m.cmdLogout.toString());
}

// Presence of the KEY is not injection: `Object.keys({a: undefined})` is `["a"]`, and a
// destructuring default fires on undefined, so `loginDeps({ removeEntry: undefined })` would hand
// back the real deleter with the guard green. The source's own instance of that idiom rides a test
// this package has not ported, so nothing below demonstrates it -- which is exactly why the guard
// has to state the rule rather than lean on an example.
function definedSeams(deps) {
    // `null` counts as absent alongside `undefined`: both acquireLock and removeEntry default to
    // null in the parameter list and resolve their real implementation with `??` in the body, so a
    // seam handed in as null falls through to the machine-global socket or the real deleter exactly
    // as an omitted one does. Filtering on undefined alone would bless that shape.
    return Object.entries(deps).filter(([, value]) => value !== undefined && value !== null).map(([key]) => key);
}

test("cmdLogin: a hostile parameter reaches the terminal message declawed", async () => {
    const { deps } = loginDeps({
        listen: async () => ({ port: 1, next: async () => ({
            error: "access_denied", description: "", extras: [["subcode", `x\u001b[2Jy`]],
        }), close: async () => {} }),
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), (e) => {
        assert.ok(!/[\u0000-\u001f]/.test(e.message), `raw control byte in: ${JSON.stringify(e.message)}`);
        assert.match(e.message, /subcode=x\?\[2Jy/);

        return true;
    });
});

test("loginDeps: every cmdLogin seam that reaches outside this process is injected", () => {
    const seams = cmdLoginSeams();
    // A parser that quietly finds nothing would make this test pass forever. Pin the whole list,
    // so adding a seam fails here and forces a decision about whether it needs injecting.
    assert.deepEqual(seams, ["listen", "open", "browser", "exchange", "writeEntry", "removeEntry",
        "randomState", "log", "backend", "acquireLock", "now", "sleep", "waitMs", "oversize"],
        "the seam list changed, or the parse broke — both need a human");
    // These four stay inside the process: a pure command builder, the clock, a timer, and a plain
    // number of milliseconds. `waitMs` is injected by the tests that drive the deadline, but it
    // needs no fixture default — left alone it is ten minutes, and no test waits that long: every
    // one either answers the callback or injects its own `waitMs`.
    const mayDefault = ["browser", "now", "sleep", "waitMs"];
    const injected = definedSeams(loginDeps().deps);
    assert.deepEqual(seams.filter((s) => !mayDefault.includes(s) && !injected.includes(s)), [],
        "each of these would fall through to a real implementation in every login test");
});

test("cmdLogout: every seam this verb declares is pinned, so a new one forces a decision", () => {
    // The LIST only, where cmdLogin's guard above also checks a fixture injects each seam: this
    // verb's tests build their deps inline, as the source's do, so there is no single fixture to
    // check them against. The list is the half that carries the weight anyway -- it is what makes
    // a NEW outside-process seam fail here instead of falling through to a real implementation in
    // every test that omits it.
    //
    // `backend` is declared but unreachable in practice while `deleteEntry` is injected, since it
    // only feeds `deleteEntryIo(backend)`. It is pinned all the same: whether that stays true is
    // exactly the decision this test exists to force.
    assert.deepEqual(cmdLogoutSeams(),
        ["deleteEntry", "backend", "acquireLock", "now", "sleep", "log"],
        "the seam list changed, or the parse broke — both need a human");
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

test("cmdLogin: the refresh entry is written before the access entry", async () => {
    // Entra invalidates the old refresh token the moment it issues a new one, so persisting the
    // new one is the only irreversible step in the design. Writing the access entry first would
    // widen the window in which a crash leaves no way back in except an interactive login.
    const { deps, written } = loginDeps();
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(written.map(([name]) => name), [LOGIN_KEYS.refresh, LOGIN_KEYS.access]);
});

test("cmdLogin: the refresh entry carries the new refresh token under the declaration's identity", async () => {
    // The two names and their order were pinned; the CONTENTS were not. Every field here is one a
    // later read compares, so a refresh entry holding the access token, or the tenant and client
    // transposed, stores a session ensureFreshToken rejects on identity at the next launch --
    // sending the developer back to `login` with nothing naming why.
    const { deps, written } = loginDeps();
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(cache.parseEntry(written.find(([name]) => name === LOGIN_KEYS.refresh)[1]),
        { schema: 1, refreshToken: "new-rt", tenantId: LOGIN_DECL.tenantId,
            clientId: LOGIN_DECL.clientId, scopes: LOGIN_DECL.scopes });
});

test("cmdLogin: the access entry carries the token and the timing the exchange returned", async () => {
    // The same gap on the other write, and it fails differently: the three timing fields decide
    // when a renewal fires, so a transposition here is a session that renews at the wrong moment
    // rather than one that is refused outright.
    const { deps, written } = loginDeps();
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(cache.parseEntry(written.find(([name]) => name === LOGIN_KEYS.access)[1]),
        { schema: 1, accessToken: "at", expiresAt: 1_703_600_000, obtainedAt: 1_700_000_000,
            lifetimeMs: 3600_000, uptimeAtIssue: 1000 });
});

test("cmdLogin: a failed refresh write is fatal, and the access entry is not written after it", async () => {
    // The access entry would then describe a session whose refresh token was never stored — a
    // login that works for an hour and cannot be renewed.
    const { deps, written } = loginDeps({
        writeEntry: async (name) => {
            if (name.endsWith("-refresh")) { throw new m.VcSecretsError("keystore full"); }
            written.push([name]);
        },
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), /keystore full/);
    assert.deepEqual(written, [], "nothing may be written once the refresh write failed");
});

test("cmdLogin: a failed ACCESS write is not fatal — losing it costs one exchange", async () => {
    const { deps, logged } = loginDeps({
        writeEntry: async (name) => { if (name.endsWith("-access")) { throw new m.VcSecretsError("nope"); } },
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.ok(logged.some((l) => /access/i.test(l)), `the degraded write must be reported: ${logged.join("")}`);
});

test("cmdLogin: an access entry too large for the keystore is recorded, not just logged", async () => {
    // On Credential Manager this failure is DETERMINISTIC: the value is over the ceiling, so the
    // identical write fails identically at every launch and every renewal, forever. It printed one
    // line to fd 2 and was forgotten, and the next tick printed it again -- so the machine paid a
    // token exchange, and a refresh-token rotation with it, every five minutes with nothing
    // anywhere saying the condition was permanent. The marker is what lets doctor say it.
    const { deps, marked, logged } = loginDeps({
        writeEntry: async (name) => {
            if (name.endsWith("-access")) {
                throw Object.assign(new m.VcSecretsError("too large for Credential Manager"), { toolExitCode: 4 });
            }
        },
        backend: "wcm",
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.equal(marked.length, 1, `exactly one marker: ${JSON.stringify(marked)}`);
    const [key, info] = marked[0];
    assert.equal(key, LOGIN_KEYS.access);
    assert.equal(info.backend, "wcm");
    assert.equal(info.limit, m.WCM_BLOB_LIMIT);
    // Measured from what we tried to write, not scraped from the backend's message -- the number is
    // in hand here, and parsing a string for it would be a second way to be wrong about it.
    assert.equal(info.bytes, Buffer.byteLength(cache.serializeAccess({ accessToken: "at",
        expiresAt: 1_703_600_000, obtainedAt: 1_700_000_000, lifetimeMs: 3600_000, uptimeAtIssue: 1000 })));
    // "signed in, but" included on purpose: without it the same sentence reads as a failed login,
    // at the moment a developer is most likely to re-run `login` and rotate away the token they
    // just got. The prefix is a parameter of the shared write tail, so it is droppable in one edit.
    assert.ok(logged.some((l) => /signed in, but the access entry could not be stored/.test(l)),
        "and the login still reports it, without reading as a failed sign-in");
});

test("cmdLogin: an access write that failed for any other reason leaves no marker", async () => {
    // The distinction the whole file rests on. A transient failure -- a locked store, a timeout --
    // will succeed on the next attempt, and a marker left for one would have doctor report a
    // permanent condition that the very next launch silently disproves. Recording unconditionally
    // is the easy mistake and it looks identical from a green run.
    const { deps, marked } = loginDeps({
        writeEntry: async (name) => {
            if (name.endsWith("-access")) { throw new m.VcSecretsError("the keystore was busy"); }
        },
        backend: "wcm",
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(marked, [], "only a deterministic oversize failure may be recorded");
});

test("cmdLogin: a successful access write clears any marker for that entry", async () => {
    // The load-bearing half: the marker is CURRENT STATE, not an event record. An entry that
    // shrank back under the ceiling -- a group membership dropped, a narrower scope list -- must
    // stop being reported, or doctor goes on naming a problem that is fixed.
    const { deps, cleared } = loginDeps();
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(cleared, [LOGIN_KEYS.access]);
});

test("cmdLogin: the previous access entry is deleted before the new refresh entry is written", async () => {
    // An access entry carries no identity of its own -- serializeAccess stores none -- so cacheStatus
    // checks the declaration against the REFRESH entry and then serves whatever access token sits
    // beside it. Sign in as a different account, store the new refresh token, then fail to store the
    // new access token, and the previous account's token is still there and still inside its
    // lifetime: the next read returns it and the server runs as that principal. Deleting FIRST makes
    // the worst case an access entry that is missing, which costs one exchange.
    //
    // Removals and writes share one array because the ordering BETWEEN them is the entire fix; two
    // separate logs would each be green in the order that reintroduces the hole.
    const events = [];
    const { deps } = loginDeps({
        writeEntry: async (name) => { events.push(`write ${name}`); },
        removeEntry: async (name) => { events.push(`remove ${name}`); },
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(events, [`remove ${LOGIN_KEYS.access}`, `write ${LOGIN_KEYS.refresh}`,
        `write ${LOGIN_KEYS.access}`]);
});

test("cmdLogin: a first sign-in, with no access entry to delete, still stores both entries", async () => {
    // Exit 3 is how every backend reports "no such entry" -- gpg maps ENOENT to it, keychain maps
    // 44 -- and on a first sign-in there is nothing to delete, so this is the ordinary path and not
    // an edge case. Without the exemption the pre-delete would refuse every first sign-in, and only
    // after the authorization code had been spent, which is the one failure a developer cannot retry.
    const { deps, written } = loginDeps({
        removeEntry: async () => {
            throw Object.assign(new m.VcSecretsError("no stored entry"), { toolExitCode: 3 });
        },
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(written.map(([name]) => name), [LOGIN_KEYS.refresh, LOGIN_KEYS.access]);
});

test("cmdLogin: a pre-delete failing for any other reason stores nothing and clears both entries", async () => {
    // The delete is what stops the previous account's token from being served, so a failure that is
    // not "there was no entry" leaves exactly the state it exists to prevent. Swallowing it would
    // store the new refresh token beside the OLD access token -- the principal confusion, reached
    // through the one path that looks like a successful sign-in. Clearing both instead makes the
    // state unambiguously signed-out; the cost is one interactive sign-in, and it is the cheaper
    // side of that trade.
    const removed = [];
    let calls = 0;
    const { deps, written } = loginDeps({
        removeEntry: async (name) => {
            removed.push(name);
            if (++calls === 1) { throw new m.VcSecretsError("keystore locked"); }
        },
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), /keystore locked/);
    assert.deepEqual(written, [], "nothing may be stored once the stale access entry could not be removed");
    assert.deepEqual(removed, [LOGIN_KEYS.access, LOGIN_KEYS.access, LOGIN_KEYS.refresh]);
});

test("cmdLogin: the redirect_uri is the registered localhost URI, with the bound port and no path", async () => {
    // Three independent failure modes in one string, and none of them fails locally.
    //
    // The port must come from the listener, or Entra redirects the browser to a port nothing is
    // listening on and the sign-in hangs with no error. The host must be `localhost` and the path
    // must be absent, because Entra matches this string against the app registration — bare
    // `http://localhost` under Mobile and desktop applications — and ignores the port only for
    // that host. Either mismatch is AADSTS50011.
    //
    // So if a change to vc-secrets.mjs makes this fail, fix vc-secrets.mjs — do not update the
    // expectation. This string is not a mirror of the code; it is what an administrator configured
    // in Entra.
    let seenUri = null;
    const { deps } = loginDeps({
        listen: async () => ({ port: 45678, next: async () => ({ code: "c" }), close: async () => {} }),
        exchange: async (tenantId, body) => {
            seenUri = new URLSearchParams(body).get("redirect_uri");

            return { refreshToken: "rt", accessToken: "at", expiresAt: 1, obtainedAt: 0,
                lifetimeMs: 3600_000, uptimeAtIssue: 1 };
        },
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.equal(seenUri, "http://localhost:45678/");
});

test("cmdLogin: a callback error aborts before any exchange and names the Entra code", async () => {
    let exchanged = false;
    const { deps } = loginDeps({
        listen: async () => ({ port: 1, close: async () => {},
            next: async () => ({ error: "access_denied", description: "AADSTS50105: not assigned" }) }),
        exchange: async () => { exchanged = true; return {}; },
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), /AADSTS50105/);
    assert.equal(exchanged, false, "a refused sign-in must not reach the token endpoint");
});

test("cmdLogin: the listener is closed even when the sign-in fails", async () => {
    // An abandoned listener holds the port for the life of the process, so the next attempt
    // binds a different one — and on a failure path nobody is watching to notice.
    let closed = false;
    const { deps } = loginDeps({
        listen: async () => ({ port: 1, close: async () => { closed = true; },
            next: async () => ({ error: "state_mismatch" }) }),
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps));
    assert.equal(closed, true);
});

test("cmdLogin: with no browser opener the URL is printed and the sign-in still proceeds", async () => {
    const { deps, opened, logged, written } = loginDeps({ browser: () => null });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(opened, [], "nothing to open");
    assert.ok(logged.some((l) => l.includes("https://login.microsoftonline.com/")),
        `the URL must reach the operator: ${logged.join("")}`);
    assert.equal(written.length, 2, "and the sign-in completes normally");
});

test("cmdLogin: the URL is printed on the browser branch too, since that is where the advice points", async () => {
    // Three messages point the developer at the "URL above" -- openBrowser's spawn failure,
    // openBrowser's non-zero exit, and the deadline -- and every one of them fires on a path where
    // a browser WAS opened. While the URL was printed only on the branch with no opener, all three
    // named something the developer had never been shown.
    const { deps, opened, logged } = loginDeps({ browser: () => ({ cmd: "xdg-open", args: ["http://x/"] }) });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.equal(opened.length, 1, "this fixture must take the branch that opens a browser");
    assert.ok(logged.some((l) => l.includes("https://login.microsoftonline.com/")),
        `the URL must be printed even when a browser opens: ${logged.join("")}`);
});

test("cmdLogin: a callback that never arrives ends on the deadline instead of waiting forever", async () => {
    // There was no timeout anywhere in the sign-in, and `next()` resolves only when the callback
    // arrives. Every way a browser fails to reach it is silent, so the command sat on a cursor with
    // no reason given and no way out but Ctrl-C.
    //
    // The listener must still be closed: it holds its port for the life of the process, and on this
    // path there is nobody watching to notice.
    let closed = false;
    const { deps } = loginDeps({
        waitMs: 5,
        listen: async () => ({ port: 51234, next: () => new Promise(() => {}),
            close: async () => { closed = true; } }),
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps),
        (e) => /timed_out/.test(e.message) && /URL above/.test(e.message));
    assert.equal(closed, true, "the listener must be closed on the deadline path");
});

test("cmdLogin: the verifier never leaves the process, only its digest does", async () => {
    // PKCE is worthless if the verifier travels with the authorize request. The code grant is
    // the only place it may appear.
    let authorizeUrl = null;
    const { deps } = loginDeps({
        browser: (platform, env, url) => { authorizeUrl = url; return null; },
        exchange: async (tenantId, body) => {
            const verifier = new URLSearchParams(body).get("code_verifier");
            assert.ok(verifier, "the code grant must carry the verifier");
            assert.ok(!authorizeUrl.includes(verifier), "but the authorize URL must not");
            // "only its digest does" was the unasserted half: dropping `challenge` from cmdLogin's
            // buildAuthorizeUrl call emits `code_challenge=undefined`, which the two lines above
            // accept happily -- the sign-in then fails at Entra, not here.
            const challenge = new URL(authorizeUrl).searchParams.get("code_challenge");
            assert.equal(challenge, crypto.createHash("sha256").update(verifier).digest("base64url"),
                "the digest must travel, and be the S256 digest of THIS verifier");

            return { refreshToken: "rt", accessToken: "at", expiresAt: 1, obtainedAt: 0,
                lifetimeMs: 3600_000, uptimeAtIssue: 1 };
        },
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
});

test("cmdLogin: macOS is a supported platform, not a refusal", async () => {
    // Every other verb already works there — detectLocalBackend returns keychain on darwin, the
    // read path is non-interactive, and the lock has its own darwin branch. login was briefly the
    // one feature that dropped the platform, which is a contradiction rather than a limitation.
    const { deps, written } = loginDeps({ backend: "keychain" });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(written.map(([name]) => name), [LOGIN_KEYS.refresh, LOGIN_KEYS.access]);
});

test("cmdLogin: a backend with no keystore is refused before a code is spent", async () => {
    // The check that survives: whatever the reason, discovering it after the exchange leaves the
    // developer signed in with nothing stored and a single-use code already burned.
    let bound = false;
    const { deps } = loginDeps({
        backend: "nonesuch",
        listen: async () => { bound = true; return { port: 1, next: async () => ({ code: "c" }), close: async () => {} }; },
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), /nonesuch/);
    assert.equal(bound, false, "nothing may be opened or bound when the token cannot be stored");
});

test("cmdLogin: a failed refresh write also clears the stale entries a previous login left", async () => {
    // Within one login the order already prevents access-without-refresh. The gap is ACROSS
    // invocations: Entra invalidated the old refresh token the moment it issued this one, so the
    // previous login's entries are now lies — the old access token keeps working until it
    // expires and then the session dies with nothing to renew from. Clearing both makes the
    // state unambiguously signed-out instead of quietly doomed.
    const removed = [];
    const { deps } = loginDeps({
        writeEntry: async (name) => { if (name.endsWith("-refresh")) { throw new m.VcSecretsError("keystore full"); } },
        removeEntry: async (n) => { removed.push(n); },
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), /keystore full/);
    // The access entry appears TWICE, and the sequence is asserted rather than the set: the first
    // removal is the pre-delete this login always performs, the second is this cleanup. A set would
    // stay green if the pre-delete disappeared, which is the regression worth catching here.
    assert.deepEqual(removed, [LOGIN_KEYS.access, LOGIN_KEYS.access, LOGIN_KEYS.refresh]);
});

test("cmdLogin: a cleanup failure does not replace the write error the developer needs", async () => {
    // The first delete must SUCCEED for this test to reach its subject. Both the pre-delete and the
    // cleanup go through this one seam, so a double that throws unconditionally fails the login
    // before the refresh write is ever attempted -- and the assertion below would then be pinning
    // the pre-delete's error, under a name that promises the write's.
    let calls = 0;
    const { deps } = loginDeps({
        writeEntry: async (name) => { if (name.endsWith("-refresh")) { throw new m.VcSecretsError("keystore full"); } },
        removeEntry: async () => { if (++calls > 1) { throw new m.VcSecretsError("delete failed too"); } },
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), /keystore full/);
});

test("cmdLogin: an undeclared server is refused before a port is bound", async () => {
    let bound = false;
    const { deps } = loginDeps({ listen: async () => { bound = true; return { port: 1, next: async () => ({}), close: async () => {} }; } });
    await assert.rejects(() => m.cmdLogin("ghost", LOGIN_CFG, deps), /ghost/);
    assert.equal(bound, false);
});

test("cmdLogin: both writes happen under the lock, and it is taken AFTER the sign-in, not across it", async () => {
    // Two claims in one order, because they trade against each other. Under the lock: a renewal
    // finishing between the exchange and these writes would otherwise overwrite the token just
    // issued with the rotated one from the chain Entra killed by issuing it. After the sign-in:
    // the same mutex serialises every renewal on this machine, and a browser waits on a human.
    const order = [];
    const { deps } = loginDeps({
        listen: async () => ({ port: 1, next: async () => { order.push("browser"); return { code: "c" }; },
            close: async () => {} }),
        exchange: async () => { order.push("exchange"); return { refreshToken: "rt", accessToken: "at" }; },
        writeEntry: async (name) => { order.push(name.endsWith("refresh") ? "write-refresh" : "write-access"); },
        acquireLock: async () => { order.push("lock"); return { release: async () => order.push("release") }; },
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.deepEqual(order, ["browser", "exchange", "lock", "write-refresh", "write-access", "release"]);
});

test("cmdLogin: a renewal that will not release still stores the token, and names what may undo it", async () => {
    // The asymmetry the shared helper deliberately does not decide. By this point the
    // authorization code is spent and single-use: refusing would leave the developer signed in at
    // Entra with nothing on disk, and a second attempt cannot reuse the code.
    let ms = 0;
    const { deps, written, logged } = loginDeps({
        acquireLock: async () => cache.HELD_BY_OTHER,
        now: () => (ms += 10_000),
        sleep: async () => {},
    });
    await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
    assert.equal(written.length, 2, "a spent code must still end up stored");
    // A wedged holder that later wakes will overwrite this write, and the developer would otherwise
    // meet that only as an unexplained request to sign in again.
    assert.match(logged.join(""), /still holding the lock/, "the hazard has to be named where it is taken");
    assert.match(logged.join(""), /run this again/, "together with what to do about it");
    // The entry name, not a bare verb: `logout` is argument-required, so advice without it sends a
    // developer to a usage line whose `[name]` reads as optional -- and the window this advisory
    // exists to close stays open while they decide the advice was stale.
    assert.match(logged.join(""), /"vc-secrets logout azure-mcp"/, "and a remedy the CLI accepts");
});

test("cmdLogin: no lock failure costs the developer a spent authorization code", async () => {
    // Every way of not getting the lock, including the ones acquireTokenLock rethrows rather than
    // classifies. Past the exchange the code is single-use and gone: an exception here would store
    // nothing, clear nothing, and leave the previous login's entries lying — and adding the lock is
    // what made that step able to fail at all, so refusing would be a regression, not a discovery.
    for (const boom of [Object.assign(new Error("refused"), { code: "EPERM" }),
        Object.assign(new Error("too many open files"), { code: "EMFILE" }),
        new TypeError("acquireLock is not a function")]) {
        const { deps, written, logged } = loginDeps({ acquireLock: async () => { throw boom; } });
        await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
        assert.equal(written.length, 2, `${boom.code ?? boom.name} lost the sign-in`);
        assert.match(logged.join(""), /NOT serialised/, "and the developer is told what was not promised");
        // Without this, a wiring TypeError and an ordinary sandbox EPERM print the same line, and
        // the first is a bug while the second is the environment working as measured.
        assert.match(logged.join(""), new RegExp(boom.code ?? boom.name),
            `the warning must name ${boom.code ?? boom.name}`);
    }
});

test("cmdLogin: a sandbox refusal and a fault nothing classified do not print the same diagnosis", async () => {
    // acquireTokenLock treats EPERM/EACCES as "unbindable" -- one measured sandbox condition -- and
    // RETHROWS everything it will not classify, its own comment naming a wide catch as the mistake.
    // cmdLogin's catch then made that exact mistake one level up: a TypeError from broken wiring
    // printed "the token lock could not be taken", and the reader went to check a sandbox that was
    // perfectly fine. "cmdLogin: no lock failure costs the developer a spent authorization code"
    // pins that both still store the token and both name the code; this one pins that they are not
    // the same sentence, which is the part that was wrong.
    const sentences = [];
    for (const boom of [Object.assign(new Error("refused"), { code: "EPERM" }),
        new TypeError("acquireLock is not a function")]) {
        const { deps, logged } = loginDeps({ acquireLock: async () => { throw boom; } });
        await m.cmdLogin("azure-mcp", LOGIN_CFG, deps);
        sentences.push(logged.find((l) => /NOT serialised/.test(l)));
    }
    assert.match(sentences[0], /could not be taken \(EPERM\)/);
    assert.match(sentences[1], /FAILED \(TypeError\)/);
    assert.doesNotMatch(sentences[1], /could not be taken/,
        "a fault nothing classified must not read as the sandbox declining a bind");
});

test("cmdLogin: the lock is released even when the refresh write fails and the entries are cleared", async () => {
    // The clearing branch deletes the very entries a waiting renewal is about to read, so it has
    // to run inside the lock too — and a leaked holder blocks every launch on this machine.
    const { deps, lock } = loginDeps({
        writeEntry: async () => { throw new m.VcSecretsError("keystore full"); },
        removeEntry: async () => {},
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", LOGIN_CFG, deps), /keystore full/);
    assert.deepEqual(lock, ["acquire", "release"]);
});

test("cmdLogin: a project-scope entry the user file has not acknowledged is refused before a port is bound", async () => {
    // Before the bind, for the same reason the backend check is: past the exchange the
    // authorization code is spent, and a refusal discovered there cannot be retried with it. The
    // bind is the observable because it is the first thing cmdLogin does to the outside world.
    let bound = false;
    const { deps } = loginDeps({
        listen: async () => { bound = true; return { port: 1, next: async () => ({}), close: async () => {} }; },
    });
    await assert.rejects(() => m.cmdLogin("azure-mcp", UNACKNOWLEDGED_CFG, deps), /not authorized/);
    assert.equal(bound, false, "an unauthorized sign-in must not reach the listener");
});

test("cmdLogin: the refusal names the registration that must be acknowledged, not the declaration", async () => {
    // The remedy is a block in the USER file keyed by the (tenantId, clientId) pair, and naming the
    // declaration instead would send the developer to edit the repository file that is precisely
    // what may not authorize itself.
    const { deps } = loginDeps();
    const e = await m.cmdLogin("azure-mcp", UNACKNOWLEDGED_CFG, deps).then(() => null, (err) => err);
    assert.ok(e, "the sign-in must be refused");
    assert.match(e.message,
        new RegExp(`registrations\\."${DECL_IDENTITY.tenantId}"\\."${DECL_IDENTITY.clientId}"`));
    // "not the declaration" is a relation, and the match above is satisfied by a message naming BOTH
    // paths. The sibling refusal test states its two halves this way; this one only stated one.
    assert.doesNotMatch(e.message, /oauth\."azure-mcp"\.authorized/,
        "naming the declaration sends the developer to edit the file that may not authorize itself");
});

test("cmdLogin: the policy refusal wins over the capability refusal", async () => {
    // Both would refuse this call. If the backend check ran first the developer would be told their
    // machine has no keystore -- true, and the wrong thing to go and fix, because installing one
    // changes nothing about a sign-in they are not authorized to make.
    const { deps } = loginDeps({ backend: "nonesuch" });
    await assert.rejects(() => m.cmdLogin("azure-mcp", UNACKNOWLEDGED_CFG, deps), (e) => {
        assert.match(e.message, /not authorized/);
        assert.doesNotMatch(e.message, /keystore/);

        return true;
    });
});

test("cmdLogin: a user-scope entry needs no registrations block, because its own file is the authorization", async () => {
    // Nothing is crossing a scope boundary: the declaration lives in the file the grant would live
    // in. Demanding a block here would make the developer authorize themselves, and `authorized` on
    // a user-scope declaration is absent in exactly the same way an unacknowledged registration is
    // -- which is why the exemption is keyed on the declaration's home and not on that absence.
    const { deps, written } = loginDeps();
    await m.cmdLogin("azure-mcp", USER_CFG, deps);
    assert.deepEqual(written.map(([name]) => name), [USER_KEYS.refresh, USER_KEYS.access]);
});

// ---------------------------------------------------------------------------------------------
// cmdLogout -- the port of the sign-out verb. Ported from the upstream launcher's suite
// (mcpw.test.js): `m.McpwError` becomes `m.VcSecretsError`, `cache.entryNames(serverName)`
// becomes `oauthEntryKeys(serverName, decl, cfg)` (both return { refresh, access }, but the
// values here are the full three-segment keystore keys keyFor produces -- an assertion on a
// removed/attempted name reads it off LOGOUT_KEYS below instead of a literal
// "oauth-azure-mcp-*" string), and every "mcpw"/"mcpw run" in a user-facing string becomes
// "vc-secrets"/"vc-secrets run".
//
// cmdLogout resolves its own lock internally, the same way cmdLogin does --
// `acquireLock` defaults to null in the parameter list and falls through to
// `tokenLockFor(serverName, decl, cfg)`. Two source tests are dropped for it, having lost their
// referent: "a call site that forgets the lock is refused rather than left unserialised"
// (mcpw.test.js) checked a wiring seam that no longer exists once the lock is resolved
// inside the verb; "main hands logout the shared lock builder rather than one of its own"
// (mcpw.test.js) source-inspected a `main` wiring this package's `main` never performs --
// it calls `cmdLogout(arg, cfg)` with no deps object, exactly like the `login` branch. The
// "three writers, one lock name" test near the end of this section replaces both: it proves the
// default actually reaches the real tokenLockFor, driven directly, for all three writers.
//
// cmdLogout gets NO authorization/policy gate. Minting a credential is the privileged act;
// removing one is not, and refusing a removal leaves the refresh token on disk, which is the one
// outcome logout exists to prevent. So LOGOUT_CFG carries no `registrations` block at all, unlike
// LOGIN_CFG -- an unacknowledged project-scope entry still logs out cleanly.
// ---------------------------------------------------------------------------------------------

const LOGOUT_DECL = { ...DECL_IDENTITY, kind: "oauth", scope: "project", home: "project", declaredName: "azure-mcp" };
const LOGOUT_CFG = { oauth: { "azure-mcp": LOGOUT_DECL }, projectId: "logout-p1" };
const LOGOUT_KEYS = m.oauthEntryKeys("azure-mcp", LOGOUT_DECL, LOGOUT_CFG);
const FREE_LOCK = async () => ({ release: async () => {} });

test("cmdLogout: removes both entries, refresh before access", async () => {
    // The ORDER is asserted rather than sorted away, and "cmdLogout: a store that fails part-way
    // has already removed the refresh token, not the access one" is why.
    // The source sorts both sides here (mcpw.test.js), which makes the order invisible:
    // measured, reversing `names` in the production loop left the whole suite green.
    const deleted = [];
    await m.cmdLogout("azure-mcp", LOGOUT_CFG, { deleteEntry: async (n) => { deleted.push(n); },
        acquireLock: FREE_LOCK });
    assert.deepEqual(deleted, [LOGOUT_KEYS.refresh, LOGOUT_KEYS.access]);
});

test("cmdLogout: an already-absent entry is success, and both are still attempted", async () => {
    // The not-found signal is toolExitCode, the property runTool actually sets -- a stub carrying
    // `code` would be read by nothing in production.
    const attempted = [];
    const report = await m.cmdLogout("azure-mcp", LOGOUT_CFG, {
        deleteEntry: async (n) => {
            attempted.push(n);
            throw Object.assign(new m.VcSecretsError("not found"), { toolExitCode: 3 });
        },
        acquireLock: FREE_LOCK,
    });
    assert.deepEqual(attempted, [LOGOUT_KEYS.refresh, LOGOUT_KEYS.access],
        "one absent entry must not stop the other from being removed, and in the order the "
        + "partial-failure test depends on");
    assert.deepEqual(report.removed, []);
    assert.deepEqual(report.alreadyAbsent, [LOGOUT_KEYS.refresh, LOGOUT_KEYS.access]);
});

test("cmdLogout: a real failure is not swallowed as already-absent", async () => {
    // Only exit 3 means "no such entry". Treating every failure as success would report a
    // logout that left the refresh token on disk -- the one outcome logout exists to prevent.
    await assert.rejects(() => m.cmdLogout("azure-mcp", LOGOUT_CFG, {
        deleteEntry: async () => { throw Object.assign(new m.VcSecretsError("keystore locked"), { toolExitCode: 1 }); },
        acquireLock: FREE_LOCK,
    }), /keystore locked/);
});

test("cmdLogout: a store that fails part-way has already removed the refresh token, not the access one", async () => {
    // The reason the two tests above assert an order instead of sorting it. There is no
    // transaction here: the loop rethrows anything that is not exit 3, so a store that dies
    // half-way leaves whatever has gone, gone, and whatever has not, on disk. Refresh-first bounds
    // that to a short-lived access token. The other order leaves the REFRESH token -- the
    // credential this verb exists to remove -- behind a failure a developer may reasonably read as
    // "nothing happened".
    //
    // Inherited from the source, which builds `names` the same way and sorts it away in its own
    // assertions, so this is a strengthening of the port rather than a correction to it.
    const deleted = [];
    await assert.rejects(() => m.cmdLogout("azure-mcp", LOGOUT_CFG, {
        deleteEntry: async (n) => {
            if (deleted.length === 1) {
                throw Object.assign(new m.VcSecretsError("keystore locked"), { toolExitCode: 1 });
            }
            deleted.push(n);
        },
        acquireLock: FREE_LOCK,
    }), /keystore locked/);
    assert.deepEqual(deleted, [LOGOUT_KEYS.refresh],
        "the long-lived credential must be the one already gone when a store fails part-way");
});

test("cmdLogout: a part-way failure says what it already removed, instead of losing it with the stack", async () => {
    // "cmdLogout: a store that fails part-way has already removed the refresh token, not the access
    // one" observes that half-done state from OUTSIDE, through its own double. Nobody who
    // runs the command has that vantage point: the loop threw bare, its return value died with the
    // stack, and the developer read "keystore locked" over a state where the refresh token -- the
    // credential this verb exists to remove -- is in fact already gone. Retrying is right either
    // way; what changes is what the developer believes is still on disk.
    await assert.rejects(() => m.cmdLogout("azure-mcp", LOGOUT_CFG, {
        deleteEntry: async (n) => {
            if (n === LOGOUT_KEYS.access) {
                throw Object.assign(new m.VcSecretsError("keystore locked"), { toolExitCode: 1 });
            }
        },
        acquireLock: FREE_LOCK,
    }), (e) => {
        assert.match(e.message, /keystore locked/, "the failure itself must still lead");
        assert.match(e.message, /HALF done/);
        assert.match(e.message, new RegExp(LOGOUT_KEYS.refresh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.deepEqual(e.removed, [LOGOUT_KEYS.refresh], "and structured, for anything that is not a human");
        assert.equal(e.toolExitCode, 1, "the classification must survive the rewording");

        return true;
    });
});

test("cmdLogout: a failure on the FIRST entry claims nothing was removed", async () => {
    // The other side of the same message, and the one that would be a lie: "HALF done" appended
    // unconditionally would tell a developer a credential is gone when the store refused before
    // touching anything.
    await assert.rejects(() => m.cmdLogout("azure-mcp", LOGOUT_CFG, {
        deleteEntry: async () => { throw Object.assign(new m.VcSecretsError("keystore locked"), { toolExitCode: 1 }); },
        acquireLock: FREE_LOCK,
    }), (e) => {
        assert.doesNotMatch(e.message, /HALF done/);
        assert.deepEqual(e.removed, []);

        return true;
    });
});

test("cmdLogout: an undeclared server is refused before anything is deleted", async () => {
    const attempted = [];
    await assert.rejects(() => m.cmdLogout("ghost", LOGOUT_CFG, {
        deleteEntry: async (n) => { attempted.push(n); },
        acquireLock: FREE_LOCK,
    }), /ghost/);
    assert.deepEqual(attempted, [], "a typo must not delete another server's entries");
});

test("cmdLogout: the lock is released even when a deletion throws", async () => {
    // Same reason ensureFreshToken releases in a finally: a leaked holder outlives the process
    // that took it and blocks every launch on this machine until someone notices.
    let released = 0;
    await assert.rejects(() => m.cmdLogout("azure-mcp", LOGOUT_CFG, {
        deleteEntry: async () => { throw Object.assign(new m.VcSecretsError("keystore locked"), { toolExitCode: 1 }); },
        acquireLock: async () => ({ release: async () => { released++; } }),
    }), /keystore locked/);
    assert.equal(released, 1, "a failed deletion must not leave the renewal lock held");
});

test("cmdLogout: the one thing that can undo the removal is named, even when nothing was removed", async () => {
    // A sign-in already waiting on a human takes the lock only when the browser returns, so it
    // lands after this logout and writes a live token. No mutex closes that ordering, and this
    // line is the only place it is reported -- the alternative to it was an epoch entry, weighed
    // and declined. Asserted on the empty removal too, because that is the case where a pending
    // sign-in is the likely reason and the notice matters most.
    for (const deleteEntry of [async () => {},
        async () => { throw Object.assign(new m.VcSecretsError("not found"), { toolExitCode: 3 }); }]) {
        const logged = [];
        await m.cmdLogout("azure-mcp", LOGOUT_CFG,
            { deleteEntry, acquireLock: FREE_LOCK, log: (line) => logged.push(line) });
        assert.match(logged.join(""), /already open in a browser/, "the residual has to reach the developer");
        assert.match(logged.join(""), /azure-mcp/, "and name the entry it applies to");
    }
});

test("cmdLogout: a holder that never releases fails the logout instead of reporting a removal", async () => {
    const attempted = [];
    let ms = 0;
    await assert.rejects(() => m.cmdLogout("azure-mcp", LOGOUT_CFG, {
        deleteEntry: async (n) => { attempted.push(n); },
        acquireLock: async () => cache.HELD_BY_OTHER,
        now: () => (ms += 10_000),
        sleep: async () => {},
    }), /still refreshing/);
    assert.deepEqual(attempted, [], "a removal that cannot be serialised must not be reported as one");
});

test("cmdLogout: where the lock cannot be bound at all, the removal proceeds and says so", async () => {
    const deleted = [];
    const logged = [];
    let ms = 0;
    await m.cmdLogout("azure-mcp", LOGOUT_CFG, {
        log: (line) => logged.push(line),
        deleteEntry: async (n) => { deleted.push(n); },
        acquireLock: async () => { throw Object.assign(new Error("bind refused"), { code: "EPERM" }); },
        // Never reached while a refusal is read as a refusal -- injected so that reading it as a
        // HOLDER instead fails here in milliseconds rather than after the whole 45 s ceiling.
        now: () => (ms += 10_000),
        sleep: async () => {},
    });
    assert.equal(deleted.length, 2, "a credential that cannot be revoked is the worse failure");
    assert.match(logged.join(""), /NOT serialised/, "and the promise it could not keep is named");
    assert.match(logged.join(""), /EPERM/, "with the errno, not a guess at the cause");
});

// One in-process mutex standing in for the socket, so the reproduction runs sandboxed too: what
// is under test is the order logout and a renewal agree on, not the socket that enforces it --
// that is what the lockTest cases in this file cover.
function sharedLock() {
    let held = false;

    return async () => {
        if (held) {
            return cache.HELD_BY_OTHER;
        }
        held = true;

        return { release: async () => { held = false; } };
    };
}

test("cmdLogout: a renewal in flight cannot put back the credential logout reported removed", async () => {
    // The window ensureFreshToken already closed is the one between its two cache reads. This is
    // the other one: the holder is inside the exchange, on the network, and will write both
    // entries the moment Entra answers. An unlocked delete lands in front of that write, reports
    // success, and the refresh token is back on disk with nothing to notice.
    const store = new Map([[LOGOUT_KEYS.refresh, "r1"], [LOGOUT_KEYS.access, "a1"]]);
    const acquireLock = sharedLock();
    let reached, answer;
    const inExchange = new Promise((r) => { reached = r; });
    const entra = new Promise((r) => { answer = r; });
    const renewal = m.ensureFreshToken({
        serverName: "azure-mcp",
        readCache: async () => (store.has(LOGOUT_KEYS.refresh)
            ? { state: "needs-refresh", refreshToken: store.get(LOGOUT_KEYS.refresh) }
            : { state: "absent" }),
        writeCache: async (fresh) => {
            store.set(LOGOUT_KEYS.refresh, fresh.refreshToken);
            store.set(LOGOUT_KEYS.access, fresh.accessToken);
        },
        exchange: async () => { reached(); await entra; return { accessToken: "a2", refreshToken: "r2" }; },
        acquireLock,
        sleep: async () => {},
    });
    await inExchange;
    const logout = m.cmdLogout("azure-mcp", LOGOUT_CFG, {
        deleteEntry: async (n) => {
            if (!store.delete(n)) {
                throw Object.assign(new m.VcSecretsError("not found"), { toolExitCode: 3 });
            }
        },
        acquireLock,
        sleep: () => new Promise((r) => setImmediate(r)),
    });
    answer();
    const [token] = await Promise.all([renewal, logout]);
    assert.deepEqual([...store.keys()], [], "logout reported a removal a renewal was able to undo");
    assert.equal(token, "a2", "and the launch it waited for still has to survive");
});

test("cmdLogout: an unserialised removal is announced, and a serialised one is quiet", async () => {
    // Deleting the warning outright left the source's suite green, and it is the ONLY signal
    // there is: the report carries no serialisation field, because nothing in production would
    // read one.
    const lines = [];
    const write = process.stderr.write;
    process.stderr.write = (line) => { lines.push(String(line)); return true; };
    try {
        await m.cmdLogout("azure-mcp", LOGOUT_CFG, {
            deleteEntry: async () => {},
            acquireLock: async () => { throw Object.assign(new Error("nope"), { code: "EACCES" }); },
        });
        await m.cmdLogout("azure-mcp", LOGOUT_CFG, {
            deleteEntry: async () => {}, acquireLock: FREE_LOCK,
        });
    } finally {
        process.stderr.write = write;
    }
    assert.match(lines.join(""), /NOT serialised/, "the one signal a developer sees cannot be silent");
    assert.match(lines.join(""), /EACCES/, "and it names the errno rather than a guess at the cause");
    assert.equal(lines.filter((l) => l.includes("NOT serialised")).length, 1,
        "the serialised path must not warn");
});

test("cmdLogout: an error from the lock reaches the caller, and nothing is deleted on the way past", async () => {
    // The half of the source's mcpw.test.js that lost its referent. That test drives the
    // error THROUGH cmdLogout and asserts twice -- it propagates, AND nothing was attempted. This
    // package pinned acquireTokenLock directly instead (vc-secrets-oauth.test.mjs, the
    // "not laundered into one" test), which was right while cmdLogout did not exist, but only the
    // first assertion survived the re-point. The second one is the half about logout.
    //
    // The shape it forecloses is not hypothetical: it is written out, correctly, in cmdLogin,
    // whose `.catch((e) => ({ lock: null, reason: "unbindable", error: e }))` belongs THERE
    // because a failed lock must not cost a single-use authorization code. Copied down onto this
    // verb it reads a TypeError from broken wiring as "the sandbox refused the bind", and logout
    // then deletes both credentials unserialised and reports success -- with an errno of
    // `undefined` as the only trace. Harmonising the two verbs' lock handling is the obvious
    // future edit; this test is what notices it.
    //
    // Both assertions are independent pins, each with its own defect, and both were measured.
    // The rejection: appending that `.catch` reddens this test alone. The `attempted` assertion:
    // wrapping the lock call in a try/catch that deletes best-effort before rethrowing -- the same
    // "be permissive when the lock machinery fails" family, and the likelier edit of the two --
    // also reddens this test alone. What does NOT isolate `attempted` is a deletion escaping
    // ahead of the lock on every path: that reddens six siblings too, because they pin the
    // ordering incidentally. Recorded because an earlier draft of this comment generalised from
    // that one mutation to "nothing isolates it", which would have invited the next reader to
    // delete the assertion as decorative.
    const attempted = [];
    const boom = new TypeError("acquireLock is not a function");
    await assert.rejects(() => m.cmdLogout("azure-mcp", LOGOUT_CFG, {
        deleteEntry: async (name) => { attempted.push(name); },
        acquireLock: async () => { throw boom; },
    }), (e) => e === boom, "the wiring error must reach the caller unchanged");
    assert.deepEqual(attempted, [], "and nothing may be deleted on the way past");
});

lockTest("the renewal, a login and a logout all lock on ONE name -- pre-occupied, not read off the source", async () => {
    // The source captures this by monkeypatching c.acquireLock (mcpw.test.js) -- unavailable
    // here for the same reason tokenLockFor's own test gives (this file, "tokenLockFor: project
    // scope keys the lock exactly the way keyFor keys the keystore entry"): cache.acquireLock is
    // a read-only ES module export. Proven instead by PRE-occupying the exact path keyFor's own
    // rule predicts and observing all three writers collide with it -- if any of them computed
    // its lock name some other way, it would bind its OWN, unoccupied lock instead of contending
    // on this one.
    //
    // An improvement on the source: login and logout are now both real, ported verbs (logout
    // resolves its own lock internally, the same way login always has), so both are
    // driven directly with `acquireLock: undefined` -- reaching the destructuring default is the
    // point, not omitting the key (the source's own comment on this test makes the same
    // distinction). The source could drive only the renewal's builder and the login verb this
    // way; its third writer was `m.tokenLockFor(arg)()` standing in for logout's wiring, because
    // logout's own lock was wired from its `main`, not from inside the verb.
    const entryName = "azure-mcp";
    const decl = { ...DECL_IDENTITY, kind: "oauth", scope: "project", home: "project", declaredName: entryName };
    const cfg = { oauth: { [entryName]: decl }, projectId: "lock-name-p1",
        registrations: { [DECL_IDENTITY.tenantId]: { [DECL_IDENTITY.clientId]: {} } } };
    const lockPath = cache.lockPathFor(entryName, cfg.projectId, { platform: process.platform, env: process.env });
    const holder = await cache.acquireLock(lockPath);
    // Captured before the assertion, and released defensively in the finally below: under a WRONG
    // scope key this comes back as a real, live-listening lock instead of HELD_BY_OTHER, and an
    // un-released listener keeps the process alive long after the assertion has already failed --
    // measured directly, mutating oauthLaunchDeps' own scope key hung this exact test until the
    // lock below was captured and released rather than only asserted on.
    let renewalLock = null;
    try {
        // Writer 1: the renewal path, oauthLaunchDeps' own acquireLock.
        renewalLock = await m.oauthLaunchDeps(entryName, decl, cfg, { backend: "gpg" }).acquireLock();
        assert.equal(renewalLock, cache.HELD_BY_OTHER, "oauthLaunchDeps must contend on the pre-occupied path");

        // Writer 2: cmdLogin, with its `acquireLock` left at the destructuring default. cmdLogin
        // treats a busy lock as a warning, not a refusal, so it still returns -- the log line is
        // the only signal that it actually contended on the SAME path rather than sailing through
        // on one of its own.
        const { deps: loginDepsObj, logged: loginLogged } = loginDeps({ acquireLock: undefined,
            now: () => 0, sleep: async () => {} });
        await m.cmdLogin(entryName, cfg, loginDepsObj);
        assert.match(loginLogged.join(""), /was still holding the lock/,
            "cmdLogin's default must contend on the same pre-occupied path");

        // Writer 3: cmdLogout, same default, but this verb treats a busy lock as fatal.
        let ms = 0;
        await assert.rejects(() => m.cmdLogout(entryName, cfg, {
            deleteEntry: async () => {}, acquireLock: undefined,
            now: () => (ms += 10_000), sleep: async () => {},
        }), /still refreshing/, "cmdLogout's default must contend on the same pre-occupied path");
    } finally {
        if (renewalLock && renewalLock !== cache.HELD_BY_OTHER) { await renewalLock.release(); }
        await holder.release();
    }
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

// -----
// The preload, run as a real process against the real channel or a raw-socket fixture

// The module URLs the fixtures below load, computed once from this test file's own URL so they
// resolve regardless of the spawned process's working directory.
const PRELOAD_URL = new URL("./vc-secrets-preload.mjs", import.meta.url).href;
const TARGET_URL = new URL("./vc-secrets-target.mjs", import.meta.url).href;

// The path/pipe a stub channel binds to. Named pipes on Windows have no filesystem lifetime to
// clean up, so only the POSIX branch registers a tmpDir for the `after()` sweep.
let pipeSeq = 0;
function stubChannelPath() {
    if (process.platform === "win32") {
        return `\\\\.\\pipe\\vcs-t16-${process.pid}-${pipeSeq++}`;
    }
    // /tmp rather than os.tmpdir(): a socket path is limited to sun_path's ~104-108 bytes, which a
    // redirected TMPDIR can exceed -- measured on Linux, the bind then lands silently at a truncated path.
    const dir = fs.mkdtempSync("/tmp/vcs-t16-");
    tmpDirs.push(dir);

    return path.join(dir, "c.sock");
}

// The preload's net.connect uses a filesystem socket / named pipe -- neither socketTest's TCP bind
// nor lockTest's abstract-namespace bind -- and a probe of the wrong privilege answers confidently
// either way (the file's own comment above lockTest records that defect once already).
let channelBindProbe = null;
function canBindChannel() {
    channelBindProbe ??= new Promise((resolve) => {
        let probePath;
        try {
            probePath = stubChannelPath();
        } catch {
            resolve(false);

            return;
        }
        const probe = net.createServer();
        probe.once("error", () => resolve(false));
        probe.once("listening", () => probe.close(() => resolve(true)));
        probe.listen(probePath);
    });

    return channelBindProbe;
}

const channelTest = (name, fn) => test(name, async (t) => {
    if (!(await canBindChannel())) {
        t.skip("needs an environment that permits a filesystem-socket bind");

        return;
    }
    await fn(t);
});

// ---- The token channel itself: createChannel, channelPipeName, CHANNEL_GREETING_MAX ----
//
// These drive the real channel directly, at the wire protocol -- no spawned process, no
// preload -- because that is the layer this block owns. The preload-level tests below (against
// startRawSocketFixture, and the five re-pointed at the real channel) are the integration half.

// Strips comments from a function's toString() before a source-text assertion matches it, so a
// comment or a disabled line quoting the same identifier cannot satisfy the match. Not a full
// parser: it tracks string/template literals, so a "//" or "/*" inside one is left alone, which
// covers every function in this file as written today. Known gaps it does NOT handle: a regex
// literal containing a quote character (read as an unterminated string), and a backtick nested
// inside a template literal's `${}` expression (read as closing the outer template).
function stripComments(src) {
    let out = "";
    let i = 0;
    while (i < src.length) {
        const two = src.slice(i, i + 2);
        if (two === "//") {
            const nl = src.indexOf("\n", i);
            if (nl < 0) {
                break;
            }
            i = nl;
            continue;
        }
        if (two === "/*") {
            const end = src.indexOf("*/", i + 2);
            i = end < 0 ? src.length : end + 2;
            continue;
        }
        const ch = src[i];
        if (ch === '"' || ch === "'" || ch === "`") {
            out += ch;
            i += 1;
            while (i < src.length && src[i] !== ch) {
                if (src[i] === "\\") {
                    out += src[i] + (src[i + 1] ?? "");
                    i += 2;
                    continue;
                }
                out += src[i];
                i += 1;
            }
            out += src[i] ?? "";
            i += 1;
            continue;
        }
        out += ch;
        i += 1;
    }

    return out;
}

// A raw client for the real channel's wire protocol: one JSON greeting line out, then whatever
// comes back. Used only by the tests below that drive createChannel directly.
function connectAndGreet(channelPath, { nonce }) {
    return new Promise((resolve, reject) => {
        const sock = net.connect(channelPath);
        let received = "";
        // The one caller expects a REFUSAL, i.e. the server closing the connection. Without a
        // bound, a broken refusal (the defect that test exists to catch) hangs the whole suite
        // instead of failing it -- this timer turns that into an ordinary failed assertion.
        const timer = setTimeout(() => {
            sock.destroy();
            // What was actually received, not just that a timeout fired: a leaked token frame
            // and a merely-slow server both time out identically otherwise, and only one of them
            // is the defect this helper's callers exist to catch.
            reject(new Error(`connectAndGreet: the server never closed the connection; received ${JSON.stringify(received)}`));
        }, 2000);
        sock.once("connect", () => sock.write(JSON.stringify({ nonce }) + "\n"));
        sock.on("data", (chunk) => { received += chunk.toString("utf8"); });
        sock.once("close", () => { clearTimeout(timer); resolve(received); });
        sock.once("error", (e) => { clearTimeout(timer); reject(e); });
    });
}

// Writes raw bytes with no framing at all -- for the oversize-greeting case, which must never
// see a newline.
function connectAndSend(channelPath, raw) {
    return new Promise((resolve, reject) => {
        const sock = net.connect(channelPath);
        const timer = setTimeout(() => {
            sock.destroy();
            reject(new Error("connectAndSend: the server never closed the connection"));
        }, 2000);
        sock.once("connect", () => sock.write(raw));
        sock.once("close", () => { clearTimeout(timer); resolve(); });
        sock.once("error", (e) => { clearTimeout(timer); reject(e); });
    });
}

// Greets and resolves with the token from the first frame the channel sends back.
function connectAndReadToken(channelPath, { nonce }) {
    return new Promise((resolve, reject) => {
        const sock = net.connect(channelPath);
        let buf = "";
        // A dropped delivery (the defect these tests exist to catch) otherwise hangs the whole
        // suite instead of failing it.
        const timer = setTimeout(() => {
            sock.destroy();
            reject(new Error("connectAndReadToken: no token frame arrived"));
        }, 2000);
        sock.once("connect", () => sock.write(JSON.stringify({ nonce }) + "\n"));
        sock.on("data", (chunk) => {
            buf += chunk.toString("utf8");
            const nl = buf.indexOf("\n");
            if (nl >= 0) {
                clearTimeout(timer);
                sock.destroy();
                try {
                    resolve(JSON.parse(buf.slice(0, nl)).token);
                } catch (e) {
                    reject(e);
                }
            }
        });
        sock.once("error", (e) => { clearTimeout(timer); reject(e); });
    });
}

// Greets and resolves once the FIRST frame arrives, leaving the socket open -- unlike
// connectAndReadToken, which destroys it. A first frame is proof of authentication (the server
// serves `latest` to it the instant it authenticates), so this makes "is this client
// authenticated yet" observable instead of assumed after a fixed delay. Returns { sock, first,
// next } -- `next()` awaits the frame after that one, bounded by the same 2s as the other
// helpers here; the caller owns destroying `sock`.
//
// A frame that arrives before `next()` is called is queued rather than dropped: a caller driving
// two clients (push, then await client A's next(), then client B's) has B's frame land during the
// await on A -- with no queue that frame is lost and B's later next() hangs forever.
function connectAndAwaitAuth(channelPath, { nonce }) {
    return new Promise((resolve, reject) => {
        const sock = net.connect(channelPath);
        let buf = "";
        let authenticated = false;
        const queue = [];
        let pending = null;
        const timer = setTimeout(() => {
            sock.destroy();
            reject(new Error("connectAndAwaitAuth: no token frame arrived"));
        }, 2000);
        const deliver = (token) => {
            if (pending !== null) {
                pending.resolve(token);
                pending = null;
            } else {
                queue.push(token);
            }
        };
        sock.once("connect", () => sock.write(JSON.stringify({ nonce }) + "\n"));
        sock.on("data", (chunk) => {
            buf += chunk.toString("utf8");
            let nl;
            while ((nl = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, nl);
                buf = buf.slice(nl + 1);
                let token;
                try {
                    token = JSON.parse(line).token;
                } catch (e) {
                    if (pending !== null) {
                        pending.reject(e);
                        pending = null;
                    }
                    continue;
                }
                if (!authenticated) {
                    authenticated = true;
                    clearTimeout(timer);
                    // Same 2s bound as connectAndReadToken's: a push that returns a delivered
                    // count but writes nothing (or a server that stops serving a client it
                    // already authenticated) must not hang the run with no failure text.
                    const next = () => {
                        if (queue.length > 0) {
                            return Promise.resolve(queue.shift());
                        }

                        return new Promise((res, rej) => {
                            const nextTimer = setTimeout(() => {
                                pending = null;
                                rej(new Error("connectAndAwaitAuth: next() timed out waiting for a frame"));
                            }, 2000);
                            pending = {
                                resolve: (v) => { clearTimeout(nextTimer); res(v); },
                                reject: (e) => { clearTimeout(nextTimer); rej(e); },
                            };
                        });
                    };
                    resolve({ sock, first: token, next });
                } else {
                    deliver(token);
                }
            }
        });
        sock.once("error", (e) => { clearTimeout(timer); reject(e); });
    });
}

channelTest("a client presenting no nonce or a wrong one is refused and gets no token", async () => {
    // The channel is reachable by any same-user process; the nonce is mandatory rather
    // than defence in depth. Covers BOTH halves of the title -- a greeting with no `nonce` field
    // at all, and one with a wrong value -- because the source reads `JSON.parse(...).nonce`, so
    // a missing field and a wrong value reach the same comparison but are not the same input, and
    // a matcher that special-cases "absent" (accepting it) would pass a title that only ever
    // tested "wrong". Each half pushes BEFORE connecting: without that, "received nothing" has
    // two causes (refused, or simply never served). A leak is then observable either way --
    // `received` carries it if the connection still closes, and connectAndGreet's own timeout
    // names it if a wrongly-accepted client is instead left open. The wrong-nonce half is also
    // ported, faithfully, at the process level: mcpw.test.js below.
    const refusals = [];
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "right",
        onRefusal: (w) => refusals.push(w) });
    try {
        ch.push("t1");
        const missing = await connectAndGreet(ch.path, {});
        assert.deepEqual(refusals, ["nonce"]);
        assert.equal(missing, "", "a client with no nonce field must receive no token frame");

        ch.push("t2");
        const wrong = await connectAndGreet(ch.path, { nonce: "wrong" });
        assert.deepEqual(refusals, ["nonce", "nonce"]);
        assert.equal(wrong, "", "a client with a wrong nonce must receive no token frame");
    } finally {
        await ch.close();
    }
});

test("a wrong-LENGTH nonce is not distinguishable from a wrong-value one", () => {
    // timingSafeEqual throws on unequal lengths, so both sides are hashed to equal length first.
    // No behavioural seam can observe this -- the catch turns either kind of mismatch into the
    // same "nonce" refusal -- so this asserts on source text, with comments stripped first.
    // Matching the two identifiers separately proves nothing: nonceDigest's OWN construction
    // also calls createHash("sha256"), so a mutant comparing raw presented/nonce values still
    // satisfies two lone matches. The binding under test is the timingSafeEqual CALL itself --
    // its first argument hashing `presented`, its second the digest built from `nonce`.
    const src = stripComments(m.createChannel.toString());
    assert.match(src, /crypto\.timingSafeEqual\(crypto\.createHash\("sha256"\)\.update\(String\(presented\)\)\.digest\(\), nonceDigest\)/);
    assert.match(src, /const nonceDigest = crypto\.createHash\("sha256"\)\.update\(String\(nonce\)\)\.digest\(\);/);
});

channelTest("an oversize greeting is refused rather than buffered without bound", async () => {
    const refusals = [];
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n",
        onRefusal: (w) => refusals.push(w) });
    try {
        await connectAndSend(ch.path, "x".repeat(m.CHANNEL_GREETING_MAX + 1));
        assert.deepEqual(refusals, ["oversize"]);
    } finally {
        await ch.close();
    }
});

channelTest("a client that authenticates AFTER a push still receives the latest token", async () => {
    // A push reaching only the sockets connected AT THAT INSTANT is lost with no error anywhere
    // when the server has not finished starting -- and the session then runs to the expiry of
    // its env token, which is the failure the channel exists to prevent. Ported from
    // mcpw.test.js, at the channel's own level rather than through a spawned preload.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n" });
    try {
        assert.equal(ch.push("t1"), 0);
        assert.equal(await connectAndReadToken(ch.path, { nonce: "n" }), "t1");
    } finally {
        await ch.close();
    }
});

channelTest("the socket is private to this uid, and its directory goes on close", async () => {
    // Ported from mcpw.test.js.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n" });
    const dir = path.dirname(ch.path);
    if (process.platform !== "win32") {
        assert.equal(fs.statSync(ch.path).mode & 0o777, 0o600);
        assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
    }
    await ch.close();
    if (process.platform !== "win32") {
        assert.equal(fs.existsSync(dir), false, "one leftover directory per launch, otherwise");
    }
    // Asserted on BOTH platforms, because on Windows the two above are not: a named pipe has no
    // directory and no mode bits, so without this the whole test degrades to "create a channel,
    // close it, assert nothing" there -- and a close() that never released the endpoint is green.
    await assert.rejects(() => new Promise((resolve, reject) => {
        const probe = net.connect(ch.path);
        probe.once("connect", () => { probe.destroy(); resolve(); });
        probe.once("error", reject);
    }), "a closed channel must not still accept clients");
});

channelTest("close() releases the endpoint, not merely the directory", async (t) => {
    // Ported from mcpw.test.js. The connect assertion in "the socket is private to this uid, and its
    // directory goes on close" cannot fail on POSIX: close() removes the whole directory, so a
    // connect answers ENOENT whether or not the listener was ever released. Suppressing only the
    // directory teardown makes the guarantee falsifiable: node unlinks a unix socket exactly when
    // the server closes and not before, so with the directory still present, the FILE's absence is
    // the release, and its presence is a listener that outlived its channel.
    if (process.platform === "win32") {
        t.skip("no directory to suppress -- the connect assertion in the uid-privacy case is load-bearing there");

        return;
    }
    let dir = null;
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n",
        rm: (d) => { dir = d; } });
    try {
        await ch.close();
        assert.ok(dir !== null && fs.existsSync(dir),
            "the directory must survive, or the socket's absence would prove nothing");
        assert.equal(fs.existsSync(ch.path), false,
            "the socket file outliving close() means the listener did too");
    } finally {
        fs.rmSync(dir ?? "/nonexistent", { recursive: true, force: true });
    }
});

channelTest("close() destroys still-open client sockets rather than waiting for them to drain", async () => {
    // Neither "the socket is private to this uid, and its directory goes on close" nor "close()
    // releases the endpoint, not merely the directory" ever leaves a connection open when close()
    // runs, so neither can catch this comment's own claim going missing: server.close() alone waits
    // for every open connection to end, and a client that never destroys its own end would turn
    // teardown into a hang. Authentication is made OBSERVABLE -- the client waits for the pushed
    // frame `latest` serves on a successful greet -- rather than assumed after a fixed delay, which
    // under load can fail this test for the wrong reason (the socket not yet in `clients` when
    // close() runs).
    // Racing close() against a timer is the only way to see "did not hang" without actually
    // hanging this suite if it regresses.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n" });
    let sock = null;
    try {
        ch.push("t1");
        const auth = await connectAndAwaitAuth(ch.path, { nonce: "n" });
        sock = auth.sock;
        assert.equal(auth.first, "t1", "the client must be authenticated before close() races it");
        const closed = ch.close().then(() => "closed");
        const timedOut = new Promise((resolve) => { setTimeout(() => resolve("timed-out"), 2000); });
        assert.equal(await Promise.race([closed, timedOut]), "closed",
            "a live, un-destroyed client must not turn close() into a hang");
        await closed;
    } finally {
        // Guarded: connectAndAwaitAuth rejecting (its own 2s bound) would otherwise skip both the
        // socket destroy and ch.close(), leaking a listener into the rest of the run.
        if (sock !== null) {
            sock.destroy();
        }
        await ch.close().catch(() => {});
    }
});

channelTest("the channel path is a filesystem socket, never the lock's abstract namespace", async () => {
    // NOT the lock's namespace, on purpose (see the comment above createChannel): an abstract
    // name has no mode bits, and a token needs the 0600 the "socket is private to this uid" test
    // above checks -- the lock never carries a secret, which is why it can afford one.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n" });
    try {
        assert.ok(!ch.path.startsWith("\0"), "an abstract name has no mode bits to set");
    } finally {
        await ch.close();
    }
});

test("channelPipeName: two users, two scopes, two servers and two launches never share a pipe", () => {
    // Ported from mcpw.test.js, extended with two scopes -- the property scopeKey adds and
    // the source could not have had. The Windows channel has no mode bits, so the NAME is the
    // whole of what separates one developer's, one project's, or one launch's token stream from
    // another's.
    const at = (user, scopeKey, name, pid) => m.channelPipeName(name, scopeKey, { env: { USERNAME: user }, pid });
    assert.match(at("usera", "p1", "azure-mcp", 1234), /^\\\\\.\\pipe\\vc-secrets-ch-usera-p1-azure-mcp-1234$/);
    assert.notEqual(at("usera", "p1", "azure-mcp", 1234), at("userb", "p1", "azure-mcp", 1234), "two users");
    assert.notEqual(at("usera", "p1", "azure-mcp", 1234), at("usera", "p2", "azure-mcp", 1234), "two scopes");
    assert.notEqual(at("usera", "p1", "azure-mcp", 1234), at("usera", "p1", "github", 1234), "two servers");
    assert.notEqual(at("usera", "p1", "azure-mcp", 1234), at("usera", "p1", "azure-mcp", 5678), "two launches");
    assert.equal(at("dom\\user", "p1", "a/b", 1), "\\\\.\\pipe\\vc-secrets-ch-dom_user-p1-a_b-1",
        "a separator in either name cannot reshape the pipe path");
});

test("a channel that cannot accept a client degrades to no renewal, never to a dead session", async () => {
    // A net.Server with NO listener for "error" throws -- into uncaughtException and out through
    // fail(). Driven behaviourally rather than by matching source text: net.createServer is
    // wrapped for this one call so the real server createChannel builds is captured, then a real
    // "error" is emitted at it and the actual outcome (reported, not thrown) is observed. This
    // catches a deletion, a REORDER of removeAllListeners/on (measured: the text match alone
    // stays green across a reorder, because it does not care about order, while the reordered
    // code ends up with zero listeners and throws), and a relocation of the reporter -- not only
    // its presence in the text.
    let captured = null;
    const realCreateServer = net.createServer;
    net.createServer = (...args) => {
        captured = realCreateServer(...args);

        return captured;
    };
    let ch;
    try {
        ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n" });
    } finally {
        net.createServer = realCreateServer;
    }
    try {
        assert.ok(captured !== null, "createChannel must have created a server to capture");
        const written = [];
        const realWriteSync = fs.writeSync;
        fs.writeSync = (fd, data) => { written.push([fd, data]); };
        try {
            assert.doesNotThrow(() => {
                captured.emit("error", Object.assign(new Error("synthetic"), { code: "EMFILE" }));
            }, "an error after listen must be reported, never thrown");
        } finally {
            fs.writeSync = realWriteSync;
        }
        assert.ok(written.some(([fd, data]) => fd === 2 && String(data).includes("EMFILE")),
            "the error must be reported on fd 2, naming its code");
    } finally {
        // ch is undefined if createChannel itself threw above -- ch.close() there would raise a
        // TypeError that masks the real failure.
        await ch?.close();
    }
});

channelTest("a failure after the directory exists takes the directory with it", async (t) => {
    // Ported from mcpw.test.js. mkdtemp runs before the bind, and the launcher's own exit
    // handler is not registered yet -- so a throw here leaves the directory (and a live
    // listener) behind with nothing to remove it.
    if (process.platform === "win32") {
        t.skip("a named pipe has no directory, so chmod is never reached");

        return;
    }
    let dir = null;
    await assert.rejects(() => m.createChannel({ name: "s", scopeKey: "p1", nonce: "n",
        chmod: (p) => { dir = path.dirname(p); throw new Error("chmod refused"); } }), /chmod refused/);
    assert.ok(dir !== null, "the failure must happen after the directory exists, or this proves nothing");
    assert.equal(fs.existsSync(dir), false);
});

channelTest("the channel serves every authenticated client, so an earlier matching process cannot starve the server of renewals", async () => {
    // Both clients must be authenticated before the SECOND push, or the count below proves
    // nothing about a second client -- a late one is already covered by the "authenticates AFTER
    // a push" test above via `latest`, which is a different mechanism from this one. Authentication
    // is made observable (each client waits for the first pushed frame) rather than assumed after
    // a fixed delay, which under load can fail this test for the wrong reason.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n" });
    let a = null;
    let b = null;
    try {
        ch.push("first");
        a = await connectAndAwaitAuth(ch.path, { nonce: "n" });
        b = await connectAndAwaitAuth(ch.path, { nonce: "n" });
        assert.equal(a.first, "first");
        assert.equal(b.first, "first");
        assert.equal(ch.push("shared-token"), 2, "an earlier matching process must not have taken the only slot");
        assert.equal(await a.next(), "shared-token");
        assert.equal(await b.next(), "shared-token");
    } finally {
        // Guarded: either connectAndAwaitAuth call rejecting (its own 2s bound) would otherwise
        // skip the sockets' destroy and ch.close(), leaking a listener into the rest of the run.
        if (a !== null) {
            a.sock.destroy();
        }
        if (b !== null) {
            b.sock.destroy();
        }
        await ch.close().catch(() => {});
    }
});

// A raw-socket fixture, not a stand-in for the channel's own checks: it exists because it can
// write bytes DETERMINISTICALLY -- a split frame, an unparsable frame, a null frame, or two
// frames coalesced into one write. Real pushes DO arrive at a reader as one chunk (measured), but
// this fixture writes both frames in a single write() call, so the coalesced-frame test does not
// depend on how the OS happens to chunk two separate ones. It can also observe a connection that
// never authenticates (`connections`) -- not a REFUSED one: a wrong nonce, an unparsable
// greeting, and an oversize greeting are all refused and reported via `onRefusal` on the real
// channel. The unexposed case is a connection that never sends a COMPLETE greeting line at all,
// which is what stub.connections pins for "a process that is not the target takes no action on
// either fd" below.
function startRawSocketFixture(onGreeting) {
    const channelPath = stubChannelPath();
    const greetings = [];
    const sockets = new Set();
    const server = net.createServer((sock) => {
        sockets.add(sock);
        sock.on("error", () => {});
        let buf = "";
        const onData = (chunk) => {
            buf += chunk.toString("utf8");
            const nl = buf.indexOf("\n");
            if (nl < 0) {
                return;
            }
            sock.off("data", onData);
            let greeting;
            try {
                greeting = JSON.parse(buf.slice(0, nl));
            } catch {
                greeting = { unparsable: true };
            }
            greetings.push(greeting);
            onGreeting(sock);
        };
        sock.on("data", onData);
    });

    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(channelPath, () => {
            resolve({
                path: channelPath,
                greetings,
                get connections() {
                    return sockets.size;
                },
                close: async () => {
                    for (const sock of sockets) {
                        sock.destroy();
                    }
                    await new Promise((res) => server.close(res));
                },
            });
        });
    });
}

// A throwaway entry-script file under its own tmp dir, at the relative path a fixture wants the
// preload to see as process.argv[1].
function writeEntry(relPath, body) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-t16-entry-"));
    tmpDirs.push(dir);
    const full = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);

    return full;
}

// The child polls rather than sleeping a fixed time: a fixed wait either flakes under load or pays
// its full cost on every run, and the negative cases need a SHORT deadline they must survive.
function pollingBody(varName, waitMs) {
    return `
        // Report on fd 2 only: fd 1 in the real server is the client's JSON-RPC stream.
        let waited = 0;
        const tick = setInterval(() => {
            const v = process.env.${varName};
            waited += 25;
            if (v || waited >= ${waitMs}) {
                clearInterval(tick);
                process.stderr.write("VAR=" + (v ?? "<unset>") + "\\n");
                process.exit(0);
            }
        }, 25);
    `;
}

// Runs one entry script as a real child process. The preload path is routed through
// buildChildEnv, exactly as mcpw.test.js's runWithPreload routes its own: the quoted
// file: URL node has to parse back out of NODE_OPTIONS is the delivery path's last mile, and
// composing it here by hand would never exercise the function a real launch actually uses.
function runEntry(entry, env, { preload = true, timeoutMs = 10000 } = {}) {
    let childEnv = { ...process.env };
    delete childEnv.NODE_OPTIONS;
    // buildChildEnv's own sanitizeEnv only drops DANGEROUS_ENV_VARS, never these -- so this scrub
    // stays even routed through it, or a stray VC_SECRETS_* left over in this test process would
    // leak into every child and these tests would start depending on the ambient environment.
    for (const key of Object.keys(childEnv)) {
        if (/^VC_SECRETS_/i.test(key)) {
            delete childEnv[key];
        }
    }
    if (preload) {
        // Seeded and deleted below, so that "the preload assigned it" stays observable: with the
        // launch's own initial token already in place the fixture would report that instead of
        // the delivery (mcpw.test.js's runWithPreload does the same).
        const composed = m.buildChildEnv(childEnv, {
            token: "seed-token-that-must-not-be-visible",
            envVar: env.VC_SECRETS_TOKEN_ENV,
            channelPath: env.VC_SECRETS_TOKEN_CHANNEL,
            nonce: env.VC_SECRETS_CHANNEL_NONCE,
            preloadPath: m.PRELOAD_PATH,
            targetPackage: env.VC_SECRETS_TARGET_PACKAGE,
            binName: env.VC_SECRETS_TARGET_BIN,
        });
        // Unguarded, as the source is. Were the name ever absent, buildChildEnv would have written
        // the seed under a key literally spelled "undefined", and that is exactly the key this
        // line then removes -- a `!== undefined` guard would skip it and hand the seed to the child.
        delete composed[env.VC_SECRETS_TOKEN_ENV];
        childEnv = composed;
    }
    // The caller's overrides land last, so a fixture can still steer what the child sees after
    // buildChildEnv has composed it. The `undefined` branch below is defence, not the mechanism:
    // node's spawn already omits an env key whose value is undefined (measured on v22.23.2 --
    // the child reports the key as absent, not as the string "undefined"), so the "malformed
    // target package" fixture would get an absent key with or without it.
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined) {
            delete childEnv[key];
        } else {
            childEnv[key] = value;
        }
    }

    return new Promise((resolve) => {
        const child = spawn(process.execPath, [entry], { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        let err = "";
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeoutMs);
        child.stdout.on("data", (d) => { out += d; });
        child.stderr.on("data", (d) => { err += d; });
        child.once("exit", (code) => {
            clearTimeout(timer);
            resolve({ out, err, code, timedOut });
        });
    });
}

function preloadEnv(stub, overrides = {}) {
    return {
        VC_SECRETS_TOKEN_CHANNEL: stub.path,
        VC_SECRETS_CHANNEL_NONCE: "right-nonce",
        VC_SECRETS_TOKEN_ENV: "SERVER_TOKEN",
        VC_SECRETS_TARGET_PACKAGE: "@vendor/server",
        VC_SECRETS_TARGET_BIN: "",
        ...overrides,
    };
}

const TARGET_ENTRY = "node_modules/@vendor/server/dist/index.js";

channelTest("a target process receives the token into the variable its own environment names, and writes nothing on fd 1", async () => {
    // Moved from a stub to the real createChannel: pushed before the child starts,
    // so `latest` serves it once the preload authenticates -- the delivery itself is now the
    // proof of the handshake that `stub.greetings` used to stand for.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "right-nonce" });
    try {
        ch.push("delivered-token");
        const entry = writeEntry(TARGET_ENTRY, pollingBody("SERVER_TOKEN", 5000));
        const { out, err } = await runEntry(entry, preloadEnv(ch));
        assert.match(err, /VAR=delivered-token/);
        assert.equal(out, "", "the preload must never write on fd 1");
    } finally {
        await ch.close();
    }
});

channelTest("preload: a wrong nonce is refused and nothing is assigned", async () => {
    // Faithful port of mcpw.test.js, against the real createChannel: a push BEFORE the
    // wrong-nonce child runs is what makes "nothing is assigned" a claim about the refusal rather
    // than about a token that was simply never sent. "a client presenting no nonce or a wrong one
    // is refused and gets no token" pins the same refusal at the channel's own API; this one pins
    // it at the process boundary the preload actually crosses.
    const refusals = [];
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "right-nonce",
        onRefusal: (w) => refusals.push(w) });
    try {
        ch.push("delivered-token");
        const entry = writeEntry(TARGET_ENTRY, pollingBody("SERVER_TOKEN", 800));
        const { out, err } = await runEntry(entry, preloadEnv(ch, { VC_SECRETS_CHANNEL_NONCE: "wrong-nonce" }));
        assert.match(err, /VAR=<unset>/);
        assert.equal(out, "");
        assert.deepEqual(refusals, ["nonce"], "the refusal must be observable, or this test cannot fail");
    } finally {
        await ch.close();
    }
});

channelTest("a process that is not the target takes no action on either fd", async () => {
    const stub = await startRawSocketFixture((sock) => {
        sock.write(JSON.stringify({ token: "delivered-token" }) + "\n");
    });
    try {
        const entry = writeEntry("node_modules/some-other-pkg/dist/index.js", pollingBody("SERVER_TOKEN", 800));
        const { out, err } = await runEntry(entry, preloadEnv(stub));
        assert.match(err, /VAR=<unset>/);
        assert.equal(out, "");
        assert.ok(!/vc-secrets preload/.test(err));
        assert.equal(stub.connections, 0, "no connection at all, not merely no assignment");
    } finally {
        await stub.close();
    }
});

channelTest("a frame split across two writes is reassembled, not dropped", async () => {
    // A stream socket may split writes; "one chunk is one frame" works on every machine it is
    // tried on and fails as a silently ignored renewal.
    const stub = await startRawSocketFixture((sock) => {
        sock.write('{"tok');
        setTimeout(() => sock.write('en":"split-token"}\n'), 100);
    });
    try {
        const entry = writeEntry(TARGET_ENTRY, pollingBody("SERVER_TOKEN", 5000));
        const { err } = await runEntry(entry, preloadEnv(stub));
        assert.match(err, /VAR=split-token/);
        assert.ok(!/unreadable/.test(err));
    } finally {
        await stub.close();
    }
});

channelTest("of frames coalesced into one write, the last one wins", async () => {
    const stub = await startRawSocketFixture((sock) => {
        sock.write('{"token":"first"}\n{"token":"second"}\n');
    });
    try {
        const entry = writeEntry(TARGET_ENTRY, pollingBody("SERVER_TOKEN", 5000));
        const { err } = await runEntry(entry, preloadEnv(stub));
        assert.match(err, /VAR=second/);
    } finally {
        await stub.close();
    }
});

channelTest("an unreadable frame is reported on fd 2 without echoing any of it, and reading continues", async () => {
    const stub = await startRawSocketFixture((sock) => {
        sock.write('NOT-JSON-secret-prefix\n{"token":"after"}\n');
    });
    try {
        const entry = writeEntry(TARGET_ENTRY, pollingBody("SERVER_TOKEN", 5000));
        const { out, err } = await runEntry(entry, preloadEnv(stub));
        assert.ok(err.includes("vc-secrets preload: unreadable channel frame, ignored"));
        // Node embeds the first ten characters of the input in a JSON SyntaxError, and on this
        // channel the input is a token.
        assert.ok(!err.includes("NOT-JSON"));
        assert.match(err, /VAR=after/);
        assert.equal(out, "");
    } finally {
        await stub.close();
    }
});

channelTest("a null frame is ignored, and reading continues", async () => {
    const stub = await startRawSocketFixture((sock) => {
        sock.write('null\n{"token":"after"}\n');
    });
    try {
        const entry = writeEntry(TARGET_ENTRY, pollingBody("SERVER_TOKEN", 5000));
        const { err, code } = await runEntry(entry, preloadEnv(stub));
        assert.match(err, /VAR=after/);
        assert.equal(code, 0);
    } finally {
        await stub.close();
    }
});

channelTest("an unreachable channel is reported on fd 2 and costs the renewal, never the process", async () => {
    // Nothing listens at this path.
    const entry = writeEntry(TARGET_ENTRY, 'setTimeout(() => process.stderr.write("MAIN RAN\\n"), 300);');
    const { out, err, code } = await runEntry(entry, preloadEnv({ path: stubChannelPath() }));
    assert.equal(code, 0, "an unhandled socket 'error' event ends the server process");
    assert.match(err, /MAIN RAN/);
    assert.match(err, /vc-secrets preload: channel error: \S/);
    assert.equal(out, "", "fd 1 is the client's JSON-RPC stream");
});

channelTest("the token receiver does not keep the server process alive", async () => {
    // Moved from a stub to the real createChannel: pushed before the child starts.
    // The old positive control (`stub.greetings.length === 1`) is replaced by the delivery
    // itself -- the entry now also polls and reports the variable, without exiting on it, so the
    // "MAIN DONE" / timedOut assertions this test is actually named for still run on their own
    // timing and are not raced by the poll's own exit(0).
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "right-nonce" });
    try {
        ch.push("delivered-token");
        const entry = writeEntry(TARGET_ENTRY, `
            let waited = 0;
            const tick = setInterval(() => {
                const v = process.env.SERVER_TOKEN;
                waited += 25;
                if (v || waited >= 800) {
                    clearInterval(tick);
                    process.stderr.write("VAR=" + (v ?? "<unset>") + "\\n");
                }
            }, 25);
            setTimeout(() => process.stderr.write("MAIN DONE\\n"), 300);
        `);
        const { err, code, timedOut } = await runEntry(entry, preloadEnv(ch), { timeoutMs: 4000 });
        assert.equal(timedOut, false, "an un-unref'd socket keeps the server alive until the launcher goes away");
        assert.equal(code, 0);
        assert.match(err, /MAIN DONE/);
        assert.match(err, /VAR=delivered-token/, "positive control: the receiver WAS connected and assigned the token");
    } finally {
        await ch.close();
    }
});

channelTest("a missing or malformed target package costs the renewal, never the process", async () => {
    // A throw in a module loaded through --import exits 1 before the entry script runs (measured on
    // node 22), so a throwing matcher would end this process before "MAIN RAN" is ever written.
    // Moved from a stub to the real createChannel: `stub.connections === 0` is
    // replaced by the delivery itself -- the entry polls too. VAR=<unset> shows no token reached
    // the process; it does NOT distinguish "no connection was attempted" from "a connection
    // attempted but never authenticated", which the real channel exposes to no caller.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "right-nonce" });
    try {
        ch.push("delivered-token");
        const entry = writeEntry(TARGET_ENTRY,
            'process.stderr.write("MAIN RAN\\n");' + pollingBody("SERVER_TOKEN", 300));
        for (const targetPackage of [undefined, ".*"]) {
            const { err, code } = await runEntry(entry, preloadEnv(ch, { VC_SECRETS_TARGET_PACKAGE: targetPackage }));
            assert.equal(code, 0);
            assert.match(err, /MAIN RAN/);
            assert.match(err, /VAR=<unset>/, "a malformed target package must never let the token through");
        }
    } finally {
        await ch.close();
    }
});

channelTest("importing the target module wakes no receiver; importing the preload does", async () => {
    // Both halves, because "wakes nothing" alone passes for a fixture that cannot observe a
    // receiver at all. Moved from a stub to the real createChannel: both
    // `stub.connections` assertions are dropped -- the VAR=<unset> / VAR=delivered-token
    // assertions already below them are the delivery itself, and the real channel exposes no
    // connection count to replace them with.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "right-nonce" });
    try {
        ch.push("delivered-token");
        const entryA = writeEntry(TARGET_ENTRY,
            `import(${JSON.stringify(TARGET_URL)}).then(() => { ${pollingBody("SERVER_TOKEN", 800)} });`);
        const runA = await runEntry(entryA, preloadEnv(ch), { preload: false });
        assert.match(runA.err, /VAR=<unset>/);

        const entryB = writeEntry(TARGET_ENTRY,
            `import(${JSON.stringify(PRELOAD_URL)}).then(() => { ${pollingBody("SERVER_TOKEN", 5000)} });`);
        const runB = await runEntry(entryB, preloadEnv(ch), { preload: false });
        assert.match(runB.err, /VAR=delivered-token/);
    } finally {
        await ch.close();
    }
});

// ---------------------------------------------------------------------------------------------
// cmdLaunch — the oauth-branch tests that need a REAL bound channel, so they run under
// channelTest rather than plain `test` (see the comment above channelTest, and the sandbox note
// above lockTest: a unix-domain-socket / filesystem-socket bind is refused here, and skipping is
// the expected outcome, not a signal). The tests that never reach createChannel at all live in
// vc-secrets.test.mjs beside the rest of cmdLaunch's coverage.
//
// Ported from mcpw.js's cmdRun and mcpw.test.js's own cmdRun test block: cmdRun(server, cfg, deps)
// becomes cmdLaunch(kind, name, cfg, deps), McpwError becomes VcSecretsError, MCPW_* becomes
// VC_SECRETS_*.
// ---------------------------------------------------------------------------------------------

const launcherModuleUrl = new URL("./vc-secrets.mjs", import.meta.url).href;

// A minimal stand-in for a spawned child: never signalled in these tests. Pid-less on purpose:
// cmdLaunch kills the child's process GROUP when the launcher exits, and a pid borrowed from a real
// process -- this one's, once -- would name a group that may be the runner's own.
function fakeChild() {
    return new EventEmitter();
}

// A launchable declared entirely at USER scope, so neither the oauth entry nor the server it is
// referenced from needs a registration grant (resolveEnvEntries exempts a user-scope launchable
// outright) or a projectId (keyFor and cmdLaunch's scopeKey both short-circuit on
// decl.scope === "user"). That keeps these tests about the launch mechanics cmdLaunch adds, not
// about the authorization machinery vc-secrets.test.mjs already covers.
const CMD_LAUNCH_OAUTH_DECL = { ...DECL_IDENTITY, scope: "user", home: "user", kind: "oauth",
    declaredName: "ado", targetPackage: "some-oauth-package" };
const CMD_LAUNCH_CFG = {
    projectId: null,
    oauth: { ado: CMD_LAUNCH_OAUTH_DECL },
    servers: { s: { command: "npx", args: ["-y", "some-oauth-package"], scope: "user", home: "user",
        env: { ADO_TOKEN: "oauth:ado" } } },
};

channelTest("cmdLaunch: the oauth server is launched with the token, the channel and the preload", async () => {
    let seen = null;
    const handle = await m.cmdLaunch("servers", "s", CMD_LAUNCH_CFG, {
        childNodeVersion: () => "v20.11.0",
        readCache: async () => ({ state: "valid", accessToken: "cached" }),
        spawnFn: (cmd, args, opts) => { seen = opts.env; return fakeChild(); },
    });
    try {
        assert.equal(seen.ADO_TOKEN, "cached");
        assert.equal(seen.VC_SECRETS_TOKEN_ENV, "ADO_TOKEN");
        assert.equal(seen.VC_SECRETS_TOKEN_CHANNEL, handle.channel.path);
        assert.match(seen.NODE_OPTIONS, /^--import "file:\/\/.*vc-secrets-preload\.mjs"$/);
        assert.ok(seen.VC_SECRETS_CHANNEL_NONCE?.length >= 20, "a guessable nonce is the only gate on Windows");
    } finally {
        await handle.dispose();
    }
});

channelTest("cmdLaunch: the channel directory is gone once the launch is disposed", async () => {
    const handle = await m.cmdLaunch("servers", "s", CMD_LAUNCH_CFG, {
        childNodeVersion: () => "v20.11.0",
        readCache: async () => ({ state: "valid", accessToken: "cached" }),
        spawnFn: () => fakeChild(),
    });
    const dir = path.dirname(handle.channel.path);
    await handle.dispose();
    if (process.platform !== "win32") {
        assert.equal(fs.existsSync(dir), false);
    }
});

channelTest("cmdLaunch: dispose detaches the exit handler that removes the channel directory", async () => {
    // A delta, not a count: the runner has "exit" listeners of its own. Only the oauth path
    // installs this one, so it cannot be pinned from the plain cmdLaunch tests.
    const before = process.listenerCount("exit");
    const handle = await m.cmdLaunch("servers", "s", CMD_LAUNCH_CFG, {
        childNodeVersion: () => "v20.11.0",
        readCache: async () => ({ state: "valid", accessToken: "cached" }),
        spawnFn: () => fakeChild(),
    });
    assert.equal(process.listenerCount("exit"), before + 1);
    await handle.dispose();
    // Left attached, the closure holds a channel that is already closed, and each later launch in
    // this process adds another.
    assert.equal(process.listenerCount("exit"), before);
});

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
        const before = new Set(fs.readdirSync("/tmp").filter((x) => x.startsWith("vc-secrets-ch-")));
        m.cmdLaunch("servers", "s", ${JSON.stringify(CMD_LAUNCH_CFG)}, {
            readCache: async () => ({ state: "valid", accessToken: "t" }),
            childNodeVersion: () => "v20.11.0",
            spawnFn: () => { throw new Error("spawn refused"); },
        }).catch(() => {
            process.on("exit", () => {
                const after = fs.readdirSync("/tmp").filter((x) => x.startsWith("vc-secrets-ch-"));
                fs.writeSync(1, JSON.stringify(after.filter((x) => !before.has(x))));
            });
            process.exit(1);   // what fail() does
        });
    `);
    const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
    assert.equal(r.stdout, "[]", `leaked ${r.stdout}${r.stderr}`);
});

// Nothing here observes channel.push and no client ever connects, so delivery is NOT what this
// pins -- that is pinned at the channel's own level. What it pins is the re-entrancy guard.
channelTest("cmdLaunch: a slow renewal tick does not stack on the one still running", async () => {
    // Without the re-entrancy guard a tick that outlasts its interval -- the contended wait alone
    // runs to 45 s -- starts another one on top of it.
    let inFlight = 0, maxInFlight = 0, calls = 0;
    const handle = await m.cmdLaunch("servers", "s", CMD_LAUNCH_CFG, {
        childNodeVersion: () => "v20.11.0",
        spawnFn: () => fakeChild(),
        renewalTickMs: 5,
        readCache: async () => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            calls += 1;
            await new Promise((r) => setTimeout(r, 40));   // a tick far slower than its interval
            inFlight -= 1;

            return { state: "valid", accessToken: `t${calls}` };
        },
    });
    try {
        await new Promise((r) => setTimeout(r, 200));
        assert.ok(calls >= 2, `the renewal must actually run, ran ${calls}`);
        assert.equal(maxInFlight, 1, "overlapping ticks multiply the load on the backend least able to absorb it");
    } finally {
        await handle.dispose();
    }
});

channelTest("cmdLaunch: a tick with nothing attached is reported twice and then not again", async (t) => {
    // New coverage (source gap): mcpw.js's cmdRun and the flag it sets have no test in the source's
    // own suite. No client ever connects here, so the channel has no peers on any tick.
    //
    // readCache returns the SAME token every time, which is what a valid cache entry does -- cacheStatus
    // hands back the stored accessToken unchanged. The fixture used to return a new one per call, a
    // state no real entry can be in, and that is what made this test pass while the counter advanced
    // only on rotations: with a constant token the warnings never arrived at all, and the first one
    // would really have waited for the first mid-life refresh, about 48 minutes in.
    //
    // TWICE, and the difference between the two lines is the point. The first one's promise -- "it
    // will be handed over when the server connects" -- is true of a server that is merely still
    // starting. By the second tick it is the likeliest false statement in the session, because the
    // ordinary reason nothing connects is that no process ever matched the declared target; so the
    // second line says THAT rather than repeating the promise. From the third on it is silent: the
    // condition cannot change without a restart. Latching at one is what let the false promise
    // stand as the session's last word on the subject.
    const stderr = [];
    t.mock.method(fs, "writeSync", (fd, str) => {
        if (fd !== 2) {
            throw new Error(`unexpected fs.writeSync(${fd}, ...) in this test`);
        }
        stderr.push(str);

        return Buffer.byteLength(str);
    });
    let calls = 0;
    const handle = await m.cmdLaunch("servers", "s", CMD_LAUNCH_CFG, {
        childNodeVersion: () => "v20.11.0",
        spawnFn: () => fakeChild(),
        renewalTickMs: 5,
        readCache: async () => { calls += 1; return { state: "valid", accessToken: "t" }; },
    });
    try {
        await new Promise((r) => setTimeout(r, 60));
        const first = stderr.filter((s) => s.includes("nothing is connected to the token channel"));
        const escalation = stderr.filter((s) => s.includes("no process has matched the declared target"));
        assert.ok(calls >= 3, `the renewal must run past the second tick for silence to mean anything, ran ${calls}`);
        assert.equal(first.length, 1, `expected exactly one first-tick warning, got ${first.length}`);
        assert.equal(escalation.length, 1, `expected exactly one escalation, got ${escalation.length}`);
        assert.match(escalation[0], /some-oauth-package/,
            "the escalation must name the target nothing matched, or it is not actionable");
    } finally {
        await handle.dispose();
    }
});

test("cmdLaunch: once something has attached, a later drop reports the silence but never the target diagnosis", async (t) => {
    // The escalation says no process ever matched the declared target. Once something has attached,
    // that sentence is false for the rest of the session -- and a client CAN drop while the launcher
    // lives, since the channel deletes it from the push set on close or error. Restarting the count
    // alone would only postpone the false line by two ticks, so what this pins is that the claim is
    // withdrawn: after a drop the first line returns, and the escalation never does. A scripted
    // peers() drives it: nothing attached, then attached, then gone again.
    const stderr = [];
    t.mock.method(fs, "writeSync", (fd, str) => {
        if (fd !== 2) {
            throw new Error(`unexpected fs.writeSync(${fd}, ...) in this test`);
        }
        stderr.push(str);

        return Buffer.byteLength(str);
    });
    let peers = 0;
    const count = (needle) => stderr.filter((s) => s.includes(needle)).length;
    const waitFor = async (done, ms = 1000) => {
        const started = Date.now();
        while (Date.now() - started < ms && !done()) {
            await new Promise((r) => setTimeout(r, 5));
        }

        return done();
    };
    const handle = await m.cmdLaunch("servers", "s", CMD_LAUNCH_CFG, {
        childNodeVersion: () => "v20.11.0",
        spawnFn: () => fakeChild(),
        renewalTickMs: 5,
        readCache: async () => ({ state: "valid", accessToken: "t" }),
        createChannel: () => ({ path: "/tmp/not-a-real.sock", push: () => peers, peers: () => peers,
            close: async () => {}, removeSync: () => {} }),
    });
    try {
        assert.ok(await waitFor(() => count("nothing is connected to the token channel") === 1),
            `expected the first warning while nothing is attached: ${stderr.join("")}`);
        peers = 1;
        await new Promise((r) => setTimeout(r, 40));   // eight ticks with a client attached
        assert.equal(count("no process has matched the declared target"), 0,
            "a tick with something attached must not escalate");
        peers = 0;
        assert.ok(await waitFor(() => count("nothing is connected to the token channel") === 2),
            `the count must start over, so the first line is what a fresh drop reports: ${stderr.join("")}`);
        // Far past the second unattached tick, which is where the escalation would fire if the claim
        // were only being postponed rather than withdrawn.
        await new Promise((r) => setTimeout(r, 60));   // twelve further ticks with nothing attached
        assert.equal(count("no process has matched the declared target"), 0,
            `something did match, so that diagnosis must never be printed in this session: ${stderr.join("")}`);
    } finally {
        await handle.dispose();
    }
});

channelTest("cmdLaunch: a failed renewal is loud on fd 2, and does not disturb the session", async (t) => {
    // New coverage (source gap): mcpw.js's cmdRun renewal-failure branch has no test in the
    // source's own suite. The first readCache is the launch-time acquisition and must succeed, or
    // the session never starts; only the RENEWAL call fails, and the child must survive it untouched.
    const stderr = [];
    t.mock.method(fs, "writeSync", (fd, str) => {
        if (fd !== 2) {
            throw new Error(`unexpected fs.writeSync(${fd}, ...) in this test`);
        }
        stderr.push(str);

        return Buffer.byteLength(str);
    });
    const child = fakeChild();
    let killed = false;
    child.kill = () => { killed = true; };
    let calls = 0;
    const handle = await m.cmdLaunch("servers", "s", CMD_LAUNCH_CFG, {
        childNodeVersion: () => "v20.11.0",
        spawnFn: () => child,
        renewalTickMs: 5,
        readCache: async () => {
            calls += 1;
            if (calls === 1) {
                return { state: "valid", accessToken: "initial" };
            }
            throw new Error("network down");
        },
    });
    try {
        await new Promise((r) => setTimeout(r, 30));
        assert.ok(stderr.some((s) => /renewal failed: network down/.test(s)));
        assert.equal(killed, false, "a failed renewal must not touch the child");
        assert.equal(child.listenerCount("close"), 1, "the session must still be intact");
    } finally {
        await handle.dispose();
    }
});

// A tiny stub binary on PATH, intercepting the real "gpg" invocation runTool makes for a local
// secret read -- the same technique vc-secrets.test.mjs uses (withStubOnPath/stubBinary), inlined
// here rather than imported so this file stays independent of that one's fixtures.
function stubGpgOnPath(plaintext) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-gpgstub-"));
    tmpDirs.push(dir);
    fs.writeFileSync(path.join(dir, "gpg"), `#!/bin/sh\nprintf %s ${JSON.stringify(plaintext)}\n`, { mode: 0o755 });

    return dir;
}

channelTest("cmdLaunch: an oauth reference and an ordinary secret both reach the child, and neither leaks on fd 1 or fd 2", async (t) => {
    // Replaces vc-secrets.test.mjs's deleted "cmdLaunch: an authorized oauth reference is refused,
    // and the secret beside it is still not leaked" -- that test's body asserted only the interim
    // rejection, never the leak its own title promised. This one drives the real path: a "secret:"
    // reference needs a real backend, so a stub "gpg" on PATH stands in for the actual tool
    // (gpg --decrypt just prints the plaintext), while the ciphertext file only has to EXIST for
    // makeSecretResolver's pre-check to proceed to it.
    // The stub stands in for gpg, so it stands in for nothing where gpg is not the backend this machine
    // selects: on win32 detectLocalBackend answers wcm, the stub on PATH is never consulted, and the
    // resolver reaches the real Credential Manager for a secret nobody stored there.
    if (m.detectLocalBackend(process.platform, process.env) !== "gpg") {
        t.skip("needs gpg to be the backend this machine selects -- the stub on PATH stands in for it");

        return;
    }
    const secretsHome = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-both-"));
    tmpDirs.push(secretsHome);
    const secretPath = path.join(secretsHome, "vc-secrets", "secrets", "user", "plain.gpg");
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, "ciphertext-placeholder");
    const binDir = stubGpgOnPath("PLAIN-SECRET-VALUE");

    const savedPath = process.env.PATH;
    const savedXdg = process.env.XDG_CONFIG_HOME;
    process.env.PATH = `${binDir}${path.delimiter}${savedPath}`;
    process.env.XDG_CONFIG_HOME = secretsHome;

    const stdout = [];
    const stderr = [];
    t.mock.method(fs, "writeSync", (fd, str) => {
        if (fd === 1) {
            stdout.push(str);
        } else if (fd === 2) {
            stderr.push(str);
        }

        return Buffer.byteLength(str);
    });
    const realErr = process.stderr.write.bind(process.stderr);
    // fd 2 has two routes and fs.writeSync is only one: cmdLaunch's timing line goes out through
    // process.stderr.write, which an fs.writeSync mock cannot see.
    // No matching process.stdout.write mock, deliberately: under `node --test` a test file is a
    // child process that reports its results to the parent over fd 1, so a mock there that does
    // not forward deletes neighbouring tests' results while the run still reports green.
    t.mock.method(process.stderr, "write", (...a) => { stderr.push(String(a[0])); return realErr(...a); });

    const cfg = {
        projectId: null,
        oauth: { ado: CMD_LAUNCH_OAUTH_DECL },
        secrets: { plain: { backend: "local", scope: "user", home: "user" } },
        servers: { both: { command: "npx", args: ["-y", "some-oauth-package"], scope: "user", home: "user",
            env: { ADO_TOKEN: "oauth:ado", OTHER: "secret:plain" } } },
    };

    let seen = null;
    let handle;
    try {
        handle = await m.cmdLaunch("servers", "both", cfg, {
            childNodeVersion: () => "v20.11.0",
            readCache: async () => ({ state: "valid", accessToken: "TOKEN-VALUE" }),
            spawnFn: (cmd, args, opts) => { seen = opts.env; return fakeChild(); },
        });
        assert.equal(seen.OTHER, "PLAIN-SECRET-VALUE", "the secret must still reach the child beside the oauth token");
        assert.equal(seen.ADO_TOKEN, "TOKEN-VALUE", "the oauth token must reach the child too");
        const allOutput = [...stdout, ...stderr].join("");
        assert.doesNotMatch(allOutput, /PLAIN-SECRET-VALUE/);
        assert.doesNotMatch(allOutput, /TOKEN-VALUE/);
    } finally {
        await handle?.dispose();
        process.env.PATH = savedPath;
        if (savedXdg === undefined) {
            delete process.env.XDG_CONFIG_HOME;
        } else {
            process.env.XDG_CONFIG_HOME = savedXdg;
        }
    }
});

// ---------------------------------------------------------------------------------------------
// vc-secrets-probe.mjs — the initialize-handshake verification aid. Ported from the upstream
// launcher's mcpw-probe.js and its suite: `mcpw` becomes `vc-secrets` throughout, including inside
// the LAUNCHER_LINE / TOKEN_REFUSAL patterns. Those were COPIED with the tool name substituted, then
// checked against this package's own messages one alternative at a time -- which is how "not signed
// in" came out, having no producer here that LAUNCHER_LINE can match.
// ---------------------------------------------------------------------------------------------

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
    assert.match(source, /if \(process\.argv\[1\] && fileURLToPath\(import\.meta\.url\) === path\.resolve\(process\.argv\[1\]\)\)/);
    assert.equal(source.split("main(server);").length - 1, 1, "exactly one call site");
    assert.ok(source.indexOf("if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))")
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
    // Both measured against the previous whole-stream scan. "channel client refused" can only be
    // printed by a launcher whose server is already RUNNING, and the timing line is emitted on the
    // success path -- so blaming either for a crash reintroduces the conflation, reversed.
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
    for (const [file, installs] of [
        ["vc-secrets-probe.mjs", /for \(const signal of forwardedSignalsFor\(\)\)\s*\{\s*process\.on\(/],
        ["vc-secrets.mjs", /for \(const signal of forwardedSignals\)\s*\{\s*process\.on\(/],
    ]) {
        const source = stripComments(fs.readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8"));
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
