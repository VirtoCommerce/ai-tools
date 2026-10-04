import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { VcSecretsError } from "../vc-secrets-error.mjs";
import * as cache from "../vc-secrets-cache.mjs";  // entries, expiry, the cross-process refresh lock
import { severingClose } from "../vc-secrets-teardown.mjs";  // the one teardown, for all three servers

import { buildSpawnInvocation, mergeDeclaredEnv, resolveSpawnCommand, sanitizeEnv, windowsEnvValue } from "./spawn.mjs";
import { LEGACY_SECRET_ENV_VARS, parseLiteral, requireLaunchable, resolveEnvEntries } from "./config.mjs";
import { TIMEOUT_LOCAL_MS, detectLocalBackend, makeSecretResolver, scopeKeyFor } from "./keystore.mjs";
import { readTrustState, trustGateOf, trustProblem, trustRefusal } from "./trust.mjs";
import { ensureFreshToken, oauthEntryKeys, oauthLaunchDeps } from "./oauth-token.mjs";

// The per-launch delivery channel a mid-session renewal uses to hand a fresh token into the
// server process it is already running -- the launcher's other half of ensureFreshToken's
// contract. Nothing here decides WHEN to renew; cmdLaunch owns the timer and calls push() on it.
const CHANNEL_GREETING_MAX = 4096;

// NOT the lock's namespace, and the asymmetry is deliberate: the lock binds an abstract socket
// precisely because nothing secret crosses it, and a token crosses this one. An abstract name has
// no filesystem entry and therefore no mode bits at all, so the channel is a filesystem socket at
// 0600 -- gated by uid AND by the nonce. On Windows a named pipe takes no mode bits either, which
// is what makes the nonce mandatory rather than defence in depth.
// On Windows the pipe name is the channel's ENTIRE identity: a named pipe takes no mode bits, so
// nothing else separates one developer's channel from another's, or one launch from a concurrent
// one. Per LAUNCH rather than per server -- two sessions may run the same server at once -- so the
// pid belongs in the name rather than in every caller's memory. Extracted for the same reason
// lockPathFor is: the collision properties are worth asserting, and an inlined name cannot be.
function channelPipeName(name, scopeKey, { env = process.env, pid = process.pid } = {}) {
    return `\\\\.\\pipe\\vc-secrets-ch-${cache.sanitize(env.USERNAME || "user")}-${cache.sanitize(scopeKey)}-${cache.sanitize(name)}-${pid}`;
}

async function createChannel({ name, scopeKey, nonce, onRefusal = () => {}, chmod = fs.chmodSync,
    rm = (dir) => fs.rmSync(dir, { recursive: true, force: true }) }) {
    // /tmp rather than os.tmpdir(): sun_path is ~104 bytes, and a redirected TMPDIR can be long
    // enough to overflow it. An overflowing path still BINDS -- libuv truncates it rather than
    // refusing it -- so where the cut lands decides what happens next: measured here, the chmod
    // below can throw ENOENT because nothing exists at the full path, or the bind can land on a
    // path already in use (EADDRINUSE), or truncation can place the socket outside this
    // directory entirely. lockPathFor's own darwin branch makes the same call for the same reason.
    const dir = process.platform === "win32" ? null : fs.mkdtempSync(path.join("/tmp", "vc-secrets-ch-"));
    const channelPath = process.platform === "win32" ? channelPipeName(name, scopeKey) : path.join(dir, "c.sock");
    const nonceDigest = crypto.createHash("sha256").update(String(nonce)).digest();
    const clients = new Set();
    // The last token pushed, handed to a client that authenticates later. A push reaching only
    // the sockets connected at that instant is lost with no error anywhere when the server has
    // not finished starting, and the session then runs to the expiry of its env token -- the very
    // failure the channel exists to prevent, reintroduced by the delivery mechanism.
    let latest = null;
    const frameOf = (token) => JSON.stringify({ token }) + "\n";
    const server = net.createServer((sock) => {
        let greeting = "";
        const refuse = (why) => {
            onRefusal(why);
            fs.writeSync(2, `vc-secrets: channel client refused (${why})\n`);
            sock.destroy();
        };
        const onData = (buf) => {
            greeting += buf.toString("utf8");
            if (greeting.length > CHANNEL_GREETING_MAX) {
                refuse("oversize");

                return;
            }
            const nl = greeting.indexOf("\n");
            if (nl < 0) {
                return;   // a stream socket may deliver the greeting in pieces
            }
            sock.off("data", onData);
            let ok = false;
            try {
                const presented = JSON.parse(greeting.slice(0, nl)).nonce;
                // Digests, because timingSafeEqual throws on unequal lengths: comparing the raw
                // values would make a wrong-LENGTH nonce distinguishable from a wrong-value one.
                ok = crypto.timingSafeEqual(crypto.createHash("sha256").update(String(presented)).digest(), nonceDigest);
            } catch {
                ok = false;
            }
            if (!ok) {
                refuse("nonce");

                return;
            }
            clients.add(sock);
            if (latest !== null) {
                sock.write(frameOf(latest));
            }
        };
        sock.on("data", onData);
        sock.on("close", () => clients.delete(sock));
        sock.on("error", () => { clients.delete(sock); sock.destroy(); });
    });
    // `clients` above is the PUSH set -- who gets the next token -- and is not the teardown's
    // bookkeeping. Keeping them separate is deliberate: a teardown that depended on the push set
    // would silently weaken whenever that set's membership rules changed.
    const severedClose = severingClose(server);
    try {
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(channelPath, resolve);
        });
        if (dir !== null) {
            chmod(channelPath, 0o600);
        }
    } catch (e) {
        // The directory exists from mkdtempSync above and the server may already be bound. A
        // caller that CATCHES this would otherwise hang on a live listener and leave the
        // directory behind.
        try {
            server.close();
        } catch { /* never listened */ }
        if (dir !== null) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
        throw e;
    }
    // A successful listen does NOT remove the once("error", reject) above -- a `once` listener is
    // removed only when it FIRES, and that promise already resolved without one. So an error
    // emitted after this point would still reach that stale, already-settled `reject`: a silent
    // no-op, reported nowhere. What actually keeps the channel from dying is the reporter added
    // below -- a net.Server with NO listener at all for "error" throws, straight into
    // process.on("uncaughtException") and out through fail(). removeAllListeners here only clears
    // the stale reject before adding the reporter, so the two do not both run on one emit for no
    // reason; it is the reporter, not this call, that stands between an error and a crash.
    server.removeAllListeners("error");
    server.on("error", (e) => fs.writeSync(2, `vc-secrets: channel error: ${e.code ?? e.message}\n`));
    server.unref();   // the channel must not keep the launcher alive
    const removeSync = () => {
        if (dir !== null) {
            try {
                rm(dir);
            } catch { /* best effort: an exit handler has nowhere to report to */ }
        }
    };

    return {
        path: channelPath,
        push: (token) => {
            latest = token;
            let delivered = 0;
            for (const sock of clients) {
                sock.write(frameOf(token));
                delivered += 1;
            }

            return delivered;
        },
        // How many receivers are attached right now, which push() can only answer by sending
        // something. The renewal timer asks this on every tick, and a tick that exchanges nothing
        // still needs the answer: whether anything is listening is a property of the channel, not of
        // the token.
        peers: () => clients.size,
        removeSync,
        close: () => severedClose().then(removeSync),
    };
}

