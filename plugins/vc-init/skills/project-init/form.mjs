#!/usr/bin/env node
/**
 * skills/project-init/form.mjs — the interview's free-text answers as ONE file the operator fills in an
 * editor, instead of a form typed into the chat (§2e, host-governed.md step 3).
 *
 *   node form.mjs --write --envs qa,uat [--accounts 4]
 *       writes `project-init.form.ini` in the project (gitignored first): per environment its URLs and one
 *       line per test account (`account = <admin|user> | <login> | <one line about it>`), plus the
 *       project-wide keys still empty. What is already known is pre-filled. On a host-governed project an
 *       environment gets one account line per FREE host password slot (that is the most it can hold).
 *   node form.mjs --apply
 *       reads the filled form: URLs and project keys go through write-env.mjs, accounts through add-user.mjs
 *       (admins first). A host-governed project puts every account in the host's slots; a normal one makes
 *       the first admin `ADMIN`, the first storefront user `USER_EMAIL`, and the rest numbered users.
 *       Prints one JSON report (`written`, `users`, `steps` — the operator's password commands — and
 *       `problems`). The form is deleted once everything in it was applied; kept, with the problems
 *       listed, otherwise.
 *
 * The form never holds a password: a value that looks like one is refused (not echoed). Exit 0 = report
 * printed, 1 = a bad argument or an unreadable form.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { readProjectProfile } from "../../scripts/lib/project-profile.mjs";
import { CATALOG } from "./scaffold-env.mjs";
import { ensureProjectIgnores } from "./lib/gitignore.mjs";
import { hostInstallPath } from "./lib/governance.mjs";
import { hostState } from "./lib/host-adapter.mjs";
import { outputRoot } from "./lib/paths.mjs";
import { LOCAL_FILE } from "./lib/project-env.mjs";
import { envsIn, hostEnvFor, markedUsersIn } from "./lib/test-users.mjs";

export const FORM_FILE = "project-init.form.ini";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const ENV_KEYS = ["FRONT_URL", "BACK_URL"];
const ACCOUNT_RE = /^\s*account\s*=\s*(.*)$/i;

function fail(message) {
  console.error(`[form] ${message}`);
  process.exit(1);
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** The project-wide keys scaffold-env asks for that are still empty in `.env.local` — pre-filled from what the host declares. */
function emptyProjectKeys(root, profile, facts = {}) {
  const local = parse(readText(join(root, LOCAL_FILE)));
  const tracker = profile?.tracker?.kind || "jira";
  const clientVcs = profile?.vcs?.clientHost || "github";
  const known = { ADO_ORG: facts.adoOrg?.value || profile?.tracker?.azure?.organization || "", ADO_PROJECT: facts.adoProject?.value || profile?.tracker?.azure?.project || "" };
  return CATALOG.filter(([k, m]) => m.scope === "project" && m.include({ tracker, clientVcs }) && !local[k] && !m.optional)
    .map(([k, m]) => ({ key: k, what: m.what, value: known[k] || "" }));
}

/**
 * The form text. Pure over its inputs: `envs` = [{ env, values: {FRONT_URL, BACK_URL}, accounts: n,
 * slots?: [..] }], `projectKeys` = [{ key, what }], `hostGoverned`.
 */
export function renderForm({ envs, projectKeys, hostGoverned }) {
  const lines = [
    "# /project-init — fill this in, SAVE, then reply \"done\" in the chat.",
    "# One value per line. Leave a value empty to skip it. NEVER put a password in this file.",
    "#",
    "# Accounts — one line each:   account = <admin|user> | <login or email> | <one line about the account>",
    "#   admin = back office (Admin SPA), user = storefront.  Example:",
    "#   account = user | buyer1@example.com | buyer in org A, approval limit 1000",
    hostGoverned
      ? "# Passwords go to the host plugin's own secret tool — you get one command per account afterwards."
      : "# Passwords are asked separately (admins: the secret store; storefront users: your choice).",
    "",
  ];
  if (projectKeys.length) {
    lines.push("[project]");
    for (const { key, what, value } of projectKeys) lines.push(`# ${what}${value ? " (read from the host — change only if wrong)" : ""}`, `${key}=${value || ""}`);
    lines.push("");
  }
  for (const e of envs) {
    lines.push(`[env ${e.env}]`);
    for (const k of ENV_KEYS) lines.push(`${k}=${e.values?.[k] || ""}`);
    if (e.slots) lines.push(`# ${e.accounts} account line(s) = the free password slots of ${e.hostEnv} (${e.slots.join(", ")})`);
    for (let i = 0; i < e.accounts; i++) lines.push("account = user |  | ");
    lines.push("");
  }
  return lines.join("\n");
}

