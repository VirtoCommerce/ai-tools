// vc-secrets-cache.mjs — the token cache: two entries, their identity check, and the evaluation
// of whether the cached access token is still usable, plus the cross-process refresh lock.
//
// Storage belongs to the launcher, which already owns the keystore io; this module only decides
// what a cached entry means and, separately, who may exchange a refresh token right now. The io
// that does exist here — acquireLock's socket bind, lockPathFor's reads of process.platform,
// process.env and os.userInfo — sits behind injectable seams (bind/probe/remove default to the
// real thing, {platform, env, userInfo} default to the real ones), which is what makes the
// decisions around that io testable without a live bind or a real OS identity. The seams make
// these functions TESTABLE; they do not make them pure.
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import { VcSecretsError } from "./vc-secrets-error.mjs";
import { severingClose } from "./vc-secrets-teardown.mjs";

const CACHE_SCHEMA = 1;
// Both of the renewal's keystore writes + one exchange + a clock-skew allowance + the renewal
// tick's granularity, because entering the margin is noticed up to one tick late. Widening this
// costs one thing only — the exchange lands slightly earlier in the token's life, never more
// often -- so it is the term to widen when the tick has to grow.
const MARGIN_MS = 12 * 60 * 1000;
// Ordinary NTP correction between the exchange and the read must not read as a rollback, or
// every small adjustment costs a refresh-token rotation.
const SKEW_TOLERANCE_MS = 60 * 1000;

function sameScopes(a, b) {
    return a.length === b.length && [...a].sort().join(" ") === [...b].sort().join(" ");
}

function cacheStatus(cache, decl, now, uptime) {
    // Raised rather than downgraded to needs-refresh, and symmetric with parseTokenResponse. A
    // caller that omits the monotonic reading makes byUptime NaN, `NaN >= 0` is false, and the
    // function silently reverts to the wall-clock-only rule the anchor exists to replace: no
    // throw, no refresh, nothing red. A programming error at the wiring seam has to be loud,
    // because its symptom is indistinguishable from working correctly.
    if (!Number.isFinite(now)) {
        throw new VcSecretsError("cacheStatus needs `now` as a number of milliseconds");
    }
    if (!Number.isFinite(uptime)) {
        throw new VcSecretsError("cacheStatus needs the uptime reading taken with `now`");
    }
    // A usable access entry with no refresh entry still reports absent. Spending the access
    // token first and discovering only then that there is nothing to renew with trades a clear
    // failure now for an opaque one inside the hour.
    if (!cache.refresh?.refreshToken) {
        return { state: "absent" };
    }
    const refresh = cache.refresh;
    // The tenant id compares without regard to case: it is a GUID, TENANT_ID_RE accepts either case, and
    // loadConfig folds it for the registrations lookup. A strict comparison read a cache written under one
    // spelling as another tenant's the day the declaration was retyped in the other, and asked for a new
    // sign-in for the same tenant. The client id keeps the strict comparison the declaration is keyed by.
    if (typeof refresh.tenantId !== "string" || refresh.tenantId.toLowerCase() !== decl.tenantId.toLowerCase()
        || refresh.clientId !== decl.clientId || !sameScopes(refresh.scopes ?? [], decl.scopes)) {
        return { state: "identity-mismatch" };
    }
    const access = cache.access;
    if (!access?.accessToken) {
        return { state: "needs-refresh" };
    }
    // Finiteness, not mere presence: every one of these is absorbed silently by the arithmetic
    // below. A missing obtainedAt makes the WALL term NaN, and Math.max propagates NaN, so one
    // absent stamp destroys a perfectly honest anchor and the entry ages at zero forever —
    // measured, an entry ten years past its expiry read as valid. `null` is what JSON.stringify
    // writes for a NaN, so these arrive from a keystore blob and not only from a hand edit.
    // parseTokenResponse stamps all three, so an entry missing any of them was not written by
    // this code, or predates the anchor; refusing costs one exchange, trusting costs a dead token.
    if (![access.obtainedAt, access.lifetimeMs, access.uptimeAtIssue].every(Number.isFinite)) {
        return { state: "needs-refresh" };
    }
    // Two readings of how much time has passed, and the PESSIMISTIC one wins. Each understates
    // the age in its own way:
    //
    //   - the wall clock understates it when the clock is set backwards (host sleep, NTP step);
    //   - the monotonic counter understates it if it does not advance while the machine is
    //     suspended — WSL2 pauses the guest, whose kernel then misses the pause entirely.
    //
    // A backwards clock is invisible to the wall term by construction: expiresAt, obtainedAt and
    // lifetimeMs all come from ONE reading of ONE clock, so they agree with each other no matter
    // where that clock is now. Only a second, unrelated time source can see it.
    //
    // They are independent but NOT disjoint, and the difference matters. A paused guest freezes
    // both of its clocks together, so between resume and the wall clock resyncing, both terms
    // understate by the same suspend and max() returns the same wrong number. Separating that
    // needs a third source — a server-supplied time, or observing the 401 the launcher is
    // deliberately positioned never to see. It is the boundary of what this check can promise.
    const byClock = now - access.obtainedAt;
    const byUptime = (uptime - access.uptimeAtIssue) * 1000;
    // A negative uptime difference means the stored reading belongs to a boot that no longer
    // exists. Ignored rather than used: a negative age would INFLATE the remaining life and make
    // a spent token look freshly issued, so a reboot would resurrect exactly what this prevents.
    const elapsed = byUptime >= 0 ? Math.max(byClock, byUptime) : byClock;
    if (elapsed < -SKEW_TOLERANCE_MS) {
        // Reachable only once the anchor has been discarded: with a usable one, elapsed is at
        // least byUptime, which is non-negative. So this is the POST-REBOOT allowance, not the
        // general NTP one the anchor now absorbs — after a reboot the wall clock is all there is,
        // and a small backwards correction must not cost a refresh-token rotation while a large
        // one must still refuse.
        return { state: "needs-refresh" };
    }
    if (access.lifetimeMs - elapsed <= MARGIN_MS) {
        return { state: "needs-refresh" };
    }

    return { state: "valid", accessToken: access.accessToken };
}

