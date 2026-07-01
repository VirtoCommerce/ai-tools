#!/usr/bin/env node
// healthcheck.mjs — wait for a local start-local VC stack to come up, then probe it.
//
// WHAT IT DOES
//   1. Polls   <back>/health      until the platform reports healthy (or timeout).
//   2. Polls   <back>/connect/token (optional) to confirm OAuth issues a token.
//   3. Polls   <front>            until the storefront serves 200/3xx.
//   4. Optional GraphQL probe: POST a query (file or inline) to <back>/graphql with
//      the admin bearer token — used to confirm a task-specific field resolves
//      (e.g. VCST-5173: cart → items → configurationItems → configurationSection).
//
// Endpoints/creds follow the repo convention (see .claude/commands/qa-env-check.md):
//   platform health = <back>/health   (NOT /api/platform/healthcheck — that 404s)
//   token           = POST <back>/connect/token  grant_type=password client_id=internal-frontend
//   xAPI            = POST <back>/graphql
//
// USAGE
//   node healthcheck.mjs                              # localhost:8090 + localhost
//   node healthcheck.mjs --back http://localhost:8090 --front http://localhost
//   node healthcheck.mjs --admin admin --password store --token
//   node healthcheck.mjs --graphql-file ./probe.graphql --admin admin --password store
//   node healthcheck.mjs --graphql '{ __typename }' --token
//
//   --back <url>        platform/admin base URL (default $BACK_URL or http://localhost:8090)
//   --front <url>       storefront base URL      (default $FRONT_URL or http://localhost)
//   --timeout <sec>     overall wait budget per endpoint (default 600)
//   --interval <sec>    poll interval (default 10)
//   --admin <user>      OAuth username (default $ADMIN or "admin")
//   --password <pass>   OAuth password (default $ADMIN_PASSWORD, else ADMIN_PASSWORD_LOCALHOST
//                       from .env.local, else the local convention "Password1!")
//   --token             attempt the OAuth token step even without a GraphQL probe
//   --graphql <query>   inline GraphQL query to probe
//   --graphql-file <p>  read the GraphQL query from a file
//   --expect-module <Id>=<Version>   assert the platform actually loaded this module version
//                       (repeatable). Use to verify a pinned pre-release is REALLY running, not
//                       the released module. NOTE: pre-release artifacts often carry the un-bumped
//                       base version in module.manifest (the -pr-… suffix lives only in the artifact
//                       filename), so a version MISMATCH is a loud advisory, not a hard fail —
//                       confirm the PR code by behaviour/schema (--graphql), not the version number.
//                       A MISSING module is a hard failure.
//   --module-errors     report ANY installed module that has load/validation errors (advisory).
//                       A manifest with incompatible module versions BUILDS and the platform
//                       STARTS, but such modules fail to initialise → /health flips to 503
//                       ("Some modules have errors"). This surfaces the culprit by name.
//   --no-front          skip the storefront check (admin-only bring-up)
//   --front-only        FRONTEND-ONLY mode: skip the platform /health check entirely (there is no
//                       local platform). Required checks become the storefront + (if given) the
//                       proxied GraphQL probe. Used by provision -Mode frontend, where `/` is the
//                       local theme and the API is proxied to a remote env.
//   --expect-theme <s>  (front-only) assert the served storefront `/` carries the X-VC-Local-Theme
//                       response header equal to <s>. provision injects this header into the
//                       generated nginx and passes the same build marker here — a match proves `/`
//                       is served by the LOCAL theme of the expected build (not the remote
//                       storefront), while the proxied GraphQL probe proves the API is the remote env.
//
// Exit 0 if every REQUIRED check passed (back + front unless --no-front). The
// token/GraphQL probes are advisory: a failure is reported but does not flip exit
// code unless a GraphQL probe was explicitly requested and returned errors.
//
// Zero dependencies, Node 18+ (global fetch).

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

// Default admin password resolution (no --password / $ADMIN_PASSWORD given):
// after provision's init-admin the local admin is Password1! and that value is written to
// .env.local as ADMIN_PASSWORD_LOCALHOST. Read it so the OAuth/probe steps "just work";
// fall back to the documented local convention Password1! (NOT the seed "store", which is
// only valid on a brand-new DB before init-admin runs).
// Read an env var, but treat an UNEXPANDED placeholder as unset. A shell/profile that references
// a var it never set can leave the literal "${env:ADMIN}" / "${ADMIN_PASSWORD}" as the value;
// sending that verbatim as username/password yields a 400 invalid_grant even though the local
// credentials are fine. Such values are never legitimate, so collapse them to undefined.
function cleanEnv(name) {
  const v = process.env[name];
  if (!v || /\$\{[^}]*\}/.test(v)) return undefined;
  return v;
}