/** A value that is plainly not a login — a password pasted by mistake must never be applied or echoed. */
export function looksLikeSecret(value) {
  const v = String(value || "");
  return /password|passwd|secret|token/i.test(v) || (!v.includes("@") && /[^\w.@+-]/.test(v) && v.length >= 8);
}

/**
 * Parse a filled form. Pure. Returns { project: {KEY: value}, envs: [{ env, values, accounts: [{role,
 * login, note}] }], problems: [..] }. An account line with no login is skipped silently (left as offered).
 */
export function parseForm(text) {
  const out = { project: {}, envs: [], problems: [] };
  let section = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sec = /^\[(project|env\s+([a-z0-9_]+))\]$/i.exec(line);
    if (sec) {
      section = sec[2] ? { env: sec[2], values: {}, accounts: [] } : "project";
      if (sec[2]) out.envs.push(section);
      continue;
    }
    const acc = ACCOUNT_RE.exec(line);
    if (acc) {
      if (!section || section === "project") { out.problems.push("an account line outside an [env …] section"); continue; }
      const [role = "", login = "", ...rest] = acc[1].split("|").map((s) => s.trim());
      if (!login) continue;
      if (!["admin", "user"].includes(role.toLowerCase())) { out.problems.push(`${section.env}: account role must be admin or user (got "${role}")`); continue; }
      if (looksLikeSecret(login)) { out.problems.push(`${section.env}: an account login looks like a password — not applied; remove it from the form`); continue; }
      section.accounts.push({ role: role.toLowerCase(), login, note: rest.join(" | ").trim() });
      continue;
    }
    const kv = /^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!kv) { out.problems.push(`unreadable line: ${line.slice(0, 40)}`); continue; }
    if (!kv[2]) continue;
    if (section === "project") out.project[kv[1]] = kv[2];
    else if (section) section.values[kv[1]] = kv[2];
  }
  // Admins first — the order the operator is asked for and the slots are handed out in.
  for (const e of out.envs) e.accounts.sort((a, b) => (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1));
  return out;
}

function runScript(script, args, input) {
  const r = spawnSync(process.execPath, [join(HERE, script), ...args], { encoding: "utf8", input, env: process.env });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* a script that prints lines, not JSON */
  }
  return { ok: r.status === 0, json, stdout: r.stdout || "", stderr: (r.stderr || "").trim() };
}

function write(root, profile, args) {
  const envNames = String(args.envs || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!envNames.length) fail("--envs <env1,env2> is required");
  const g = profile?.governance;
  const state = g?.host ? hostState(g.host, hostInstallPath(g.host, { projectRoot: root }), root) : null;
  const envs = envNames.map((env) => {
    const values = parse(readText(join(root, `.env.${env}`)));
    if (!state) return { env, values, accounts: Number(args.accounts) > 0 ? Number(args.accounts) : 4 };
    const hostEnv = hostEnvFor(env, g, state.hostEnvs);
    const taken = new Set(envsIn(readdirSync(root)).filter((e) => hostEnvFor(e, g, state.hostEnvs) === hostEnv)
      .flatMap((e) => markedUsersIn(readText(join(root, `.env.${e}`))).map((u) => u.key)));
    const free = state.slots.filter((s) => s.hostEnv === hostEnv && !taken.has(s.slot)).map((s) => s.slot);
    return { env, values, hostEnv, slots: free, accounts: free.length };
  });
  ensureProjectIgnores(root, [FORM_FILE]);
  const path = join(root, FORM_FILE);
  writeFileSync(path, renderForm({ envs, projectKeys: emptyProjectKeys(root, profile, state?.facts), hostGoverned: Boolean(state) }));
  return { status: "written", form: path, envs: envs.map((e) => ({ env: e.env, accountLines: e.accounts, hostEnv: e.hostEnv || "" })) };
}

