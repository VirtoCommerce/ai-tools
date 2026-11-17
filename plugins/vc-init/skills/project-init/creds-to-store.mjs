#!/usr/bin/env node
/**
 * skills/project-init/creds-to-store.mjs — move a project's test-account credentials into the test-account store,
 * test-accounts.local.json (`/project-init --check` Step M, first action). vc-init before 0.8.0 kept the logins in
 * `.env.<env>` (ADMIN, USER_EMAIL, `<KEY>_LOGIN` under a `# vc-init user` marker) and the passwords in `.env.local`
 * (`ADMIN_PASSWORD_<ENV>`, bare `USER_PASSWORD`, …), plus a generated `.env.playwright.local` for the lanes.
 *
 * For every env the project defines (a `.env.<env>` file in the output root) it reads the credentials AS THE CURRENT
 * LOADER GIVES THEM — scripts/lib/load-layered-env.mjs in a child process per env (TEST_ENV=<env>, cwd = the root,
 * an environment with no inherited variable) — and keeps only what the store does not already hold:
 *   - the built-in users (ADMIN + ADMIN_PASSWORD, USER_EMAIL + USER_PASSWORD), every add-user user (`<KEY>_LOGIN` +
 *     `<KEY>_PASSWORD`), every `<STEM>_PASSWORD` whose `<STEM>_LOGIN` / `<STEM>_EMAIL` is set → an account per env,
 *     login beside password (lib/store-accounts.mjs);
 *   - any other password name (not a person's own tool account, not token-shaped) → `shared`: the top level when
 *     every env has the same value, else that env's own `shared`.
 * The store's own values win; an empty store field is filled. A password an env keeps in vc-secrets (option B) is
 * not visible here and stays there — the report names it.
 *
 *   --dry-run  (default) the plan: names and counts only.
 *   --apply    writes the store, then PROVES it: per env, a child loading the new store must resolve every moved
 *              name to the value it had before (the children compare; only a mismatching NAME comes back). On a green
 *              proof it backs up every file it is about to change to `.vc-fix/creds-backup/<time>/`, removes the moved
 *              password lines from `.env.local` and the moved login lines (+ their marker / scaffold comments) from
 *              `.env.<env>`, deletes `.env.playwright.local`, and proves again — a red second proof restores the backup.
 *
 * Never prints a value. A host-governed project is refused in one line: its passwords are the host's.
 * Exit: 0 done / nothing to move / dry run, 1 a refusal or a failed proof (the store and the files are as before).
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "dotenv";
import { outputRoot } from "./lib/paths.mjs";
import { standDownIfHostGoverned } from "./lib/governance.mjs";
import { ensureProjectIgnores } from "./lib/gitignore.mjs";
import { declaredPasswords, isPasswordName } from "./lib/passwords.mjs";
import { envsIn, markedUsersIn } from "./lib/test-users.mjs";
import { STORE_FILE, envSection, fillAccount, passwordAccount, readStore, writeStore } from "./lib/store-accounts.mjs";
import { envView, isPersonalServiceName, isStoreName, storeValues } from "../../scripts/lib/test-accounts.mjs";

const SELF = fileURLToPath(import.meta.url);
const LOADER = resolve(dirname(SELF), "../../scripts/lib/load-layered-env.mjs");
const BROWSER_SECRETS_FILE = ".env.playwright.local";
const TAG = "[creds-to-store]";

/** A password name the store takes. */
const storePassword = (n) => isPasswordName(n) && !isPersonalServiceName(n) && isStoreName(n);

/** The environment of a child: nothing inherited but what node and the OS need, so only the project's files speak. */
function childEnv(env) {
  const keep = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "windir", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ComSpec"];
  const out = { TEST_ENV: env };
  for (const k of keep) if (process.env[k] !== undefined) out[k] = process.env[k];
  return out;
}

