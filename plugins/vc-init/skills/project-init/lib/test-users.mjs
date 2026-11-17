/**
 * skills/project-init/lib/test-users.mjs — the test users an environment declares (`.env.<env>`), read by
 * add-user.mjs (which writes them) and verify-access.mjs (which checks them). Pure readers, no CLI.
 *
 * A test user is a KEY: its login `<KEY>_LOGIN` and its password `<KEY>_PASSWORD`, which the agent types by
 * NAME. add-user.mjs records both in the test-account store (test-accounts.local.json, `envs.<env>.accounts.<KEY>`);
 * a project onboarded before the store has the login in `.env.<env>` under a `# vc-init user <KEY> (<role>)`
 * comment, which is still read. Every environment also has the two built-ins (ADMIN / USER — scaffold-secrets.mjs)
 * — except on a host-governed project, where users take the host's password slots and stay in `.env.<env>`.
 */
import { parse } from "dotenv";

/** `.env.<x>` files that are not an environment. */
export const NOT_ENVS = new Set(["local", "defaults", "example", "template", "backup"]);

/** The users every environment already has (scaffold-env / scaffold-secrets). */
export const BUILT_IN = [
  { key: "ADMIN", role: "admin", loginVar: "ADMIN", password: "ADMIN_PASSWORD" },
  { key: "USER", role: "user", loginVar: "USER_EMAIL", password: "USER_PASSWORD" },
];

export const MARK_RE = /^#\s*vc-init user ([A-Z][A-Z0-9_]*) \((user|admin)\)/;

/** The environment names of a directory listing (`.env.<env>` files). Pure. */
export function envsIn(names) {
  return names
    .map((n) => /^\.env\.([a-z0-9_]+)$/.exec(n)?.[1])
    .filter((e) => e && !NOT_ENVS.has(e))
    .sort();
}

/**
 * The users an environment declares: the built-ins plus every user add-user wrote — into the test-account store
 * (`accounts`, the env's view: an account whose `vars.login` names `<KEY>_LOGIN`) or, before the store, as a
 * `# vc-init user` block in the `.env.<env>` text. A store login wins over the file's. A store user's role is
 * its `role` (add-user records it); one written before that is an admin when its KEY starts with ADMIN. Pure.
 */
export function usersIn(text, accounts = {}) {
  const values = parse(String(text || ""));
  const users = BUILT_IN.map((b) => ({ ...b, login: accounts[b.key]?.login || values[b.loginVar] || "" }));
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = MARK_RE.exec(line.trim());
    if (m) users.push({ key: m[1], role: m[2], loginVar: `${m[1]}_LOGIN`, password: `${m[1]}_PASSWORD`, login: accounts[m[1]]?.login || values[`${m[1]}_LOGIN`] || "" });
  }
  for (const [key, a] of Object.entries(accounts || {})) {
    if (users.some((u) => u.key === key) || !(a?.vars?.login ?? []).includes(`${key}_LOGIN`)) continue;
    users.push({ key, role: a.role ?? (/^ADMIN/.test(key) ? "admin" : "user"), loginVar: `${key}_LOGIN`, password: `${key}_PASSWORD`, login: a.login || "" });
  }
  return users;
}

/**
 * Only the users add-user.mjs added (the `# vc-init user` blocks) — never the built-in ADMIN / USER, so
 * a host slot that happens to be named ADMIN or USER is matched to its own block, not to a built-in. Pure.
 */
export function markedUsersIn(text) {
  return usersIn(text).slice(BUILT_IN.length);
}

/** The host website environment an `.env.<env>` is: the profile's map, else a same-named host env. Pure. */
export function hostEnvFor(env, governance, hostEnvs) {
  const mapped = governance?.envs?.[env];
  if (mapped) return hostEnvs.includes(mapped) ? mapped : null;
  return hostEnvs.includes(env) ? env : null;
}
