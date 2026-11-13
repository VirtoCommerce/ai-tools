// plugins/vc-test/lib/oauth-code.mjs — an OAuth 2.1 authorization-code + PKCE sign-in for /vc-test:qa-goal in which the
// agent never holds a secret. The agent opens the authorize URL `start` prints in a Playwright lane and signs in (the
// lane types the password from its own secrets); the platform redirects the browser to the client's registered redirect
// URI; the agent closes the lane page so Playwright writes the HAR; `redeem` finds that ONE callback in the HAR by the
// `state` it issued and redeems the code with the verifier it kept. The code, the PKCE verifier and every token stay in
// `<runDir>/.tokens/` (deleted by `purge` at close) and in this process; nothing this script prints holds one — every
// output is scrubbed of the stored token values, the code, the project's secret values and token shapes.
// The HAR also holds the sign-in POST with the plaintext password: only `log.entries[i].request.url` and
// `log.entries[i].response.headers` are ever read — never a postData, never a response body.
// A token is sent only to the origin of its issuer, its audience, the current env's BACK_URL or FRONT_URL, or its
// resource when that is one of those or a host an approved S1/S2 checkpoint names (the agent chose the resource at
// `start`), over https (or loopback), and a redirect is never followed: a URL elsewhere is refused, so a page cannot
// talk the agent into shipping it out.
// CLI (every command takes --dir <runDir> --persona <name>; persona matches /^[a-z0-9-]{1,32}$/):
//   start --issuer <url> --client <id> --redirect <uri> [--resource <uri>] [--scope "openid offline_access"] → { persona, url, restarted }
//   redeem --har <path>      → { persona, aud, iss, sub, name, roles, permissions, expiresIn, hasRefresh }
//   refresh                  → the same claim summary (invalid_grant deletes the persona's token file)
//   mcp --url <mcp url> --method <jsonrpc method> [--params-file <json>] → { status, result } (initialize + initialized + call;
//     every request after initialize sends MCP-Protocol-Version = the version initialize answered). No message with the
//     request's id ⇒ { status, result: null, error: "no response with the request id" } — never another message.
//   http --method GET|POST|DELETE --url <url> [--body-file <json>]      → { status, body }
//   purge                    → { purged: n } (removes <runDir>/.tokens/; with --persona only that persona's files)
//   A 401 from mcp/http prints { status, error } — the WWW-Authenticate `error` value only; nothing is refreshed.
//   A URL carrying a user name or password is a usage error. Every request, body included, times out after 30 s (exit 3).
// Prints ONE JSON object. Exit 0 done · 1 usage · 2 refused (a server or HAR said no; `errors` names why) · 3 could not run
// (a HAR over 400 MB or unreadable is 3, not 2: close the lane and sign in again in a fresh context).
// Imported, `cli(argv)` returns and throws values that are already scrubbed.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { knowledgeSecretValues, scrubValues } from "./knowledge-store.mjs";
import { argOf, outputRoot } from "./paths.mjs";
import { hostAllowed, loadGoal, standUrls } from "./goal.mjs";

const PERSONA_RE = /^[a-z0-9-]{1,32}$/;
const TRIM = 4000;
const DEFAULT_SCOPE = "openid offline_access";
const MCP_PROTOCOL = "2025-06-18";
const CLOSE_PAGE = "close the lane page so the HAR is written";
const USAGE = "usage: oauth-code.mjs start|redeem|refresh|mcp|http|purge --dir <runDir> --persona <name> …";

class OAuthError extends Error {
  constructor(exit, errors, extra = {}) { super(errors[0]); this.exit = exit; this.errors = errors; this.extra = extra; }
}
const usage = (msg) => new OAuthError(1, [msg]);
const refuse = (msg, extra) => new OAuthError(2, [msg], extra);
const cannot = (msg) => new OAuthError(3, [msg]);

/** Every value this run must never print; filled as the code, verifier and tokens come into reach. */
const held = new Set();
const MIN_HELD = 8; // a real code, verifier or token is far longer; a shorter test value would mask ordinary words
const hold = (...vs) => { for (const v of vs) if (typeof v === "string" && v.length >= MIN_HELD) held.add(v); };