// The preload side of the same channel, entered inside the child via NODE_OPTIONS=--import. It
// must be resolved beside THIS file, never against process.argv[1]: the launcher is normally
// entered through vc-secrets-shim.mjs, so argv[1] is the shim in the plugin DATA dir while the
// preload sits beside this module in the versioned plugin CACHE -- anchoring on argv[1] yields a
// path that exists, is wrong, and produces a child that starts fine and never renews.
const PRELOAD_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "vc-secrets-preload.mjs");

function buildChildEnv(base, { token, envVar, channelPath, nonce, preloadPath, targetPackage, binName }) {
    const env = sanitizeEnv(base);   // drops any inherited NODE_OPTIONS first
    env[envVar] = token;
    env.VC_SECRETS_TOKEN_CHANNEL = channelPath;
    env.VC_SECRETS_CHANNEL_NONCE = nonce;
    // The preload reads the variable name from here, not from the socket payload: the process
    // holding the credential should not take instructions about where to put it.
    env.VC_SECRETS_TOKEN_ENV = envVar;
    env.VC_SECRETS_TARGET_PACKAGE = targetPackage;
    env.VC_SECRETS_TARGET_BIN = binName;
    // The one place this package's env-sanitization decision is reversed, and the bound is this
    // line: the value is composed HERE, from a path derived from this file's own location, after
    // the inherited one has been dropped. Configuration still cannot express it (loadConfig
    // rejects the key) and backend tools still never see it (runTool sanitizes unconditionally).
    env.NODE_OPTIONS = `--import "${pathToFileURL(preloadPath).href}"`;

    return env;
}

const NODE_IMPORT_FLOOR = [18, 18, 0];

// Shared with the two refusal messages: they must distinguish "read a version, and it is too old"
// from "could not read one at all", and a second copy of this pattern would let the two drift into
// disagreeing about which case a given string is.
const NODE_VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)/;

function childNodeSupportsImport(version) {
    const match = NODE_VERSION_RE.exec(String(version ?? ""));
    if (match === null) {
        // Refused rather than assumed: an unrecognised NODE_OPTIONS flag makes node abort at
        // startup, so guessing "new enough" trades a named error here for a server that does not
        // start behind a message pointing at the flag instead of at us.
        return false;
    }
    const parts = [Number(match[1]), Number(match[2]), Number(match[3])];
    for (const [i, floor] of NODE_IMPORT_FLOOR.entries()) {
        if (parts[i] !== floor) {
            return parts[i] > floor;
        }
    }

    return true;
}

// The one wording for "this node cannot take a renewal", shared by the launch refusal and doctor's
// FAIL. They measure the same thing and used to hedge differently, which reads as two findings about
// two subjects; and a declaration whose command is not node reached a sentence calling the PATH node
// "the closest probe", which is not close to anything when nothing below `dnx` is node at all.
//
// `declared` is whether `command` is the binary that was probed. When it is not, which node runs the
// server is not knowable from the declaration -- NODE_OPTIONS reaches every node below the launcher,
// and a wrapper may resolve any of them or none -- so the sentence reports the PATH node as the thing
// measured and does not promise what the launch will do.
function childNodeRefusal({ launchableName, command, declared, version }) {
    const subject = declared
        ? `the node that runs "${launchableName}" (${command})`
        : `the node on PATH -- "${launchableName}" launches through "${command}", so which node runs it `
            + `is not knowable from the declaration --`;
    // "predates" is a version comparison, so it may only be said where a version was read. A probe
    // that could not run returns its reason here, and calling that reason old asserts a comparison
    // nothing performed -- sending the reader to upgrade a node that answered perfectly well.
    const verdict = NODE_VERSION_RE.test(String(version ?? ""))
        ? `predates --import (${NODE_IMPORT_FLOOR.join(".")})`
        : `is not a version to compare against --import (${NODE_IMPORT_FLOOR.join(".")})`;

    return `${subject} reports ${version || "no version"}, which ${verdict} -- a renewed token `
        + `could not be delivered through it`;
}

// The environment a launched child starts from, before the launchable's own values are merged in: the
// inherited one without the code-injection variables (sanitizeEnv) and without the legacy plaintext
// credentials. Every spelling of those goes, not only the canonical one, for the reason isDangerousEnvKey
// folds case: on Windows a name differing only by case is the same variable, and the result is a plain
// object that no longer folds anything, so deleting AZURE_CLIENT_SECRET leaves `Azure_Client_Secret`
// standing. Unconditional, because keeping one spelling while the declaration adds another would hand the
// child both and let the platform pick -- the merge runs after this, so whatever the launchable declares
// wins there. A stale session token must not leak into the child. Shared with the version probe, so the
// two cannot drift on what is scrubbed.
function inheritedChildEnv(env) {
    const out = sanitizeEnv(env);
    for (const key of Object.keys(out)) {
        if (LEGACY_SECRET_ENV_VARS.includes(key.toUpperCase())) {
            delete out[key];
        }
    }

    return out;
}

