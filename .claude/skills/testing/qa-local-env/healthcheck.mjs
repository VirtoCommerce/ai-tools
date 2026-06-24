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
//   --password <pass>   OAuth password (default $ADMIN_PASSWORD or "store")
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
//   --no-front          skip the storefront check (admin-only bring-up)
//
// Exit 0 if every REQUIRED check passed (back + front unless --no-front). The
// token/GraphQL probes are advisory: a failure is reported but does not flip exit
// code unless a GraphQL probe was explicitly requested and returned errors.
//
// Zero dependencies, Node 18+ (global fetch).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArgs(argv) {
  const o = {
    back: process.env.BACK_URL || "http://localhost:8090",
    front: process.env.FRONT_URL || "http://localhost",
    timeout: 600, interval: 10,
    admin: process.env.ADMIN || "admin",
    password: process.env.ADMIN_PASSWORD || "store",
    // start-local's local platform issues the password grant with NO client_id;
    // sending client_id=internal-frontend (the remote-QA client) returns invalid_client.
    // Leave empty to omit; pass --client-id for environments that require a registered client.
    clientId: process.env.OAUTH_CLIENT_ID || "",
    token: false, graphql: null, graphqlFile: null, noFront: false,
    expectModules: [],
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
    else if (a === "--no-front") o.noFront = true;
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
async function waitFor(label, url, predicate, o, init) {
  const deadline = Date.now() + o.timeout * 1000;
  let last = "";
  process.stdout.write(`▶ ${label} … `);
  // Date.now() is fine here — this is a CLI tool, not a replayable workflow script.
  for (;;) {
    const r = await tryFetch(url, init);
    last = r.ok ? `HTTP ${r.status}` : `ERR ${r.error}`;
    if (r.ok && predicate(r.status)) { console.log(`UP (${last})`); return { up: true, ...r }; }
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
  if (!r.ok || r.status !== 200) return { ok: false, detail: r.ok ? `HTTP ${r.status}` : r.error };
  const json = await r.res.json().catch(() => ({}));
  if (json.errors?.length) return { ok: false, detail: json.errors.map((e) => e.message).join("; "), json };
  return { ok: true, json };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const query = o.graphqlFile ? readFileSync(resolve(o.graphqlFile), "utf8") : o.graphql;
  console.log(`qa-local-env healthcheck :: back=${o.back} front=${o.front} (timeout ${o.timeout}s)\n`);

  const results = [];

  // 1. Platform health (required).
  const health = await waitFor("platform /health", `${o.back}/health`, (s) => s === 200, o);
  results.push({ name: "platform /health", required: true, up: health.up });

  // 2. Storefront (required unless --no-front).
  if (!o.noFront) {
    const front = await waitFor("storefront", o.front, (s) => s === 200 || (s >= 300 && s < 400), o);
    results.push({ name: "storefront", required: true, up: front.up });
  }

  // 3. OAuth token (advisory; also needed for the GraphQL probe + module verification).
  let token = null;
  if (o.token || query || o.expectModules.length) {
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
    console.log(g.ok ? "OK (no errors)" : `FAIL (${g.detail})`);
    results.push({ name: "GraphQL probe", required: true, up: g.ok });
    if (g.ok && g.json) console.log("  data: " + JSON.stringify(g.json.data).slice(0, 300));
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

  console.log("\n── summary ──");
  for (const r of results) console.log(`  ${r.up ? "✅" : (r.required ? "❌" : "⚠️ ")} ${r.name}${r.required ? "" : " (advisory)"}`);
  const failedRequired = results.filter((r) => r.required && !r.up);
  console.log(`\n${results.filter((r) => r.up).length}/${results.length} checks up`);
  process.exit(failedRequired.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
