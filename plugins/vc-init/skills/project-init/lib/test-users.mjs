/**
 * skills/project-init/lib/test-users.mjs — the test users an environment declares (`.env.<env>`), read by
 * add-user.mjs (which writes them) and verify-access.mjs (which checks them). Pure readers, no CLI.
 *
 * A test user is a KEY: its login `<KEY>_LOGIN` in `.env.<env>` under a `# vc-init user <KEY> (<role>)`
 * comment that add-user.mjs writes, and a password the agent types by NAME. Every environment also has
 * the two built-ins scaffold-env writes (ADMIN / USER_EMAIL) — except on a host-governed project, where
 * users take the host's password slots instead.
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

/** The users an `.env.<env>` text declares: the built-ins plus every `# vc-init user` block. Pure. */
export function usersIn(text) {
  const values = parse(String(text || ""));
  const users = BUILT_IN.map((b) => ({ ...b, login: values[b.loginVar] || "" }));
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = MARK_RE.exec(line.trim());
    if (m) users.push({ key: m[1], role: m[2], loginVar: `${m[1]}_LOGIN`, password: `${m[1]}_PASSWORD`, login: values[`${m[1]}_LOGIN`] || "" });
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
