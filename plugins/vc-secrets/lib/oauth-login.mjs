// OAuth login layer: the browser callback flow and login/logout verbs; imports only from lower layers.

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";

import { VcSecretsError } from "../vc-secrets-error.mjs";
import * as cache from "../vc-secrets-cache.mjs";  // entries, expiry, the cross-process refresh lock
import * as oauth from "../vc-secrets-oauth.mjs";  // the Entra protocol
import { severingClose } from "../vc-secrets-teardown.mjs";  // the one teardown, for all three servers

import { forTerminal } from "./util.mjs";
import { commandOnPath, resolveSpawnCommand } from "./spawn.mjs";
import { CONFIG_HINT_PATH, CONFIG_NAME, DOCTOR_REMEDY, USER_SCOPE, authorizationFor } from "./config.mjs";
import { LOCAL_BACKENDS, clearOversizeMarker, deleteEntryIo, detectLocalBackend, recordOversizeMarker,
    writeSecretValue } from "./keystore.mjs";
import { requireNamespaceTrust } from "./trust.mjs";
import { acquireTokenLock, clearEntryPair, oauthEntryKeys, storeAccessEntry, tokenLockFor } from "./oauth-token.mjs";

// The interactive sign-in callback surface: the loopback listener that receives Entra's redirect,
// the leaf that decides what a given request means, the two tiny pages the browser ends up
// looking at, and the browser opener. No storage, no mutex — that is `login`'s job, not this one's.

// Root, not a descriptive path like "/callback". Entra matches the redirect URI as a string, and
// the app registration carries the bare `http://localhost` — a registered URI with no path segment
// matches only a request that has none. A path here is refused with AADSTS50011 while every local
// test still passes, because nothing local knows what Entra was told.
const REDIRECT_PATH = "/";

const MAX_ERROR_PARAMS = 20;