const need = (argv, name) => {
  const v = argOf(argv, name);
  if (v === undefined || v === "" || v.startsWith("--")) throw usage(`--${name} is required`);
  return v;
};

function runDir(argv) {
  const dir = resolve(need(argv, "dir"));
  if (!existsSync(join(dir, "goal.json"))) throw usage(`--dir is not a qa-goal run folder (no goal.json): ${dir}`);
  return dir;
}
function persona(argv) {
  const p = need(argv, "persona");
  if (!PERSONA_RE.test(p)) throw usage(`--persona must match ${PERSONA_RE}`);
  return p;
}
const tokensDir = (dir) => join(dir, ".tokens");
const pkceFile = (dir, p) => join(tokensDir(dir), `${p}.pkce.json`);
const tokenFile = (dir, p) => join(tokensDir(dir), `${p}.json`);

function writeSecret(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  const ignore = join(dirname(file), ".gitignore"); // belt and braces: the folder is never committed
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n");
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}
function readSecret(file) {
  if (!existsSync(file)) return null;
  let obj;
  try { obj = JSON.parse(readFileSync(file, "utf8")); } catch { throw cannot(`unreadable: ${file}`); }
  hold(obj.verifier, obj.access_token, obj.refresh_token, obj.id_token);
  return obj;
}
/** Every token value stored for this run — held before anything is printed, so no command can echo another's. */
function holdStored(dir) {
  let names = [];
  try { names = readdirSync(tokensDir(dir)); } catch { return; }
  for (const n of names) if (n.endsWith(".json")) { try { readSecret(join(tokensDir(dir), n)); } catch { /* unreadable: skip */ } }
}

const isLoopback = (u) => ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
function safeUrl(raw, what) {
  let u;
  try { u = new URL(raw); } catch { throw usage(`${what} is not a URL`); }
  // fetch would refuse it anyway — with an error message that quotes the whole URL, password included
  if (u.username || u.password) throw usage(`${what} must not carry a user name or password`);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && isLoopback(u))) throw refuse(`${what} must be https (http only on loopback)`);
  return u;
}
const b64u = (buf) => Buffer.from(buf).toString("base64url");
// One trailing slash is normalised on both sides (`https://host/` vs `https://host`); otherwise strict.
const sameIssuer = (a, b) => String(a ?? "").replace(/\/$/, "") === String(b ?? "").replace(/\/$/, "");

// Every request and its body read share one deadline: a stalled endpoint or an SSE stream left open must not hang a
// run. The env override exists for the temporary tests only.
const TIMEOUT_MS = Number.parseInt(process.env.VC_TEST_OAUTH_TIMEOUT_MS ?? "", 10) > 0 ? Number.parseInt(process.env.VC_TEST_OAUTH_TIMEOUT_MS, 10) : 30_000;
/** A failure names the step and an error code — never `e.message`, which can quote the URL. */
function failed(e, what) {
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return cannot(`${what} timed out after ${TIMEOUT_MS / 1000} s`);
  return cannot(`${what}: ${e?.cause?.code ?? e?.code ?? e?.name ?? "failed"}`);
}
async function request(url, init, what) {
  try {
    const res = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    res.what = what;
    return res;
  } catch (e) {
    throw failed(e, what);
  }
}
async function textOf(res) {
  try { return await res.text(); } catch (e) { throw failed(e, res.what); }
}
async function drop(res) {
  try { await res.body?.cancel(); } catch { /* already aborted */ }
}
async function jsonOf(res) {
  const text = await textOf(res);
  try { return JSON.parse(text); } catch { return null; }
}

async function discover(issuer) {
  const base = issuer.href.replace(/\/+$/, "");
  for (const path of ["/.well-known/openid-configuration", "/.well-known/oauth-authorization-server"]) {
    const res = await request(`${base}${path}`, { headers: { Accept: "application/json" } }, "discovery");
    if (res.status !== 200) { await drop(res); continue; }
    const doc = await jsonOf(res);
    if (doc?.authorization_endpoint && doc?.token_endpoint) return doc;
  }
  throw refuse(`no OAuth discovery document at ${base}/.well-known/openid-configuration`);
}

