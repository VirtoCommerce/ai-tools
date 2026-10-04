import fs from "node:fs";
import os from "node:os";

import { VcSecretsError } from "../vc-secrets-error.mjs";
import * as cache from "../vc-secrets-cache.mjs";  // entries, expiry, the cross-process refresh lock
import * as oauth from "../vc-secrets-oauth.mjs";  // the Entra protocol

import { runTool } from "./spawn.mjs";
import { WCM_BLOB_LIMIT, batchedReadError, buildLocalRead, clearOversizeMarker, decodeCredBlobHex, deleteEntryIo,
    detectLocalBackend, gpgEntryPresent, isAbsentEntry, keyFor, mapResolveError, nameFromKey, psCommand,
    recordOversizeMarker, scopeKeyFor, writeSecretValue } from "./keystore.mjs";

function oauthEntryKeys(name, decl, cfg) {
    return {
        refresh: keyFor(`oauth-${name}-refresh`, decl, cfg),
        access: keyFor(`oauth-${name}-access`, decl, cfg),
    };
}

function oauthKeyClashes(cfg) {
    const secretKeys = new Map();
    for (const [secretName, decl] of Object.entries(cfg.secrets)) {
        // Only a local secret has a keystore slot: cmdSet refuses others, cmdMigrate and unlockTargets skip them.
        if (decl.backend !== "local") {
            continue;
        }
        secretKeys.set(keyFor(secretName, decl, cfg), secretName);
    }
    const clashes = [];
    for (const [name, decl] of Object.entries(cfg.oauth ?? {})) {
        for (const [role, key] of Object.entries(oauthEntryKeys(name, decl, cfg))) {
            const secretName = secretKeys.get(key);
            if (secretName !== undefined) {
                clashes.push(`oauth "${name}" ${role} entry and secret "${secretName}" resolve to the `
                    + `same keystore key ${key} -- one overwrites the other`);
            }
        }
    }

    return clashes;
}

const LOCK_POLL_MS = 250;

const LOCK_POLL_CEILING_MS = 2_000;

// A backstop on acquireTokenLock's wait, never the thing that ends it -- the reasoning is at the
// loop. 64 polls of a backoff that doubles to LOCK_POLL_CEILING_MS run to 123.75 s -- measured by
// driving the loop against a clock that never advances, not derived on paper -- versus a 45 s
// LOCK_WAIT_MS. Nearly three times the deadline, so under any advancing clock the deadline is
// crossed first and this cap never fires.
const MAX_LOCK_POLLS = 64;

// The one place the mutex name is built. Three writers share the same pair of keystore entries —
// a renewal, a login and a logout — and a lock any of them takes on a different name serialises
// against nothing while every one of the three still reads as correct. Built here once rather than
// at each call site for that reason.
//
// The lock and the keystore entries it guards have to agree on what "the same project" means, which
// is why the scope comes from scopeKeyFor rather than from `decl.scope` — that string is "project"
// for a local declaration too, so a lock keyed on it would serialise two separate projects against
// each other and fail to serialise one project against itself.
function tokenLockFor(entryName, decl, cfg, { platform = process.platform, env = process.env } = {}) {
    const scopeKey = scopeKeyFor(decl, cfg);

    return () => cache.acquireLock(cache.lockPathFor(entryName, scopeKey, { platform, env }));
}

