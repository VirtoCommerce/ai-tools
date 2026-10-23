#!/usr/bin/env node
/**
 * skills/project-init/add-user.mjs — add another test user (storefront or admin) to an environment
 * (`/project-init --add-user`).
 *
 * A test user is two values under one KEY: its login, which is not a secret and goes into `.env.<env>`
 * as `<KEY>_LOGIN`, and its password `<KEY>_PASSWORD`, which this script never sees. Where the password
 * goes follows where the env keeps its ROLE's passwords (§2d asks per role; lib/passwords.mjs) — the
 * built-in password of that role (ADMIN_PASSWORD / USER_PASSWORD) being declared for the env says so:
 *
 *   vc-secrets  the role's passwords are declared there → the name is added to that env's declaration
 *               (write-secrets-decl.mjs: secret `<key>-password-<env>`, bound in vc-init-onboard.<env>
 *               and every playwright-<lane>.<env>). The operator then runs `trust` and `set`.
 *   .env.local  an empty `<KEY>_PASSWORD_<ENV>=` placeholder is appended to `.env.local` for the
 *               operator to fill. A lane run from vc-secrets reads it from there itself; a project with
 *               no declaration hands it over through sync-browser-secrets.mjs.
 *
 * Either way a browser agent logs in with the login from `<KEY>_LOGIN` and types the password by its
 * NAME — `browser_type(text="<KEY>_PASSWORD")`.
 *
 * Usage:
 *   node add-user.mjs --list
 *       JSON: every environment (`.env.<env>` in the project), where each role's passwords live, its
 *       users, and `nextKeys` — per role the next free numbered KEYs (USER2, USER3, … / ADMIN2, …),
 *       free in EVERY environment, which the skill offers as the KEY question's options.
 *   node add-user.mjs --env <env> --key <KEY> --role user|admin --login <login> [--replace] [--shim <vc-run>]
 *       one env per call (a login usually differs per env). Prints one JSON report whose `steps` are the
 *       operator's commands, relayed verbatim. --replace overwrites a different login under the same KEY.
 *
 * On a host-governed project whose host keeps the passwords (governance.websiteAuth "host-secrets"), a user
 * takes one of the host's password SLOTS instead (hostMain below):
 *   node add-user.mjs --list            every env, its host website env, and each slot: free or whose
 *   node add-user.mjs --env <env> --slot <SLOT> --role user|admin --login <login> [--note "<one line>"] [--replace]
 *
 * Exit: 0 done (or nothing to do), 1 a bad argument or a refusal (the JSON / stderr says why).
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { readProjectProfile } from "../../scripts/lib/project-profile.mjs";
import { defaultShimPath } from "../../scripts/install-bridge.mjs";
import { vcSecretsShim } from "../../bridge/vc-secrets-path.mjs";
import { ensureProjectIgnores } from "./lib/gitignore.mjs";
import { outputRoot } from "./lib/paths.mjs";
import { hostInstallPath, standDownIfHostGoverned } from "./lib/governance.mjs";
import { hostState, storeCommand } from "./lib/host-adapter.mjs";
import { BUILT_IN, envsIn, hostEnvFor, markedUsersIn, usersIn } from "./lib/test-users.mjs";
import { ENV_NAME_RE, ROLES, ROLE_PASSWORD, declaredPasswords, isPasswordName, passwordSecret } from "./lib/passwords.mjs";
import { patAxesFromProfile, writeSecretsDecl } from "./write-secrets-decl.mjs";

export { envsIn, hostEnvFor, markedUsersIn, usersIn };

const ROLE_TEXT = { user: "storefront test user", admin: "back-office (admin) test user" };

/** Why a KEY is not usable, or null. Pure. */
export function keyProblem(key) {
  if (!/^[A-Z][A-Z0-9_]{0,40}$/.test(String(key || ""))) return "KEY is upper snake case: letters, digits, _ (e.g. BUYER2, SUPPORT_ADMIN)";
  if (BUILT_IN.some((b) => b.key === key)) return `${key} is a built-in user — every environment already has it`;
  if (!isPasswordName(`${key}_PASSWORD`)) return `${key}_PASSWORD looks like a token name (TOKEN/API/KEY/SECRET/PAT) — pick another KEY`;
  return null;
}