// ---- the claim summary: the access token's payload, decoded for display only (never verified, never trusted) ----
const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
function claimsOf(token) {
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); } catch { return null; }
}
function summary(p, tok) {
  const expiresIn = tok.expires_at ? Math.max(0, Math.round((tok.expires_at - Date.now()) / 1000)) : null;
  const hasRefresh = Boolean(tok.refresh_token);
  const c = claimsOf(tok.access_token);
  if (!c) return { persona: p, opaque: true, expiresIn, hasRefresh };
  return {
    persona: p, aud: c.aud ?? null, iss: c.iss ?? null, sub: c.sub ?? null, name: c.name ?? c.preferred_username ?? null,
    roles: asArray(c.role ?? c.roles), permissions: asArray(c.permission ?? c.permissions), expiresIn, hasRefresh,
  };
}

/** Posts a grant; a refusal carries only the server's `error` and `error_description`, never the request. */
async function tokenCall(endpoint, form) {
  const res = await request(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(Object.entries(form).filter(([, v]) => v)).toString(),
  }, "token endpoint");
  const doc = await jsonOf(res);
  if (res.status !== 200 || !doc?.access_token) {
    const error = doc?.error ?? `http_${res.status}`;
    throw refuse(`token endpoint refused: ${error}`, { error, error_description: doc?.error_description ?? null });
  }
  hold(doc.access_token, doc.refresh_token, doc.id_token);
  return doc;
}
function stored(prev, doc) {
  const exp = claimsOf(doc.access_token)?.exp;
  return {
    issuer: prev.issuer, client: prev.client, resource: prev.resource ?? null, tokenEndpoint: prev.tokenEndpoint,
    token_type: doc.token_type ?? "Bearer", scope: doc.scope ?? prev.scope ?? null,
    access_token: doc.access_token, refresh_token: doc.refresh_token ?? prev.refresh_token ?? null, id_token: doc.id_token ?? null,
    expires_at: doc.expires_in ? Date.now() + Number(doc.expires_in) * 1000 : typeof exp === "number" ? exp * 1000 : null,
  };
}

// ---- the HAR: only request.url and response.headers, and only the callback carrying this persona's state ----
// A HAR that cannot be read (too large for one string, an I/O error) is exit 3, and closing the page again never fixes
// it: the lane's context has grown, so the next sign-in starts in a fresh one. A HAR that is not complete JSON is
// exit 2: the page is still open and the HAR not yet written.
const MAX_HAR_BYTES = 400 * 1024 * 1024;
const FRESH_CONTEXT = "close the lane (browser_close) so the next sign-in starts in a fresh context with a small HAR, then sign in again from `start`";
function callbackIn(harPath, pkce) {
  if (!existsSync(harPath)) throw refuse(`no HAR at ${harPath} — ${CLOSE_PAGE}`);
  let size;
  try { size = statSync(harPath).size; } catch (e) { throw cannot(`the HAR at ${harPath} is unreadable (${e?.code ?? "stat failed"}) — ${FRESH_CONTEXT}`); }
  if (size > MAX_HAR_BYTES) throw cannot(`the HAR at ${harPath} is too large to read (${Math.round(size / 1048576)} MB, over 400 MB) — ${FRESH_CONTEXT}`);
  let text;
  try { text = readFileSync(harPath, "utf8"); } catch (e) { throw cannot(`the HAR at ${harPath} is unreadable (${e?.code ?? "read failed"}) — ${FRESH_CONTEXT}`); }
  let har;
  try { har = JSON.parse(text); } catch { throw refuse(`the HAR at ${harPath} is not complete JSON — ${CLOSE_PAGE}`); }
  const entries = har?.log?.entries;
  if (!Array.isArray(entries)) throw refuse(`the HAR at ${harPath} has no log.entries — ${CLOSE_PAGE}`);
  const redirect = new URL(pkce.redirect);
  const match = (raw, baseUrl) => {
    let u;
    try { u = new URL(raw, baseUrl); } catch { return null; }
    if (u.origin !== redirect.origin || u.pathname !== redirect.pathname) return null;
    return u.searchParams.get("state") === pkce.state ? u.searchParams : null;
  };
  let found = null; // a reload repeats the callback: the LAST one wins
  for (const e of entries) {
    const url = e?.request?.url;
    if (typeof url !== "string") continue;
    const direct = match(url);
    if (direct) found = direct;
    const headers = e?.response?.headers;
    if (!Array.isArray(headers)) continue;
    for (const h of headers) {
      if (String(h?.name).toLowerCase() !== "location" || typeof h?.value !== "string") continue;
      const viaLocation = match(h.value, url);
      if (viaLocation) found = viaLocation;
    }
  }
  if (!found) throw refuse(`no callback for this persona's state in ${harPath} — sign in through the URL \`start\` printed, then ${CLOSE_PAGE}`);
  hold(found.get("code"));
  if (found.get("error")) throw refuse(`the sign-in returned ${found.get("error")}`, { error: found.get("error"), error_description: found.get("error_description") });
  if (!found.get("code")) throw refuse("the callback carries no code");
  if (found.has("iss") && !sameIssuer(found.get("iss"), pkce.issuer)) throw refuse("the callback's iss is not the issuer this sign-in started with");
  return found.get("code");
}