// The environment a node version probe resolves its command in and runs under: the inherited one, scrubbed
// as the launch's child is (inheritedChildEnv), merged with the launchable's DECLARED `literal:` values and
// nothing else. A `secret:` or `oauth:` value is left out because it would put a credential into a process
// that only has to print a version, and doctor could not resolve one without spending it. What that means
// for resolution: PATH and PATHEXT decide which binary is found, and either one declared as a `literal:`
// is seen here while one declared as `secret:` is not and stays the inherited one -- so the probe
// searches what the spawn searches only where both are literal or undeclared. One builder for the launch and for
// doctor, so the two cannot drift on what the probe is given.
function probeEnvFor(launchable, base = process.env, platform = process.platform) {
    const declaredLiterals = {};
    for (const [envVar, value] of Object.entries(launchable.env)) {
        const literal = parseLiteral(value);
        if (literal !== null) {
            declaredLiterals[envVar] = literal;
        }
    }

    return mergeDeclaredEnv(inheritedChildEnv(base), declaredLiterals, platform);
}

// What doctor asks about every oauth launchable's node, as data rather than as a side effect. Pure
// but for `probe`, which is the seam: cmdDoctor around it performs real keystore io and cannot be
// driven from a test, so leaving this inline meant the only available check was grepping the source
// -- and a grep for the presence of a guard passes against a guard that has been disabled, which was
// measured here rather than supposed.
//
// Two dedups, because oauthReferences yields one entry per ENV VAR, not per launchable.
// `seenLaunchables` keeps the report honest: a launchable naming two oauth entries is one machine
// fact and must be one finding, or doctor prints the same sentence twice and the reader goes looking
// for a second problem. (cmdLaunch refuses such a declaration, but only at launch, so doctor is where
// it is seen at all.) `probedVersions` is the cheaper one: it saves a duplicate `--version` spawn
// where several launchables resolve to the same binary. Its key is what will be probed AND the PATH it
// is looked up on -- on win32 PATHEXT too, which decides the file as much as PATH does: a declaration
// may set its own, and two launchables commanding the same name under different ones are two binaries.
// Every wrapper on the same PATH still collapses onto the one PATH entry; two spellings of one node are
// still probed twice, which costs a process and no correctness.
//
// The probe mirrors cmdLaunch, so doctor's verdict and the launch's are answers about the same binary
// rather than about two different ones -- as far as the declaration names one: a wrapper command is
// probed as `node`, and the message says so. The environment it resolves in is built by probeEnvFor for
// both: a PATH or PATHEXT declared as a `literal:` is seen, one declared as `secret:` is not and stays the
// inherited one, so the two agree except where only a credential store can supply it.
//
// `refused` is trustAssessment's problems, keyed the way `seen` is. A launchable in it is skipped: the
// probe SPAWNS the declared command, and for a repository's launchable nobody has trusted that is the
// execution the launch gate exists to refuse. The skip lives here rather than in the caller so that a
// caller cannot forget it -- which only holds while `refused` has no default: an empty one would let the
// omission pass silently, so leaving it out throws instead, and a caller with nothing refused says so
// with `new Map()`.
function childNodeProbes(cfg, references, { probe = childNodeVersionIo, platform = process.platform, env = process.env, refused } = {}) {
    if (!(refused instanceof Map)) {
        throw new Error("childNodeProbes needs `refused`, a Map of the launchables the trust gate refuses -- "
            + "probing one would run a command nobody has approved");
    }
    const probedVersions = new Map();
    const seenLaunchables = new Set();
    const out = [];
    for (const { kind, launchableName } of references) {
        const seen = `${kind}/${launchableName}`;
        if (seenLaunchables.has(seen) || refused.has(seen)) {
            continue;
        }
        seenLaunchables.add(seen);
        const { command } = cfg[kind][launchableName];
        const probed = isNodeCommand(command, { platform }) ? command : "node";
        const probeEnv = probeEnvFor(cfg[kind][launchableName], env, platform);
        // NUL cannot occur in any part, so no combination can spell another's key. PATHEXT is part of the
        // key on win32 only, where it decides which extensions the lookup tries.
        const pathValue = (platform === "win32" ? windowsEnvValue(probeEnv, "PATH") : probeEnv.PATH) ?? "";
        const memoKey = platform === "win32"
            ? `${probed}\0${pathValue}\0${windowsEnvValue(probeEnv, "PATHEXT") ?? ""}`
            : `${probed}\0${pathValue}`;
        if (!probedVersions.has(memoKey)) {
            probedVersions.set(memoKey, probe({ command: probed, env: probeEnv }));
        }
        out.push({ launchableName, command, declared: probed === command,
            version: probedVersions.get(memoKey) });
    }

    return out;
}

// Whether a declared `command` names a node binary, so its own version can be probed. A declaration
// reaches its server through `npx`, a `.bin` shim or a wrapper just as often, and for those the node
// that ends up running the entry file is not knowable from the declaration: NODE_OPTIONS reaches every
// node below the launcher, so a wrapper that ends in `exec node` delivers a renewal perfectly well --
// which node it picked is simply not something the declaration says. `dnx` is the case that genuinely
// cannot receive one, because nothing below it is node at all.
function isNodeCommand(command, { platform = process.platform } = {}) {
    if (typeof command !== "string" || command === "") {
        return false;
    }
    const P = platform === "win32" ? path.win32 : path.posix;
    const base = P.basename(command).toLowerCase();

    return base === "node" || (platform === "win32" && base === "node.exe");
}