function serializeRefresh({ refreshToken, tenantId, clientId, scopes }) {
    return JSON.stringify({ schema: CACHE_SCHEMA, refreshToken, tenantId, clientId, scopes });
}

// expiresAt is stored but has no reader: the decision above is made from obtainedAt, lifetimeMs
// and uptimeAtIssue, because an absolute stamp cannot outlive a clock change. It stays because a
// human reading a cache entry needs one field that says when the token dies, and it costs nothing.
function serializeAccess({ accessToken, expiresAt, obtainedAt, lifetimeMs, uptimeAtIssue }) {
    return JSON.stringify({ schema: CACHE_SCHEMA, accessToken, expiresAt, obtainedAt, lifetimeMs, uptimeAtIssue });
}

function parseEntry(json) {
    let parsed;
    try {
        parsed = JSON.parse(json);
    } catch {
        // Absent rather than an error, and never a rethrow: node embeds the first ten characters
        // of its input in a JSON SyntaxError and this input is a keystore blob. Absent is also the
        // actionable answer for the callers there now: ensureFreshToken treats it as "sign in", and
        // the `login` verb overwrites it.
        return null;
    }
    if (parsed?.schema !== CACHE_SCHEMA) {
        // Named rather than swallowed: a schema number carries no secret, and "written by a newer
        // vc-secrets" is a different problem from "corrupt" that a caller may want to tell apart. A
        // caller that only needs a token catches this and treats it as absent.
        throw new VcSecretsError(`token cache entry has schema ${parsed?.schema}, expected ${CACHE_SCHEMA}`);
    }

    return parsed;
}

// Entra rotates the refresh token on use, so two concurrent exchanges invalidate each other and
// the loser's session is signed out with nothing to point at. Node has no flock, so an exclusive
// bind IS the mutex: EADDRINUSE means occupied.
const HELD_BY_OTHER = Symbol("vc-secrets:lock-held-by-other");
// A waiter must outlast the holder's ENTIRE critical section, or a slow-but-successful refresh
// next door reads as a stuck holder and fails a session that was about to work. That section does
// not end at the network call: the holder still has to write both keystore entries before it can
// release, and releasing any earlier would hand the waiter a refresh token Entra has already
// rotated away — the exact failure the lock exists to prevent. So one exchange (TIMEOUT_OAUTH_MS,
// 20 s) plus two keystore writes (TIMEOUT_LOCAL_MS, 10 s each) plus headroom. It is a ceiling, not
// a cost: the waiter stops as soon as the neighbour publishes. A test asserts this against those
// constants, because nothing else connects the numbers and they live in three different modules.
const LOCK_WAIT_MS = 45_000;

function sanitize(value) {
    return String(value).replace(/[^A-Za-z0-9_-]/g, "_");
}