// Waits out whoever holds the token mutex — the one all three writers to the entry pair take —
// and DECIDES NOTHING about failing to get it. Its two callers are the login and logout verbs,
// both ported. They want opposite things from a failure and each words its own message at its
// own call site, so a message written here would be right for at most one of them.
//
// The window being waited out is not the one ensureFreshToken already closed between its two cache
// reads. It is the width of the exchange, where the holder sits on the network with a token it
// will write the instant Entra answers.
//
// A wedged holder costs the ceiling below and a report of "busy"; a DEAD one costs nothing, for
// the reasons lockPathFor sets out per platform — the kernel frees the abstract name and the pipe,
// and acquireLock probes and unlinks the darwin path.
async function acquireTokenLock({ acquireLock, now, sleep, log }) {
    let sawHolder = false;
    // Classified in ONE place. Written twice, it is free to drift, and the safe reading of "the
    // bind stopped working after a holder was seen" is that the holder is still there.
    const classify = (lock, error) => {
        if (lock !== null && lock !== cache.HELD_BY_OTHER) {
            return { lock };
        }
        if (lock === cache.HELD_BY_OTHER || sawHolder) {
            return { lock: null, reason: "busy" };
        }

        return { lock: null, reason: "unbindable", error };
    };
    let failure = null;
    const attempt = async () => {
        try {
            return await acquireLock();
        } catch (e) {
            if (e.code !== "EPERM" && e.code !== "EACCES") {
                // Narrow on purpose. The carve-out exists for ONE measured condition, and a wide
                // catch launders every other failure — a TypeError from broken wiring, an EMFILE
                // under fd exhaustion — into "the sandbox refused the bind". Callers then act on a
                // diagnosis nobody made. ensureFreshToken does not catch at all.
                throw e;
            }
            failure = e;

            return null;
        }
    };
    let lock = await attempt();
    if (lock !== cache.HELD_BY_OTHER) {
        return classify(lock, failure);
    }
    sawHolder = true;
    log(`vc-secrets: waiting for an in-flight token renewal\n`);
    // Deliberately the same ceiling and the same backoff as ensureFreshToken's waiter, because the
    // critical section being waited out is the same one. Tuning either loop alone reintroduces the
    // asymmetry the shared constants exist to prevent, and nothing but these two names connects the
    // loops — so each is driven separately and its own observed sleep sequence asserted.
    const deadline = now() + cache.LOCK_WAIT_MS;
    let backoff = LOCK_POLL_MS;
    // Bounded by polls as WELL as by the clock, because the deadline is enforced by an INJECTED
    // `now`: a frozen stub would spin here forever, and the login verb reaches this line with a
    // single-use authorization code already spent, so a hang there costs the code itself. The cap
    // is the backstop and the clock is the mechanism — under any advancing clock the deadline is
    // crossed first.
    // ensureFreshToken's identical loop has no cap on purpose: it has spent nothing and a launch
    // that hangs is a launch that failed, which is visible.
    for (let poll = 0; poll < MAX_LOCK_POLLS && now() < deadline; poll += 1) {
        await sleep(backoff);
        backoff = Math.min(backoff * 2, LOCK_POLL_CEILING_MS);
        lock = await attempt();
        if (lock !== cache.HELD_BY_OTHER) {
            return classify(lock, failure);
        }
    }

    return { lock: null, reason: "busy" };
}

