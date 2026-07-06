#!/usr/bin/env node
/**
 * .claude/skills/project-init/ensure-subscription.mjs
 *
 * Detect the DEPLOYMENT's Azure subscription and make it the `az` default — so the
 * `azure-mcp` server's subscription-scoped tools (monitor / applicationinsights /
 * resourcehealth, used by the interactive /qa-monitoring twin) and
 * `DefaultAzureCredential` resolve the RIGHT subscription context instead of failing
 * with "no default subscription". The single `az login` this skill runs is the ADO
 * path (`ensure-session.mjs`, with `--allow-no-subscriptions`) — it deliberately
 * selects NO subscription, which is exactly why none ends up default.
 *
 * Detection order (App-Insights-first, then fallbacks). The subscription is always tied
 * to the DEPLOYMENT project-init configured — env / App Insights are deployment anchors;
 * the un-anchored fallbacks are gated by projectType so a CLIENT deployment never adopts
 * an unrelated (e.g. VirtoCommerce-internal) subscription the operator's `az` happens to see:
 *   1. AZURE_SUBSCRIPTION_ID filled in env      → authoritative, just set it default.
 *   2. App Insights resource identity           → find the subscription HOSTING the
 *      (APPINSIGHTS_RESOURCE_* names, else the      resource — the most precise "this
 *       APPINSIGHTS_APP_ID_* GUIDs)                 deployment's subscription" signal.
 *   3a. projectType=client, no anchor            → STOP (client-needs-anchor): NEVER auto-pick;
 *                                                   print the client's tenant + candidates so the
 *                                                   operator passes --subscription <id> or
 *                                                   `az login --tenant <client>`.
 *   3b. projectType=platform, one enabled sub    → auto-pick (native VC — the `az` subs ARE VC's).
 *   4. projectType=platform, several, no match   → AMBIGUOUS: print candidates, exit non-zero.
 *
 * On a successful set it PINS AZURE_SUBSCRIPTION_ID (+ AZURE_RESOURCE_GROUP) back into
 * `.env.<env>` (via write-env.mjs) so the choice is a durable per-env artifact, not just the
 * machine-global `az` default. Suppress the write-back with --no-write.
 *
 * Uses the `az` CLI only (like ensure-session.mjs) — Azure MCP is a model-side tool,
 * not callable from a script; setting the `az` default is precisely what makes that
 * MCP work afterwards. The App-Insights lookup prefers Azure Resource Graph
 * (`az graph query`, cross-subscription in one hop) and falls back to iterating
 * `az account list` + `az resource list` by resource NAME when the resource-graph
 * extension is absent.
 *
 * TEST_ENV-aware (mirrors config.js / verify-access env loading + _<ENV> promotion).
 *
 * Usage:
 *   TEST_ENV=<env> node .claude/skills/project-init/ensure-subscription.mjs                 # detect + set + pin to .env
 *   TEST_ENV=<env> node .claude/skills/project-init/ensure-subscription.mjs --check          # probe only (no set, no write)
 *   TEST_ENV=<env> node .claude/skills/project-init/ensure-subscription.mjs --subscription <id>  # override the detection
 *   TEST_ENV=<env> node .claude/skills/project-init/ensure-subscription.mjs --no-write       # set the az default but don't touch .env
 *
 * Output: ONE JSON object on STDOUT for the caller to consume, e.g.
 *   {"subscriptionId":"…","name":"…","tenantId":"…","resourceGroup":"…","source":"appinsights|env|single|override","isDefault":true}
 * or, when it cannot decide:
 *   {"source":"ambiguous","candidates":[{"subscriptionId":"…","name":"…","tenantId":"…"}]}
 * Human-readable notes go to STDERR. Exit 0 iff a subscription is now the default.
 */
