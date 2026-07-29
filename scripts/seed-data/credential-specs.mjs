/**
 * credential-specs.mjs — side-effect-free source of truth for WHERE a test account's credential
 * is declared, and which cross-registry declarations are illegal.
 *
 * Why this exists (050m sales-rep audit, 2026-07-29): one account can be declared by MORE THAN ONE
 * fixture registry — a committed test-data CSV (`{{VAR}}` password cell, consumed via
 * `@td(ALIAS.password)`) AND the `.env`-driven role registry (`scripts/lib/user-roles.mjs`
 * `passwordVar`). When the two name DIFFERENT password vars, whichever seeder created the account
 * first wins forever, every consumer of the other declaration gets `invalid_grant`, and the whole
 * dependent suite reports BLOCKED. Live proof on vcst: `test-sarah.chen-20260310@test-agent.com`
 * was declared as `{{B2B_USER_PASSWORD}}` by b2b/users.csv USR-002 (→ `@td(ACME_BUYER.password)`,
 * 15 cases in 050m) and as `LOCKOUT_TEST_PASSWORD` by the LOCKOUT_TEST role — the live account held
 * the LOCKOUT_TEST value, so all 15 cases were BLOCKED.
 *
 * A conflict is STATICALLY detectable from committed files, so it must never need a suite run (or a
 * live probe) to surface. Importing this module has no side effects (no env read, no fs, no
 * network), so the validator AND its unit tests both import it.
 *
 * Companion live check: `td:reconcile` [10] Auth drift (each role authenticates with its declared
 * password) — that catches the SYMPTOM after damage; this catches the CAUSE before commit.
 */

/**
 * Every committed CSV that declares an account credential, with the column pair(s) to read.
 * A row may declare more than one account (agent-user-pool declares a personal + a b2b login).
 */
export const CSV_CREDENTIAL_SOURCES = [
  { file: 'test-data/b2b/users.csv', idCol: 'user_id', pairs: [{ email: 'email', password: 'password' }] },
  { file: 'test-data/b2b/organization-memberships.csv', idCol: 'membership_id', pairs: [{ email: 'user_email', password: 'password' }] },
  { file: 'test-data/white-labeling/users.csv', idCol: 'user_id', pairs: [{ email: 'email', password: 'password' }] },
  { file: 'test-data/users/test-users.csv', idCol: 'user_id', pairs: [{ email: 'email', password: 'password' }] },
  {
    file: 'test-data/users/agent-user-pool.csv',
    idCol: 'slot',
    pairs: [
      { email: 'personal_email', password: 'personal_password' },
      { email: 'b2b_email', password: 'b2b_password' },
    ],
  },
];

/**
 * Roles whose whole PURPOSE is to damage their own account (deliberately failed logins → platform
 * lockout, password-reset flows, …). Such a fixture MUST own a dedicated account: sharing it with a
 * happy-path fixture makes every consumer of that account intermittently BLOCKED for the lockout
 * window, and lets the abuse suite's password win. Suite 044's own precondition already states the
 * rule — "Dedicated lockout-test user exists (LOCKOUT_TEST_EMAIL) isolated from agent pool slot
 * accounts" — this list is what makes it enforceable.
 */
export const DESTRUCTIVE_ROLE_KEYS = ['LOCKOUT_TEST'];

/**
 * Canonical form of a declared password, for comparison. Two declarations agree iff their refs are
 * equal. `unset` means the source declares no credential at all (blank cell) — never a conflict.
 */
export function normalizePasswordRef(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return 'unset';
  const m = s.match(/^\{\{\s*([A-Z0-9_]+)\s*\}\}$/);
  if (m) return `var:${m[1]}`;
  return 'literal'; // a bare literal in a committed CSV is separately rejected by td:reconcile [4]
}

const lc = (e) => String(e || '').trim().toLowerCase();

/**
 * Flatten CSV rows + role-registry entries into one declaration list.
 * `csvFiles`: [{ file, rows }] where rows are already-parsed objects (the validator does the I/O).
 * `roleEntries`: [{ key, email, passwordVar }] resolved from user-roles.mjs + the env layer.
 */
export function collectDeclarations({ csvFiles = [], roleEntries = [] } = {}) {
  const out = [];
  for (const { file, rows } of csvFiles) {
    const src = CSV_CREDENTIAL_SOURCES.find((s) => s.file === file);
    if (!src) continue;
    for (const row of rows || []) {
      for (const pair of src.pairs) {
        const email = lc(row[pair.email]);
        if (!email.includes('@')) continue;
        out.push({
          email,
          origin: `${file}${src.idCol && row[src.idCol] ? ` [${row[src.idCol]}]` : ''}:${pair.password}`,
          kind: 'csv',
          ref: normalizePasswordRef(row[pair.password]),
        });
      }
    }
  }
  for (const r of roleEntries) {
    const email = lc(r.email);
    if (!email.includes('@')) continue;
    out.push({
      email,
      origin: `user-roles.mjs [${r.key}]:${r.passwordVar}`,
      kind: 'role',
      roleKey: r.key,
      ref: r.passwordVar ? `var:${r.passwordVar}` : 'unset',
    });
  }
  return out;
}

/**
 * Accounts declared with TWO OR MORE different password refs. Returns one finding per email with
 * every conflicting declaration, so the message can name both sides.
 */
export function findPasswordConflicts(declarations) {
  const byEmail = new Map();
  for (const d of declarations) {
    if (d.ref === 'unset') continue;
    if (!byEmail.has(d.email)) byEmail.set(d.email, []);
    byEmail.get(d.email).push(d);
  }
  const findings = [];
  for (const [email, decls] of byEmail) {
    const refs = [...new Set(decls.map((d) => d.ref))];
    if (refs.length > 1) findings.push({ email, refs, declarations: decls });
  }
  return findings.sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * A destructive role (see DESTRUCTIVE_ROLE_KEYS) sharing its account with any OTHER declaration —
 * i.e. the account is not dedicated. Reported even when the password refs happen to agree, because
 * the lockout side-effect alone blocks the other consumers.
 */
export function findDestructiveOverlaps(declarations, destructiveKeys = DESTRUCTIVE_ROLE_KEYS) {
  const keys = new Set(destructiveKeys);
  const destructive = declarations.filter((d) => d.kind === 'role' && keys.has(d.roleKey));
  const findings = [];
  for (const d of destructive) {
    const others = declarations.filter((o) => o !== d && o.email === d.email);
    if (others.length) findings.push({ email: d.email, roleKey: d.roleKey, sharedWith: others });
  }
  return findings.sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * `{{VAR}}` cells whose var is not present in `knownVars` — the value silently degrades to the
 * seeder's PW_FALLBACK ('Password1!'), which is how a credential drifts in the first place.
 * Advisory (a var may legitimately be unset on the machine running the guard), so the validator
 * reports these as warnings.
 */
export function findUndeclaredVars(declarations, knownVars = []) {
  const known = new Set(knownVars);
  const seen = new Set();
  const out = [];
  for (const d of declarations) {
    if (!d.ref.startsWith('var:')) continue;
    const name = d.ref.slice(4);
    if (known.has(name)) continue;
    const k = `${name}|${d.origin}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ varName: name, origin: d.origin, email: d.email });
  }
  return out;
}
