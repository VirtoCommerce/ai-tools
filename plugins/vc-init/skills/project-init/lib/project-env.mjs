/**
 * skills/project-init/lib/project-env.mjs — the PROJECT-level env keys live in `.env.local`, not in `.env.<env>`.
 *
 * The tracker and code-host connection (JIRA_BASE_URL / JIRA_PROJECT_KEY / JIRA_EMAIL, ADO_ORG / ADO_PROJECT,
 * CLIENT_REPO_ORG) is one value for the whole project, whatever stand a run targets. Kept in `.env.<env>` it was
 * re-emitted into every new env file, so the operator re-typed it per env (or left it empty and relied on the
 * profile), and JIRA_EMAIL — a personal identifier — sat in a file meant for shared URLs. `.env.local` is loaded
 * after `.env.<env>` by every loader (load-layered-env.mjs, vc-fix config.js), so readers of `process.env` do not
 * change. `scaffold-env.mjs` `CATALOG` marks these keys `scope: "project"`; this module is the one place that
 * knows where they go and moves them out of a project onboarded before the split.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const LOCAL_FILE = ".env.local";

/** Section header above the project settings appended to an EXISTING `.env.local`. */
export const LOCAL_SECTION = "# === /project-init project settings — the same for every environment ===";

/** Header of a NEW `.env.local`, whichever scaffolder creates it first (scaffold-env or scaffold-secrets). */
export const LOCAL_HEADER = [
  `# ==============================================================================`,
  `# .env.local — this machine's project settings (GITIGNORED — never commit).`,
  `# Templated by /project-init. Holds what is the SAME for every environment (the`,
  `# tracker / code-host connection) and the test-user passwords; per-env creds carry`,
  `# the _<ENV> suffix config.js promotes to the base name when TEST_ENV matches.`,
  `# Per-env URLs live in .env.<env>. API tokens do NOT go here: they are stored in`,
  `# vc-secrets (node "$VC_SECRETS" set <name>) and reach a process only via $VC_RUN.`,
  `# ==============================================================================`,
  ``, ``,
].join("\n");

/** Header of a NEW `.env.local` on a host-governed project: no password and no token of ours lives here. */
export const LOCAL_HEADER_HOST = [
  `# ==============================================================================`,
  `# .env.local — this machine's project settings (GITIGNORED — never commit).`,
  `# Templated by /project-init on a host-governed project. Holds what is the SAME for`,
  `# every environment (the tracker / code-host connection). No password and no token`,
  `# goes here: test-user passwords are stored with the host plugin's own secret tool,`,
  `# and its MCP servers hold every credential. Per-env URLs live in .env.<env>.`,
  `# ==============================================================================`,
  ``, ``,
].join("\n");

/** Header of a NEW `.env.<env>`. A host-governed project keeps it local and puts test-user logins in it. */
export function envHeader(env, { hostGoverned = false } = {}) {
  return [
    `# ==============================================================================`,
    hostGoverned
      ? `# .env.${env} — per-env URLs and test-user logins (GITIGNORED — never commit, NO secrets).`
      : `# .env.${env} — per-env URLs / identifiers (Bucket #2, committed, NO secrets).`,
    `# Templated by project-init/scaffold-env.mjs. FILL IN each value below, then`,
    `# run verify-access.mjs. What is the same for every env (the tracker /`,
    hostGoverned
      ? `# code-host connection) lives in .env.local; passwords live in the host's secret tool.`
      : `# code-host connection) and the test-user passwords live in .env.local.`,
    `# Activate: TEST_ENV=${env} npm run env:check`,
    `# ==============================================================================`,
    ``, ``,
  ].join("\n");
}

/** Names that look like `.env.<x>` but are not an environment. */
// `test` is not here: it is a valid TEST_ENV name ([a-z0-9_]+), and its file must migrate like any other.
const NOT_AN_ENV = new Set(["local", "defaults", "example", "template", "backup"]);

/** The `.env.<env>` files in `root` (names only). */
export function envFileNames(root) {
  let names = [];
  try { names = readdirSync(root); } catch { return []; }
  return names.filter((n) => {
    const m = /^\.env\.([a-z0-9_]+)$/.exec(n);
    return m && !NOT_AN_ENV.has(m[1]);
  }).sort();
}

