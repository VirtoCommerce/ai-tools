#!/usr/bin/env node
/**
 * .claude/skills/project-init/scaffold-secrets.mjs
 *
 * Writes a COMMENTED `.env.local` TEMPLATE (Bucket #3) after the /project-init
 * interview. Secrets are deliberately NOT asked during the interview — instead the
 * operator fills the placeholders this script emits, each preceded by a comment
 * that says WHAT it is, WHY it's needed, and WHERE to get it. verify-access.mjs
 * then confirms the filled values.
 *
 * Which secrets are emitted is topology-driven (flags below):
 *   - ADMIN_PASSWORD / USER_PASSWORD — always (app test-user creds; per-env → the
 *     `_<ENV>` suffix config.js promotes to the base name when TEST_ENV matches).
 *   - JIRA_API_TOKEN   — only if --tracker jira    AND --jira-auth token
 *   - GITHUB_FIX_BUGS_TOKEN — only if --client-vcs github AND --vcs-auth pat
 *   - ADO_PAT          — only if --tracker azure   OR  --client-vcs azure-repos
 *   - POSTMAN_API_KEY / CONTEXT7_API_KEY — only if named in --extras
 * Browser-login auth (gh-cli / az-login / Atlassian MCP OAuth) emits NO token line.
 *
 * IDEMPOTENT: appends only the placeholders not already present in `.env.local`
 * (a line matching `^KEY=`), so a re-run never clobbers values the operator has
 * already filled. Placeholders are written empty (`KEY=`) so config.js treats them
 * as unset until filled — that's what makes verify-access FAIL until the operator
 * completes them.
 *
 * Usage:
 *   node .claude/skills/project-init/scaffold-secrets.mjs \
 *     --env myqa --tracker jira --jira-auth token \
 *     --client-vcs github --vcs-auth pat --extras postman,context7 --print
 *
 * Flags: --out <path> (default .env.local), --print (list the keys emitted).
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

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

function fail(msg) { console.error(`[scaffold-secrets] ${msg}`); process.exit(1); }

// Secret catalog: what / why / where + whether it is a per-env credential.
const CATALOG = {
  ADMIN_PASSWORD: {
    perEnv: true, include: () => true,
    what: "Admin / back-office login password (an app TEST account — never a raw personal password).",
    why: "Required for every admin-side run.",
    where: "Your deployment's admin TEST account (ops/customer). Local start-local stack: Password1!",
  },
  USER_PASSWORD: {
    perEnv: true, include: () => true,
    what: "Storefront test-user login password (app TEST account).",
    why: "Required for storefront runs.",
    where: "Your deployment's storefront TEST account.",
  },
  JIRA_API_TOKEN: {
    perEnv: false, include: (o) => o.tracker === "jira" && o.jiraAuth === "token",
    what: "Jira API token (used together with JIRA_EMAIL for Basic auth).",
    why: "Lets /qa-fix comment on and transition Jira issues.",
    where: "id.atlassian.com → Manage account → Security → API tokens → Create API token.",
  },
  GITHUB_FIX_BUGS_TOKEN: {
    perEnv: false, include: (o) => o.clientVcs === "github" && o.vcsAuth === "pat",
    what: "GitHub fine-grained Personal Access Token.",
    why: "Lets /qa-fix open PRs and file issues on GitHub.",
    where: "github.com → Settings → Developer settings → Personal access tokens → Fine-grained. Perms: Contents + Pull requests = Read/Write (public_repo is enough to fork + file issues).",
  },
  ADO_PAT: {
    perEnv: false, include: (o) => o.tracker === "azure" || o.clientVcs === "azure-repos",
    what: "Azure DevOps Personal Access Token.",
    why: "Azure Boards work items and/or Azure Repos pull requests.",
    where: "dev.azure.com → User settings → Personal access tokens. Scopes: Work Items R/W, Code R/W.",
  },
  POSTMAN_API_KEY: {
    perEnv: false, include: (o) => o.extras.includes("postman"),
    what: "Postman API key.",
    why: "Enables the postman MCP server (/qa-postman, /qa-api test).",
    where: "postman.com → Settings → API keys.",
  },
  CONTEXT7_API_KEY: {
    perEnv: false, include: (o) => o.extras.includes("context7"),
    what: "Context7 API key.",
    why: "Enables the context7 MCP docs lookup (fallback for /vc-docs).",
    where: "context7.com dashboard → API key.",
  },
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = args.env;
  if (!env || typeof env !== "string") fail('missing --env <name> (needed for the per-env credential suffix).');
  if (!/^[a-z0-9_]+$/.test(env)) fail(`invalid --env "${env}". Must match [a-z0-9_]+ (underscores, no hyphens).`);

  const opts = {
    tracker: args.tracker || "jira",
    jiraAuth: args["jira-auth"] || "token",       // token | oauth
    clientVcs: args["client-vcs"] || "github",
    vcsAuth: args["vcs-auth"] || "pat",            // pat | gh-cli | az-login
    extras: String(args.extras || "").split(",").map((s) => s.trim()).filter(Boolean),
  };

  const SUFFIX = `_${env.toUpperCase()}`;
  const outPath = args.out ? resolve(args.out) : join(REPO_ROOT, ".env.local");
  const existing = existsSync(outPath) ? readFileSync(outPath, "utf-8") : "";

  const emitted = [];
  const skipped = [];
  const blocks = [];
  for (const [key, meta] of Object.entries(CATALOG)) {
    if (!meta.include(opts)) continue;
    const name = meta.perEnv ? `${key}${SUFFIX}` : key;
    const present = new RegExp(`^\\s*${name}=`, "m").test(existing);
    if (present) { skipped.push(name); continue; }
    blocks.push(
      `# ${key} — ${meta.what}\n` +
      `#   Why:   ${meta.why}\n` +
      `#   Where: ${meta.where}\n` +
      (meta.perEnv ? `#   (per-env: config.js promotes ${name} → ${key} when TEST_ENV=${env})\n` : ``) +
      `${name}=\n`
    );
    emitted.push(name);
  }

  if (blocks.length) {
    const header = existing
      ? `\n# === /project-init secret placeholders (${env}) — fill in the values below ===\n`
      : [
          `# ==============================================================================`,
          `# .env.local — secrets (Bucket #3, GITIGNORED — never commit).`,
          `# Templated by project-init/scaffold-secrets.mjs. FILL IN each value below,`,
          `# then run verify-access.mjs. Per-env creds carry the _<ENV> suffix config.js`,
          `# promotes to the base name when TEST_ENV matches.`,
          `# ==============================================================================`,
          ``, ``,
        ].join("\n");
    const body = header + blocks.join("\n");
    writeFileSync(outPath, existing + body);
  }

  console.log(`[scaffold-secrets] ${blocks.length ? "wrote" : "no new placeholders for"} ${outPath}`);
  if (emitted.length) console.log(`[scaffold-secrets] to fill: ${emitted.join(", ")}`);
  if (skipped.length) console.log(`[scaffold-secrets] already present (kept): ${skipped.join(", ")}`);
  if (args.print && emitted.length) console.log(`[scaffold-secrets] placeholders emitted: ${emitted.length}`);
}

main();
