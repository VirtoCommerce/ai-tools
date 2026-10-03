// vc-secrets-oauth.mjs — the Entra OAuth protocol as pure functions plus one network call.
// ESM, matching vc-secrets.mjs; zero runtime dependencies by design — a dependency tree in the
// credential path is the cost this design refuses.
//
// AUTHORITY below is Entra-specific, and describeTokenError parses /AADSTS\d+/ out of the error
// body. The declaration schema commits the same way — vc-secrets.mjs requires a GUID tenantId and
// keys registrations by it — so this is a single-provider design rather than one layer's shortcut.
// In scope for the declared use, and deliberately not generalised here.
import crypto from "node:crypto";
import https from "node:https";
import os from "node:os";
import { VcSecretsError } from "./vc-secrets-error.mjs";

const AUTHORITY = "https://login.microsoftonline.com";
const TIMEOUT_OAUTH_MS = 20_000;   // matches the other network backend's ceiling

function createPkcePair() {
    const verifier = crypto.randomBytes(64).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

    return { verifier, challenge };
}

function buildAuthorizeUrl({ tenantId, clientId, scopes, redirectUri, state, challenge }) {
    // response_mode=query pairs with a redirect URI registered under "Mobile and desktop
    // applications". A Web-platform redirect accepts only form_post and answers AADSTS70007
    // with no browser ever opening — the defect that broke the upstream server's own
    // interactive mode.
    const url = new URL(`${AUTHORITY}/${tenantId}/oauth2/v2.0/authorize`);
    url.search = new URLSearchParams({
        client_id: clientId, response_type: "code", response_mode: "query",
        redirect_uri: redirectUri, scope: scopes.join(" "), state,
        code_challenge: challenge, code_challenge_method: "S256",
    }).toString();

    return url.toString();
}

function buildTokenBody({ kind, clientId, redirectUri, code, verifier, refreshToken, scopes }) {
    const body = new URLSearchParams({ client_id: clientId, scope: scopes.join(" ") });
    if (kind === "code") {
        body.set("grant_type", "authorization_code");
        body.set("code", code);
        body.set("code_verifier", verifier);
        body.set("redirect_uri", redirectUri);

        return body.toString();
    }
    if (kind !== "refresh") {
        throw new VcSecretsError(`unknown grant kind "${kind}"`);
    }
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", refreshToken);

    return body.toString();
}

// Only ever the shape of the failure, never the body: an error response carries trace ids and
// can carry a token hint, and this message reaches the operator's terminal.
function describeTokenError(status, body) {
    let parsed = null;
    try {
        parsed = JSON.parse(body);
    } catch { /* a gateway's HTML page, not Entra's JSON */ }
    if (parsed?.error) {
        const aadsts = /AADSTS\d+/.exec(parsed.error_description ?? "")?.[0];

        return aadsts ? `${parsed.error} (${aadsts})` : String(parsed.error);
    }

    return `HTTP ${status} with an unrecognised body`;
}

// Whether the body is Entra's own error object rather than whatever else arrived carrying the
// status. Derived a second time instead of threading an extra return value out of describeTokenError,
// whose callers and tests all take a string: this runs once, on an error path, and the duplicated
// parse buys both readers a shape they can use on their own.
function isEntraJudgement(body) {
    try {
        return Boolean(JSON.parse(body)?.error);
    } catch {
        return false;
    }
}