// The single path the pre-spawn launch and the mid-session renewal both go through. Every
// dependency is injected for the same reason resolveEnvEntries takes its resolver: what is worth
// testing here is the ORDER — who exchanges, who waits, and what is released when it throws.
async function ensureFreshToken({ serverName, readCache, writeCache, exchange, acquireLock,
    now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    if (typeof serverName !== "string" || serverName === "") {
        // Loud at the wiring seam: without the name every message below sends the developer to
        // `vc-secrets login undefined`, and a remedy naming the wrong verb is worse than none.
        throw new VcSecretsError("ensureFreshToken needs the name of the oauth entry it is refreshing");
    }
    const signIn = `no usable token for "${serverName}" -- run "vc-secrets login ${serverName}"`;
    const first = await readCache();
    if (first.state === "valid") {
        return first.accessToken;
    }
    if (first.state !== "needs-refresh") {
        throw new VcSecretsError(signIn);
    }
    let lock = await acquireLock();
    if (lock === cache.HELD_BY_OTHER) {
        // What this launcher needs is a valid access token, and the WINNER writes one — so it
        // waits for the cache rather than for the lock, and fails naming the neighbour rather
        // than suggesting a sign-in that would rotate the refresh token a second time.
        const deadline = now() + cache.LOCK_WAIT_MS;
        let backoff = LOCK_POLL_MS;
        while (now() < deadline) {
            await sleep(backoff);
            // Backed off rather than a flat 250 ms: on Credential Manager every readCache is a
            // PowerShell P/Invoke worth one to three seconds, so a fixed fast poll is really
            // "start powershell.exe as fast as it will start" for the length of the wait.
            backoff = Math.min(backoff * 2, LOCK_POLL_CEILING_MS);
            const again = await readCache();
            if (again.state === "valid") {
                return again.accessToken;
            }
            // The lock is retried, not only the cache. A neighbour can finish WITHOUT publishing
            // a usable access entry — that write is best-effort by design, and its exchange may
            // have failed outright — and waiting on the cache alone then burns the whole deadline
            // and blames a neighbour that released seconds after taking it, for a token this
            // launcher could have exchanged itself.
            lock = await acquireLock();
            if (lock !== cache.HELD_BY_OTHER) {
                break;
            }
        }
        if (lock === cache.HELD_BY_OTHER) {
            throw new VcSecretsError(`another vc-secrets is still refreshing the token for "${serverName}" -- it did not finish in time`);
        }
    }
    try {
        const again = await readCache();   // it may have finished while we waited on the bind
        if (again.state === "valid") {
            return again.accessToken;
        }
        if (again.state !== "needs-refresh") {
            // Re-checked rather than assumed still refreshable: a logout landing between the two
            // reads would otherwise hand `undefined` to the exchange, and Entra's answer to that
            // names nothing a developer can act on.
            throw new VcSecretsError(signIn);
        }
        let fresh;
        try {
            fresh = await exchange(again.refreshToken);
        } catch (e) {
            // A refusal means the refresh token is dead and signing in again is the remedy. A
            // timeout or an unreachable endpoint is not, and the same advice there sends the
            // developer to a browser that cannot help either.
            throw e?.refused ? new VcSecretsError(`${e.message} -- run "vc-secrets login ${serverName}"`, e.exitCode) : e;
        }
        await writeCache(fresh);

        return fresh.accessToken;
    } finally {
        // The load-bearing line: the error table promises the launcher survives a failed renewal,
        // and that is exactly the case where a leaked holder would never be released — blocking
        // every other session on this machine until someone reboots.
        await lock.release();
    }
}

// The tail both token writers share -- cmdLogin after an interactive sign-in, writeCache after a
// renewal. Best effort throughout: losing the access entry costs one exchange on the next launch,
// where failing the whole operation would cost an interactive sign-in.
//
// ONLY exit 4 records a marker. It is the one failure that cannot come right on its own -- the value
// is over the backend's ceiling, so the identical write fails identically forever. A transient
// failure that left a marker behind would report a permanent condition that the very next successful
// write disproves, and that distinction is the whole point of the file. Credential Manager is the
// only backend that produces it (gpg has no ceiling to cross, keychain does not signal size this
// way), so WCM_BLOB_LIMIT is the limit recorded; `backend` goes in the marker too, because a reader
// should not have to infer which store refused from the value of a number.
//
// Cleared on success because the marker is current state, not a log; the reason is on
// oversizeMarkerPath. Four coupled rules in one body rather than two, so a fifth writer gets them
// by calling rather than by copying.
async function storeAccessEntry(key, value, { write, marker, log, backend, note = "" }) {
    try {
        await write(key, value);
        marker.clear(key);
    } catch (e) {
        if (e.toolExitCode === 4) {
            marker.record(key, { backend, limit: WCM_BLOB_LIMIT, bytes: Buffer.byteLength(value) });
        }
        log(`vc-secrets: ${note}the access entry could not be stored (${e.message}); `
            + "the next launch will exchange one\n");
    }
}

// Once the refresh token has rotated, both stored entries are lies: the stored one cannot be
// redeemed, and the access token that went with it keeps working until it expires, at which point
// the session dies mid-use with nothing to renew from. Clearing both makes the state unambiguously
// signed-out. Best effort, because the write failure is the actionable one and a delete's error must
// not displace it.
async function clearEntryPair(remove, keys) {
    for (const stale of keys) {
        try {
            await remove(stale);
        } catch { /* best effort — the write failure is what the developer must see */ }
    }
}

// The real backends behind ensureFreshToken's seams. Nothing here decides anything: the storage
// rules live in vc-secrets-cache.mjs and the protocol in vc-secrets-oauth.mjs.
//
// entryName/decl/cfg go to oauthEntryKeys rather than to cache.entryNames (which the source used):
// oauthEntryKeys already fills that role for this package (it is what keyFor/buildLocalRead agree
// on — see the comment beside its own test), and it returns FULL three-segment keystore keys
// ("vc-secrets:<scope>:<name>"), never a bare entry name. Every read/write below is built from one
// of those full keys.
//
// `seed`: raw outcomes of the launch's one batched Credential Manager call (readWcmBatch's `outcomes`), by
// full key -- or null. It exists to save the first readCache of a launch its PowerShell round trips and
// answers nothing else: readCache takes it and drops it before its first read, so the re-read under the
// lock, every poll while another launcher holds it and every renewal tick read the store itself. That is
// what the refresh token's safety rests on -- the exchange spends the token it read under the lock, never
// one batched before the lock was asked for, which a neighbour may have rotated since. An outcome is
// interpreted only when consumed, by the same branches as a read that ran then.
function oauthLaunchDeps(entryName, decl, cfg, { backend = detectLocalBackend(), env = process.env,
    run = runTool, write = writeSecretValue, remove = null, seed = null } = {}) {
    const keys = oauthEntryKeys(entryName, decl, cfg);
    // `= null` in the parameter list and resolved here, the way cmdLogin and cmdLogout resolve their
    // own locks: the default needs `backend`, `env` and `run`, and reading sibling parameters out of
    // one destructuring pattern relies on evaluation order that is easy to break by reordering the
    // list. A seam at all because the default DELETES — on gpg it is an `fs.rmSync` of a real file in
    // the developer's keystore — and a test that reaches this path without injecting it would do
    // that from a run that looks entirely green. That has happened once already, to cmdLogin's
    // equivalent seam; the note is on loginDeps in the test file.
    const removeEntry = remove ?? deleteEntryIo(backend, env, { run });
    // The raw read: what the backend printed for `key`, or what it threw. A batched outcome stands in for the
    // run when there is one, and throws the very error that run would have -- so everything past this point,
    // absent-versus-failure included, is one code path for both.
    const fetchRaw = (key, batched) => {
        const outcome = backend === "wcm" ? batched?.get(key) : undefined;
        if (outcome === undefined) {
            return run(buildLocalRead(backend, key, env));
        }
        if (typeof outcome.ok === "string") {
            return outcome.ok;
        }

        throw batchedReadError(psCommand(env), outcome.err);
    };
    const readEntry = async (key, batched = null) => {
        // keyToPath (not the source's flat `${name}.gpg`) — this package's gpg layout already
        // namespaces entries by scope, so the file this key resolves to is the one keyToPath
        // computes everywhere else, not a hand-built path that skips the scope directory.
        if (backend === "gpg" && !gpgEntryPresent(key, env)) {
            return undefined;
        }
        const keyName = nameFromKey(key);
        let raw;
        try {
            raw = await fetchRaw(key, batched);
        } catch (e) {
            if (isAbsentEntry(backend, e)) {
                return undefined;   // not stored: "sign in", not a tool failure
            }
            throw mapResolveError(backend, keyName, e);
        }
        try {
            const entry = cache.parseEntry(backend === "wcm" ? decodeCredBlobHex(raw).value : raw);
            if (entry === null) {
                // Both cases are named on fd 2, and this one most of all: a version skew is a
                // thing a developer can reason about, a keystore entry that has been damaged is
                // not.
                //
                // parseEntry returns null rather than throwing because node embeds the first ten
                // characters of its input in a JSON SyntaxError, and that input is a keystore blob.
                // The notice is therefore built HERE, out of the key alone, so nothing of the value
                // travels with it.
                fs.writeSync(2, `vc-secrets: the stored entry for "${keyName}" is not readable JSON`
                    + " -- treating it as absent; the next launch will sign in or exchange\n");
            }

            return entry ?? undefined;
        } catch (e) {
            // An entry written by a NEWER vc-secrets is named once and then treated as absent: the
            // next step is a sign-in either way, and refusing to launch over a cache this build
            // cannot read helps nobody.
            fs.writeSync(2, `vc-secrets: ${e.message} -- treating "${keyName}" as absent\n`);

            return undefined;
        }
    };

    return {
        readCache: async () => {
            // Taken and dropped before anything can throw: only this call may see the batch.
            const s = seed;
            seed = null;
            const refresh = await readEntry(keys.refresh, s);
            if (refresh?.refreshToken === undefined) {
                // Short-circuited before the second read: deciding "no token can be obtained
                // without interaction" is the path with a latency budget on it, and on Credential
                // Manager each read is a PowerShell P/Invoke worth one to three seconds.
                return { state: "absent" };
            }
            const status = cache.cacheStatus({ refresh, access: await readEntry(keys.access, s) },
                decl, Date.now(), os.uptime());

            // The refresh token rides back with the verdict: cacheStatus deliberately returns a
            // state and nothing else, and the exchange needs the token that state was decided on.
            return status.state === "needs-refresh" ? { ...status, refreshToken: refresh.refreshToken } : status;
        },
        writeCache: async (fresh) => {
            // RFC 6749 section 6 makes refresh_token optional on the refresh grant. Writing the
            // entry regardless would serialise `undefined` over a LIVE refresh token, and the
            // next launch would demand a sign-in that nothing had actually invalidated.
            if (fresh.refreshToken !== undefined) {
                try {
                    await write(keys.refresh, cache.serializeRefresh({ refreshToken: fresh.refreshToken,
                        tenantId: decl.tenantId, clientId: decl.clientId, scopes: decl.scopes }), { backend, env });
                } catch (e) {
                    // Both entries go, exactly as cmdLogin's identical branch does — and the reason
                    // is STRONGER here, because nobody is watching. What is on disk after this
                    // failure is a dead refresh token beside an access token that keeps working
                    // until it expires. In `login` a human reads the throw and signs in again; here
                    // the renewal timer catches it into one line on fd 2 and keeps ticking, so every
                    // later tick spends the same dead token again. Cleared, the next tick reads the
                    // entry as absent and says so.
                    //
                    // Certainly dead, not probably: this branch is reached only with a NEW refresh
                    // token in hand, so Entra has rotated and what is stored cannot be redeemed.
                    await clearEntryPair(removeEntry, [keys.access, keys.refresh]);
                    // The one irreversible step: Entra invalidated the previous refresh token the
                    // moment it issued this one, so a failure here IS a signed-out state and must
                    // name the entry and the remedy rather than the tool that refused.
                    throw new VcSecretsError(`the renewed refresh token could not be stored in "${keys.refresh}" `
                        + `(${e.message}) -- run "vc-secrets login ${entryName}"`);
                }
            }
            // The renewal path is where an oversize entry HURTS, which is why it records the marker
            // at all. RENEWAL_TICK_MS fires every five minutes and the tick decides from the store,
            // so an access entry that never lands means an exchange -- and a refresh-token rotation
            // -- every five minutes, indefinitely, reported as one fd-2 line each time and never as
            // a condition.
            await storeAccessEntry(keys.access, cache.serializeAccess(fresh), {
                write: (k, v) => write(k, v, { backend, env }),
                marker: {
                    clear: (k) => clearOversizeMarker(k, env),
                    record: (k, meta) => recordOversizeMarker(k, { ...meta, env }),
                },
                log: (s) => fs.writeSync(2, s),
                backend,
            });
        },
        exchange: (refreshToken) => oauth.exchange(decl.tenantId, oauth.buildTokenBody({ kind: "refresh",
            clientId: decl.clientId, refreshToken, scopes: decl.scopes })),
        acquireLock: tokenLockFor(entryName, decl, cfg, { env }),
    };
}

export {
    oauthEntryKeys, oauthKeyClashes, tokenLockFor, acquireTokenLock, ensureFreshToken, storeAccessEntry,
    clearEntryPair, oauthLaunchDeps,
};