const lineRe = (key) => new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=(.*)$`);

function unquote(raw) {
  let v = String(raw ?? "").trim();
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) v = v.slice(1, -1).trim();
  return v;
}

/**
 * The value a dotenv TEXT gives `key`: `null` when no line declares it, else the (unquoted) value.
 * With duplicates it is the LAST line, the one dotenv keeps.
 */
export function readKey(text, key) {
  const re = lineRe(key);
  let value = null;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = re.exec(line);
    if (m) value = unquote(m[1]);
  }
  return value;
}

/**
 * The `_<ENV>` suffixes a dotenv TEXT declares `key` under (`JIRA_PROJECT_KEY_QA=…` → "QA"). A project that
 * points two stands at two trackers keeps the key per env this way; config.js / load-layered-env promote the
 * suffixed value to the base name when TEST_ENV matches.
 */
export function keySuffixes(text, key, envSuffixes) {
  const re = new RegExp(`^\\s*(?:export\\s+)?${key}_([A-Z0-9_]+)\\s*=`);
  // Only a REAL env name makes a suffix: `ADO_ORG_URL` is the operator's own variable, not ADO_ORG for env "URL".
  return String(text ?? "").split(/\r?\n/).map((l) => re.exec(l)?.[1]).filter((s) => s && envSuffixes.includes(s));
}

/** The env names of the project in `root` as `_<ENV>` suffixes (uppercased), plus any `extra` env being added. */
export function envSuffixesIn(root, ...extra) {
  const names = [...envFileNames(root).map((n) => n.slice(".env.".length)), ...extra];
  return [...new Set(names.filter((e) => typeof e === "string" && e).map((e) => e.toUpperCase()))];
}

/**
 * A value as dotenv reads it back: quoted when it holds whitespace, `#` or a quote (an unquoted `#` starts a
 * comment). `null` when it holds BOTH quote characters — dotenv cannot read that back, so it is refused.
 */
