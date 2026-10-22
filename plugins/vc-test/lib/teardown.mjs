// plugins/vc-test/lib/teardown.mjs — tears a run down from its ledger only (spec §6a Teardown): entities newest first
// by id, never by prefix, name or email; a changed setting restored to its first "before" only while the stand still
// holds the run's last "after". A line written on another stand (env + host), or with no stamp, is refused, and
// nothing runs on a stand the run may not write to (U16). Anything it cannot do safely is listed for a human, never
// guessed. Each result is appended to the ledger, so a re-run skips what is done.
// CLI: node plugins/vc-test/lib/teardown.mjs --key <KEY> [--dry-run]   (exit 2: something is left; 3: refused)
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { standOf } from "./capabilities.mjs";
import { argOf, currentEnv, workDir } from "./paths.mjs";

const enc = encodeURIComponent;
// A 404 comes back as null or an error body, so only a body with a userName is the account.
const userById = async (api, id) => { const u = await api("GET", `/api/platform/security/users/id/${enc(id)}`); return u?.userName ? u : null; };
// A deleter returns "gone" when the entity no longer exists, else nothing ("deleted").
const DELETERS = {
  "organization-membership": async (api, a) => { await api("DELETE", `/api/customer/organization-memberships?ids=${enc(a.id)}`); },
  user: async (api, a) => {
    const user = await userById(api, a.id);
    if (!user) return "gone";
    await api("DELETE", `/api/platform/security/users?names=${enc(user.userName)}`);
  },
  contact: async (api, a) => { await api("DELETE", `/api/members?ids=${enc(a.id)}`); },
  organization: async (api, a) => { await api("DELETE", `/api/members?ids=${enc(a.id)}`); },
  store: async (api, a) => { await api("DELETE", `/api/stores?ids=${enc(a.id)}`); },
  "storefront-user": async (api, a) => {
    const user = await userById(api, a.id);
    if (!user) return "gone";
    await api("DELETE", `/api/platform/security/users?names=${enc(user.userName)}`);
    if (user.memberId) await api("DELETE", `/api/members?ids=${enc(user.memberId)}`);
  },
};
export const ENTITIES = [...Object.keys(DELETERS), "setting"];
const DONE = new Set(["deleted", "restored", "gone"]);
const at = (x) => String(x.at ?? "");
const keyOf = (x) => `${x.entity}|${x.id}`;
const onStand = (x, here) => !here || (x.env === here.env && x.host === here.host);

export function planTeardown(entries, here = null) {
  const foreign = entries.filter((x) => !x.teardown && !onStand(x, here)).map((x) =>
    `${x.entity} ${x.id}: ${x.host ? `written on ${x.env} (${x.host})` : "no env/host stamp"}, not ${here.env} (${here.host}) — tear it down there, or by hand`);
  const mine = entries.filter((x) => onStand(x, here));
  const done = new Set(mine.filter((x) => DONE.has(x.teardown)).map(keyOf));
  const live = mine.filter((x) => !x.teardown && !done.has(keyOf(x)));
  const stores = new Set(live.filter((x) => x.entity === "store").map((x) => x.id));
  const actions = [], manual = [], unknown = [];

  const settings = new Map();
  for (const x of live.filter((y) => y.entity === "setting").sort((a, b) => at(a).localeCompare(at(b)))) {
    (settings.get(x.id) ?? settings.set(x.id, []).get(x.id)).push(x);
  }
  for (const [id, rows] of settings) {
    const first = rows[0], last = rows.at(-1);
    const scope = id.includes("/") ? id.slice(0, id.indexOf("/")) : null;
    if (!Object.hasOwn(first, "before") || !Object.hasOwn(last, "after")) manual.push(`${id}: the ledger has no before/after for this setting — check it by hand`);
    else if (isDeepStrictEqual(first.before, last.after)) actions.push({ kind: "skip", entity: "setting", id, reason: "already restored" });
    else if (scope && stores.has(scope)) actions.push({ kind: "skip", entity: "setting", id, reason: `covered by deleting store ${scope}` });
    else if (scope) manual.push(`${id}: a store setting of a store this run did not create — restore by hand to ${JSON.stringify(first.before)}`);
    else actions.push({ kind: "restore", entity: "setting", id, name: id, value: first.before, expect: last.after });
  }

  const latest = new Map();
  for (const x of live.filter((y) => y.entity !== "setting")) {
    const k = keyOf(x);
    if (!latest.has(k) || at(latest.get(k)) < at(x)) latest.set(k, x);
  }
  for (const x of [...latest.values()].sort((a, b) => at(b).localeCompare(at(a)))) {
    if (x.entity === "other") manual.push(`${x.id}: ${x.note ?? "no note on how to undo it"}`);
    else if (!DELETERS[x.entity]) unknown.push(`${x.entity} ${x.id}`);
    else actions.push({ kind: "delete", entity: x.entity, id: x.id });
  }
  return { actions, manual, unknown, foreign };
}