// The node that runs the server need not be the one running this launcher — so the gate reads the
// CHILD's version. Reading our own would pass happily on a machine where the server cannot start.
//
// `command` is the binary this launch will actually spawn, when that binary is a node. A declaration
// naming an absolute node -- or any node other than the one first on PATH -- is measured by the wrong
// probe otherwise, and the error it produces is wrong in both directions: an old PATH node refuses a
// server that would have started, and a new one passes a child that then aborts on --import. Callers
// that cannot name a node (a declaration commanding `npx`, a wrapper, or anything not node at all)
// pass the literal "node" and get the PATH one, which is a proxy rather than an answer -- so the
// message built from it must say which of the two it holds. See isNodeCommand and childNodeRefusal.
//
// `env` is what `command` is resolved against and what the probe runs under: built by probeEnvFor, so that
// a PATH the declaration sets as a literal is the one searched, as it is for the spawn, and no resolved
// secret is in it. It defaults to this process's for a caller with no launchable to speak of.
//
// `run` is a seam only so the FAILURE path can be driven: the success path needs no help, but a
// probe that cannot run is the case this function now has to describe, and arranging a real spawn
// failure portably means breaking PATH resolution, whose rules differ per platform and node version.
function childNodeVersionIo({ command = "node", platform = process.platform, env = process.env, run = spawnSync,
    existsSync = fs.existsSync } = {}) {
    let invocation;
    try {
        invocation = buildSpawnInvocation(resolveSpawnCommand(command, { platform, env, existsSync }), ["--version"]);
    } catch (e) {
        // A node the resolver cannot find is a probe that could not run, which is the failure return
        // below and not an exception: both consumers turn this string into a refusal that names the
        // reason, and a throw here would escape them as an uncaught error from `doctor`.
        return `no usable version (${e.message})`;
    }
    const r = run(invocation.cmd, invocation.args,
        // Sanitized like runTool's and cmdLaunch's children, and last so no invocation option can
        // put a loader back. What this seam can actually show is the loud failure: node validates
        // NODE_OPTIONS even for --version, so an inherited value it rejects leaves the probe empty
        // and the launcher refuses a server that would have started. Measured: --version exits
        // before any preload runs, so an inherited `--require` does not execute in THIS child; it
        // would in any child that runs code, which is why this call sanitizes on the same rule
        // rather than on a weaker per-site judgement.
        { encoding: "utf8", timeout: TIMEOUT_LOCAL_MS, windowsHide: true, ...invocation.opts,
            env: sanitizeEnv(env) });
    if (r.error || r.status !== 0) {
        // The reason rides out in the RETURN VALUE, because both consumers turn this into a refusal
        // AND a message, and both were handed "". A node missing from PATH, a node killed by the
        // timeout, and a node that aborted because it rejected an inherited NODE_OPTIONS all read as
        // "no version" -- and that last one is the case this probe was added to catch, so it was the
        // one indistinguishable from the others. Any non-version string still fails
        // childNodeSupportsImport's match, so what happens next is unchanged; only what the
        // developer is told changes. A child killed by a signal carries no status at all, so the
        // signal is the part that names it. The OOM killer on a loaded machine reaches this branch;
        // `TIMEOUT_LOCAL_MS` does not, because spawnSync reports that one as ETIMEDOUT on `error`,
        // which is both earlier here and the more precise of the two answers.
        return `no usable version (${r.error?.code ?? r.error?.message
            ?? (r.signal ? `killed by ${r.signal}` : `exit ${r.status}`)})`;
    }

    return (r.stdout ?? "").trim();
}

// killProcessTree's follow-up SIGKILL: how long after the signal, and whether the timer keeps the process
// alive to deliver it. The default is for a caller that exits on its own.
const DEFAULT_KILL_ESCALATION = { afterMs: 5000, ref: false };

// The launcher's own escalation. It has to be SHORTER than the client's shutdown window, or it never
// runs: the MCP TypeScript SDK's stdio transport closes a server by ending stdin, waiting 2 s, sending
// SIGTERM, waiting 2 s, then SIGKILL (packages/client/src/client/stdio.ts in
// modelcontextprotocol/typescript-sdk). SIGKILL cannot be handled, so a launcher still waiting on a
// direct child that traps SIGTERM dies without running any handler, and the group -- which holds the
// secrets in its environment -- outlives it. The same file on the SDK's main branch also has an internal
// _dispose() for a version-negotiation probe sibling, which sends SIGTERM and then SIGKILL after only
// 1000 ms. The escalation must finish inside that shorter window, so it is half of it. Whether released
// clients ship that path was not verified, and the figure is chosen for the case where they do. That
// window is an MCP client's, so it binds servers only: a task is started by a person from a terminal,
// nothing SIGKILLs the launcher behind it, and so short a window is too little for a run that writes
// its summary or rolls back on Ctrl-C -- a task keeps the grace the default always gave it. Ref'd in
// both cases so that firing does not depend on some other handle keeping the loop alive -- today the
// child's own handle does, but this timer is the whole guarantee and should not lean on that.
const LAUNCH_KILL_ESCALATION = {
    servers: { afterMs: 500, ref: true },
    tasks: { afterMs: 5000, ref: true },
};

// How long a server's group is given to leave on its own once the client has closed the launcher's stdin,
// before the launcher tears it down. The client's shutdown is "end stdin, wait 2 s, SIGTERM, wait 2 s,
// SIGKILL" (see LAUNCH_KILL_ESCALATION), and the point of relaying stdin is to act inside that first 2 s:
// a launcher that waits for the SIGTERM may never get one (the client died), and a SIGKILL runs nothing.
// A server that reads stdin to EOF and exits is not hurried -- it has this long, and its close ends the
// launcher through the ordinary path. What has to fit inside the 2 s is this grace plus the server
// escalation that follows it (1000 + 500 ms).
const LAUNCH_STDIN_CLOSE_GRACE_MS = 1000;