function parseTokenResponse(status, body, now, kind, uptimeAtIssue) {
    if (status < 200 || status >= 300) {
        // Tagged, because the launcher has to tell a dead refresh token from a dead network: the
        // first is fixed by signing in again and the second is not, and advising a browser for a
        // timeout sends the developer somewhere that cannot help. A tag rather than a message
        // match — the wording is not a contract, and the first improvement to it would break the
        // branch silently.
        //
        // Only where Entra JUDGED the grant, which is what a sign-in answers. 5xx, 408 and 429
        // are the service asking to be tried later: tagging those too would send a developer to
        // rotate a LIVE refresh token over an outage the next 60-second tick would have ridden out.
        //
        // And only where the answer came from Entra AT ALL. A status code cannot say that on its
        // own: a captive portal, a corporate proxy or a misrouted request answers 400 with an HTML
        // page, and reading that as a judgement sends the developer to sign in again -- which
        // rotates a live refresh token away over a network that was merely in the way.
        // describeTokenError already tells the two apart to choose its wording; this decision needs
        // the same fact and was the only one not asking for it.
        const retryable = status >= 500 || status === 408 || status === 429;
        throw Object.assign(new VcSecretsError(`token endpoint refused the request: ${describeTokenError(status, body)}`),
            { refused: !retryable && isEntraJudgement(body) });
    }
    let parsed;
    try {
        parsed = JSON.parse(body);
    } catch {
        // Not a rethrow: Node embeds the first ten characters of the input in a JSON
        // SyntaxError — measured, `Unexpected token 'e', "eyJhbGciOi"... is not valid JSON` —
        // so surfacing it would print a token prefix and name the wrong problem.
        throw new VcSecretsError("token endpoint returned a body that is not JSON");
    }
    if (typeof parsed.access_token !== "string" || parsed.access_token === "") {
        throw new VcSecretsError("token endpoint returned no access token");
    }
    // RFC 6749 section 6 makes refresh_token optional on the refresh grant — the client keeps
    // the one it has. Demanding it here would abort a renewal that SUCCEEDED and send the
    // developer to an administrator over a valid response.
    if (kind === "code" && typeof parsed.refresh_token !== "string") {
        throw new VcSecretsError("token endpoint returned no refresh token -- the app registration is "
            + "missing offline_access consent, without which every session needs an interactive login");
    }
    const lifetimeMs = Number(parsed.expires_in) * 1000;
    if (!Number.isFinite(lifetimeMs) || lifetimeMs <= 0) {
        throw new VcSecretsError("token endpoint returned no usable expires_in");
    }
    // Required rather than defaulted, and checked here rather than at the top so an error
    // response still reports what the server said. A caller that forgets the monotonic reading
    // would otherwise write an entry that looks complete and simply has no rollback protection —
    // invisible until a clock moves, which is the one moment it was supposed to matter.
    if (!Number.isFinite(uptimeAtIssue)) {
        throw new VcSecretsError("parseTokenResponse needs the uptime reading taken with `now`");
    }

    return {
        refreshToken: typeof parsed.refresh_token === "string" ? parsed.refresh_token : undefined,
        accessToken: parsed.access_token,
        expiresAt: now + lifetimeMs,
        obtainedAt: now,
        lifetimeMs,
        uptimeAtIssue,
    };
}

// requestImpl is a seam so the WIRING can be tested. A test that injects `request` into `exchange`
// exercises none of what follows, and what follows is where the defect was: which stream carries the
// error and whether anything listens. TLS is not part of that question, so the test drives this with
// http.request against a local server.
function httpsPostForm(url, body, { requestImpl = https.request } = {}) {
    return new Promise((resolve, reject) => {
        const req = requestImpl(url, {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "content-length": Buffer.byteLength(body),
            },
            timeout: TIMEOUT_OAUTH_MS,
        }, (res) => {
            let text = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => { text += chunk; });
            res.on("end", () => resolve({ status: res.statusCode, body: text }));
            // A connection dropped AFTER the headers emits on the RESPONSE, not on the request, and an
            // IncomingMessage with no error listener SWALLOWS it -- measured on node 22.22.0: the
            // promise stays pending forever, and the request timeout cannot rescue it because the
            // socket is already gone. Pending is worse than throwing here. On the renewal path
            // `renewing` never clears, so every later tick returns early and the launcher stops
            // renewing for the rest of its life, silently, until the access token expires and the
            // server it is holding dies. On the launch path `run` and `login` simply hang with no
            // output. Only the code, never the body: the request carried a refresh token.
            res.on("error", (e) => reject(new VcSecretsError(`token endpoint response failed: ${e.code ?? e.message}`)));
        });
        // The request body carries the refresh token, so nothing about this request may be
        // echoed on failure — only that it failed.
        req.on("timeout", () => req.destroy(new VcSecretsError(`token endpoint did not answer within ${TIMEOUT_OAUTH_MS} ms`)));
        req.on("error", (e) => reject(e instanceof VcSecretsError ? e : new VcSecretsError(`token endpoint unreachable: ${e.code ?? e.message}`)));
        req.end(body);
    });
}

// The wall clock and the monotonic counter are read HERE, one after the other, because the entry
// is only protected against a moved clock if the two readings describe the same instant.
async function exchange(tenantId, body, { request = httpsPostForm, now = Date.now,
    uptime = os.uptime } = {}) {
    const url = `${AUTHORITY}/${tenantId}/oauth2/v2.0/token`;
    // Read back rather than taken as a parameter: grant_type in the body IS the statement of
    // which grant this is, and a second parameter saying the same thing could disagree with it —
    // silently applying the code grant's "refresh_token is required" rule to a renewal.
    const kind = new URLSearchParams(body).get("grant_type") === "refresh_token" ? "refresh" : "code";
    const res = await request(url, body);

    return parseTokenResponse(res.status, res.body, now(), kind, uptime());
}

export {
    createPkcePair, buildAuthorizeUrl, buildTokenBody, parseTokenResponse, exchange, httpsPostForm,
    AUTHORITY, TIMEOUT_OAUTH_MS,
};
