import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as m from "../vc-secrets.mjs";
import * as cache from "../vc-secrets-cache.mjs";
import { tmpDirs, lockTest } from "../test-support.mjs";
import { scopedPaths, OAUTH_DECL, credHex, d1Config, d1LiveRun, DECL_IDENTITY } from "../test-fixtures.mjs";

test("an oauth entry key is a full three-segment key the read builder accepts", () => {
    const keys = m.oauthEntryKeys("ado", { scope: "project" }, { projectId: "p1" });
    assert.equal(keys.refresh, `${m.KEY_PREFIX}:p1:oauth-ado-refresh`);
    assert.equal(keys.access, `${m.KEY_PREFIX}:p1:oauth-ado-access`);
    assert.doesNotThrow(() => m.buildLocalRead("gpg", keys.refresh));
});

test("a user-scope oauth declaration lands in the user namespace, not the project's", () => {
    const keys = m.oauthEntryKeys("ado", { scope: "user" }, { projectId: "p1" });
    assert.equal(keys.refresh, `${m.KEY_PREFIX}:user:oauth-ado-refresh`);
    assert.equal(keys.access, `${m.KEY_PREFIX}:user:oauth-ado-access`);
});

test("an oauth entry key colliding with a same-spelled secret is reported, naming both sides", () => {
    // SECRET_NAME_RE admits `oauth-ado-refresh`, which is what lets the two derive one key.
    const cfg = m.loadConfig(scopedPaths({ project: { projectId: "proj-x",
        oauth: { ado: OAUTH_DECL },
        secrets: { "oauth-ado-refresh": { backend: "local" } } } }));
    const clashes = m.oauthKeyClashes(cfg);
    assert.equal(clashes.length, 1);
    assert.match(clashes[0], /oauth "ado"/);
    assert.match(clashes[0], /secret "oauth-ado-refresh"/);
    assert.ok(clashes[0].includes(`${m.KEY_PREFIX}:proj-x:oauth-ado-refresh`));
});

test("no clash is reported when an oauth entry and a secret merely look similar", () => {
    const cfg = m.loadConfig(scopedPaths({ project: { projectId: "proj-x",
        oauth: { ado: OAUTH_DECL },
        secrets: { "oauth-ado": { backend: "local" } } } }));
    assert.deepEqual(m.oauthKeyClashes(cfg), []);
});

test("a clash on the access entry is reported, and names that entry rather than the refresh one", () => {
    const cfg = m.loadConfig(scopedPaths({ project: { projectId: "proj-x",
        oauth: { ado: OAUTH_DECL },
        secrets: { "oauth-ado-access": { backend: "local" } } } }));
    const clashes = m.oauthKeyClashes(cfg);
    assert.equal(clashes.length, 1);
    assert.match(clashes[0], /access entry/);
    // The role is interpolated, not spelled: a hardcoded "refresh" is invisible to every fixture
    // that happens to collide on the refresh entry, which is all the others.
    assert.doesNotMatch(clashes[0], /refresh entry/);
});

test("the secret side's own scope decides the clash, in both directions", () => {
    const across = m.loadConfig(scopedPaths({
        user: { secrets: { "oauth-ado-refresh": { backend: "local" } } },
        project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL } },
    }));
    assert.deepEqual(m.oauthKeyClashes(across), [],
        "a user secret and a project sign-in are different namespaces — neither can overwrite the other");

    const together = m.loadConfig(scopedPaths({
        user: { secrets: { "oauth-ado-refresh": { backend: "local" } }, oauth: { ado: OAUTH_DECL } },
        project: { projectId: "proj-x" },
    }));
    const clashes = m.oauthKeyClashes(together);
    assert.equal(clashes.length, 1);
    assert.ok(clashes[0].includes(`${m.KEY_PREFIX}:user:oauth-ado-refresh`));
});

test("a keyvault secret holds no keystore slot, so its spelling is not a clash", () => {
    const cfg = m.loadConfig(scopedPaths({ project: { projectId: "proj-x",
        oauth: { ado: OAUTH_DECL },
        secrets: { "oauth-ado-refresh": { backend: "keyvault", vault: "demo-vault", secret: "s" } } } }));
    assert.deepEqual(m.oauthKeyClashes(cfg), []);
});