// ---- where a token may go: the issuer's or the audience's origin, the stand's, an approved resource — nowhere else ----
// The stand's own hosts (goal.mjs standUrls) are allowed so the method can prove a token is REFUSED by another
// endpoint of the same stand. The resource is the agent's own `start --resource` argument, so it counts only when it
// is a host the run may touch (goal.mjs hostAllowed: the stand, or a host an approved S1/S2 note names).
function allowedOrigins(tok, goal) {
  const stand = standUrls();
  const out = new Set();
  for (const raw of [tok.issuer, ...asArray(claimsOf(tok.access_token)?.aud), ...stand]) {
    try { out.add(new URL(raw).origin); } catch { /* not a URL */ }
  }
  if (tok.resource && hostAllowed(goal, tok.resource, stand)) { try { out.add(new URL(tok.resource).origin); } catch { /* not a URL */ } }
  return out;
}
function target(argv, tok, dir) {
  const u = safeUrl(need(argv, "url"), "--url");
  const allowed = allowedOrigins(tok, loadGoal(dir));
  if (!allowed.has(u.origin)) throw refuse(`--url ${u.origin} is not this token's issuer or audience, this stand's BACK_URL or FRONT_URL, nor a resource on a host approved at S1/S2 (${[...allowed].join(", ")})`);
  return u;
}
function loadToken(dir, p) {
  const tok = readSecret(tokenFile(dir, p));
  if (!tok?.access_token) throw refuse(`no token for persona ${p} — run start, sign in, then redeem`);
  return tok;
}
const wwwError = (res) => /error="?([^",\s]+)"?/.exec(res.headers.get("www-authenticate") ?? "")?.[1] ?? null;
function readJsonFile(argv, name) {
  const f = argOf(argv, name);
  if (f === undefined) return undefined;
  try { return JSON.parse(readFileSync(f, "utf8")); } catch (e) { throw usage(`--${name} is not a readable JSON file (${e.code ?? "invalid JSON"})`); }
}
/** Scrubbed first, trimmed second: a trim before the scrub could cut a token in half and let its head through. */
function shown(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const s = scrub(text ?? "null");
  if (s.length > TRIM) return { value: `${s.slice(0, TRIM)}…[trimmed]`, trimmed: true };
  if (typeof value === "string") return { value: s };
  try { return { value: JSON.parse(s) }; } catch { return { value: s }; }
}

/**
 * A Streamable HTTP response is JSON, or SSE whose `data:` lines carry the messages: ours is the one whose `id` is the
 * request's. None ⇒ null — never another message (a notification on the same stream is not the answer).
 */
const NO_RESPONSE = "no response with the request id";
function rpcMessage(text, id) {
  const datas = text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
  const docs = (datas.length ? datas : [text]).map((d) => { try { return JSON.parse(d); } catch { return null; } }).filter(Boolean);
  return docs.find((d) => d && d.id === id) ?? null;
}

