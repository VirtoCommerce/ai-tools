#!/usr/bin/env node
/**
 * .claude/skills/project-init/write-env.mjs
 *
 * Non-interactive writer for the two customer-owned env buckets, so /project-init
 * can persist interview answers WITHOUT the readline wizard (bootstrap/install.ts)
 * and WITHOUT the model hand-editing files:
 *
 *   Bucket #2  .env.<env>   (committed, NON-secret) — per-env URLs / identifiers /
 *              risk: FRONT_URL, BACK_URL, STORE_ID, ENV_RISK, STOREFRONT_PROFILE,
 *              MODULES_ENABLED, JIRA_PROJECT_KEY, ADMIN/USER emails, JIRA_EMAIL, …
 *   Bucket #3  .env.local   (gitignored, SECRET) — passwords + tokens + API keys.
 *              Per-env credentials are written with the `_<ENV>` suffix that
 *              config.js promotes to the base name when TEST_ENV=<env>; global
 *              tokens (GitHub/Jira/ADO/Postman/Context7/Figma) are written un-suffixed.
 *
 * SECRET TRANSPORT: values arrive as a JSON object on STDIN — never as argv — so
 * secrets don't land in the process list or shell history. The script prints only
 * key NAMES and their destination file; it never echoes a value.
 *
 * WRITES ARE IDEMPOTENT: each key is updated IN PLACE (regex on `^KEY=`), preserving
 * comments, ordering, and any keys the interview didn't touch. Re-running with new
 * values overwrites just those keys — no duplicate append-blocks.
 *
 * STDIN JSON contract:
 *   {
 *     "env": "acme_qa",          // required; must match [a-z0-9_]+ (hyphens break suffix promotion)
 *     "suffixCreds": true,        // optional (default true): write per-env creds as KEY_<ENV>
 *     "envVars":  { "FRONT_URL": "https://…", "STORE_ID": "B2B-store", "ENV_RISK": "test", … },
 *     "secrets":  { "ADMIN_PASSWORD": "…", "USER_PASSWORD": "…", "GITHUB_FIX_BUGS_TOKEN": "…" }
 *   }
 *
 * envVars  → .env.<env>   (never suffixed; these are non-secret identifiers)
 * secrets  → .env.local   (per-env creds suffixed when suffixCreds; global tokens never)
 *
 * Usage:
 *   echo '<json>' | node .claude/skills/project-init/write-env.mjs [--dry-run] [--print]
 *   node .claude/skills/project-init/write-env.mjs < answers.json
 *
 * Flags:
 *   --dry-run   parse + report what WOULD change, write nothing
 *   --print     after writing, list the keys written per file (names only, no values)
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// Secret keys that are GLOBAL (one value across all envs) → never get the _<ENV>
// suffix. Everything else in `secrets` is treated as a per-env credential.
const GLOBAL_SECRET_KEYS = new Set([
  "GITHUB_FIX_BUGS_TOKEN",
  "GIT_TOKEN",
  "GITHUB_TOKEN",
  "GITHUB_PERSONAL_ACCESS_TOKEN",
  "JIRA_API_TOKEN",
  "ADO_PAT",
  "POSTMAN_API_KEY",
  "CONTEXT7_API_KEY",
  "FIGMA_API_KEY",
  "BROWSERSTACK_USERNAME",
  "BROWSERSTACK_ACCESS_KEY",
  "APPINSIGHTS_API_KEY_BACKEND",
  "APPINSIGHTS_API_KEY_STOREFRONT",
]);

const FLAGS = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const DRY_RUN = FLAGS.has("--dry-run");
const PRINT = FLAGS.has("--print");

function fail(msg) {
  console.error(`[write-env] ${msg}`);
  process.exit(1);
}

// dotenv-safe serialization: quote when the value has whitespace/#/quotes/= or
// leading-trailing space; escape backslash + double-quote inside double quotes.
function serializeValue(v) {
  const s = String(v);
  if (s === "") return "";
  const needsQuote = /[\s#"'=]/.test(s) || s !== s.trim();
  if (!needsQuote) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Update KEY=value lines in place; append any keys not already present.
// Returns { text, written: [keys], updated: [keys], appended: [keys] }.
function upsert(existingText, kv) {
  let lines = existingText.length ? existingText.split(/\r?\n/) : [];
  const updated = [];
  const appended = [];
  for (const [key, rawVal] of Object.entries(kv)) {
    const line = `${key}=${serializeValue(rawVal)}`;
    const re = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=`);
    const idx = lines.findIndex((l) => re.test(l));
    if (idx >= 0) {
      lines[idx] = line;
      updated.push(key);
    } else {
      lines.push(line);
      appended.push(key);
    }
  }
  let text = lines.join("\n");
  if (text.length && !text.endsWith("\n")) text += "\n";
  return { text, updated, appended, written: [...updated, ...appended] };
}

function readStdinJson() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8"); // fd 0 = stdin
  } catch {
    fail("could not read STDIN. Pipe the JSON answer object in: `echo '<json>' | write-env.mjs`.");
  }
  raw = raw.trim();
  if (!raw) fail("empty STDIN. Expected a JSON object with { env, envVars, secrets }.");
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`STDIN is not valid JSON: ${err.message}`);
  }
}

function main() {
  const payload = readStdinJson();

  const envName = payload.env;
  if (!envName || typeof envName !== "string") fail('missing "env" (the TEST_ENV name).');
  if (!/^[a-z0-9_]+$/.test(envName)) {
    fail(`invalid env "${envName}". Must match [a-z0-9_]+ (use underscores, not hyphens — the _<ENV> suffix promotion in config.js depends on it).`);
  }
  const SUFFIX = `_${envName.toUpperCase()}`;
  const suffixCreds = payload.suffixCreds !== false; // default true

  const envVars = payload.envVars || {};
  const secrets = payload.secrets || {};
  if (!Object.keys(envVars).length && !Object.keys(secrets).length) {
    fail("nothing to write: both envVars and secrets are empty.");
  }

  // Split secrets: global tokens keep their name; per-env creds get the suffix.
  const secretKv = {};
  const suffixedNote = [];
  for (const [key, val] of Object.entries(secrets)) {
    if (val === undefined || val === null || val === "") continue;
    if (GLOBAL_SECRET_KEYS.has(key) || !suffixCreds) {
      secretKv[key] = val;
    } else if (key.endsWith(SUFFIX)) {
      secretKv[key] = val; // already suffixed by caller
    } else {
      secretKv[`${key}${SUFFIX}`] = val;
      suffixedNote.push(`${key} → ${key}${SUFFIX}`);
    }
  }

  const envPath = join(REPO_ROOT, `.env.${envName}`);
  const localPath = join(REPO_ROOT, ".env.local");

  // --- Bucket #2: .env.<env> (non-secret) ---
  let envReport = null;
  if (Object.keys(envVars).length) {
    const existing = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
    const header = existing
      ? ""
      : [
          `# ==============================================================================`,
          `# .env.${envName} — per-env URLs / identifiers (Bucket #2, committed, no secrets)`,
          `# Written by project-init/write-env.mjs. Activate: TEST_ENV=${envName} npm run env:check`,
          `# Secrets for this env live in .env.local (suffixed _${envName.toUpperCase()}).`,
          `# ==============================================================================`,
          "",
          "",
        ].join("\n");
    const res = upsert(header + existing, envVars);
    envReport = { path: envPath, ...res, created: !existing };
    if (!DRY_RUN) writeFileSync(envPath, res.text);
  }

  // --- Bucket #3: .env.local (secret, gitignored) ---
  let localReport = null;
  if (Object.keys(secretKv).length) {
    const existing = existsSync(localPath) ? readFileSync(localPath, "utf-8") : "";
    const header = existing
      ? ""
      : [
          `# ==============================================================================`,
          `# .env.local — secrets (Bucket #3, GITIGNORED — never commit).`,
          `# Written by project-init/write-env.mjs. Per-env creds carry the _<ENV> suffix`,
          `# that config.js promotes to the base name when TEST_ENV matches.`,
          `# ==============================================================================`,
          "",
          "",
        ].join("\n");
    const res = upsert(header + existing, secretKv);
    localReport = { path: localPath, ...res, created: !existing };
    if (!DRY_RUN) writeFileSync(localPath, res.text);
  }

  // --- Report (names only, never values) ---
  const tag = DRY_RUN ? "[write-env] DRY-RUN — would write" : "[write-env] wrote";
  if (envReport) {
    console.log(`${tag} ${envReport.path}${envReport.created ? " (created)" : ""}: ${envReport.written.join(", ")}`);
  }
  if (localReport) {
    console.log(`${tag} ${localReport.path}${localReport.created ? " (created)" : ""}: ${localReport.written.join(", ")} [values hidden]`);
  }
  if (suffixedNote.length) {
    console.log(`[write-env] per-env cred suffix applied (TEST_ENV=${envName}): ${suffixedNote.join(", ")}`);
  }
  if (PRINT) {
    if (envReport) console.log(`[write-env] .env.${envName} keys: ${Object.keys(envVars).join(", ")}`);
    if (localReport) console.log(`[write-env] .env.local keys: ${Object.keys(secretKv).join(", ")}`);
  }
  console.log(`[write-env] done${DRY_RUN ? " (dry-run, no files changed)" : ""}.`);
}

main();