// A signal reaches the direct child only. On Windows that leaves a grandchild running: `dnx` spawns
// dotnet.exe, which survives, orphans, and keeps a lock on the package file it was reading -- so the
// NEXT run fails with "the process cannot access the file" instead of the clean timeout it deserved.
//
// SYNCHRONOUS on the win32 branch on purpose: a caller that kills and exits on the next line races its
// own teardown, and an async spawn loses. The POSIX path needs no such care -- kill(2) has been
// delivered on return.
//
// Two follow-up timers exist, and they serve different callers. The default is unref'd, so it can never
// hold a process open: it is for a caller that stays alive after the kill. Every caller here except
// cmdLaunch exits on the next line and takes that timer with it, so for them it is inert. cmdLaunch is
// the caller whose survival is the point -- it passes LAUNCH_KILL_ESCALATION for its kind, ref'd, because a
// direct child that traps the signal keeps the launcher running and nothing else would end it. The
// "exit" handler in cmdLaunch covers every way the launcher leaves ON ITS OWN; only the ref'd timer makes
// it leave.
//
// The child must have been spawned DETACHED, or `-child.pid` names a group it is not in: usually
// absent, but a recycled pid makes it someone else's, and that group takes the SIGKILL follow-up.
// cmdLaunch and vc-secrets-probe.mjs both spawn detached.
//
// Returns the SIGKILL follow-up timer so a caller that later stands its handlers down can clear it, or
// null where none was armed: on win32, where taskkill /T /F is already forced, and when `escalation` is
// null, which is how a caller that forwards several signals arms it once.
function killProcessTree(child, signal, { platform = process.platform, spawnSyncProcess = spawnSync,
    killProcess = (pid, sig) => process.kill(pid, sig),
    resolveCommand = (command) => resolveSpawnCommand(command, { platform }),
    escalation = DEFAULT_KILL_ESCALATION } = {}) {
    if (platform === "win32") {
        let taskkill;
        try {
            // Absolute, because a bare `taskkill` is looked up in the cwd first and this runs from the
            // project checkout.
            taskkill = resolveCommand("taskkill.exe").cmd;
        } catch (e) {
            if (!(e instanceof VcSecretsError)) {
                throw e;
            }
            // The direct child only, which is what a plain kill reaches; a tree left running beats
            // running whatever a lookup in the cwd would have found.
            child.kill(signal);

            return null;
        }
        spawnSyncProcess(taskkill, ["/PID", String(child.pid), "/T", "/F"],
            { stdio: "ignore", windowsHide: true });

        return null;
    }
    let group = true;
    try {
        killProcess(-child.pid, signal);   // the group, which is why both callers spawn detached
    } catch {
        // No group of its own, so escalating to the group below would signal a pgid this child is not
        // in -- and pids are recycled, so in principle somebody else's.
        group = false;
        child.kill(signal);
    }
    if (escalation === null) {
        return null;
    }
    const timer = setTimeout(() => {
        try {
            if (group) {
                killProcess(-child.pid, "SIGKILL");
            } else {
                child.kill("SIGKILL");
            }
        } catch { /* already gone */ }
    }, escalation.afterMs);
    if (!escalation.ref) {
        timer.unref();
    }

    return timer;
}

// The signals a launcher (and the probe, which spawns one) takes over from the child it detached. SIGQUIT
// is left out on win32: libuv's Windows signal support is limited, and whether `process.on("SIGQUIT")`
// is accepted there was not verified -- if it threw, it would abort every Windows launch before the child
// started, to guard a Unix keystroke (Ctrl-\). A parameter so a test
// can say what win32 gets without being on it.
function forwardedSignalsFor(platform = process.platform) {
    return platform === "win32" ? ["SIGINT", "SIGTERM", "SIGHUP"] : ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"];
}

// A repeating interval rather than one timer aimed at the margin: a timer that long fires late after
// a host suspend, and a late wake costs a window of 401s nothing will retry, because the launcher is
// not in the data path and cannot see one.
//
// BOUNDED FROM ABOVE by MARGIN_MS (vc-secrets-cache.mjs): entering the margin is noticed up to one
// tick late, so this granularity spends the same budget the margin holds for the renewal's two
// keystore writes, an exchange and a wrong clock. Raising it past that budget breaks nothing
// observable, which is why a test ties the two together across the modules the terms live in
// (vc-secrets-oauth.test.mjs).
const RENEWAL_TICK_MS = 5 * 60 * 1000;