async function mcp(argv, dir, p) {
  const tok = loadToken(dir, p);
  const url = target(argv, tok, dir);
  const method = need(argv, "method");
  const params = readJsonFile(argv, "params-file") ?? {};
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${tok.access_token}` };
  const post = async (body, session = {}) => request(url, { method: "POST", headers: { ...headers, ...session }, body: JSON.stringify(body) }, "mcp");
  const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: MCP_PROTOCOL, capabilities: {}, clientInfo: { name: "vc-test-qa-goal", version: "1" } } });
  if (init.status === 401) { await drop(init); return { status: 401, step: "initialize", error: wwwError(init) }; }
  const initText = await textOf(init);
  const initMsg = rpcMessage(initText, 1);
  if (init.status !== 200) return { status: init.status, step: "initialize", result: shown(initMsg ?? initText).value };
  if (!initMsg) return { status: init.status, step: "initialize", result: null, error: NO_RESPONSE };
  if (initMsg.error) return { status: init.status, step: "initialize", error: shown(initMsg.error).value };
  // Every request after initialize carries the version the server answered with (ours when it names none or an odd one).
  const negotiated = initMsg.result?.protocolVersion;
  const version = typeof negotiated === "string" && /^[\w.-]{1,32}$/.test(negotiated) ? negotiated : MCP_PROTOCOL;
  const sid = init.headers.get("mcp-session-id") ?? undefined;
  const session = { "MCP-Protocol-Version": version, ...(sid ? { "Mcp-Session-Id": sid } : {}) };
  const note = await post({ jsonrpc: "2.0", method: "notifications/initialized" }, session);
  await drop(note);
  const res = await post({ jsonrpc: "2.0", id: 2, method, params }, session);
  if (res.status === 401) { await drop(res); return { status: 401, step: method, error: wwwError(res) }; }
  const resText = await textOf(res);
  const msg = rpcMessage(resText, 2);
  if (sid) { try { const d = await request(url, { method: "DELETE", headers: { ...headers, ...session } }, "mcp"); await drop(d); } catch { /* best effort */ } }
  // A refusal (403, 400 …) carries no JSON-RPC message of ours: its body is the observation, as at initialize.
  if (!msg && res.status !== 200) {
    let parsed = resText;
    try { parsed = JSON.parse(resText); } catch { /* a text body */ }
    const b = shown(parsed);
    return { status: res.status, step: method, result: b.value, ...(b.trimmed ? { trimmed: true } : {}) }; }
  if (!msg) return { status: res.status, result: null, error: NO_RESPONSE };
  if (msg.error) return { status: res.status, error: shown(msg.error).value };
  const s = shown(msg?.result ?? null);
  return { status: res.status, result: s.value, ...(s.trimmed ? { trimmed: true } : {}) };
}

async function http(argv, dir, p) {
  const method = need(argv, "method").toUpperCase();
  if (!["GET", "POST", "DELETE"].includes(method)) throw usage("--method must be GET, POST or DELETE");
  const tok = loadToken(dir, p);
  const url = target(argv, tok, dir);
  const body = readJsonFile(argv, "body-file");
  const headers = { Accept: "application/json", Authorization: `Bearer ${tok.access_token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, "http");
  if (res.status === 401) { await drop(res); return { status: 401, error: wwwError(res) }; }
  const text = await textOf(res);
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* a text body */ }
  const s = shown(parsed);
  const location = res.headers.get("location");
  return { status: res.status, body: s.value, ...(s.trimmed ? { trimmed: true } : {}), ...(location ? { location: shown(location).value } : {}) };
}

/**
 * The library entry: what it returns AND every error it throws are already scrubbed, so an importer that prints
 * either cannot echo a code, verifier or token. An unexpected error becomes exit 3 with its scrubbed message.
 */
export async function cli(argv) {
  try {
    return scrubbed(await run(argv));
  } catch (e) {
    if (e instanceof OAuthError) throw new OAuthError(e.exit, e.errors.map((m) => scrub(m)), scrubbed(e.extra));
    throw new OAuthError(3, [scrub(String(e?.message ?? e))]);
  }
}