test("both entries of one sign-in clashing are both reported", () => {
    const cfg = m.loadConfig(scopedPaths({ project: { projectId: "proj-x",
        oauth: { ado: OAUTH_DECL },
        secrets: { "oauth-ado-refresh": { backend: "local" }, "oauth-ado-access": { backend: "local" } } } }));
    const clashes = m.oauthKeyClashes(cfg);
    // Every other fixture collides on exactly one entry, so their "length === 1" pins
    // "no more than one" and never "all of them".
    assert.equal(clashes.length, 2);
    assert.ok(clashes.some((c) => /refresh entry/.test(c)));
    assert.ok(clashes.some((c) => /access entry/.test(c)));
});

test("oauthLaunchDeps: the seed answers the first readCache only, and a later one reads the keystore", async () => {
    const fx = d1Config();
    const reads = [];
    const seed = new Map([[fx.keys.refresh, { ok: credHex(fx.refreshBlob("r-batch")) }],
        [fx.keys.access, { ok: credHex(fx.accessBlob("a-batch")) }]]);
    const deps = m.oauthLaunchDeps("ado", fx.cfg.oauth.ado, fx.cfg, { backend: "wcm", seed,
        run: d1LiveRun({ [fx.keys.refresh]: fx.refreshBlob("r-live"), [fx.keys.access]: fx.accessBlob("a-live") }, reads) });

    assert.deepEqual(await deps.readCache(), { state: "valid", accessToken: "a-batch" });
    assert.deepEqual(reads, [], "the first call was answered from the batch");
    assert.deepEqual(await deps.readCache(), { state: "valid", accessToken: "a-live" });
    assert.deepEqual(reads, [fx.keys.refresh, fx.keys.access], "the second call read the keystore");
    assert.deepEqual(await deps.readCache(), { state: "valid", accessToken: "a-live" });
    assert.equal(reads.length, 4);
});

test("oauthLaunchDeps: a seed whose first use throws is gone for the next readCache", async () => {
    const fx = d1Config();
    const reads = [];
    const seed = new Map([[fx.keys.refresh, { err: 5 }]]);
    const deps = m.oauthLaunchDeps("ado", fx.cfg.oauth.ado, fx.cfg, { backend: "wcm", seed,
        run: d1LiveRun({ [fx.keys.refresh]: fx.refreshBlob("r-live"), [fx.keys.access]: fx.accessBlob("a-live") }, reads) });

    await assert.rejects(() => deps.readCache(), /win32err=5/);
    assert.deepEqual(reads, []);
    assert.deepEqual(await deps.readCache(), { state: "valid", accessToken: "a-live" });
    assert.deepEqual(reads, [fx.keys.refresh, fx.keys.access], "the failure did not leave the batch behind for the retry");
});

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
    // `write` here receives the full three-segment keystore key oauthEntryKeys produces, so the
    // value that must appear is LAUNCH_KEYS.access.
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
// New coverage (not a port): acquireTokenLock had no DIRECT test in the source — every source
// case drove it through cmdLogin/cmdLogout instead. cmdLogin and cmdLogout are now both ported,
// and a handful of their own tests exercise this loop too — but without these seven,
// acquireTokenLock would still have no coverage of its own that survives a change to either
// verb's wiring.
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
// acquireTokenLock's OWN wait was completely unpinned. Lowering MAX_LOCK_POLLS from 64 to 1 left
// the whole suite green. Root cause: every test above drives a FROZEN clock or a small, controlled
// number of attempts, so none of them can tell "the deadline ended the wait" apart from "the poll
// cap ended the wait". The first two tests below close that gap, driving an ADVANCING clock; the
// other two pin the classification and the log line, for which a frozen clock is the right
// instrument. All four drive acquireTokenLock DIRECTLY — no vehicle needed, it is exported and
// callable on its own.
// ---------------------------------------------------------------------------------------------

test("acquireTokenLock: the poll cap is a backstop, not the terminator of the wait", async () => {
    // Under an advancing clock the LOCK_WAIT_MS deadline must be what ends the wait; the poll cap
    // must never fire first. Must go red when MAX_LOCK_POLLS is lowered enough to end the loop
    // before the deadline is reached.
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
    // through ensureFreshToken rather than cmdLogout: cmdLogout is ported now and pins the same numbers
    // on its own call to acquireTokenLock (see the cmdLogout tests in lib/oauth-login.test.mjs), but
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