export async function executeTeardown(plan, api, now = () => new Date().toISOString()) {
  const results = [], manual = [];
  for (const a of plan.actions) {
    let teardown;
    try {
      if (a.kind === "skip") teardown = `skipped: ${a.reason}`;
      else if (a.kind === "restore") {
        const entry = await api("GET", `/api/platform/settings/${enc(a.name)}`);
        if (!entry?.name) {
          manual.push(`${a.id}: not found on the stand — restore by hand to ${JSON.stringify(a.value)}`);
          teardown = "skipped: not found";
        } else if (!isDeepStrictEqual(entry.value, a.expect)) {
          manual.push(`${a.id}: changed since the run left it (now ${JSON.stringify(entry.value)}, the run left ${JSON.stringify(a.expect)}) — restore to ${JSON.stringify(a.value)} only if no one else changed it`);
          teardown = "skipped: changed since the run";
        } else {
          await api("POST", "/api/platform/settings", [{ ...entry, value: a.value }]);
          teardown = "restored";
        }
      } else teardown = (await DELETERS[a.entity](api, a)) ?? "deleted";
    } catch (err) { teardown = `failed: ${String(err?.message ?? err).slice(0, 200)}`; }
    results.push({ entity: a.entity, id: a.id, teardown, at: now() });
  }
  return { results, manual };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const key = argOf(process.argv, "key");
  if (!key) { console.error("usage: teardown.mjs --key <KEY> [--dry-run]"); process.exit(1); }
  const [config, common] = [join(process.cwd(), "config.js"), join(process.cwd(), "scripts", "lib", "seed-common.mjs")];
  if (!existsSync(config) || !existsSync(common)) { console.error("no config.js or scripts/lib/seed-common.mjs here — run from the project root"); process.exit(3); }
  await import(pathToFileURL(config).href); // runs the layered env loader into process.env
  const here = { env: currentEnv(), host: process.env.BACK_URL ? new URL(process.env.BACK_URL).host : null };
  const ledger = join(workDir(key, { env: here.env }), "ledger.jsonl");
  if (!existsSync(ledger)) { console.log(JSON.stringify({ status: "nothing-to-do", reason: `no ledger for ${key} on ${here.env}` })); process.exit(0); }
  let bad = 0;
  const entries = readFileSync(ledger, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { bad++; return []; } });
  const plan = planTeardown(entries, here);
  if (process.argv.includes("--dry-run")) { console.log(JSON.stringify({ status: "planned", here, unreadable_lines: bad, ...plan }, null, 2)); process.exit(0); }
  const stand = standOf(process.env);
  if (!stand.writable) {
    console.log(JSON.stringify({ status: "refused", reason: `this stand may not be written to (${stand.reason}) — every line is for a human`, here, ...plan }, null, 2));
    process.exit(3);
  }
  const { assertSafeTarget, auth, api } = await import(pathToFileURL(common).href);
  assertSafeTarget();
  await auth();
  const { results, manual } = await executeTeardown(plan, (method, path, body) => api(method, path, body, { expectStatus: [200, 201, 204, 404] }));
  for (const r of results) appendFileSync(ledger, `${JSON.stringify({ ...r, ...here })}\n`);
  const failed = results.filter((r) => r.teardown.startsWith("failed"));
  const left = [...plan.manual, ...manual];
  console.log(JSON.stringify({ status: failed.length ? "partial" : "done", deleted: results.filter((r) => r.teardown === "deleted").length,
    restored: results.filter((r) => r.teardown === "restored").length, failed, manual: left, unknown: plan.unknown, foreign: plan.foreign, unreadable_lines: bad }, null, 2));
  process.exit(failed.length || left.length || plan.unknown.length || plan.foreign.length ? 2 : 0);
}