import { execSync, spawnSync } from "child_process";
import { config as dotenv } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { resolveTestEnv } from "../../../scripts/lib/resolve-test-env.js";
import { loadProjectProfile } from "../../../scripts/lib/project-profile.mjs";
import { resolveAdoTenant } from "./probe-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (n === undefined || n.startsWith("--")) a[k] = true;
    else { a[k] = n; i++; }
  }
  return a;
}
function loadEnv() {
  const TEST_ENV = resolveTestEnv("vcst");
  dotenv({ path: ".env.defaults", quiet: true });
  dotenv({ path: `.env.${TEST_ENV}`, override: true, quiet: true });
  dotenv({ path: ".env.local", override: true, quiet: true });
  const SUF = `_${TEST_ENV.toUpperCase()}`;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.endsWith(SUF) && v) process.env[k.slice(0, -SUF.length)] = v;
  }
  return TEST_ENV;
}
const note = (m) => console.error(`[ensure-subscription] ${m}`);
function tryOut(cmd) {
  try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return ""; }
}
function tryJson(cmd) {
  const out = tryOut(cmd);
  if (!out) return null;
  try { return JSON.parse(out); } catch { return null; }
}
/** /subscriptions/<s>/resourceGroups/<rg>/providers/... → rg (case-insensitive). */
function rgFromResourceId(id) {
  const m = /\/resourceGroups\/([^/]+)/i.exec(id || "");
  return m ? m[1] : "";
}

/** All REAL enabled subscriptions visible to the current `az` identity (across tenants). */
function listSubscriptions() {
  const subs = tryJson("az account list --all --output json") || [];
  return subs
    .filter((s) => (s.state || "").toLowerCase() === "enabled")
    // Drop the tenant-level placeholder `az` invents for a `--allow-no-subscriptions`
    // login: it has id === tenantId and is not a real subscription to default to.
    .filter((s) => s.id && s.id !== s.tenantId)
    .map((s) => ({ subscriptionId: s.id, name: s.name, tenantId: s.tenantId, isDefault: Boolean(s.isDefault) }));
}

/**
 * Resolve the subscription hosting the deployment's App Insights resource.
 * Matches by RESOURCE NAME (APPINSIGHTS_RESOURCE_*) or, via Resource Graph only,
 * by App ID (APPINSIGHTS_APP_ID_*). Returns {subscriptionId, resourceGroup,
 * resourceName} or null.
 */
function resolveByAppInsights() {
  const names = [process.env.APPINSIGHTS_RESOURCE_BACKEND, process.env.APPINSIGHTS_RESOURCE_STOREFRONT].filter(Boolean);
  const appIds = [process.env.APPINSIGHTS_APP_ID_BACKEND, process.env.APPINSIGHTS_APP_ID_STOREFRONT].filter(Boolean);
  if (!names.length && !appIds.length) return null;

  // Preferred: Azure Resource Graph — one query spans every accessible subscription.
  const quote = (arr) => arr.map((v) => `'${String(v).replace(/'/g, "")}'`).join(",");
  const clauses = [];
  if (names.length) clauses.push(`name in~ (${quote(names)})`);
  if (appIds.length) clauses.push(`tostring(properties.AppId) in~ (${quote(appIds)})`);
  const kql =
    `Resources | where type =~ 'microsoft.insights/components' | where ${clauses.join(" or ")} ` +
    `| project subscriptionId, resourceGroup, name | limit 5`;
  const graph = tryJson(`az graph query -q "${kql.replace(/"/g, '\\"')}" --output json`);
  const graphRows = graph && Array.isArray(graph.data) ? graph.data : Array.isArray(graph) ? graph : null;
  if (graphRows && graphRows.length) {
    const r = graphRows[0];
    if (graphRows.length > 1) note(`App Insights matched in ${graphRows.length} places — using the first (${r.name}).`);
    return { subscriptionId: r.subscriptionId, resourceGroup: r.resourceGroup, resourceName: r.name };
  }
  note("Resource Graph unavailable or no hit (extension may be absent) — falling back to a per-subscription scan by resource name.");

  // Fallback: iterate subscriptions, list App Insights components, match by NAME.
  // (App-ID-only matching needs Resource Graph; note it and let a later gate decide.)
  if (!names.length) { note("only App IDs are set (no APPINSIGHTS_RESOURCE_*) — cannot match without Resource Graph."); return null; }
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const sub of listSubscriptions()) {
    const comps = tryJson(
      `az resource list --subscription ${sub.subscriptionId} --resource-type microsoft.insights/components --output json`,
    ) || [];
    const hit = comps.find((c) => wanted.has(String(c.name || "").toLowerCase()));
    if (hit) return { subscriptionId: sub.subscriptionId, resourceGroup: hit.resourceGroup || rgFromResourceId(hit.id), resourceName: hit.name };
  }
  return null;
}

