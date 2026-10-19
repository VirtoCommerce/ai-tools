#!/usr/bin/env node
/**
 * skills/project-init/scaffold-env.mjs
 *
 * Writes a COMMENTED `.env.<env>` TEMPLATE (Bucket #2 — committed, NON-secret) after
 * the /project-init interview asks only the environment NAME. There is no value
 * form: the operator fills the placeholders this script emits, each preceded by a
 * comment saying WHAT it is and an example / WHERE it comes from. verify-access.mjs
 * then confirms the filled values. Its sibling scaffold-secrets.mjs does the same
 * for the secret `.env.local`.
 *
 * Fields are topology-driven (flags below) and limited to what the plugin needs to
 * run (config.js core-required non-secrets + the tracker connection). ENV_RISK and
 * ADMIN are pre-filled with safe defaults; everything else is an empty placeholder.
 *
 * IDEMPOTENT: appends only the keys not already present (a line matching `^KEY=`),
 * so a re-run never clobbers values the operator has filled.
 *
 * Usage:
 *   node skills/project-init/scaffold-env.mjs --env myqa --tracker jira --print
 *   node skills/project-init/scaffold-env.mjs --env acme --tracker azure
 *
 * Flags: --env <name> (required), --tracker jira|azure, --project-type
 *        platform|client, --client-vcs github|azure-repos, --contribution-mode
 *        fork|direct, --out <path> (default .env.<env>), --print.
 *
 * For --project-type client with --client-vcs github it also emits CLIENT_REPO_ORG
 * (the GitHub org owning the client's custom repos) as a fillable placeholder, so that
 * free-text value lives in this ONE file — never a chat question. For --client-vcs
 * azure-repos it is NOT emitted: the client org is already ADO_ORG/ADO_PROJECT.
 *
 * The upstream FORK account is deliberately NOT a placeholder — it is the owner of the
 * GitHub fix token / gh session, which gen-profile derives (GET /user) at step 4, and
 * the fix pipeline auto-creates the fork under it (`gh repo fork`). No manual entry.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { resolveOutPath, outputRoot } from "./lib/paths.mjs";
// Protect BEFORE creating. gen-mcp's .gitignore block only ran at §7, so every file created
// earlier in the flow existed un-ignored until then (VCST-5774 review #4). Idempotent — the four
// writers all call it, and only the first one actually appends.
import { ensureProjectIgnores } from "./lib/gitignore.mjs";

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (n === undefined || n.startsWith("--")) a[k] = true;
    else { a[k] = n; i++; }
  }
  return a;
}
function fail(msg) { console.error(`[scaffold-env] ${msg}`); process.exit(1); }

// key → { def?, type?, warnOnPath?, what, where }.  include() gates topology-specific keys.
//
// `type` + the ABSENCE of `def` make this table the SINGLE SOURCE OF TRUTH for what
// normalize-env.mjs must check after the operator fills the file (VCST-5582 B):
//   type "url"       — needs an http(s) scheme; all trailing slashes are stripped (a stray `/`
//                      turns every runtime `${BACK_URL}/api/...` template into `//api/...`).
//   type "ado-slug"  — a bare Azure DevOps org/project name, never a URL.
//   no `def`         — the operator MUST fill it; still empty ⇒ a hard failure.
//   warnOnPath       — a path component on this URL is almost certainly a paste mistake.
export const CATALOG = [
  ["ENV_RISK",         { def: "test", include: () => true,
    what: "Risk class: dev | test | staging | production.",
    where: "production blocks admin-write suites by default; QA envs use test." }],
  ["FRONT_URL",        { include: () => true, type: "url", warnOnPath: true,
    what: "Storefront URL.", where: "e.g. https://storefront.example.com" }],
  ["BACK_URL",         { include: () => true, type: "url", warnOnPath: true,
    what: "Admin SPA / platform URL.", where: "e.g. https://platform.example.com" }],
  ["STORE_ID",         { include: () => true,
    what: "Primary store identifier.", where: "e.g. B2B-store (Platform → Stores)." }],
  ["ADMIN",            { def: "admin", include: () => true,
    what: "Admin login (identifier, NOT the password).", where: "usually 'admin'." }],
  ["USER_EMAIL",       { include: () => true,
    what: "Storefront test-user email.", where: "an existing storefront TEST account." }],
  ["JIRA_BASE_URL",    { include: (o) => o.tracker === "jira", type: "url",
    // No warnOnPath: a self-hosted Jira Server can legitimately live at https://host/jira.
    what: "Jira base URL.", where: "e.g. https://acme.atlassian.net" }],
  ["JIRA_PROJECT_KEY", { include: (o) => o.tracker === "jira",
    what: "Jira project key for bug filing.", where: "e.g. VCST." }],
  ["JIRA_EMAIL",       { include: (o) => o.tracker === "jira",
    what: "Jira login email (identifier, pairs with JIRA_API_TOKEN in .env.local).",
    where: "your Atlassian account email." }],
  // Emitted for Azure Boards (tracker) OR an Azure Repos code host — a Jira + azure-repos
  // client still needs ADO_ORG/ADO_PROJECT (discover-repos scan + the client checkout read
  // them, and it is the client org for routing). Mirrors ADO_PAT's gate in scaffold-secrets.
  ["ADO_ORG",          { include: (o) => o.tracker === "azure" || o.clientVcs === "azure-repos", type: "ado-slug",
    what: "Azure DevOps organization.", where: "dev.azure.com/<org> → just the <org> part." }],
  ["ADO_PROJECT",      { include: (o) => o.tracker === "azure" || o.clientVcs === "azure-repos", type: "ado-slug",
    what: "Azure DevOps project (Boards / Repos).", where: "the project holding your work items / repos." }],
  // Only for a GitHub-hosted client: the client org is a distinct GitHub namespace.
  // For azure-repos it is redundant with ADO_ORG/ADO_PROJECT, so it is NOT emitted.
  ["CLIENT_REPO_ORG",  { include: (o) => o.projectType === "client" && o.clientVcs === "github",
    what: "GitHub org that owns your CUSTOM/client repos (modules, theme, storefront fork).",
    where: "e.g. acme-corp — routes client bugs to your repos (gen-profile --client-org)." }],
];

function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = args.env;
  if (!env || typeof env !== "string") fail("missing --env <name>.");
  if (!/^[a-z0-9_]+$/.test(env)) fail(`invalid --env "${env}". Must match [a-z0-9_]+ (underscores, no hyphens).`);

  const opts = {
    tracker: args.tracker || "jira",
    projectType: args["project-type"] || "platform",
    contributionMode: args["contribution-mode"] || "fork",
    clientVcs: args["client-vcs"] || "github",
  };
  // Default output → the deployment project (process.cwd()); config.js dotenv-loads
  // `.env.${env}` relative to cwd, so this must land there. --out still overrides.
  const outPath = resolveOutPath(args.out, `.env.${env}`);
  const existing = existsSync(outPath) ? readFileSync(outPath, "utf-8") : "";

  const emitted = [];
  const skipped = [];
  const blocks = [];
  for (const [key, meta] of CATALOG) {
    if (!meta.include(opts)) continue;
    if (new RegExp(`^\\s*${key}=`, "m").test(existing)) { skipped.push(key); continue; }
    blocks.push(
      `# ${key} — ${meta.what}\n` +
      `#   ${meta.where}\n` +
      `${key}=${meta.def || ""}\n`
    );
    emitted.push(key);
  }

  if (blocks.length) {
    const header = existing
      ? `\n# === /project-init placeholders (${env}) — fill in the values below ===\n`
      : [
          `# ==============================================================================`,
          `# .env.${env} — per-env URLs / identifiers (Bucket #2, committed, NO secrets).`,
          `# Templated by project-init/scaffold-env.mjs. FILL IN each value below, then`,
          `# run verify-access.mjs. Secrets for this env live in .env.local.`,
          `# Activate: TEST_ENV=${env} npm run env:check`,
          `# ==============================================================================`,
          ``, ``,
        ].join("\n");
    const ignored = ensureProjectIgnores(outputRoot());
    if (ignored.length) console.log(`[scaffold-env] .gitignore += ${ignored.join(", ")}`);
    writeFileSync(outPath, existing + header + blocks.join("\n"));
  }

  console.log(`[scaffold-env] ${blocks.length ? "wrote" : "no new placeholders for"} ${outPath}`);
  if (emitted.length) console.log(`[scaffold-env] to fill: ${emitted.join(", ")}`);
  if (skipped.length) console.log(`[scaffold-env] already present (kept): ${skipped.join(", ")}`);
  if (args.print && emitted.length) console.log(`[scaffold-env] placeholders emitted: ${emitted.length}`);
}

// Run ONLY as a CLI. `normalize-env.mjs` imports CATALOG from here (it is the single source
// of truth for each key's type + requiredness), so importing this module must have no side
// effects — the repo's standard main-guard, same as discover-repos.mjs / ado.mjs.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