// The tab title says WHICH sign-in this was, because a machine can hold more than one: entries are
// named per organisation now, so two projects can each have a tab open and "vc-secrets" on both of
// them is the one thing a developer cannot use to tell them apart. Escaped although the name is
// validated `[a-z0-9-]+` at load -- the page should not depend on a check made somewhere else.
function closeTabPage(entryName = null) {
    const who = entryName ? `Signed in - ${escapeHtml(entryName)}` : "Signed in";

    return `<!doctype html><meta charset=utf-8><title>${who}</title>`
        + "<p>Signed in. You can close this tab.";
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Escaped, not because the values are trusted but because they are not: anything that can reach the
// loopback port during a sign-in chooses them, and an unescaped one would execute as script on this
// page's own origin.
function failedPage({ error, description, extras = [] }, entryName = null) {
    const rows = [["error", error]].concat(description ? [["error_description", description]] : [], extras)
        .map(([k, v]) => `<tr><td>${escapeHtml(k)}<td>${escapeHtml(v)}`).join("");

    // "Sign-in failed", never "signed in" -- in the title here and in the body below alike: either is
    // read at a glance, and a test pins that this page cannot be mistaken for the success one.
    const who = entryName ? `Sign-in failed - ${escapeHtml(entryName)}` : "Sign-in failed";

    return `<!doctype html><meta charset=utf-8><title>${who}</title>`
        + "<style>body{font:14px system-ui;margin:2rem}td{padding:.2rem .6rem;vertical-align:top}"
        + "td:first-child{color:#666;white-space:nowrap}</style>"
        + "<p><strong>Sign-in failed.</strong> The same reason is printed in the terminal where you ran"
        + " <code>vc-secrets login</code>."
        + `<table>${rows}</table>`
        + "<p>An <code>access_denied</code> with no description usually means the browser carried no work"
        + " account, and its sign-in page asked for one to be added to the browser profile instead."
        + " The other two causes are a declined consent prompt and an account not assigned to this"
        + " application -- so check which account the browser used.";
}

// Binds an ephemeral port on the loopback interface only, and resolves `next()` with the first
// request that is actually a callback. Everything else is answered 404 and waited past, so a
// browser fetching /favicon.ico cannot abort a sign-in that is about to succeed.
function listenForCallback(expectedState, { entryName = null,
    log = (line) => process.stderr.write(line) } = {}) {
    return new Promise((resolve, reject) => {
        let settle = null;
        const arrived = new Promise((r) => { settle = r; });
        const server = http.createServer((req, res) => {
            const verdict = handleCallback(req, expectedState, REDIRECT_PATH);
            if (verdict.ignore) {
                if (verdict.notice) {
                    // Said out loud, because the alternative is a sign-in that waits with no reason
                    // given. Repeatable by whoever sent it, which is why it is a notice and not a
                    // failure.
                    log(`vc-secrets: ${verdict.notice}\n`);
                }
                res.writeHead(404).end();

                return;
            }
            res.writeHead(verdict.error ? 400 : 200, { "content-type": "text/html; charset=utf-8" })
                .end(verdict.error ? failedPage(verdict, entryName) : closeTabPage(entryName));
            settle(verdict);
        });
        const severedClose = severingClose(server);
        // `reject` rejects the BIND, and is inert once listen has resolved -- after that a server
        // error would vanish while next() waited forever. Settling as well makes a listener that dies
        // mid-sign-in end the wait with a reason instead of hanging. createChannel's own
        // `server.on("error", ...)` is the counterpart for the same shape there -- it reports
        // rather than settles, because by the time that listener fires createChannel has already
        // returned and left no pending caller to settle.
        server.once("error", (e) => {
            reject(e);
            settle({ error: "listener_failed", description: e.code ?? e.message });
        });
        // 127.0.0.1 explicitly, never 0.0.0.0: the authorization code arrives in this request,
        // and a listener on every interface would accept it from the network.
        server.listen(0, "127.0.0.1", () => resolve({
            port: server.address().port,
            next: () => arrived,
            close: severedClose,
        }));
    });
}

// Spread spec.opts rather than ignoring it: the win32 spec needs windowsVerbatimArguments, and the
// previous inline default silently dropped whatever the builder asked for. A spec field nothing reads
// is worse than no field -- the builder looks correct and the launch is not.
function openBrowser(spec, { spawnProcess = spawn, log = (line) => process.stderr.write(line) } = {}) {
    const child = spawnProcess(spec.cmd, spec.args,
        { stdio: "ignore", detached: true, windowsHide: true, ...spec.opts });
    // A missing opener fails ASYNCHRONOUSLY, so the caller's try/catch is long gone by then and an
    // unhandled `error` would end the sign-in on a stack trace. Losing the browser is a degradation:
    // the URL is already printed and the listener is already waiting.
    child.on("error", (e) => log(`vc-secrets: could not open a browser (${e.code ?? e.message})`
        + " -- open the sign-in URL above by hand\n"));
    // `error` covers a spawn that never happened; this covers one that happened and then failed,
    // which is the commoner shape and was invisible. wslview with interop off, xdg-open on a
    // headless host and a policy-blocked powershell all spawn cleanly and exit non-zero, so the
    // sign-in went on waiting for a browser that was never going to appear with nothing said.
    //
    // Falsy rather than `!== 0`, because it must also pass over the null a signal gives: an opener
    // the developer killed, or one that execs into a browser and dies with it, is not the opener
    // reporting a failure of its own.
    child.on("close", (code) => {
        if (code) {
            log(`vc-secrets: the browser opener exited with code ${code}`
                + " -- open the sign-in URL above by hand\n");
        }
    });

    return child.unref();
}

function buildBrowserCommand(platform, env, url, onPath = commandOnPath,
    resolveCommand = (command) => resolveSpawnCommand(command, { platform, env })) {
    if (platform === "darwin") {
        return { cmd: "open", args: [url] };
    }
    if (platform === "win32") {
        // The empty string is a title placeholder: `start <url>` would consume the URL as the
        // window title and open nothing.
        //
        // Verbatim, with the URL quoted, because cmd.exe does not use the argv it was handed. It
        // re-parses everything after /c as one string, where a bare & separates commands -- and node
        // does not quote an argument that has no spaces, so an authorize URL arrives with every &
        // exposed. Measured on Windows: the browser received the URL truncated at `client_id`, and
        // Entra answered `AADSTS900144` naming the `scope` it was never sent. The argv-element form
        // this replaced was green in a test that asserted the element, which is not the property
        // cmd.exe reads. Same technique buildSpawnInvocation already uses for a .cmd shim.
        if (url.includes('"')) {
            // Cannot arrive from the outside today -- the URL is built here from guids, base64url and
            // configured scopes -- so this is an invariant made checkable rather than a guess about
            // input. Thrown before the browser opens, so no authorization code is at stake.
            throw new VcSecretsError("refusing to open a URL containing a double quote");
        }

        // Resolved to an absolute path, never the bare name libuv would look up in the cwd first. An
        // unresolvable cmd.exe is "no opener" rather than an error: sign-in still completes by hand
        // from the URL cmdLogin has already printed.
        let shell;
        try {
            shell = resolveCommand("cmd.exe").cmd;
        } catch (e) {
            if (e instanceof VcSecretsError) {
                return null;
            }
            throw e;
        }

        return { cmd: shell, args: [`/c start "" "${url}"`], opts: { windowsVerbatimArguments: true } };
    }
    // Named to match this package's own override convention (VC_SECRETS_LOCAL_BACKEND,
    // VC_SECRETS_POWERSHELL), not the source's launcher-prefixed spelling -- the public-repo rule
    // is that the source tool's own name must not survive into this one, env vars included.
    if (env.VC_SECRETS_WSL_NO_INTEROP === "1") {
        return null;
    }
    // Interop first, and deliberately ahead of xdg-open: inside WSL, xdg-open reaches for a Linux
    // browser that may not be installed, while these two hand the URL to the Windows default
    // browser — which is the one the developer is already signed into.
    if (onPath("wslview")) {
        return { cmd: "wslview", args: [url] };
    }
    if (onPath("powershell.exe")) {
        // Quoted for the same reason the win32 branch quotes, in the other shell's syntax: everything
        // after -Command is joined back into script text, and & is an argument-mode metacharacter
        // anywhere in a token, not only between commands (about_Parsing, "Handling special
        // characters"). Measured on Windows PowerShell 5.1: the unquoted form does not truncate the
        // URL, it does not parse at all -- exit 1, nothing on stdout, "The ampersand (&) character is
        // not allowed" -- so no browser opens and the developer is left with the by-hand fallback.
        // A single-quoted literal interpolates nothing, and arrived whole in the same measurement.
        if (url.includes("'")) {
            // Same shape as the double-quote guard above: the URL is built here, so this is an
            // invariant made checkable rather than a guess about input, and it throws before the
            // browser opens, with no authorization code at stake.
            throw new VcSecretsError("refusing to open a URL containing a single quote");
        }

        return { cmd: "powershell.exe", args: ["-NoProfile", "-Command", "Start-Process", `'${url}'`] };
    }
    if (onPath("xdg-open")) {
        return { cmd: "xdg-open", args: [url] };
    }

    return null;
}

// Filters before it interprets. Only a code or an error ends the wait; anything else is answered
// 404 and the listener keeps waiting.
function handleCallback(req, expectedState, redirectPath) {
    if (req.method !== "GET") {
        return { ignore: true };
    }
    const parsed = new URL(req.url, "http://127.0.0.1");
    if (parsed.pathname !== redirectPath) {
        return { ignore: true };   // favicon, or any path that is not the callback
    }
    // The path stopped discriminating when the callback moved to "/" to match the registered bare
    // `http://localhost`: every stray loopback GET now reaches this far. A real redirect carries
    // state and either a code or an error, so a request with none of the three is not a response to
    // this sign-in. Without this branch such a request falls into the state check below and ends the
    // wait with "state_mismatch" — aborting the sign-in and telling the developer they are under
    // attack, when a port scanner or the browser asking for "/" is the whole story. Reachable from
    // Windows under WSL, where loopback spans the boundary and the port is reachable from processes
    // outside this kernel — by port forwarding under nat, by a shared stack under mirrored.
    if (!parsed.searchParams.has("code") && !parsed.searchParams.has("error")
        && !parsed.searchParams.has("state")) {
        return { ignore: true };
    }
    // AFTER the state check, and this reverses an earlier decision here. The old order read `error`
    // first so that a genuine Entra failure showed its AADSTS code instead of a mismatch warning --
    // a good goal, kept below, because an error with a MATCHING state is still reported before the
    // code is looked at.
    //
    // What the old order also allowed: anything able to reach this port sends `?error=whatever` with
    // no state and ends the sign-in, repeatedly, with a message naming a cause the developer does not
    // have. The abort is cheap -- `login` is retryable -- but the false diagnosis is not. So a
    // request whose state does not match this sign-in decides nothing, and says so rather than
    // vanishing: if Entra ever does redirect an error without echoing state, the notice is what keeps
    // that visible instead of hanging silently.
    if (parsed.searchParams.get("state") !== expectedState) {
        return { ignore: true,
            notice: "a request reached the callback port carrying a state that is not this sign-in's"
                + " -- ignored, still waiting" };
    }
    const error = parsed.searchParams.get("error");
    if (error) {
        // Every remaining parameter, because the useful one is whichever Entra chose to send: a
        // measured `access_denied` carried no description, and reporting two fixed fields threw the
        // rest away unseen. `code` is excluded rather than trusted absent — it has no business on an
        // error redirect, and echoing one into a page or a log is the single thing this must not do.
        // Bounded here rather than at each sink, so the page and the terminal inherit one limit. A
        // real redirect carries a handful; anything that can reach this port can send thousands.
        const extras = [...parsed.searchParams.entries()]
            .filter(([k]) => !["error", "error_description", "code"].includes(k))
            .slice(0, MAX_ERROR_PARAMS);

        return { error, description: parsed.searchParams.get("error_description") ?? "", extras };
    }
    const code = parsed.searchParams.get("code");

    return code ? { code } : { error: "no_code" };
}

// Generous on purpose. Its job is to end a HANG, not to hurry a human through MFA, a password
// change or a first-time consent prompt -- anyone actually signing in returns long before it, and
// anyone who is not gets the URL and a reason instead of a cursor. Nothing in the protocol bounds
// this wait: the authorization code does not exist until the callback arrives, so its own short
// lifetime constrains what happens after, never how long we may wait for it.
const LOGIN_WAIT_MS = 10 * 60 * 1000;

// Races a promise against a timer that is ALWAYS cleared. A bare Promise.race leaves the timer
// pending on the winning path too, and node keeps the process alive until it fires -- so a sign-in
// that completed in ten seconds would hold the CLI open for the remaining ten minutes, looking
// exactly like the hang the deadline was added to prevent.
function withDeadline(promise, ms, onTimeout) {
    let timer = null;
    const expiry = new Promise((resolve) => { timer = setTimeout(() => resolve(onTimeout()), ms); });

    return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

async function cmdLogin(serverName, cfg, {
    listen = listenForCallback,
    open = openBrowser,
    browser = buildBrowserCommand,
    exchange = oauth.exchange,
    writeEntry = (name, value) => writeSecretValue(name, value),
    removeEntry = null,
    randomState = () => crypto.randomBytes(32).toString("base64url"),
    log = (line) => process.stderr.write(line),
    backend = detectLocalBackend(),
    acquireLock = null,
    now = Date.now,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    waitMs = LOGIN_WAIT_MS,
    oversize = null,
    trustState = null,
} = {}) {
    const decl = (cfg.oauth ?? {})[serverName];
    if (!decl) {
        throw new VcSecretsError(`unknown oauth entry "${serverName}" -- not declared in ${CONFIG_NAME}`);
    }
    // Refused on policy here: before the capability check below, and before anything is bound or
    // opened. Minting is the privileged act — consent happens in a browser and the refresh token it
    // yields outlives the session, so a repository that names an app registration would otherwise
    // cause a delegated token to be minted against it. resolveEnvEntries polices which launchable
    // may CONSUME a token, which is a different question from whether the token may exist at all.
    // The order also matters: telling someone who is not allowed to sign in that their machine has
    // no keystore sends them to fix the wrong thing.
    //
    // Keyed on `home`, not on the returned block: a user-scope declaration carrying no `authorized`
    // yields an absent block too, and refusing on that would demand a second opt-in in the file
    // that IS the opt-in. And `=== undefined` rather than a truthy test, because validateAuthorized
    // rejects every non-object at this leaf when the config loads — absent is the only other state
    // a real config reaches, so a truthy test would be a proxy for what the loader guarantees.
    if (decl.home !== USER_SCOPE) {
        const source = authorizationFor(cfg, decl);
        if (source.block === undefined) {
            // Carries DOCTOR_REMEDY like every other authorization refusal, because doctor now reports
            // an absent registration block through TWO paths: the crossing loop, when a project- or
            // local-scope launchable already names the entry (crossingProblem's own comment); and the
            // loop below it otherwise, for a declaration nothing references or that only a user-scope
            // launchable does. Either way naming the command here is true. Enforced by the rule
            // stated above authorizationRefusal (lib/config.mjs).
            throw new VcSecretsError(`"vc-secrets login ${serverName}" is not authorized -- the app`
                + ` registration it names must be acknowledged at ${source.where} in`
                + ` ${CONFIG_HINT_PATH}${DOCTOR_REMEDY}`);
        }
        // The acknowledgement above says the person accepts this app registration; it says nothing about
        // WHICH project's sign-in this entry replaces. The keys are namespaced by the repository's own
        // projectId, so a repository claiming another project's id would have this login overwrite that
        // project's tokens. Trust is what pins the id. Still before the capability check, the browser and
        // the listener.
        requireNamespaceTrust(cfg, "oauth", serverName, trustState);
    }
    if (!LOCAL_BACKENDS.includes(backend)) {
        // Checked before anything is bound or opened. The alternative is to discover it at the
        // very end: the developer signs in, the exchange spends the authorization code, and only
        // then does the store fail — and a code is single-use, so that ordering turns a missing
        // capability into a sign-in that cannot even be retried cleanly.
        throw new VcSecretsError(`"vc-secrets login" has no keystore on backend "${backend}" -- nothing could store the token`);
    }
    // Resolved here rather than defaulted in the parameter list: tokenLockFor needs `decl` and
    // `cfg` (this package's keystore keys are scoped per project — see tokenLockFor's own
    // comment), neither of which exists until the guard above has run. The parameter list still
    // carries a bare `acquireLock = null` in the source's position so that cmdLoginSeams' parse of
    // this function's own text keeps finding it as a seam.
    const acquire = acquireLock ?? tokenLockFor(serverName, decl, cfg);
    const removeStale = removeEntry ?? deleteEntryIo(backend);
    // A seam for the same reason removeEntry is one: the default TOUCHES THE FILESYSTEM under the
    // developer's own config directory, and a test that reaches either path without injecting it
    // does that from a run that reports nothing but a pass.
    const marker = oversize ?? { record: recordOversizeMarker, clear: clearOversizeMarker };
    const { verifier, challenge } = oauth.createPkcePair();
    const state = randomState();
    const server = await listen(state, { entryName: serverName });
    try {
        // `localhost` although the listener binds 127.0.0.1, and the two must NOT be harmonised:
        // this string is matched against the app registration, which carries `http://localhost`,
        // and Entra ignores the port only for that host. 127.0.0.1 is a different registered URI —
        // one the portal cannot even add over http, so it is not the one an administrator created.
        //
        // The port comes from the listener rather than a guess for the mirror reason: Entra would
        // redirect the browser to a port nothing is listening on, and the sign-in hangs silently.
        const redirectUri = `http://localhost:${server.port}${REDIRECT_PATH}`;
        const url = oauth.buildAuthorizeUrl({ tenantId: decl.tenantId, clientId: decl.clientId,
            scopes: decl.scopes, redirectUri, state, challenge });
        // Printed on EVERY path, and before the opener rather than instead of it. The URL carries
        // the tenant, the client, the redirect and the PKCE CHALLENGE; the verifier never leaves
        // this process, pinned by "cmdLogin: the verifier never leaves the process, only its digest
        // does". So it is not a secret, and every degradation that can follow points at it:
        // openBrowser's two failure lines say "open the sign-in URL above by hand", and
        // withDeadline's timeout verdict says the same. Printed only when there was no opener, that
        // advice named something the developer had never been shown.
        log(`vc-secrets: open this URL to sign in to "${serverName}":\n${url}\n`);
        const spec = browser(process.platform, process.env, url);
        if (spec) {
            open(spec);
            log("vc-secrets: a browser is being opened on it\n");
        }
        // `next()` resolves only when the callback arrives, and every way a browser fails to reach
        // it is silent, so the wait needs a bound of its own. It resolves to a VERDICT rather than
        // throwing, so the `verdict.error` branch below reports a deadline exactly as it reports
        // any other failed sign-in -- declawing included.
        const verdict = await withDeadline(server.next(), waitMs, () => ({ error: "timed_out",
            description: `nothing reached the callback within ${Math.round(waitMs / 1000)}s`
                + " -- if no browser opened, sign in with the URL above and run this again" }));
        if (verdict.error) {
            // The extras carry whatever Entra chose to send instead of a description; without them
            // an `access_denied` reaches the developer as one word they can do nothing with.
            const extras = (verdict.extras ?? [])
                .map(([k, v]) => `${forTerminal(k, 40)}=${forTerminal(v)}`).join(", ");
            throw new VcSecretsError(`sign-in for "${serverName}" failed: ${forTerminal(verdict.error, 60)}`
                + (verdict.description ? ` -- ${forTerminal(verdict.description, 400)}` : "")
                + (extras ? ` (${extras})` : "")
                + (verdict.description ? "" : " -- no description was sent; the usual causes are a"
                    + " declined consent prompt or an account not assigned to the application"));
        }
        const parsed = await exchange(decl.tenantId, oauth.buildTokenBody({ kind: "code",
            clientId: decl.clientId, redirectUri, code: verdict.code, verifier, scopes: decl.scopes }));
        const names = oauthEntryKeys(serverName, decl, cfg);
        // Taken HERE and not before the browser: one mutex serialises every renewal on this
        // machine, and a sign-in waits on a human, so holding it across that would stall every
        // launch for minutes. What it does cover is the window between the exchange and the writes,
        // where a renewal finishing first would have its own write land second and replace the
        // token this sign-in just obtained. This matters MORE here than in the source: entries are
        // keyed per project (oauthEntryKeys, not a bare server name), so one machine routinely
        // holds several of them signed in at once, each a login of its own.
        //
        // What the late placement LEAVES OPEN, and no mutex can close: a logout that runs while
        // this sign-in is still at the browser takes the lock uncontended, deletes both entries,
        // and reports a removal — then these writes land and the credential is back. The two never
        // overlap, so it is an ordering, not a race; closing it needs an epoch a logout bumps and
        // a login re-checks here. Deliberately not built: the shape of it is "a human left a tab
        // open across a logout", and the cost is a third entry plus a write on every logout.
        // Every failure to get the lock is caught, including the ones acquireTokenLock rethrows.
        // Past this line the authorization code is SPENT: an exception here stores nothing, clears
        // nothing, and leaves the previous login's entries in exactly the lying state the fatal
        // write branch below exists to prevent — and the developer cannot retry with the same code.
        // A reason of its own, not acquireTokenLock's "unbindable". That function classifies
        // deliberately and RETHROWS what it refuses to classify -- a TypeError from broken wiring,
        // an EMFILE under fd exhaustion -- with its own comment calling a wide catch exactly the
        // mistake this used to make: relabelling them here put them back under "the sandbox refused
        // the bind", a diagnosis nobody had made, and the reader went to check their sandbox.
        // Only the label changes HERE; storing the token anyway is unchanged and deliberate. The
        // wording that goes with it is at the `lock-failed` branch.
        const { lock, reason, error } = await acquireTokenLock({ acquireLock: acquire, now, sleep, log })
            .catch((e) => ({ lock: null, reason: "lock-failed", error: e }));
        if (reason === "busy") {
            // Waited the full ceiling and gave up. Worded as "was still holding" rather than "is":
            // the latch that got us here remembers a holder was SEEN, not that one is there now.
            // Stored anyway, which is deliberate for every unserialised reason here — but a holder
            // that later wakes and completes will overwrite this, and the developer would otherwise
            // meet that only as an unexplained request to sign in again.
            //
            // A sign-in under a DIFFERENT principal is the case the advice has to name, because it
            // is the one that stays SILENT. This path deletes the access entry while the previous
            // principal's refresh entry is still readable, so a renewal that wakes inside that
            // window exchanges it and stores that principal's pair. Nothing then asks for anything:
            // reads serve the previous account until its access token expires. cmdLogout is the
            // remedy rather than a second sign-in because it removes BOTH entries, leaving a waking
            // renewal nothing to exchange; a second sign-in re-opens this very window, since it too
            // leaves the previous refresh entry readable until it overwrites it.
            //
            // cmdLogout takes this same lock and refuses while the holder is still wedged, so the
            // advice can bounce once. Not named in the line: its refusal is loud and says what to do
            // ("find the vc-secrets run that is still refreshing it"), and the whole reason this
            // advisory exists is that the outcome is otherwise silent. A caveat here would lengthen
            // it for a case that already speaks for itself.
            log(`vc-secrets: a token renewal for "${serverName}" was still holding the lock -- storing the new`
                + " token anyway; if the next launch asks you to sign in, run this again."
                + ` If this sign-in was for a DIFFERENT account, run "vc-secrets logout ${serverName}"`
                + " and sign in again: the renewal can still store the previous account's tokens, and"
                + " reads serve that account until its access token expires\n");
        }
        if (reason === "unbindable") {
            log(`vc-secrets: the token lock could not be taken (${error?.code ?? error?.name}) -- this sign-in`
                + " is NOT serialised against an in-flight renewal\n");
        }
        if (reason === "lock-failed") {
            // Stored anyway, exactly as the two branches above store: past the exchange the
            // authorization code is SPENT, so refusing would charge the developer a fresh
            // interactive sign-in for a fault that is ours. The wording is the only thing that
            // separates this from the `unbindable` message -- "could not be taken" describes a lock
            // that was unavailable, and this is not that; nothing was wrong with the lock.
            log(`vc-secrets: taking the token lock FAILED (${error?.code ?? error?.name}) -- not a busy lock`
                + " and not a sandbox refusal, so please report it; this sign-in is NOT serialised"
                + " against an in-flight renewal\n");
        }
        try {
            // The previous login's access entry goes first, and the refresh write follows it;
            // both failures are fatal and share one clearing branch.
            //
            // The order is the whole point. An access entry carries no identity — serializeAccess
            // stores none — so cacheStatus checks the declaration against the REFRESH entry and then
            // serves whatever access token sits beside it. Sign in as a different account, store the
            // new refresh token, then fail to store the new access token, and the previous account's
            // token is still there and still inside its lifetime: the next read returns it and the
            // server runs as that principal. Deleting first makes the worst case an access entry
            // that is MISSING, which costs one exchange. Adding the identity to serializeAccess
            // instead does not close it — two people signing in on one declaration share tenant,
            // client and scopes, so the fields would match.
            //
            // Only on this path. A renewal cannot change identity, so an access entry that survives
            // there belongs to the same account and using it is correct.
            //
            // The refresh write is the single step in the design that cannot be retried: Entra kills
            // the old refresh token the moment it issues this one, so an access entry stored beside
            // a refresh token that never landed describes a session that works for an hour and then
            // cannot be renewed by anything.
            try {
                try {
                    await removeStale(names.access);
                } catch (e) {
                    // Only exit 3 means "there was no entry", which is every first login. Any other
                    // failure leaves the previous entry readable — the state this delete exists to
                    // prevent — so it takes the clearing branch below instead of being swallowed.
                    // cmdLogout draws this same line, for the mirror reason.
                    if (e.toolExitCode !== 3) {
                        throw e;
                    }
                }
                await writeEntry(names.refresh, cache.serializeRefresh({ refreshToken: parsed.refreshToken,
                    tenantId: decl.tenantId, clientId: decl.clientId, scopes: decl.scopes }));
            } catch (e) {
                // Entra has already invalidated whatever refresh token was there, so a PREVIOUS
                // login's entries are now lies: the old refresh token is dead and the old access
                // token keeps working until it expires, at which point the session dies mid-use with
                // nothing to renew from. Clearing both makes the state unambiguously signed-out.
                await clearEntryPair(removeStale, [names.access, names.refresh]);
                throw e;
            }
            // "signed in, but": the sign-in itself succeeded and the refresh entry landed, so the
            // line must not read as a failed login.
            await storeAccessEntry(names.access, cache.serializeAccess(parsed), {
                write: writeEntry, marker, log, backend, note: "signed in, but ",
            });
        } finally {
            // Covers the stale-clearing path too: that branch deletes the very entries a waiting
            // renewal is about to read, and releasing before it would let the renewal see one of
            // the two halves mid-clear.
            await lock?.release();
        }

        return { serverName };
    } finally {
        // An abandoned listener holds its port for the life of the process, and on a failure
        // path there is nobody watching to notice.
        await server.close();
    }
}

// Unlike cmdLogin, this verb carries NO authorization/policy gate: minting a credential is the privileged
// act, removing one is not, and refusing a removal on policy would leave the refresh token on disk — the
// one outcome logout exists to prevent. The one refusal it does make is the namespace's: a repository's
// entry lives under a projectId the repository chose, which may be another project's, and removing that
// sign-in is not removing the person's own. The remedy is the trust a person gives the checkout, after
// which the removal runs.
async function cmdLogout(serverName, cfg, { deleteEntry = null,
    backend = detectLocalBackend(),
    acquireLock = null, now = Date.now,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    log = (line) => process.stderr.write(line),
    trustState = null } = {}) {
    const decl = (cfg.oauth ?? {})[serverName];
    if (!decl) {
        // Before any deletion: a typo must not remove a different server's tokens, and there is
        // no way to tell afterwards which name was meant.
        throw new VcSecretsError(`unknown oauth entry "${serverName}" -- not declared in ${CONFIG_NAME}`);
    }
    // Before the lock is taken and before any deletion.
    requireNamespaceTrust(cfg, "oauth", serverName, trustState);
    // Resolved here rather than defaulted in the parameter list, for the same reason cmdLogin
    // resolves its own lock here: tokenLockFor needs `decl` and `cfg` (this package's keystore
    // keys are scoped per project), neither of which exists until the guard above has run. The
    // source's `main` wires this verb's lock itself and refuses a missing one at the call
    // site — that does not port here, because it would force this
    // package's `main` to resolve `decl` itself, duplicating the guard above AND running it before
    // it, inverting the ordering this guard guarantees. The parameter list still carries a bare
    // `acquireLock = null` -- NOT in the source's position, since `backend` precedes it here -- so
    // that cmdLogoutSeams' parse of this function's text keeps finding it as a seam. That parse is
    // cmdLogout's own: cmdLoginSeams reads cmdLogin and nothing else.
    const acquire = acquireLock ?? tokenLockFor(serverName, decl, cfg);
    const remove = deleteEntry ?? deleteEntryIo(backend);
    const names = Object.values(oauthEntryKeys(serverName, decl, cfg));
    const removed = [];
    const alreadyAbsent = [];
    const { lock, reason, error } = await acquireTokenLock({ acquireLock: acquire, now, sleep, log });
    if (reason === "busy") {
        // Refused rather than deleted anyway: a retryable logout is a far weaker failure than a
        // credential the developer has been told is gone and which is in fact back on disk.
        throw new VcSecretsError(`another vc-secrets is still refreshing the token for "${serverName}" -- logout did not get`
            + " the lock in time; retry, or find the \"vc-secrets run\" that is still refreshing it");
    }
    if (reason === "unbindable") {
        // Not a holder, and not a reason to refuse: this is EPERM in the sandbox agents run in, and
        // failing here would leave a credential that cannot be revoked from the session that needs
        // it revoked. The removal goes ahead saying out loud what it could not promise.
        log(`vc-secrets: the token lock could not be taken (${error?.code}) -- this removal is NOT`
            + " serialised against an in-flight renewal\n");
    }
    try {
        for (const name of names) {
            try {
                await remove(name);
                removed.push(name);
            } catch (e) {
                // Only exit 3 means "no such entry". Treating every failure as success would report
                // a logout that left the refresh token on disk, which is the one thing logout is for.
                if (e.toolExitCode !== 3) {
                    // What the loop already removed leaves WITH the error. Thrown bare, the return
                    // value died with the stack and the developer read "logout failed" over a state
                    // where one of the two entries is in fact gone -- and the two halves fail
                    // differently. A refresh token removed with the access token left behind keeps
                    // working for up to an hour and then cannot renew; the reverse is merely an
                    // extra exchange. The retry is the same command either way, so this is about
                    // what the developer believes is on disk, not about what to do next.
                    const partial = removed.length > 0
                        ? ` -- this logout is HALF done, "${removed.join('", "')}" already removed`
                        : "";

                    throw Object.assign(new VcSecretsError(`${e.message}${partial}`),
                        { toolExitCode: e.toolExitCode, removed: [...removed] });
                }
                alreadyAbsent.push(name);
            }
        }
    } finally {
        await lock?.release();
    }
    // The one thing that can undo this removal, said where the developer can still act on it. A
    // sign-in that was already waiting on a human takes the lock only when the browser comes back,
    // so it lands after this and writes a live token — the reasoning is at cmdLogin's lock. No
    // mutex closes that, and nothing else reports it, so deleting this line silently restores a
    // logout that can be reversed without a trace.
    //
    // Unconditional on purpose: a removal that found nothing is exactly the case where a pending
    // sign-in is the likely cause.
    log(`vc-secrets: a sign-in for "${serverName}" already open in a browser will still complete and store`
        + " a token -- close any such tab\n");

    return { removed, alreadyAbsent };
}

export {
    REDIRECT_PATH, MAX_ERROR_PARAMS, closeTabPage, escapeHtml, failedPage, listenForCallback, openBrowser,
    buildBrowserCommand, handleCallback, LOGIN_WAIT_MS, withDeadline, cmdLogin, cmdLogout,
};