async function run(argv) {
  const [cmd] = argv;
  if (!["start", "redeem", "refresh", "mcp", "http", "purge"].includes(cmd)) throw usage(USAGE);
  const dir = runDir(argv);
  holdStored(dir);
  if (cmd === "purge") {
    const tdir = tokensDir(dir);
    if (argOf(argv, "persona") !== undefined) { // one persona: its token and any unredeemed sign-in, nobody else's
      const p = persona(argv);
      const files = [tokenFile(dir, p), pkceFile(dir, p)].filter((f) => existsSync(f));
      for (const f of files) rmSync(f, { force: true });
      return { purged: files.length };
    }
    let n = 0;
    try { n = readdirSync(tdir).filter((f) => f.endsWith(".json")).length; } catch { /* nothing to purge */ }
    rmSync(tdir, { recursive: true, force: true });
    return { purged: n };
  }
  const p = persona(argv);
  switch (cmd) {
    case "start": {
      const issuer = safeUrl(need(argv, "issuer"), "--issuer");
      const client = need(argv, "client");
      const redirect = need(argv, "redirect");
      try { new URL(redirect); } catch { throw usage("--redirect is not a URL"); }
      const resource = argOf(argv, "resource");
      if (resource !== undefined) safeUrl(resource, "--resource");
      const scope = argOf(argv, "scope") ?? DEFAULT_SCOPE;
      const doc = await discover(issuer);
      const methods = doc.code_challenge_methods_supported;
      if (Array.isArray(methods) && !methods.includes("S256")) throw refuse("the issuer does not support PKCE S256");
      const authorize = safeUrl(doc.authorization_endpoint, "authorization_endpoint");
      safeUrl(doc.token_endpoint, "token_endpoint");
      const verifier = b64u(randomBytes(32));
      hold(verifier);
      const state = b64u(randomBytes(16));
      const restarted = existsSync(pkceFile(dir, p));
      writeSecret(pkceFile(dir, p), { verifier, state, client, redirect, resource: resource ?? null, scope, tokenEndpoint: doc.token_endpoint, issuer: doc.issuer ?? issuer.href, startedAt: new Date().toISOString() });
      const q = authorize.searchParams;
      q.set("response_type", "code");
      q.set("client_id", client);
      q.set("redirect_uri", redirect);
      q.set("scope", scope);
      q.set("state", state);
      q.set("code_challenge", b64u(createHash("sha256").update(verifier).digest()));
      q.set("code_challenge_method", "S256");
      if (resource) q.set("resource", resource);
      return { persona: p, url: authorize.href, restarted };
    }
    case "redeem": {
      const harPath = resolve(need(argv, "har"));
      const pkce = readSecret(pkceFile(dir, p));
      if (!pkce) throw refuse(`no sign-in started for persona ${p} — run start first`);
      const code = callbackIn(harPath, pkce);
      const doc = await tokenCall(pkce.tokenEndpoint, { grant_type: "authorization_code", code, redirect_uri: pkce.redirect, client_id: pkce.client, code_verifier: pkce.verifier, resource: pkce.resource });
      const tok = stored(pkce, doc);
      writeSecret(tokenFile(dir, p), tok);
      rmSync(pkceFile(dir, p), { force: true });
      return summary(p, tok);
    }
    case "refresh": {
      const tok = loadToken(dir, p);
      if (!tok.refresh_token) throw refuse(`persona ${p} has no refresh token (was offline_access in the scope?)`);
      let doc;
      try {
        doc = await tokenCall(tok.tokenEndpoint, { grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: tok.client, resource: tok.resource });
      } catch (e) {
        if (e.extra?.error === "invalid_grant") rmSync(tokenFile(dir, p), { force: true }); // a revoked chain: sign in again
        throw e;
      }
      const next = stored(tok, doc);
      writeSecret(tokenFile(dir, p), next);
      return summary(p, next);
    }
    case "mcp": return mcp(argv, dir, p);
    case "http": return http(argv, dir, p);
  }
  throw usage(USAGE);
}

let projectSecrets = null;
function scrub(text) {
  if (projectSecrets === null) {
    try { projectSecrets = knowledgeSecretValues(outputRoot()); } catch { projectSecrets = new Set(); }
  }
  return scrubValues(text, [...held, ...projectSecrets]);
}
/** Every string inside a returned or thrown value, scrubbed; the shape is kept. */
function scrubbed(v) {
  if (typeof v === "string") return scrub(v);
  if (Array.isArray(v)) return v.map(scrubbed);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubbed(x)]));
  return v;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let out;
  let exit = 0;
  try {
    out = await cli(process.argv.slice(2));
  } catch (e) {
    out = { ok: false, errors: e.errors ?? [String(e?.message ?? e)], ...e.extra };
    exit = e.exit ?? 3;
  }
  console.log(scrub(JSON.stringify(out, null, 2))); // a second pass over the whole text: cli already scrubbed it
  process.exitCode = exit;
}
