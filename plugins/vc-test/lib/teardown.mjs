// plugins/vc-test/lib/teardown.mjs — tears a run down from its ledger only (spec §6a Teardown): entities newest first
// by id, never by prefix; changed settings restored to their first "before"; anything it cannot do safely is listed
// for a human, never guessed. Each result is appended to the ledger, so a re-run skips what is done.
// CLI: node plugins/vc-test/lib/teardown.mjs --key <KEY> [--dry-run]
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { argOf, workDir } from "./paths.mjs";

const enc = encodeURIComponent;
const DELETERS = {
  "organization-membership": async (api, a) => api("DELETE", `/api/customer/organization-memberships?ids=${enc(a.id)}`),
  user: async (api, a) => api("DELETE", `/api/platform/security/users?names=${enc(a.email ?? (await api("GET", `/api/platform/security/users/id/${enc(a.id)}`))?.userName ?? a.id)}`),
  contact: async (api, a) => api("DELETE", `/api/members?ids=${enc(a.id)}`),
  organization: async (api, a) => api("DELETE", `/api/members?ids=${enc(a.id)}`),
  store: async (api, a) => api("DELETE", `/api/stores?ids=${enc(a.id)}`),
  "storefront-user": async (api, a) => {
    const user = await api("GET", `/api/platform/security/users/${enc(a.id)}`);
    if (!user) return;
    await api("DELETE", `/api/platform/security/users?names=${enc(a.id)}`);
    if (user.memberId) await api("DELETE", `/api/members?ids=${enc(user.memberId)}`);
  },
};

export function planTeardown(entries) {
  const done = new Set(entries.filter((x) => x.teardown === "deleted" || x.teardown === "restored").map((x) => `${x.entity}|${x.id}`));
  const live = entries.filter((x) => !x.teardown && !done.has(`${x.entity}|${x.id}`));
  const stores = new Set(live.filter((x) => x.entity === "store").map((x) => x.id));
  const actions = [], manual = [], unknown = [];

  const settings = new Map();
  for (const x of live.filter((y) => y.entity === "setting").sort((a, b) => a.at.localeCompare(b.at))) {
    (settings.get(x.id) ?? settings.set(x.id, []).get(x.id)).push(x);
  }
  for (const [id, rows] of settings) {
    const before = rows[0].before, after = rows.at(-1).after;
    const scope = id.includes("/") ? id.slice(0, id.indexOf("/")) : null;
    if (isDeepStrictEqual(before, after)) actions.push({ kind: "skip", entity: "setting", id, reason: "already restored" });
    else if (scope && stores.has(scope)) actions.push({ kind: "skip", entity: "setting", id, reason: `covered by deleting store ${scope}` });
    else if (scope) manual.push(`${id}: a store setting of a store this run did not create — restore by hand to ${JSON.stringify(before)}`);
    else actions.push({ kind: "restore", entity: "setting", id, name: id, value: before });
  }

  const latest = new Map();
  for (const x of live.filter((y) => y.entity !== "setting")) {
    const k = `${x.entity}|${x.id}`;
    if (!latest.has(k) || latest.get(k).at < x.at) latest.set(k, x);
  }
  for (const x of [...latest.values()].sort((a, b) => b.at.localeCompare(a.at))) {
    if (!DELETERS[x.entity]) { unknown.push(`${x.entity} ${x.id}`); continue; }
    actions.push({ kind: "delete", entity: x.entity, id: x.id, ...(x.email ? { email: x.email } : {}) });
  }
  return { actions, manual, unknown };
}

export async function executeTeardown(plan, api, now = () => new Date().toISOString()) {
  const results = [];
  for (const a of plan.actions) {
    let teardown;
    try {
      if (a.kind === "skip") teardown = `skipped: ${a.reason}`;
      else if (a.kind === "restore") {
        const entry = await api("GET", `/api/platform/settings/${enc(a.name)}`);
        await api("POST", "/api/platform/settings", [{ ...(entry ?? { name: a.name }), value: a.value }]);
        teardown = "restored";
      } else { await DELETERS[a.entity](api, a); teardown = "deleted"; }
    } catch (err) { teardown = `failed: ${String(err?.message ?? err).slice(0, 200)}`; }
    results.push({ entity: a.entity, id: a.id, teardown, at: now() });
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const key = argOf(process.argv, "key");
  if (!key) { console.error("usage: teardown.mjs --key <KEY> [--dry-run]"); process.exit(1); }
  const ledger = join(workDir(key), "ledger.jsonl");
  if (!existsSync(ledger)) { console.log(JSON.stringify({ status: "nothing-to-do", reason: "no ledger" })); process.exit(0); }
  let bad = 0;
  const entries = readFileSync(ledger, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { bad++; return []; } });
  const plan = planTeardown(entries);
  if (process.argv.includes("--dry-run")) { console.log(JSON.stringify({ status: "planned", unreadable_lines: bad, ...plan }, null, 2)); process.exit(0); }
  const common = join(process.cwd(), "scripts", "lib", "seed-common.mjs");
  if (!existsSync(common)) { console.error("no scripts/lib/seed-common.mjs here — run from the project root"); process.exit(3); }
  await import(pathToFileURL(join(process.cwd(), "config.js")).href);
  const { assertSafeTarget, auth, api } = await import(pathToFileURL(common).href);
  assertSafeTarget();
  await auth();
  const results = await executeTeardown(plan, (method, path, body) => api(method, path, body, { expectStatus: [200, 201, 204, 404] }));
  for (const r of results) appendFileSync(ledger, `${JSON.stringify(r)}\n`);
  const failed = results.filter((r) => r.teardown.startsWith("failed"));
  console.log(JSON.stringify({ status: failed.length ? "partial" : "done", deleted: results.filter((r) => r.teardown === "deleted").length,
    restored: results.filter((r) => r.teardown === "restored").length, failed, manual: plan.manual, unknown: plan.unknown, unreadable_lines: bad }, null, 2));
  process.exit(failed.length || plan.manual.length || plan.unknown.length ? 2 : 0);
}