function apply(root, profile) {
  const path = join(root, FORM_FILE);
  if (!existsSync(path)) fail(`no ${FORM_FILE} here — run form.mjs --write first`);
  const form = parseForm(readText(path));
  const report = { status: "applied", written: [], users: [], steps: [], problems: [...form.problems] };
  const hostGoverned = Boolean(profile?.governance?.host);

  for (const e of form.envs) {
    if (!existsSync(join(root, `.env.${e.env}`))) { report.problems.push(`.env.${e.env} does not exist — scaffold it first (§3a)`); continue; }
    const envVars = { ...form.project, ...e.values };
    const normalOnes = { admin: e.accounts.find((a) => a.role === "admin"), user: e.accounts.find((a) => a.role === "user") };
    if (!hostGoverned) {
      // A normal project's first admin / storefront user are the built-ins every env has.
      if (normalOnes.admin) envVars.ADMIN = normalOnes.admin.login;
      if (normalOnes.user) envVars.USER_EMAIL = normalOnes.user.login;
    }
    if (Object.keys(envVars).length) {
      const r = runScript("write-env.mjs", ["--print"], JSON.stringify({ env: e.env, envVars, secrets: {} }));
      if (r.ok) report.written.push({ env: e.env, keys: Object.keys(envVars) });
      else report.problems.push(`${e.env}: write-env refused — ${r.stderr.split("\n").pop()}`);
    }
    // A login already in this env (an earlier --apply of the same form) is left as it is — applying a
    // corrected form again must not hand the same account a second slot.
    const existing = new Set(markedUsersIn(readText(join(root, `.env.${e.env}`))).map((u) => u.login.toLowerCase()));
    for (const a of e.accounts) {
      if (existing.has(a.login.toLowerCase())) { report.users.push({ env: e.env, role: a.role, login: a.login, already: true }); continue; }
      if (!hostGoverned && (a === normalOnes.admin || a === normalOnes.user)) {
        report.users.push({ env: e.env, key: a.role === "admin" ? "ADMIN" : "USER", role: a.role, login: a.login, password: a.role === "admin" ? "ADMIN_PASSWORD" : "USER_PASSWORD" });
        continue;
      }
      // The next free slot (host) or numbered KEY (normal), from add-user's own listing — re-read each time.
      const list = runScript("add-user.mjs", ["--list"]).json || {};
      let pick = "";
      if (hostGoverned) pick = (list.envs || []).find((x) => x.env === e.env)?.slots?.find((s) => s.free)?.slot || "";
      else pick = (list.nextKeys || {})[a.role]?.[0] || "";
      if (!pick) { report.problems.push(`${e.env}: no free ${hostGoverned ? "host password slot" : "user key"} left for ${a.login}`); continue; }
      const r = runScript("add-user.mjs", ["--env", e.env, hostGoverned ? "--slot" : "--key", pick, "--role", a.role, "--login", a.login, ...(hostGoverned && a.note ? ["--note", a.note] : [])]);
      if (!r.ok || !r.json) { report.problems.push(`${e.env}: ${a.login} not added — ${r.stderr.split("\n").pop() || "add-user failed"}`); continue; }
      report.users.push({ env: e.env, key: r.json.user.key, role: a.role, login: a.login, password: r.json.user.password });
      for (const s of r.json.steps || []) if (!report.steps.includes(s)) report.steps.push(s);
    }
  }
  if (!report.problems.length) rmSync(path);
  else report.status = "applied-with-problems";
  report.form = report.problems.length ? path : "(deleted — everything in it was applied)";
  return report;
}

function main() {
  const argv = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, "");
    if (["write", "apply"].includes(k)) args[k] = true;
    else { args[k] = argv[i + 1]; i++; }
  }
  const root = resolve(outputRoot());
  const { raw: profile } = readProjectProfile(root);
  if (!profile) fail("no project-profile.json — the form comes after the profile stub (§0-host / §2)");
  const out = args.write ? write(root, profile, args) : args.apply ? apply(root, profile) : fail("usage: form.mjs --write --envs <a,b> | --apply");
  console.log(JSON.stringify(out, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