// The name is chosen so that a dead holder needs no detection: on linux/WSL an abstract socket
// and on win32 a named pipe are both released by the kernel when the holder dies. Both namespaces
// are machine-global rather than per-user — the abstract namespace is per NETWORK NAMESPACE, not
// per uid — so the user belongs in the name on both, or one developer's refresh locks every other
// account on the host out of its own. The same is true of a project: nothing scopes either
// namespace to the declaration that named the entry, so two projects both declaring an entry
// called "ado" would otherwise serialize their refreshes against each other for no reason either
// project can see.
// The identity is read from the OS, never from USER or USERNAME: both namespaces below are
// machine-global, and those variables are set by whoever starts the process — so on a shared host
// an account could name its lock after another user and hold that user's launches at the ceiling.
// The uid is used on POSIX rather than the name because it is the identity the kernel enforces.
//
// The environment is kept only as a last resort, for a uid with no passwd entry. Sharing a name
// there does not mix credentials — the keystore entries are per-user regardless — but the second
// launcher waits out the ceiling and then fails, so this is a fallback and not a default.
//
// Failing here instead of falling back to a literal was weighed and rejected. A uid with no passwd
// entry and no USER launches successfully as this stands; refusing would take that away to prevent a
// collision that additionally needs two such accounts sharing one filesystem. That is a decision
// about which environments this serves, not a repair, and it does not belong to whoever next
// rediscovers the literal.
function lockOwner({ platform, env, userInfo }) {
    try {
        const info = userInfo();

        return platform === "win32" ? info.username : String(info.uid);
    } catch {
        return env.USERNAME || env.USER || "user";
    }
}

function lockPathFor(entryName, scopeKey, { platform = process.platform, env = process.env,
    userInfo = os.userInfo } = {}) {
    const user = sanitize(lockOwner({ platform, env, userInfo }));
    const scope = sanitize(scopeKey);
    const entry = sanitize(entryName);
    if (platform === "win32") {
        return `\\\\.\\pipe\\vc-secrets-${user}-${scope}-${entry}-lock`;
    }
    if (platform === "darwin") {
        // Short and outside secretsDir(): sun_path is ~104 bytes here.
        return `/tmp/vc-secrets-${user}-${scope}-${entry}.lock`;
    }

    return `\0vc-secrets-${user}-${scope}-${entry}.lock`;
}

function bindSocket(lockPath) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen({ path: lockPath, exclusive: true }, () => resolve(server));
    });
}

function probeAlive(lockPath) {
    return new Promise((resolve) => {
        const probe = net.connect(lockPath);
        probe.once("connect", () => { probe.destroy(); resolve(true); });
        probe.once("error", () => resolve(false));
    });
}

function holderFor(server) {
    // A neighbour that connected to this lock and is waiting its turn is a connection that never
    // completes a request, so releasing with `server.close()` alone waited on the very peer the
    // release exists to let in.
    return { release: severingClose(server) };
}

// bind/probe/remove are injected for the same reason resolveEnvEntries takes its resolver: the
// decisions below are the part worth testing, and binding a socket is refused outright in some
// environments — so without the seam every branch here would be covered only where a real bind
// is permitted, and the macOS-only branches would be covered nowhere at all.
async function acquireLock(lockPath, { bind = bindSocket, probe = probeAlive,
    remove = (p) => fs.rmSync(p, { force: true }) } = {}) {
    try {
        return holderFor(await bind(lockPath));
    } catch (e) {
        if (e.code !== "EADDRINUSE") {
            throw e;
        }
    }
    if (!lockPath.startsWith("/")) {
        return HELD_BY_OTHER;   // abstract name or pipe: occupied can only mean a live holder
    }
    // macOS only. A path can be held by a socket a killed process left behind, and connect()
    // answering ECONNREFUSED is the only way to tell that from a live listener.
    if (await probe(lockPath)) {
        return HELD_BY_OTHER;
    }
    try {
        remove(lockPath);

        return holderFor(await bind(lockPath));
    } catch (e) {
        // Inside the try on purpose: a neighbour reclaiming first is an ordinary contended
        // outcome, and an unhandled rejection here becomes a process.exit in the launcher's run
        // path — the server would not start at all.
        if (e.code === "EADDRINUSE") {
            return HELD_BY_OTHER;
        }
        throw e;
    }
}

export {
    cacheStatus, sameScopes, serializeRefresh, serializeAccess, parseEntry,
    lockPathFor, acquireLock, sanitize, HELD_BY_OTHER, LOCK_WAIT_MS,
    CACHE_SCHEMA, MARGIN_MS, SKEW_TOLERANCE_MS,
};