export function serializeValue(v) {
  const s = String(v ?? "");
  if (s.includes('"') && s.includes("'")) return null;
  if (s === "" || !(/[\s#"'=]/.test(s) || s !== s.trim())) return s;
  // dotenv does not unescape \" — pick the quote the value does not contain.
  return s.includes('"') ? `'${s}'` : `"${s}"`;
}

/**
 * Remove `key` from a dotenv TEXT, together with the comment block scaffold-env wrote above it
 * (`# KEY — …` and its indented `#   …` lines). Any other comment stays.
 */
export function removeKey(text, key) {
  const eol = String(text).includes("\r\n") ? "\r\n" : "\n";
  const lines = String(text).split(/\r?\n/);
  const re = lineRe(key);
  const out = [];
  for (let n = 0; n < lines.length; n++) {
    if (!re.test(lines[n])) { out.push(lines[n]); continue; }
    // Walk back over this key's own scaffolded comment, never past another key's.
    let i = out.length;
    while (i > 0 && /^#\s{3}/.test(out[i - 1])) i--;
    if (i > 0 && out[i - 1].startsWith(`# ${key} — `)) out.length = i - 1;
    // The blank line that separated the removed block from the next one goes with it.
    if ((out.length === 0 || out[out.length - 1] === "") && lines[n + 1] === "") n++;
  }
  return out.join(eol);
}

/** Set `key=value` in a dotenv TEXT: in place when a line declares it, else appended with `comment` above. */
export function setKey(text, key, value, comment = "") {
  const eol = String(text).includes("\r\n") ? "\r\n" : "\n";
  const lines = String(text).split(/\r?\n/);
  const re = lineRe(key);
  const idx = lines.findLastIndex((l) => re.test(l));
  const raw = value;
  value = serializeValue(value);
  if (value === null) throw new Error(`${key}: a value with both " and ' cannot be written to a dotenv file (${String(raw).length} chars)`);
  if (idx >= 0) {
    lines[idx] = `${key}=${value}`;
    return lines.join(eol);
  }
  const base = String(text);
  const sep = base === "" || base.endsWith("\n") ? "" : eol;
  // A commented block gets a blank line above it, like the ones scaffold-env writes — except right under a header.
  const prev = (base + sep).trimEnd();
  const gap = comment && prev !== "" && !(base + sep).endsWith(`${eol}${eol}`) && !prev.endsWith("===") ? eol : "";
  return base + sep + gap + (comment ? comment.replace(/\n/g, eol) : "") + `${key}=${value}${eol}`;
}

/** The comment scaffold-env writes above a key, from its CATALOG meta. */
export const keyComment = (key, meta) => `# ${key} — ${meta.what}\n#   ${meta.where}\n`;

/**
 * Move every project-level key out of the `.env.<env>` files in `root` into `.env.local`.
 *
 *   - every env file that names the key agrees on one non-empty value (or names it empty) and `.env.local`
 *     has no value yet → that value goes to `.env.local`, and the key leaves every env file;
 *   - every env file names it EMPTY and `.env.local` has no line for it → the empty placeholder moves, so the
 *     "still empty" check of normalize-env keeps firing on it;
 *   - `.env.local` already holds the same value → the key just leaves the env files (`.env.local` already won
 *     at runtime, so nothing a run reads changes);
 *   - the env files disagree, or one of them disagrees with `.env.local` → a CONFLICT: nothing is touched and
 *     the caller reports it (a project that really points two stands at two trackers keeps `KEY_<ENV>` in
 *     `.env.local`, which config.js / load-layered-env promote per env).
 *
 * @param {string} root  the project directory
 * @param {Array<[string, object]>} catalog  scaffold-env CATALOG entries with `scope: "project"`
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {{ moved: Array<{key:string, from:string[]}>, cleaned: Array<{key:string, from:string[]}>, conflicts: Array<{key:string, values:Record<string,string>}> }}
 */
export function moveProjectKeys(root, catalog, { dryRun = false } = {}) {
  const files = envFileNames(root);
  const localPath = join(root, LOCAL_FILE);
  let local = existsSync(localPath) ? readFileSync(localPath, "utf8") : "";
  const texts = Object.fromEntries(files.map((f) => [f, readFileSync(join(root, f), "utf8")]));
  const result = { moved: [], cleaned: [], conflicts: [] };
  let localChanged = false;
  const changedFiles = new Set();

  for (const [key, meta] of catalog) {
    const holders = files.filter((f) => readKey(texts[f], key) !== null);
    if (!holders.length) continue;
    const values = Object.fromEntries(holders.map((f) => [f, readKey(texts[f], key)]));
    const distinct = [...new Set(Object.values(values).filter((v) => v !== ""))];
    const localValue = readKey(local, key);
    if (distinct.length > 1 || (distinct.length === 1 && localValue && localValue !== distinct[0])) {
      result.conflicts.push({ key, values: { ...values, ...(localValue ? { [LOCAL_FILE]: localValue } : {}) } });
      continue;
    }
    if (distinct.length === 1 && serializeValue(distinct[0]) === null) {
      result.conflicts.push({ key, values, reason: "the value holds both \" and ' — dotenv cannot read that back from a quoted line; fix it in place" });
      continue;
    }
    // An unfilled placeholder moves too, so normalize-env still stops on it in its new home.
    if ((distinct.length === 1 && !localValue) || (distinct.length === 0 && localValue === null)) {
      if (local === "") local = LOCAL_HEADER;
      else if (!local.includes(LOCAL_SECTION)) {
        const nl = local.includes("\r\n") ? "\r\n" : "\n";
        local += `${local.endsWith("\n") ? "" : nl}${nl}${LOCAL_SECTION}${nl}`;
      }
      local = setKey(local, key, distinct[0] ?? "", keyComment(key, meta));
      localChanged = true;
      result.moved.push({ key, from: holders });
    } else {
      result.cleaned.push({ key, from: holders });
    }
    for (const f of holders) { texts[f] = removeKey(texts[f], key); changedFiles.add(f); }
  }

  if (!dryRun) {
    // .env.local first: a crash between the two writes then leaves the value in BOTH files, never in neither.
    if (localChanged) writeFileSync(localPath, local);
    for (const f of changedFiles) writeFileSync(join(root, f), texts[f]);
  }
  return result;
}

/** One line per move / conflict, for a scaffolder's or normalizer's own log prefix. */
export function describeMove({ moved, cleaned, conflicts }) {
  const lines = [];
  if (moved.length) lines.push(`moved to ${LOCAL_FILE} (same for every env): ${moved.map((m) => `${m.key} ← ${m.from.join(", ")}`).join("; ")}`);
  if (cleaned.length) lines.push(`removed from the env files (${LOCAL_FILE} already holds it): ${cleaned.map((m) => `${m.key} ← ${m.from.join(", ")}`).join("; ")}`);
  for (const c of conflicts) {
    if (c.reason) { lines.push(`NOT moved ${c.key} — ${c.reason}`); continue; }
    lines.push(`NOT moved ${c.key} — the files disagree (${Object.entries(c.values).map(([f, v]) => `${f}: ${v || "(empty)"}`).join(", ")}); keep one value in ${LOCAL_FILE}, or ${c.key}_<ENV> there per env, and delete the rest`);
  }
  return lines;
}