function defaultPassword() {
  const envPw = cleanEnv("ADMIN_PASSWORD");
  if (envPw) return envPw;
  try {
    const f = resolve(REPO, ".env.local");
    if (existsSync(f)) {
      const m = readFileSync(f, "utf8").match(/^\s*ADMIN_PASSWORD_LOCALHOST\s*=\s*(.+?)\s*$/m);
      if (m) return m[1];
    }
  } catch { /* ignore — fall through to convention */ }
  return "Password1!";
}

function parseArgs(argv) {
  const o = {
    back: process.env.BACK_URL || "http://localhost:8090",
    front: process.env.FRONT_URL || "http://localhost",
    timeout: 600, interval: 10,
    admin: cleanEnv("ADMIN") || "admin",
    password: defaultPassword(),
    // start-local's local platform issues the password grant with NO client_id;
    // sending client_id=internal-frontend (the remote-QA client) returns invalid_client.
    // Leave empty to omit; pass --client-id for environments that require a registered client.
    clientId: cleanEnv("OAUTH_CLIENT_ID") || "",
    token: false, graphql: null, graphqlFile: null, noFront: false,
    expectModules: [], moduleErrors: false,
    frontOnly: false, expectTheme: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--back") o.back = next();
    else if (a === "--front") o.front = next();
    else if (a === "--timeout") o.timeout = Number(next());
    else if (a === "--interval") o.interval = Number(next());
    else if (a === "--admin") o.admin = next();
    else if (a === "--password") o.password = next();
    else if (a === "--client-id") o.clientId = next();
    else if (a === "--token") o.token = true;
    else if (a === "--graphql") o.graphql = next();
    else if (a === "--graphql-file") o.graphqlFile = next();
    else if (a === "--expect-module") {
      const v = next(); const eq = v.indexOf("=");
      if (eq < 1) { console.error(`--expect-module wants Id=Version, got "${v}"`); process.exit(2); }
      o.expectModules.push({ id: v.slice(0, eq), version: v.slice(eq + 1) });
    }
    else if (a === "--module-errors") o.moduleErrors = true;
    else if (a === "--no-front") o.noFront = true;
    else if (a === "--front-only") o.frontOnly = true;
    else if (a === "--expect-theme") o.expectTheme = next();
    else if (a === "-h" || a === "--help") { console.log("see header of healthcheck.mjs"); process.exit(0); }
    else { console.error(`Unknown arg: ${a}`); process.exit(2); }
  }
  o.back = o.back.replace(/\/$/, "");
  o.front = o.front.replace(/\/$/, "");
  return o;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tryFetch(url, init) {
  try {
    const res = await fetch(url, { redirect: "manual", ...init });
    return { ok: true, status: res.status, res };
  } catch (e) {
    return { ok: false, status: 0, error: e.code || e.message };
  }
}

// Poll until predicate(status) is true or the budget runs out.
// bail503: if > 0, give up early after that many CONSECUTIVE HTTP 503s. A 503 means the app is
// UP but reporting itself unhealthy (e.g. "Some modules have errors") — unlike a connection error
// during startup, that state rarely self-heals, so polling the full timeout just wastes minutes.
async function waitFor(label, url, predicate, o, init, bail503 = 0) {
  const deadline = Date.now() + o.timeout * 1000;
  let last = "", c503 = 0;
  process.stdout.write(`▶ ${label} … `);
  // Date.now() is fine here — this is a CLI tool, not a replayable workflow script.
  for (;;) {
    const r = await tryFetch(url, init);
    last = r.ok ? `HTTP ${r.status}` : `ERR ${r.error}`;
    if (r.ok && predicate(r.status)) { console.log(`UP (${last})`); return { up: true, ...r }; }
    c503 = (r.ok && r.status === 503) ? c503 + 1 : 0;
    if (bail503 && c503 >= bail503) {
      console.log(`UNHEALTHY (HTTP 503 ×${c503} — service up but reporting errors; not waiting out the ${o.timeout}s budget)`);
      console.log(`  ↳ likely module load/validation errors — run: healthcheck.mjs --token --module-errors`);
      return { up: false, ...r };
    }
    if (Date.now() >= deadline) { console.log(`DOWN (last: ${last}, ${o.timeout}s budget exhausted)`); return { up: false, ...r }; }
    await sleep(o.interval * 1000);
  }
}

async function getToken(o) {
  const params = { grant_type: "password", username: o.admin, password: o.password };
  if (o.clientId) params.client_id = o.clientId;
  const body = new URLSearchParams(params);
  const r = await tryFetch(`${o.back}/connect/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  if (!r.ok || r.status !== 200) return { ok: false, detail: r.ok ? `HTTP ${r.status}` : r.error };
  const json = await r.res.json().catch(() => ({}));
  return json.access_token ? { ok: true, token: json.access_token } : { ok: false, detail: "no access_token in response" };
}

async function getModules(o, token) {
  const r = await tryFetch(`${o.back}/api/platform/modules`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok || r.status !== 200) return null;
  return r.res.json().catch(() => null);
}

async function graphqlProbe(o, token, query) {
  const r = await tryFetch(`${o.back}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query }),
  });
  if (!r.ok || r.status !== 200) return { ok: false, reached: false, detail: r.ok ? `HTTP ${r.status}` : r.error };
  const json = await r.res.json().catch(() => null);
  // `reached` = a well-formed GraphQL envelope came back (HTTP 200 + a `data`/`errors` key), which
  // proves the request hit a real GraphQL backend. A broken proxy / wrong upstream yields a non-200,
  // a network error, or a non-GraphQL body instead → reached:false.
  if (!json || typeof json !== "object" || !("data" in json || "errors" in json))
    return { ok: false, reached: false, detail: "non-GraphQL response (proxy/upstream returned no GraphQL envelope)", json };
  if (json.errors?.length) return { ok: false, reached: true, detail: json.errors.map((e) => e.message).join("; "), json };
  return { ok: true, reached: true, json };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const query = o.graphqlFile ? readFileSync(resolve(o.graphqlFile), "utf8") : o.graphql;
  console.log(`qa-local-env healthcheck :: back=${o.back} front=${o.front} (timeout ${o.timeout}s)\n`);

  const results = [];

  // 1. Platform health (required) — SKIPPED in --front-only mode (no local platform).
  if (!o.frontOnly) {
    // Bail early on persistent 503 (up-but-unhealthy ≠ still starting).
    const health = await waitFor("platform /health", `${o.back}/health`, (s) => s === 200, o, undefined, 6);
    results.push({ name: "platform /health", required: true, up: health.up });
  }

  // 2. Storefront (required unless --no-front; always required in --front-only).
  if (!o.noFront || o.frontOnly) {
    const front = await waitFor("storefront", o.front, (s) => s === 200 || (s >= 300 && s < 400), o);
    results.push({ name: "storefront", required: true, up: front.up });

    // 2b. Theme build-marker (front-only): the served `/` must carry X-VC-Local-Theme = expected.
    if (o.frontOnly && o.expectTheme) {
      process.stdout.write(`▶ theme marker (X-VC-Local-Theme=${o.expectTheme}) … `);
      const r = await tryFetch(o.front, { method: "GET" });
      const got = r.ok ? (r.res.headers.get("x-vc-local-theme") || "") : "";
      const match = got === o.expectTheme;
      console.log(match ? "OK (local theme of expected build)" : `MISMATCH (got "${got || "(none)"}")`);
      if (!match) console.log("     ⚠ `/` is not served by the expected local theme build — check the frontend image / nginx conf.");
      results.push({ name: "theme marker", required: true, up: match });
    }
  }

  // 3. OAuth token (advisory; also needed for the GraphQL probe + module verification).
  //    Skipped in --front-only: the storefront proxies /connect/token to the REMOTE env, whose admin
  //    password is not the local Password1!, and the front-only GraphQL probe is anonymous anyway.
  let token = null;
  if (!o.frontOnly && (o.token || query || o.expectModules.length || o.moduleErrors)) {
    process.stdout.write(`▶ OAuth /connect/token … `);
    const t = await getToken(o);
    token = t.ok ? t.token : null;
    console.log(t.ok ? "OK (token issued)" : `FAIL (${t.detail})`);
    results.push({ name: "OAuth token", required: false, up: t.ok });
  }

  // 4. GraphQL probe (exit-affecting only when explicitly requested).
  if (query) {
    process.stdout.write(`▶ GraphQL probe … `);
    const g = await graphqlProbe(o, token, query);
    if (o.frontOnly && !g.ok && g.reached) {
      // Front-only: the probe's job is to prove the nginx proxy reached the BOUND backend, not that
      // the store is populated. A well-formed GraphQL envelope — even an empty-store / NULL_REFERENCE
      // error — proves the proxy works. A fresh/empty local backend (e.g. bound to a `backend-only`
      // stack) legitimately has no data, so that is PASS-with-advisory, not a hard fail. Only a
      // transport failure (reached:false) fails the probe.
      console.log("OK (proxy reached backend — no data: empty/fresh store, advisory)");
      console.log(`     note: ${g.detail}`);
      results.push({ name: "GraphQL probe (proxy reachability)", required: true, up: true });
    } else {
      console.log(g.ok ? "OK (no errors)" : `FAIL (${g.detail})`);
      results.push({ name: "GraphQL probe", required: true, up: g.ok });
      if (g.ok && g.json) console.log("  data: " + JSON.stringify(g.json.data).slice(0, 300));
    }
  }

  // 5. Pinned-module verification (explicit; surfaces a pre-release that is mislabelled as the
  //    released version instead of silently trusting the build log / artifact filename).
  if (o.expectModules.length) {
    const mods = token ? await getModules(o, token) : null;
    for (const em of o.expectModules) {
      process.stdout.write(`▶ module ${em.id} … `);
      if (!mods) {
        console.log("FAIL (no token / modules API unreachable)");
        results.push({ name: `module ${em.id}`, required: true, up: false });
        continue;
      }
      const m = mods.find((x) => (x.id || "").toLowerCase() === em.id.toLowerCase());
      if (!m) {
        console.log("NOT INSTALLED");
        results.push({ name: `module ${em.id}`, required: true, up: false });
        continue;
      }
      const reported = m.version || "(none)";
      if (reported === em.version) {
        console.log(`OK (${reported} — pinned pre-release confirmed by version)`);
        results.push({ name: `module ${em.id}`, required: true, up: true });
      } else {
        console.log("VERSION MISMATCH ⚠️");
        console.log(`     pinned : ${em.version}`);
        console.log(`     loaded : ${reported}`);
        console.log("     ⚠ Cannot confirm the pinned pre-release BY VERSION. Pre-release artifacts often carry the");
        console.log("       un-bumped base version in module.manifest (the -pr-… suffix is only in the artifact file");
        console.log("       name). The PR binaries may well be loaded — VERIFY BY BEHAVIOUR/SCHEMA (a --graphql probe");
        console.log("       of the PR's new field), NOT by this version number.");
        // Advisory (not a hard fail): the build is likely the PR code, just mislabelled.
        results.push({ name: `module ${em.id} (version)`, required: false, up: false });
      }
    }
  }

  // 6. Module-error scan (advisory): name any installed module that failed to load/validate.
  //    A version-incompatible manifest builds + starts but leaves such modules broken → /health 503.
  if (o.moduleErrors) {
    process.stdout.write(`▶ module errors … `);
    const mods = token ? await getModules(o, token) : null;
    if (!mods) {
      console.log("SKIPPED (no token / modules API unreachable)");
    } else {
      const broken = mods
        .map((m) => ({ id: m.id || m.moduleName || "(unknown)", errs: [].concat(m.errors || [], m.validationErrors || []).filter(Boolean) }))
        .filter((m) => m.errs.length);
      if (!broken.length) {
        console.log(`none (${mods.length} modules, all OK)`);
      } else {
        console.log(`${broken.length} module(s) with errors ⚠️`);
        for (const b of broken) console.log(`     ✖ ${b.id}: ${b.errs.join("; ").slice(0, 200)}`);
        console.log("     ⚠ These break /health (503). Usually an incompatible pinned/switched version —");
        console.log("       check the manifest's version for the module(s) above.");
      }
      // Advisory: surfaces the culprit but does not by itself flip the exit code.
      results.push({ name: "module errors", required: false, up: broken.length === 0 });
    }
  }

  console.log("\n── summary ──");
  for (const r of results) console.log(`  ${r.up ? "✅" : (r.required ? "❌" : "⚠️ ")} ${r.name}${r.required ? "" : " (advisory)"}`);
  const failedRequired = results.filter((r) => r.required && !r.up);
  console.log(`\n${results.filter((r) => r.up).length}/${results.length} checks up`);
  process.exit(failedRequired.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