/** Run this file as a child for `env` (cwd = root); `input` goes to its stdin. Returns its parsed stdout. */
function child(root, env, mode, input = "") {
  const r = spawnSync(process.execPath, [SELF, mode], { cwd: root, env: childEnv(env), input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${env}: the loader failed — ${String(r.stderr || "").trim().split("\n").pop()}`);
  return JSON.parse(r.stdout);
}

/** CHILD: the credential variables the loader gives this env, with values (to the parent's pipe only). */
async function childRead() {
  const { loadLayeredEnv } = await import(pathToUrl(LOADER));
  const env = loadLayeredEnv();
  const e = process.env;
  const markers = existsSync(`.env.${env}`) ? markedUsersIn(readFileSync(`.env.${env}`, "utf8")).map((u) => u.key) : [];
  const out = {};
  for (const [k, v] of Object.entries(e)) if (v && storePassword(k)) out[k] = v;
  const logins = ["ADMIN", "USER_EMAIL", ...markers.map((k) => `${k}_LOGIN`)];
  for (const p of Object.keys(out)) {
    const stem = p.replace(/_PASSWORD$/, "");
    logins.push(`${stem}_LOGIN`, `${stem}_EMAIL`);
  }
  for (const k of logins) if (e[k] && isStoreName(k)) out[k] = e[k];
  process.stdout.write(JSON.stringify({ env, markers, values: out }));
}

/** CHILD: compare the loader's values with the expected ones on stdin; print only the names that differ. */
async function childProof() {
  const expected = JSON.parse(readFileSync(0, "utf8"));
  const { loadLayeredEnv } = await import(pathToUrl(LOADER));
  loadLayeredEnv();
  process.stdout.write(JSON.stringify({ mismatch: Object.keys(expected).filter((k) => process.env[k] !== expected[k]).sort() }));
}

const pathToUrl = (p) => pathToFileURL(p).href;

/**
 * The plan for every env from what the loader gave it: per env the accounts (key → fields to fill) and the shared
 * names, plus the top-level shared names. Skips what the store holds and what the env keeps in vc-secrets. Pure.
 */
export function planMove(store, reads, vcByEnv = {}) {
  const plan = { envs: {}, topShared: {}, vcSecrets: {} };
  const unowned = {};
  for (const { env, markers, values } of reads) {
    const held = new Set(Object.keys(storeValues(store, env).values));
    const vc = new Set(vcByEnv[env] || []);
    const take = (n) => values[n] && !held.has(n) && !vc.has(n);
    const accounts = {};
    const acc = (key) => (accounts[key] ??= {});
    const loginOf = (key) => {
      if (key === "ADMIN") return ["ADMIN", "ADMIN"];
      if (key === "USER") return ["USER_EMAIL", "USER_EMAIL"];
      if (markers.includes(key) || values[`${key}_LOGIN`]) return [`${key}_LOGIN`, `${key}_LOGIN`];
      if (values[`${key}_EMAIL`]) return [`${key}_EMAIL`, `${key}_EMAIL`];
      return null;
    };
    if (vc.size) plan.vcSecrets[env] = [...vc].sort();
    for (const name of Object.keys(values).filter(storePassword)) {
      const key = passwordAccount(name);
      if (!key || !take(name)) continue;
      if (loginOf(key)) acc(key).password = name;
      else (unowned[name] ??= {})[env] = values[name];
    }
    for (const key of ["ADMIN", "USER", ...markers, ...Object.keys(accounts)]) {
      const l = loginOf(key);
      if (l && take(l[0])) Object.assign(acc(key), { login: l[0], loginVar: l[1] });
    }
    plan.envs[env] = { accounts, shared: [] };
  }
  const envs = reads.map((r) => r.env);
  for (const [name, byEnv] of Object.entries(unowned)) {
    const vals = Object.values(byEnv);
    if (envs.every((e) => e in byEnv) && vals.every((v) => v === vals[0]) && !store.shared?.[name]) plan.topShared[name] = true;
    else for (const env of Object.keys(byEnv)) plan.envs[env].shared.push(name);
  }
  return plan;
}

/** Apply a plan to a store (mutates it) with the values read; returns { name → value } per env: what must resolve. */
function applyPlan(store, plan, reads) {
  const expected = {};
  for (const { env, values } of reads) {
    const exp = (expected[env] = {});
    const p = plan.envs[env];
    for (const [key, f] of Object.entries(p.accounts)) {
      const fields = {};
      if (f.password) { fields.password = values[f.password]; exp[f.password] = values[f.password]; }
      if (f.login) { fields.login = values[f.login]; fields.loginVar = f.loginVar; exp[f.login] = values[f.login]; }
      fillAccount(store, env, key, fields);
    }
    for (const name of p.shared) {
      if (!envView(store, env).shared[name]) envSection(store, env).shared[name] = values[name];
      exp[name] = values[name];
    }
    for (const name of Object.keys(plan.topShared)) if (values[name]) exp[name] = values[name];
  }
  for (const name of Object.keys(plan.topShared)) store.shared[name] = reads.find((r) => r.values[name]).values[name];
  return expected;
}

/** Remove the lines of `names` from a dotenv text, with the comment block written for them right above. Pure. */
export function removeLines(text, names, owners = names) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const drop = new Set();
  const own = new Set(owners);
  lines.forEach((line, i) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!m || !names.includes(m[1])) return;
    drop.add(i);
    // The comment block above it, when its first line names this variable (or its account): scaffold / add-user wrote it.
    for (let j = i - 1; j >= 0 && /^\s*#/.test(lines[j]); j--) {
      const head = /^\s*#\s*(?:vc-init user\s+)?([A-Z][A-Z0-9_]*)\b/.exec(lines[j]);
      if (!head || !/^\s*#\s*(?:vc-init user\s+[A-Z]|[A-Z][A-Z0-9_]*\s+—)/.test(lines[j])) continue;
      if (own.has(head[1]) || head[1] === m[1]) for (let k = j; k < i; k++) drop.add(k);
      break;
    }
  });
  if (!drop.size) return text;
  // Tidy what the removal left: a placeholder-section header with nothing under it, and runs of blank lines.
  let kept = lines.filter((_, i) => !drop.has(i));
  kept = kept.filter((line, i) => {
    if (!/^#\s*===\s*\/project-init secret placeholders/.test(line)) return true;
    const next = kept.slice(i + 1).find((l) => l.trim() && !/^\s*#/.test(l) ? true : /^#\s*===/.test(l));
    return next !== undefined && !/^#\s*===/.test(next);
  });
  kept = kept.filter((line, i) => line.trim() || (i > 0 && kept[i - 1].trim()));
  while (kept.length > 1 && !kept[kept.length - 1].trim() && !kept[kept.length - 2].trim()) kept.pop();
  return kept.join(eol);
}

function fail(msg) { console.error(`${TAG} ${msg}`); process.exit(1); }

function readDecl(root) {
  try { return JSON.parse(readFileSync(join(root, ".claude", "vc-secrets.local.json"), "utf8")); } catch { return null; }
}

function proofFails(root, expected) {
  const out = [];
  for (const [env, exp] of Object.entries(expected)) {
    if (!Object.keys(exp).length) continue;
    const { mismatch } = child(root, env, "--child-proof", JSON.stringify(exp));
    for (const n of mismatch) out.push(`${env}:${n}`);
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--child-read") return childRead();
  if (argv[0] === "--child-proof") return childProof();
  const apply = argv.includes("--apply");
  const root = outputRoot();
  standDownIfHostGoverned(root, "creds-to-store refused: on a host-governed project the test-user passwords are the host's, never a file of ours");

  const envs = envsIn(readdirSync(root));
  if (!envs.length) { console.log(`${TAG} no .env.<env> file in ${root} — nothing to move`); return; }
  let store;
  try { store = readStore(root); } catch (e) { fail(e.message); }
  const storeBefore = existsSync(join(root, STORE_FILE)) ? readFileSync(join(root, STORE_FILE), "utf8") : null;
  let reads;
  try { reads = envs.map((env) => child(root, env, "--child-read")); } catch (e) { fail(e.message); }
  const plan = planMove(store, reads, declaredPasswords(readDecl(root)));

  // The plan, names and counts only.
  let moved = Object.keys(plan.topShared).length;
  for (const env of envs) {
    const p = plan.envs[env];
    const accounts = Object.entries(p.accounts).map(([k, f]) => `${k}(${["login", "password"].filter((x) => f[x]).join("+")})`);
    moved += Object.values(p.accounts).reduce((a, f) => a + !!f.login + !!f.password, 0) + p.shared.length;
    console.log(`${TAG} ${env}: accounts ${accounts.join(", ") || "—"}; shared ${p.shared.join(", ") || "—"}`);
  }
  if (Object.keys(plan.topShared).length) console.log(`${TAG} every env: shared ${Object.keys(plan.topShared).join(", ")}`);
  for (const [env, names] of Object.entries(plan.vcSecrets)) console.log(`${TAG} ${env}: ${names.join(", ")} kept in vc-secrets (option B) — not visible here, stays there`);
  const leftover = existsSync(join(root, BROWSER_SECRETS_FILE));
  console.log(`${TAG} ${moved} value(s) to move into ${STORE_FILE}${leftover ? `; ${BROWSER_SECRETS_FILE} to delete` : ""}`);
  if (!apply) { console.log(`${TAG} dry run — nothing written; --apply moves them and proves the move`); return; }
  if (!moved && !leftover) { console.log(`${TAG} nothing to move`); return; }

  // 1. The store, then the first proof: the new store resolves every moved name as before.
  const expected = applyPlan(store, plan, reads);
  const restoreStore = () => (storeBefore === null ? rmSync(join(root, STORE_FILE), { force: true }) : writeFileSync(join(root, STORE_FILE), storeBefore));
  ensureProjectIgnores(root);
  try { writeStore(root, store); } catch (e) { fail(e.message); }
  let bad;
  try { bad = proofFails(root, expected); } catch (e) { restoreStore(); fail(`proof could not run — ${e.message}; ${STORE_FILE} restored`); }
  if (bad.length) { restoreStore(); fail(`proof FAILED for ${bad.join(", ")} — ${STORE_FILE} restored, no file touched`); }
  console.log(`${TAG} ✓ proof: ${Object.values(expected).reduce((a, e) => a + Object.keys(e).length, 0)} name(s) resolve as before in ${envs.length} env(s)`);

  // 2. Back up what changes, then clean the old files.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = join(root, ".vc-fix", "creds-backup", stamp);
  mkdirSync(backup, { recursive: true });
  const changes = new Map();
  const local = join(root, ".env.local");
  if (existsSync(local)) {
    const names = [];
    for (const env of envs) {
      const suffix = `_${env.toUpperCase()}`;
      for (const n of Object.keys(expected[env]).filter(storePassword)) names.push(`${n}${suffix}`);
    }
    // A bare password line serves every env: it goes only when every env moved that name.
    const bare = [...new Set(Object.values(expected).flatMap((e) => Object.keys(e)).filter(storePassword))].filter((n) => envs.every((e) => n in expected[e]));
    const text = readFileSync(local, "utf8");
    // A block's comment head names the bare password (scaffold-secrets) or the account KEY (add-user).
    const owners = [...names, ...bare].flatMap((n) => [n.replace(/(_PASSWORD)_[A-Z0-9_]+$/, "$1"), n.replace(/_PASSWORD(_[A-Z0-9_]+)?$/, "")]);
    const next = removeLines(text, [...names, ...bare], owners);
    if (next !== text) changes.set(local, next);
  }
  for (const env of envs) {
    const f = join(root, `.env.${env}`);
    const text = readFileSync(f, "utf8");
    const logins = Object.keys(expected[env]).filter((n) => !storePassword(n));
    const owners = Object.keys(plan.envs[env].accounts);
    const next = removeLines(text, logins, owners);
    if (next !== text) changes.set(f, next);
  }
  if (storeBefore !== null) writeFileSync(join(backup, STORE_FILE), storeBefore);
  for (const f of changes.keys()) copyFileSync(f, join(backup, f.slice(root.length + 1)));
  if (leftover) copyFileSync(join(root, BROWSER_SECRETS_FILE), join(backup, BROWSER_SECRETS_FILE));
  for (const [f, text] of changes) writeFileSync(f, text);
  if (leftover) rmSync(join(root, BROWSER_SECRETS_FILE));
  const restoreAll = () => {
    for (const f of changes.keys()) copyFileSync(join(backup, f.slice(root.length + 1)), f);
    if (leftover) copyFileSync(join(backup, BROWSER_SECRETS_FILE), join(root, BROWSER_SECRETS_FILE));
    restoreStore();
  };

  // 3. The second proof: with the old lines gone, the store alone still resolves every name.
  try { bad = proofFails(root, expected); } catch (e) { restoreAll(); fail(`second proof could not run — ${e.message}; every file restored from ${backup}`); }
  if (bad.length) { restoreAll(); fail(`second proof FAILED for ${bad.join(", ")} — every file restored from ${backup}`); }

  const rel = (f) => f.slice(root.length + 1);
  console.log(`${TAG} ✓ moved into ${STORE_FILE}; cleaned ${[...changes.keys()].map(rel).join(", ") || "no file"}${leftover ? `; deleted ${BROWSER_SECRETS_FILE}` : ""}; backup: ${rel(backup)} (gitignored — delete it once the lanes sign in)`);
  const remaining = existsSync(local) ? Object.keys(parse(readFileSync(local, "utf8"))).filter((k) => /PASSWORD/.test(k) && !isPersonalServiceName(k) && !/TOKEN|API|KEY|SECRET/.test(k)) : [];
  if (remaining.length) console.log(`${TAG} still in .env.local (no .env.<env> uses it, or not a test account): ${remaining.join(", ")}`);
  console.log(`${TAG} next: gen-mcp.mjs (the lanes then read ${STORE_FILE}), restart Claude Code; a tracked .env.<env> changed — commit it, and give teammates ${STORE_FILE} through the team's secret store`);
}

main().catch((e) => fail(e.message));