// One launch path for both kinds. A `task` is not an MCP server, but everything that matters here is
// the same: resolve, strip the inherited legacy vars, inject into this child only, forward stdio, and
// take the whole process group down on a signal. Giving tasks their own copy of this is how the two
// would drift on the parts that are security-relevant.
async function cmdLaunch(kind, name, cfg, deps = {}) {
    // The gate stands before anything that could prompt or spend a credential: a repository nobody has
    // trusted must not cost even a keystore unlock, and refusing after resolution would have already
    // handed it that. The trust file is read only when trustGateOf says the launch is gated: the winning
    // entry is a repository's, or it is the person's own but reads a namespace the repository declares.
    // Every other user-scope launch never depends on the file -- an unreadable one cannot take down the
    // servers you wrote yourself.
    if (trustGateOf(cfg, requireLaunchable(kind, name, cfg)) !== null) {
        const problem = trustProblem(cfg, kind, name, deps.trustState ?? readTrustState(process.env));
        if (problem !== null) {
            throw new VcSecretsError(trustRefusal(kind, name, problem, cfg));
        }
    }
    const startedAt = process.hrtime.bigint();
    const resolver = makeSecretResolver(cfg);
    // On win32 the launch's tree is bound to this process with a job object, so that a TerminateProcess of
    // the launcher -- how an MCP client stops a server there -- ends the server and everything under it;
    // the reasoning is at PS_CRED_READ_MANY. For servers and tasks alike, as the POSIX "exit" handler below
    // kills the group for both. It has to happen BEFORE the spawn, because only a process created after the
    // assignment is in the job, and it rides in the same PowerShell call as the Credential Manager reads,
    // which resolveEnvEntries makes before its first read -- after validation, so a refused launch starts
    // no PowerShell at all. With no wcm name to read, the call is the bind alone.
    //
    // A bind that fails -- a restricted context can deny the job calls -- leaves the launch where it was
    // before this existed: it runs, and says once that a client stop may leave its tree behind. Refusing
    // to launch over it would trade a working server for a guarantee the platform would not give.
    //
    // The oauth entries' two keys ride in that same call when oauthLaunchDeps will read the Credential
    // Manager, which saves the launch two more PowerShell round trips. What comes back is held apart
    // (oauthSeed) and handed to oauthLaunchDeps, whose first readCache alone may use it. It is not part of
    // the Map prefetch returns, which is keyed by a secret's name: an entry and a secret may share one.
    let oauthSeed = null;
    const prefetch = (deps.bindPlatform ?? process.platform) === "win32"
        ? async (refs, oauthRefs) => {
            // The backend oauthLaunchDeps defaults to. An invalid VC_SECRETS_LOCAL_BACKEND is not raised here:
            // it is raised where it is today, by the read that needs it.
            let oauthBackend = null;
            if (oauthRefs.length > 0) {
                try {
                    oauthBackend = deps.backend ?? detectLocalBackend();
                } catch (e) {
                    if (!(e instanceof VcSecretsError)) {
                        throw e;
                    }
                }
            }
            const extraKeys = oauthBackend === "wcm"
                ? oauthRefs.flatMap(({ name: entryName, decl }) => Object.values(oauthEntryKeys(entryName, decl, cfg)))
                : [];
            const { seeded, job, outcomes } = await resolver.readWcmBatch(refs,
                { pid: process.pid, extraKeys, ...(deps.credReadMany ? { run: deps.credReadMany } : {}) });
            oauthSeed = outcomes.size > 0 ? outcomes : null;
            if (job !== "ok") {
                // A whole-call failure carries PowerShell's stderr, which can span lines; the warning is one.
                const why = Number.isInteger(job) ? `win32 error ${job}` : job.replace(/\s*\r?\n\s*/g, " ");
                fs.writeSync(2, `vc-secrets: could not bind the launch's process tree to this launcher (${why})`
                    + " -- a client stop may leave it running\n");
            }

            return seeded;
        }
        : undefined;
    const entries = await resolveEnvEntries(name, cfg, resolver, kind, { prefetch });
    if (process.env.VC_SECRETS_TIMING === "1") {
        const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
        process.stderr.write(`vc-secrets: resolve phase took ${ms.toFixed(0)} ms\n`);   // budget measurement
    }
    if (entries.oauth.length > 1) {
        // One launch carries one token, one channel and one VC_SECRETS_TOKEN_ENV. Two references
        // would silently renew whichever the last write won, so refuse where the cause is still visible.
        throw new VcSecretsError(`${kind === "tasks" ? "task" : "server"} "${name}" references ${entries.oauth.length} `
            + `oauth entries (${entries.oauth.map((x) => x.envVar).join(", ")}) -- a launch can renew only one`);
    }
    const server = cfg[kind][name];
    let childEnv = mergeDeclaredEnv(inheritedChildEnv(process.env), entries.env);

    // Only a launchable with an oauth reference goes through what follows. Every other one takes
    // the plain spawn path -- routing them all through this would widen the NODE_OPTIONS carve-out
    // past the child it was authorised for.
    const [oauthEntry] = entries.oauth;
    let channel = null;
    let launchDeps = null;
    let token = null;
    let renewalTimer = null;
    const cleanup = () => {
        if (renewalTimer !== null) {
            clearInterval(renewalTimer);
        }
        channel?.removeSync();
    };
    if (oauthEntry !== undefined) {
        launchDeps = { serverName: oauthEntry.name,
            ...oauthLaunchDeps(oauthEntry.name, oauthEntry.decl, cfg, { ...deps, seed: oauthSeed }), ...deps };
        oauthSeed = null;   // oauthLaunchDeps holds the only reference that may be used, and drops it at its first read
        token = await ensureFreshToken(launchDeps);
        // Probe the declared binary when it is a node; otherwise the PATH node, which is a guess at
        // what the wrapper will resolve. The message distinguishes the two, because a refusal naming
        // a node the reader never declared is one they cannot act on.
        const probed = isNodeCommand(server.command) ? server.command : "node";
        // A declaration that sets PATH as a literal would otherwise be judged by the node this process's PATH
        // finds, and the launch run another. Not childEnv itself -- that holds the resolved secrets, and a
        // version probe has no use for them; a PATH or PATHEXT declared as `secret:` is therefore what the
        // probe cannot see (see probeEnvFor).
        const version = (deps.childNodeVersion ?? childNodeVersionIo)({ command: probed, env: probeEnvFor(server) });
        if (!childNodeSupportsImport(version)) {
            throw new VcSecretsError(childNodeRefusal({ launchableName: name, command: server.command,
                declared: probed === server.command, version }));
        }
        const nonce = crypto.randomBytes(32).toString("base64url");
        // "exit" is where this process actually leaves: the normal path is child.on("close") ->
        // process.exit and a thrown error is fail() -> process.exit, neither of which runs a
        // signal handler. A filesystem socket outlives its process unless something removes it.
        //
        // Registered BEFORE the channel exists, because everything in between is a window where a
        // throw leaks the directory -- resolving the spawn command and the spawn itself both live
        // there, and fail() runs only the handlers already installed. With a null channel the
        // handler is a no-op, so registering early costs nothing and closes the window entirely.
        process.on("exit", cleanup);
        const scopeKey = scopeKeyFor(oauthEntry.decl, cfg);
        channel = await (deps.createChannel ?? createChannel)({ name, scopeKey, nonce });
        childEnv = buildChildEnv(childEnv, { token, envVar: oauthEntry.envVar,
            channelPath: channel.path, nonce, preloadPath: PRELOAD_PATH,
            targetPackage: oauthEntry.decl.targetPackage, binName: oauthEntry.decl.binName });
    }

    // Looked up against the CHILD's environment, because that is the PATH its own spawn would search:
    // a declaration may set PATH (it is not denylisted), and resolving against this process's would
    // find a different binary than the one Node then fails to, or does, run.
    const invocation = buildSpawnInvocation(
        (deps.resolveCommand ?? resolveSpawnCommand)(server.command, { env: childEnv }), server.args);
    // With "inherit" the client's stdin reaches the SERVER, and its EOF reaches only the server: the MCP
    // SDK's stdio transport has no end handler, so a server holding the event loop (an interval, a socket,
    // a child) never leaves, and if the client died no SIGTERM ever comes -- the launcher and the detached
    // group holding the secrets live on. So a server's stdin goes through the launcher, which can act on
    // the EOF. A task keeps the terminal itself (Ctrl-C, prompts); win32 keeps "inherit" too, where the
    // group is bound to the launcher another way; and a TTY is a person at a keyboard, not a client that
    // closes a pipe. The stream is looked up only once the others are ruled out, so a task never touches
    // process.stdin.
    const stdin = kind === "servers" && process.platform !== "win32" ? deps.stdin ?? process.stdin : null;
    const relayStdin = stdin !== null && !stdin.isTTY;
    const child = (deps.spawnFn ?? spawn)(invocation.cmd, invocation.args, {
        stdio: relayStdin ? ["pipe", "inherit", "inherit"] : "inherit",
        env: childEnv,
        detached: process.platform !== "win32",   // own process group -> we can kill the whole tree
        ...invocation.opts,
    });
    resolver.resolvedValues.length = 0;   // shrink the in-heap window

    let unattachedTicks = 0;
    let everAttached = false;
    let renewing = false;
    if (channel !== null) {
        renewalTimer = setInterval(() => {
            // Asked every tick, and before the exchange, because "is anything attached" is a property
            // of the channel rather than of the token. Counting it on the renewal instead made the
            // warning wait for a NEW token: ensureFreshToken returns the cached one while it is still
            // valid, so the first line arrived at the first mid-life refresh -- about 48 minutes into
            // a 60-minute token -- and the escalation only at the rotation after that, half an hour
            // after the token the server started with had expired. The text promised ticks; the
            // counter counted rotations.
            if (channel.peers() > 0) {
                everAttached = true;
                unattachedTicks = 0;   // whatever the count was about is over, and its claim with it
            } else {
                unattachedTicks += 1;
                // The first is ordinary and its promise is true: a server still starting has not
                // connected yet, and the handover does happen when it does. A SECOND means another
                // RENEWAL_TICK_MS passed with nothing attached, and by then the likely cause is that
                // no process ever matched the declared target -- at which point repeating the first
                // message would be asserting a future that will not arrive.
                //
                // That diagnosis is only available while nothing has EVER attached. A client can drop
                // while the launcher lives (the channel deletes it from the push set on close or
                // error), and then the count starts over from zero -- so without everAttached the
                // second tick after a drop would state, of a process that did match and did receive
                // tokens, that none ever matched. Resetting the count alone only delayed that by two
                // ticks; it is the CLAIM that has to be withdrawn, not the timer restarted.
                //
                // The preload cannot report this from its own side: NODE_OPTIONS reaches every node
                // process the server spawns, so failing isTargetEntry is the ordinary case there and
                // a line per miss would bury the one that matters.
                //
                // Silent from the third on: while nothing attaches the condition does not change, so
                // a line every tick would be noise -- but latching at ONE was what let the false
                // promise stand as the last word.
                if (unattachedTicks === 1) {
                    fs.writeSync(2, "vc-secrets: nothing is connected to the token channel; a renewed token "
                        + "will be handed over when a process connects\n");
                } else if (unattachedTicks === 2 && !everAttached) {
                    fs.writeSync(2, "vc-secrets: still nothing connected to the token channel -- no process has"
                        + ` matched the declared target (targetPackage "${oauthEntry.decl.targetPackage}"`
                        + `${oauthEntry.decl.binName ? `, binName "${oauthEntry.decl.binName}"` : ""}),`
                        + " so the server is running on the token it started with and will lose access when"
                        + " that one expires\n");
                }
            }
            // A tick can outlast its own interval -- the contended wait alone runs to 45 s -- and
            // overlapping ticks cannot double-exchange (the bind is process-wide) but do multiply
            // the poll load on the backend least able to absorb it.
            if (renewing) {
                return;
            }
            renewing = true;
            // Through the same locked path as the launch: every concurrent launcher computes its
            // schedule from the same expiry, so without the lock they all wake together and all
            // exchange -- and Entra rotates on use, which signs out every session but one.
            ensureFreshToken(launchDeps).then((fresh) => {
                if (fresh === token) {
                    return;
                }
                token = fresh;
                // The delivery count is not read here: a push reaching nobody is the same condition
                // the tick above already counted, on the same tick, and reporting it twice would put
                // the warning back on the rotation clock it was moved off.
                channel.push(fresh);
            }).catch((e) => {
                // Loud on fd 2 and nowhere else: the stdio channel is the client's, and the
                // server keeps serving on the token it already has until that token expires.
                fs.writeSync(2, `vc-secrets: renewal failed: ${e.message}\n`);
            }).finally(() => {
                renewing = false;
            });
        }, deps.renewalTickMs ?? RENEWAL_TICK_MS);
        renewalTimer.unref();   // must not keep the launcher alive after the child is gone
    }

    // The escalation is armed by the FIRST signal only: a second one (a client's SIGINT after its own
    // SIGTERM) re-signals the group but must not restart the clock the first one set.
    let escalationTimer = null;
    let stdinGraceTimer = null;
    const onSignal = (signal) => {
        // A signal has already started the teardown the grace timer would start; left armed, it would
        // signal the group a second time after the first one's escalation has been running.
        clearTimeout(stdinGraceTimer);
        const timer = killProcessTree(child, signal,
            { escalation: escalationTimer === null ? LAUNCH_KILL_ESCALATION[kind] : null });
        escalationTimer ??= timer;
    };
    // SIGHUP as well: it is what a closing terminal delivers, and the child is detached into a group of
    // its own, so without a handler the launcher dies of it (129) and the whole group lives on. SIGQUIT
    // is the same door from a keyboard: Ctrl-\ in a task's terminal reaches only the launcher, because the
    // child sits in its own session, and the default action kills the launcher without running its
    // "exit" handlers -- the group is left standing. (Not on win32: see forwardedSignalsFor.)
    const forwardedSignals = forwardedSignalsFor(deps.signalPlatform);
    for (const signal of forwardedSignals) {
        process.on(signal, onSignal);
    }
    // The one place every way this process leaves ON ITS OWN passes: the child's close, a spawn error,
    // fail(), an uncaught exception. Not a SIGKILL of the launcher itself (the MCP client's last step, or
    // the OOM killer) -- nothing runs then, which is why a forwarded signal also arms the short
    // escalation above, and a launcher killed before it fires still leaves the group. A group member
    // that traps SIGTERM outlives the direct child (see
    // killProcessTree), and it holds the secrets in its environment. SIGKILL rather than a signal it
    // can trap, without a grace period: nothing after "exit" runs, and the MCP client's own shutdown
    // SIGKILLs this process within seconds anyway. ESRCH -- the group already empty -- is the normal
    // case. A pid-less child is a spawn that never happened, which names no group.
    const onExit = () => {
        try {
            process.kill(-child.pid, "SIGKILL");
        } catch { /* already gone */ }
    };
    if (process.platform !== "win32" && Number.isInteger(child.pid)) {
        process.on("exit", onExit);
    }
    // Named, because dispose() has to detach them: they end the PROCESS, and a caller holding a
    // handle it has already disposed would otherwise have the whole CLI exit under it when the
    // child it no longer owns happens to close.
    const onChildError = (e) => {
        // sync write: stderr is async on a POSIX pipe and on a Windows console, and process.exit drops pending writes
        fs.writeSync(2, `vc-secrets: failed to spawn ${server.command}: ${e.message}\n`);
        process.exit(1);
    };
    const onChildClose = (code, signal) => {
        clearTimeout(stdinGraceTimer);
        process.exit(signal ? 1 : (code ?? 1));   // signal collapse to 1 is accepted
    };
    child.on("error", onChildError);
    child.on("close", onChildClose);

    // The relay. EOF on the launcher's stdin means the client has closed the transport; the child gets
    // the EOF (end:false: the end and the grace timer start from one place), and a child that does not
    // leave on it within the grace is torn down through the same path a SIGTERM takes, escalation
    // included. A child that closes first ends the launcher through onChildClose. A child without a stdin
    // (the suite's fakes) has nothing to relay to. An unexpected error on either stream is thrown, which
    // the uncaught-exception path turns into the "exit" handler above killing the group -- loud, and not a
    // leak.
    const onChildStdinError = (e) => {
        if (e?.code !== "EPIPE" && e?.code !== "ERR_STREAM_DESTROYED") {
            throw e;
        }
        // The child has stopped reading, not necessarily exited: a server may close its stdin and keep its
        // event loop, and then no close is on the way. pipe() detaches on this error and leaves the
        // launcher's stdin paused, so the client's EOF -- queued behind whatever it wrote last -- would
        // never be read and the grace timer never armed. Keep draining; onStdinEnd still gets the EOF.
        stdin.unpipe(child.stdin);
        stdin.resume();
    };
    const onStdinEnd = () => {
        // The stream may already be destroyed by the error above; ending it again has nothing to do.
        if (!child.stdin.destroyed) {
            child.stdin.end();
        }
        // A signal that got here first has begun the teardown and armed the escalation; a grace timer
        // behind it would only signal the group again.
        if (escalationTimer === null) {
            stdinGraceTimer = setTimeout(() => onSignal("SIGTERM"), LAUNCH_STDIN_CLOSE_GRACE_MS);
        }
    };
    const relaying = relayStdin && child.stdin != null;
    if (relaying) {
        child.stdin.on("error", onChildStdinError);
        stdin.on("end", onStdinEnd);
        stdin.pipe(child.stdin, { end: false });
        // A stdin that has already ended will not emit "end" again.
        if (stdin.readableEnded) {
            onStdinEnd();
        }
    }

    // A launch outlives this call in production -- the process exits from the handlers above -- so
    // the handle exists for callers that must end one without ending the process: the suite, and
    // any later verb that launches a server to ask it something.
    return {
        child,
        channel,
        dispose: async () => {
            process.off("exit", cleanup);
            process.off("exit", onExit);
            for (const signal of forwardedSignals) {
                process.off(signal, onSignal);
            }
            child.removeListener("error", onChildError);
            child.removeListener("close", onChildClose);
            clearTimeout(stdinGraceTimer);
            if (relaying) {
                stdin.removeListener("end", onStdinEnd);
                stdin.unpipe(child.stdin);
                child.stdin.removeListener("error", onChildStdinError);
            }
            if (renewalTimer !== null) {
                clearInterval(renewalTimer);
            }
            if (escalationTimer !== null) {
                clearTimeout(escalationTimer);
            }
            await channel?.close();
        },
    };
}

function cmdRun(serverName, cfg, deps = {}) {
    return cmdLaunch("servers", serverName, cfg, deps);
}

// The declared-task counterpart of `run`. There is deliberately no verb that takes a command from the
// caller: a task's argv lives in the declaration, so it is reviewed in a PR like a server's, and the
// tool still has no way to print a secret or route one into something chosen at the call site.
function cmdTask(taskName, cfg, deps = {}) {
    return cmdLaunch("tasks", taskName, cfg, deps);
}

export {
    CHANNEL_GREETING_MAX, channelPipeName, createChannel, PRELOAD_PATH, buildChildEnv,
    childNodeSupportsImport, childNodeRefusal, childNodeProbes, isNodeCommand, childNodeVersionIo,
    LAUNCH_KILL_ESCALATION, LAUNCH_STDIN_CLOSE_GRACE_MS, killProcessTree, forwardedSignalsFor, RENEWAL_TICK_MS,
    cmdLaunch, cmdRun, cmdTask,
};