/** Why a login is not usable, or null. A login is a plain dotenv value: no quote, space, # or line break. Pure. */
export function loginProblem(login) {
  if (!login || typeof login !== "string") return "--login is required";
  if (/[\s"'`#\\]/.test(login)) return "a login holds no space, quote, # or backslash";
  return null;
}

/**
 * The `.env.<env>` text with the user's block added or its login changed. Pure.
 * @returns {{ text: string, change: "added"|"replaced"|"unchanged" } | { refused: string }}
 */
export function withUser(text, { key, role, login, replace = false, note = "", password = `${key}_PASSWORD`, where = "" }) {
  const loginVar = `${key}_LOGIN`;
  const current = parse(String(text || ""))[loginVar];
  const comment = `# vc-init user ${key} (${role}) — ${note || ROLE_TEXT[role]}. Login below; the agent types the password by its NAME: ${password}${where ? ` (${where})` : ""}`;
  if (current === login && !replace) return { text, change: "unchanged" };
  if (current !== undefined) {
    if (!replace) return { refused: `${loginVar} is already ${JSON.stringify(current)} here — pass --replace to change it` };
    // A replacer function: a login is data, and `$&` / `$1` in a string replacement would be a pattern.
    // The comment above it is rewritten too, so its role, note and password NAME follow the new user.
    const marker = new RegExp(`^#\\s*vc-init user ${key} \\((?:user|admin)\\).*$`, "m");
    // A login line written by hand has no marker: one is added above it, or the slot reads as free.
    const loginLine = new RegExp(`^(\\s*${loginVar}\\s*=).*$`, "m");
    const next = marker.test(text)
      ? String(text).replace(loginLine, (_m, lead) => `${lead}${login}`).replace(marker, () => comment)
      : String(text).replace(loginLine, (_m, lead) => `${comment}\n${lead}${login}`);
    return { text: next, change: next === text ? "unchanged" : "replaced" };
  }
  const base = String(text || "");
  const block = `${comment}\n${loginVar}=${login}\n`;
  return { text: `${base}${base && !base.endsWith("\n") ? "\n" : ""}${base ? "\n" : ""}${block}`, change: "added" };
}

function readDecl(root) {
  try {
    return JSON.parse(readFileSync(join(root, ".claude", "vc-secrets.local.json"), "utf8"));
  } catch {
    return null;
  }
}

/** The role's built-in KEY, the stem its numbered KEYs grow from (USER → USER2, USER3, …). */
const ROLE_STEM = Object.freeze({ user: "USER", admin: "ADMIN" });

/** The next `count` free numbered KEYs of a role, given every KEY in use (any env). Pure. */
export function nextKeys(role, taken, count = 3) {
  const used = new Set(taken);
  const out = [];
  for (let n = 2; out.length < count; n++) if (!used.has(`${ROLE_STEM[role]}${n}`)) out.push(`${ROLE_STEM[role]}${n}`);
  return out;
}

/** Every environment of the project, its password mode and its users. */
export function listEnvs(root) {
  const inVcSecrets = declaredPasswords(readDecl(root));
  return envsIn(readdirSync(root)).map((env) => ({
    env,
    passwords: Object.fromEntries(ROLES.map((r) => [r, inVcSecrets[env]?.includes(ROLE_PASSWORD[r]) ? "vc-secrets" : ".env.local"])),
    users: usersIn(readFileSync(join(root, `.env.${env}`), "utf8")).map(({ key, role, loginVar, password, login }) => ({ key, role, loginVar, password, login })),
  }));
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(k)}`);
    const name = k.slice(2);
    if (["list", "replace"].includes(name)) {
      a[name] = true;
      continue;
    }
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`--${name} needs a value`);
    a[name] = v;
    i++;
  }
  return a;
}

function fail(message) {
  console.error(`[add-user] ${message}`);
  process.exit(1);
}

/** Why a note is not usable, or null. It lands in a one-line `#` comment. Pure. */
export function noteProblem(note) {
  if (note === undefined || note === "") return null;
  if (/[\r\n]/.test(note) || note.length > 160) return "--note is one line of at most 160 characters";
  return null;
}

/**
 * A host-governed project whose host keeps test-user passwords (governance.websiteAuth "host-secrets"): the
 * host declares fixed password SLOTS per website environment (lib/host-adapter.mjs), each with the
 * NAME a browser agent types. A user takes a free slot of its environment: the login and a one-line
 * note go into `.env.<env>` (the built-in ADMIN / USER have no slot there and are not offered), and
 * the operator stores the password with the host's wrapper — never this script, never a file.
 */
function hostMain(root, profile, args) {
  const g = profile.governance;
  const installPath = hostInstallPath(g.host, { projectRoot: root });
  if (!installPath) fail(`${g.host} is not installed for this folder — install it first (the host's own instructions)`);
  const state = hostState(g.host, installPath, root);
  const { slots, hostEnvs } = state;
  if (!slots.length) fail(`${g.host} declares no test-user password slots — sign in by hand (gen-profile --gov-website-auth manual-operator)`);
  // A slot holds ONE password, so it belongs to one user across every `.env.<env>` that maps to the same
  // host environment — two files claiming it would share a password.
  const allEnvs = envsIn(readdirSync(root));
  const holders = (hostEnv) => allEnvs.filter((e) => hostEnvFor(e, g, hostEnvs) === hostEnv)
    .flatMap((e) => markedUsersIn(readFileSync(join(root, `.env.${e}`), "utf8")).map((u) => ({ ...u, env: e })));
  const envView = (env) => {
    const hostEnv = hostEnvFor(env, g, hostEnvs);
    const users = hostEnv ? holders(hostEnv) : [];
    return {
      env,
      hostEnv,
      slots: slots.filter((s) => s.hostEnv === hostEnv).map((s) => {
        const u = users.find((x) => x.key === s.slot);
        return { slot: s.slot, password: s.password, secret: s.secret, login: u?.login || "", role: u?.role || "", heldIn: u?.env || "", free: !u };
      }),
    };
  };

  if (args.list) {
    const envs = envsIn(readdirSync(root)).map(envView);
    console.log(JSON.stringify({ host: g.host, websiteAuth: "host-secrets", hostEnvs, envs,
      unmapped: envs.filter((e) => !e.hostEnv).map((e) => e.env) }, null, 2));
    return;
  }

  const { env, role, login, note = "" } = args;
  const slot = args.slot || args.key;
  if (!ENV_NAME_RE.test(String(env || ""))) fail("--env <name> is required ([a-z0-9_]+)");
  if (!existsSync(join(root, `.env.${env}`))) fail(`no .env.${env} — the environments here are: ${envsIn(readdirSync(root)).join(", ") || "(none)"}; add one with /project-init --add-env`);
  const view = envView(env);
  if (!view.hostEnv) fail(`.env.${env} is not mapped to a ${g.host} website environment (${hostEnvs.join(", ")}) — gen-profile --gov-envs ${env}=<one of them>`);
  const target = view.slots.find((s) => s.slot === slot);
  if (!target) fail(`--slot must be one of ${view.slots.map((s) => s.slot).join(", ")} (the ${g.host} slots for ${view.hostEnv})`);
  if (!target.free && target.heldIn !== env) fail(`slot ${slot} of ${view.hostEnv} already belongs to ${target.login} in .env.${target.heldIn} — one slot is one password; pick a free slot`);
  if (!["user", "admin"].includes(role)) fail("--role must be user (storefront) or admin (back office)");
  const lp = loginProblem(login);
  if (lp) fail(lp);
  const np = noteProblem(note);
  if (np) fail(np);

  const envFile = join(root, `.env.${env}`);
  const next = withUser(readFileSync(envFile, "utf8"), { key: slot, role, login, note, password: target.password, where: `${g.host} slot ${target.secret}`, replace: !!args.replace });
  if (next.refused) fail(next.refused);
  if (next.change !== "unchanged") writeFileSync(envFile, next.text);
  const store = storeCommand(state.wrapper, target.secret);
  console.log(JSON.stringify({
    env,
    hostEnv: view.hostEnv,
    user: { key: slot, role, loginVar: `${slot}_LOGIN`, login, password: target.password, envFile: `.env.${env}`, login_change: next.change },
    password: { mode: "host", host: g.host, secret: target.secret },
    steps: [
      store
        ? `${store}    # in your own terminal: hidden input — paste the password, never into the chat`
        : `store the password as the secret "${target.secret}" with ${g.host}'s own secret tool${state.wrapper ? ` (${state.wrapper})` : ""} — ${state.setupCommands[0] || "its setup"} shows how; in your own terminal, never in the chat`,
      "restart Claude Code — the browser servers read the passwords at start",
    ],
    agent: `log in with ${slot}_LOGIN from .env.${env} and type the password by its NAME: browser_type(text="${target.password}")`,
  }, null, 2));
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    fail(e.message);
  }
  const root = outputRoot();
  const { raw: profile, error, path } = readProjectProfile(root);
  // A guest profile written before 0.4.0 has no websiteAuth: let the host's own slots decide (hostMain
  // refuses with the manual-operator fix when it declares none).
  if (profile?.governance?.host && ["host-secrets", "", undefined].includes(profile.governance.websiteAuth)) return hostMain(root, profile, args);
  standDownIfHostGoverned(root, "add-user skipped: test users sign in by hand here (governance.websiteAuth is not host-secrets)", { json: true });
  if (!profile) fail(error ? `cannot parse ${path}: ${error}` : `no ${path} — this project is not onboarded; run /project-init first`);

  if (args.list) {
    const envs = listEnvs(root);
    const taken = envs.flatMap((e) => e.users.map((u) => u.key));
    console.log(JSON.stringify({ envs, nextKeys: { user: nextKeys("user", taken), admin: nextKeys("admin", taken) } }, null, 2));
    return;
  }

  const { env, key, role, login } = args;
  if (!ENV_NAME_RE.test(String(env || ""))) fail("--env <name> is required ([a-z0-9_]+)");
  const envFile = join(root, `.env.${env}`);
  if (!existsSync(envFile)) fail(`no .env.${env} — the environments here are: ${envsIn(readdirSync(root)).join(", ") || "(none)"}; add one with /project-init --add-env`);
  const kp = keyProblem(key);
  if (kp) fail(kp);
  if (!["user", "admin"].includes(role)) fail("--role must be user (storefront) or admin (back office)");
  const lp = loginProblem(login);
  if (lp) fail(lp);

  // 1. The login, in the env file (not a secret).
  const before = readFileSync(envFile, "utf8");
  const next = withUser(before, { key, role, login, replace: !!args.replace });
  if (next.refused) fail(next.refused);
  if (next.change !== "unchanged") writeFileSync(envFile, next.text);

  // 2. The password: declared in vc-secrets, or a placeholder in .env.local — by the env's mode.
  const name = `${key}_PASSWORD`;
  const vcSecrets = JSON.stringify(vcSecretsShim().path || "<VC_SECRETS>");
  const steps = [];
  let password;
  const envDecl = declaredPasswords(readDecl(root))[env];
  if (envDecl?.includes(ROLE_PASSWORD[role])) {
    let decl;
    try {
      decl = writeSecretsDecl({ root, pat: patAxesFromProfile(profile), shim: args.shim || defaultShimPath(), passwordChange: { addEnvs: [env], addNames: [name], roles: [] /* the env is declared: add this name, no built-in */ } });
    } catch (e) {
      fail(e.message);
    }
    const secret = passwordSecret(name, env);
    password = { mode: "vc-secrets", secret, declaration: decl.status };
    if (decl.trustNeeded) steps.push(`node ${vcSecrets} trust`);
    steps.push(`node ${vcSecrets} set ${secret}`);
  } else {
    const local = join(root, ".env.local");
    const suffixed = `${name}_${env.toUpperCase()}`;
    const has = existsSync(local) && new RegExp(`^\\s*${suffixed}\\s*=`, "m").test(readFileSync(local, "utf8"));
    if (!has) {
      ensureProjectIgnores(root);
      const text = existsSync(local) ? readFileSync(local, "utf8") : "";
      appendFileSync(local, `${text && !text.endsWith("\n") ? "\n" : ""}\n# ${key} — password of the ${ROLE_TEXT[role]} ${login} on ${env}\n${suffixed}=\n`);
    }
    password = { mode: ".env.local", key: suffixed, placeholder: has ? "kept" : "added" };
    steps.push(`fill ${suffixed}= in .env.local (in your editor, never in chat)`);
    // A lane run from vc-secrets reads .env.local itself; only a declaration-free project needs the file.
    if (!envDecl) steps.push(`TEST_ENV=${env} node "<vcInit>/skills/project-init/sync-browser-secrets.mjs"`);
  }
  steps.push("restart Claude Code — the browser lanes and the bridge read the passwords at start");

  console.log(JSON.stringify({
    env,
    user: { key, role, loginVar: `${key}_LOGIN`, login, password: name, envFile: `.env.${env}`, login_change: next.change },
    password,
    steps,
    agent: `log in with ${key}_LOGIN from .env.${env} and type the password by its NAME: browser_type(text="${name}")`,
  }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