function emit(obj) { console.log(JSON.stringify(obj)); }

/** The client's Entra tenant, best-effort, for a "log into it" hint (azure-repos client). "" otherwise. */
async function resolveClientTenant(profile) {
  const org = profile?.vcs?.azure?.organization || "";
  if (!org) return "";
  try { return await resolveAdoTenant(org); } catch { return ""; }
}

/**
 * Pin the resolved subscription (+ RG) back into `.env.<env>` via write-env.mjs, so
 * it is a durable per-env artifact (appinsights.ts reads AZURE_SUBSCRIPTION_ID) and
 * not just a transient machine-global `az` default. No-op when already pinned.
 */
function writeBack(env, result) {
  const cur = process.env.AZURE_SUBSCRIPTION_ID || "";
  const curRg = process.env.AZURE_RESOURCE_GROUP || "";
  if (cur === result.subscriptionId && (!result.resourceGroup || curRg === result.resourceGroup)) {
    note(`.env.${env} already pins this subscription — no write-back needed.`);
    return;
  }
  const envVars = { AZURE_SUBSCRIPTION_ID: result.subscriptionId };
  if (result.resourceGroup) envVars.AZURE_RESOURCE_GROUP = result.resourceGroup;
  const r = spawnSync("node", [join(HERE, "write-env.mjs")], {
    input: JSON.stringify({ env, envVars }), stdio: ["pipe", "ignore", "inherit"],
  });
  note(r.status === 0
    ? `pinned AZURE_SUBSCRIPTION_ID${result.resourceGroup ? " + AZURE_RESOURCE_GROUP" : ""} → .env.${env}.`
    : `write-back to .env.${env} failed (status ${r.status}) — set AZURE_SUBSCRIPTION_ID there manually.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const check = Boolean(args.check);
  const TEST_ENV = loadEnv();
  const profile = loadProjectProfile();
  const isClient = profile?.projectType === "client";

  if (!tryOut("az account show")) {
    note("no active `az` session — run `az login` (ensure-session.mjs handles the ADO tenant) first.");
    emit({ source: "no-session" });
    process.exit(1);
  }

  const subs = listSubscriptions();
  if (!subs.length) {
    note("the `az` identity has no ENABLED subscriptions — it may be a tenant-level login (`--allow-no-subscriptions`). Run `az login` picking the deployment's subscription, or set AZURE_SUBSCRIPTION_ID.");
    emit({ source: "none" });
    process.exit(1);
  }
  const byId = (id) => subs.find((s) => s.subscriptionId === id || s.name === id);

  // Resolve the target subscription by the detection order.
  let target = null, source = "", resourceGroup = "";
  const override = typeof args.subscription === "string" ? args.subscription : "";
  const envSub = process.env.AZURE_SUBSCRIPTION_ID || "";

  if (override) {
    target = byId(override);
    source = "override";
    if (!target) { note(`--subscription '${override}' is not among this identity's enabled subscriptions (run \`az login --tenant <id>\` for its tenant).`); emit({ source: "override-not-found", requested: override, candidates: subs }); process.exit(1); }
  } else if (envSub) {
    target = byId(envSub);
    source = "env";
    if (!target) { note(`AZURE_SUBSCRIPTION_ID='${envSub}' is not visible to this identity (log in to its tenant, or fix the value).`); emit({ source: "env-not-found", requested: envSub, candidates: subs }); process.exit(1); }
  } else {
    const ai = resolveByAppInsights();
    if (ai && byId(ai.subscriptionId)) {
      target = byId(ai.subscriptionId);
      resourceGroup = ai.resourceGroup || "";
      source = "appinsights";
      note(`resolved via App Insights resource '${ai.resourceName}' → subscription '${target.name}'.`);
    } else if (isClient) {
      // CLIENT deployment: NEVER silently adopt a subscription the `az` identity happens
      // to see — it may be an unrelated (e.g. VirtoCommerce-internal) sub, not the client's.
      // Only a deployment ANCHOR (AZURE_SUBSCRIPTION_ID / APPINSIGHTS_*) or an explicit
      // --subscription is trusted. Surface the client's tenant to log into.
      const clientTenant = await resolveClientTenant(profile);
      note(`CLIENT project and no deployment anchor (AZURE_SUBSCRIPTION_ID / APPINSIGHTS_RESOURCE_* unset or unresolved) — NOT auto-picking (a visible sub may be unrelated to the client). Fill the deployment's APPINSIGHTS_RESOURCE_* / AZURE_SUBSCRIPTION_ID, pass --subscription <id>, or \`az login --tenant ${clientTenant || "<client-tenant>"}\` if the client's subscription isn't visible.`);
      emit({ source: "client-needs-anchor", clientTenant, candidates: subs });
      process.exit(1);
    } else if (subs.length === 1) {
      target = subs[0];
      source = "single";
      note(`native-platform project, one enabled subscription visible → '${target.name}'.`);
    } else {
      note(`native-platform project, ${subs.length} subscriptions visible and no App Insights match — cannot pick automatically. ASK the operator, then re-run with --subscription <id>.`);
      emit({ source: "ambiguous", candidates: subs });
      process.exit(1);
    }
  }

  const result = {
    subscriptionId: target.subscriptionId,
    name: target.name,
    tenantId: target.tenantId,
    resourceGroup: resourceGroup || process.env.AZURE_RESOURCE_GROUP || "",
    source,
  };

  if (check) {
    result.isDefault = target.isDefault;
    note(`[check] target subscription '${target.name}' (${target.subscriptionId}); currently default=${target.isDefault}. No change made.`);
    emit(result);
    process.exit(target.isDefault ? 0 : 1);
  }

  // Set it default. `az account set` picks a subscription already in the account list
  // (its tenant is already logged in — that's why it appeared above), and switches the
  // active tenant context to that subscription's tenant. NOTE: if the deployment's
  // subscription is in a DIFFERENT tenant than the ADO org, ADO code paths must keep
  // passing `--tenant <ado>` to `az account get-access-token` (they do) — this default
  // is for subscription-scoped resource tools, not for ADO.
  tryOut(`az account set --subscription ${target.subscriptionId}`); // empty stdout on success
  const nowId = tryOut(`az account show --query id -o tsv`);
  const ok = nowId === target.subscriptionId;
  result.isDefault = ok;
  note(ok
    ? `default subscription set → '${target.name}' (${target.subscriptionId}), tenant ${target.tenantId}. azure-mcp subscription-scoped tools will now resolve.`
    : `\`az account set\` did not stick (az account show → '${nowId || "none"}'). Log in to the subscription's tenant: az login --tenant ${target.tenantId}`);
  // Pin the choice into .env.<env> so it is durable per-env (not just the machine `az`
  // default). Suppress with --no-write; never write in --check (handled above).
  if (ok && !args["no-write"]) writeBack(TEST_ENV, result);
  emit(result);
  process.exit(ok ? 0 : 1);
}
main();
