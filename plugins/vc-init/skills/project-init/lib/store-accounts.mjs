/**
 * skills/project-init/lib/store-accounts.mjs — how /project-init writes test accounts into the test-account store
 * (test-accounts.local.json, scripts/lib/test-accounts.mjs): which store account a variable name belongs to, and the
 * few edits the writers make. The store module validates and writes; this file only decides where a name goes.
 *
 *   ADMIN                 → account ADMIN, login       (vars.login ["ADMIN"] — the built-in admin's login variable)
 *   USER_EMAIL            → account USER, login        (the default login variable of a named account)
 *   <KEY>_LOGIN           → account <KEY>, login       (vars.login ["<KEY>_LOGIN"] — an /project-init --add-user user)
 *   <STEM>_PASSWORD       → account <STEM>, password   (ADMIN_PASSWORD → ADMIN, USER_PASSWORD → USER, …)
 *
 * A person's own tracker / code-host account (JIRA_EMAIL, JIRA_PASSWORD, GITHUB_*, ADO_*) is never a test account and
 * never goes to the store; a token- or key-shaped name neither. Never logs a value.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import { envView, isPersonalServiceName, isStoreName } from "../../../scripts/lib/test-accounts.mjs";
import { isPasswordName } from "./passwords.mjs";

export { STORE_FILE, readStore, writeStore } from "../../../scripts/lib/test-accounts.mjs";

/** The built-in accounts and their login variable. */
export const BUILT_IN_LOGIN = Object.freeze({ ADMIN: "ADMIN", USER: "USER_EMAIL" });

/** The `vars` an account needs so the loader exposes its login under `loginVar` (null: the default `<KEY>_EMAIL`). */
export function loginVarsFor(key, loginVar) {
  return loginVar === `${key}_EMAIL` ? null : { login: [loginVar] };
}

/**
 * The store account a LOGIN variable belongs to, or null when it is not one: `{ key, loginVar }`. `<KEY>_LOGIN` counts
 * only when `isUser(KEY)` says KEY is a test user (an add-user marker or a store account). Pure.
 */
export function loginAccount(name, isUser = () => false) {
  if (name === "ADMIN") return { key: "ADMIN", loginVar: "ADMIN" };
  if (name === "USER_EMAIL") return { key: "USER", loginVar: "USER_EMAIL" };
  const m = /^([A-Z][A-Z0-9_]*)_LOGIN$/.exec(String(name));
  if (m && isStoreName(m[1]) && isUser(m[1])) return { key: m[1], loginVar: name };
  return null;
}

/** The store account a PASSWORD variable belongs to (`ADMIN_PASSWORD` → ADMIN), or null when the store may not hold it. Pure. */
export function passwordAccount(name) {
  if (!isPasswordName(name) || isPersonalServiceName(name) || !isStoreName(name)) return null;
  const key = String(name).replace(/_PASSWORD$/, "");
  return key && isStoreName(key) ? key : null;
}

/** The env's section of a store, created when absent. Mutates `store`. */
export function envSection(store, env) {
  const s = (store.envs[env] ??= { shared: {}, accounts: {} });
  s.shared ??= {};
  s.accounts ??= {};
  return s;
}

/**
 * Give account `key` on `env` the fields of `fields` it does not have yet in that env's VIEW (the top level counts:
 * an account every env shares is not shadowed by an empty per-env copy). `overwrite` names fields to set even when
 * present. A login variable is added to `vars.login` when the account would not expose it. Mutates `store`; returns
 * the names of the fields it set.
 */
export function fillAccount(store, env, key, { login, password, loginVar } = {}, { overwrite = [] } = {}) {
  const view = envView(store, env).accounts[key] ?? {};
  const section = envSection(store, env);
  const entry = (section.accounts[key] ??= {});
  const set = [];
  const want = (field, value) => {
    if (value === undefined) return;
    if (view[field] !== undefined && view[field] !== "" && !overwrite.includes(field)) return;
    if (view[field] === value) return;
    entry[field] = value;
    set.push(field);
  };
  want("login", login);
  want("password", password);
  if (loginVar) {
    const current = view.vars?.login ?? (loginVar === `${key}_EMAIL` ? [loginVar] : []);
    if (!current.includes(loginVar)) {
      entry.vars = { ...(view.vars ?? {}), login: [...(view.vars?.login ?? []), loginVar] };
      set.push("vars");
    }
  }
  if (!Object.keys(entry).length) delete section.accounts[key];
  return set;
}

/**
 * The value `name` has for `env` in the project's .env files, as the loader layers them (.env.defaults → .env.<env> →
 * .env.local, then the `_<ENV>` promotion) — read without touching process.env. "" when none. Reads files.
 */
export function fileValue(root, env, name) {
  const read = (f) => (existsSync(join(root, f)) ? parse(readFileSync(join(root, f), "utf8")) : {});
  const merged = { ...read(".env.defaults"), ...read(`.env.${env}`), ...read(".env.local") };
  return merged[`${name}_${env.toUpperCase()}`] || merged[name] || "";
}
