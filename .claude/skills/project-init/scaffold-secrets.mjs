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
 *   - GITHUB_FIX_BUGS_TOKEN — only if the GitHub auth is a PAT (--github-auth pat).
 *     GitHub auth is its OWN axis (client GitHub repos AND/OR the platform upstream
 *     fork-PR), independent of where the client's code is hosted — so an azure-repos
 *     client contributing upstream via a GitHub PAT still gets this line.
 *   - ADO_PAT          — only if (--tracker azure OR --client-vcs azure-repos) AND the
 *     ADO auth is a PAT (--ado-auth pat). --ado-auth az-login relies on the `az` session
 *     and emits NO ADO_PAT line.
 *   - POSTMAN_API_KEY / CONTEXT7_API_KEY — ALWAYS emitted, but as OPTIONAL placeholders
 *     (blank = the postman / context7 MCP server stays disabled; not needed for /qa-fix).
 *     Each carries a "for which tool" description. (--extras is retained but no longer gates them.)
 * Browser-login/session auth (gh-cli / az-login / Atlassian MCP OAuth) emits NO token line.
 *
 * Auth axes (each maps from its own interview question):
 *   --ado-auth    pat | az-login   (Azure Boards + Azure Repos)
 *   --github-auth pat | gh-cli     (client GitHub repos and/or the platform upstream)
 *   --jira-auth   token | oauth    (Jira)
 * Legacy: --vcs-auth pat|gh-cli|az-login is still honoured as a fallback for the two new
 * flags (pat⇒both pat; gh-cli⇒github gh-cli; az-login⇒ado az-login) when they are absent.
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
    perEnv: false, include: (o) => o.githubAuth === "pat",
    what: "GitHub fine-grained Personal Access Token.",
    why: "Lets /qa-fix open PRs and file issues on GitHub (client GitHub repos and/or the platform upstream fork-PR).",
    where: "github.com → Settings → Developer settings → Personal access tokens → Fine-grained. Perms: Contents + Pull requests = Read/Write (public_repo is enough to fork + file issues).",
  },
  ADO_PAT: {
    perEnv: false, include: (o) => (o.tracker === "azure" || o.clientVcs === "azure-repos") && o.adoAuth !== "az-login",
    what: "Azure DevOps Personal Access Token.",
    why: "Azure Boards work items and/or Azure Repos pull requests.",
    where: "dev.azure.com → User settings → Personal access tokens. Scopes: Work Items R/W, Code R/W.",
  },
  POSTMAN_API_KEY: {
    perEnv: false, optional: true, include: () => true,
    what: "Postman API key (OPTIONAL).",
    why: "Enables the `postman` MCP server — powers /qa-postman (build/configure/verify API collections) and /qa-api test (REST + GraphQL xAPI test execution).",
    where: "postman.com → Settings → API keys → Generate API Key.",
  },
  CONTEXT7_API_KEY: {
    perEnv: false, optional: true, include: () => true,
    what: "Context7 API key (OPTIONAL).",
    why: "Enables the `context7` MCP server — up-to-date library / framework / SDK docs lookup; the fallback docs source for /vc-docs (VirtoOZ MCP is primary).",
    where: "context7.com dashboard → API key.",
  },
  APPINSIGHTS_API_KEY_BACKEND: {
    perEnv: true, optional: true, include: () => true,
    what: "App Insights READ-telemetry API key for the PLATFORM/backend (OPTIONAL).",
    why: "Fallback auth for /qa-monitoring when NO Azure identity (az login / service principal) is available — an `az login` session covers this without any key.",
    where: "App Insights resource → Configure → API Access → Create API key (Read telemetry).",
  },
  APPINSIGHTS_API_KEY_STOREFRONT: {
    perEnv: true, optional: true, include: () => true,
    what: "App Insights READ-telemetry API key for the STOREFRONT (OPTIONAL).",
    why: "Fallback auth for /qa-monitoring when no Azure identity is available (see backend key above).",
    where: "the storefront App Insights resource → API Access → Create API key (Read telemetry).",
  },
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = args.env;
  if (!env || typeof env !== "string") fail('missing --env <name> (needed for the per-env credential suffix).');
  if (!/^[a-z0-9_]+$/.test(env)) fail(`invalid --env "${env}". Must match [a-z0-9_]+ (underscores, no hyphens).`);

  const vcsAuth = args["vcs-auth"] || "pat";        // legacy single flag (fallback)
  const opts = {
    tracker: args.tracker || "jira",
    jiraAuth: args["jira-auth"] || "token",         // token | oauth
    clientVcs: args["client-vcs"] || "github",
    vcsAuth,
    // Independent auth axes; each maps from its own interview question. Fall back to the
    // legacy --vcs-auth so existing callers keep working (pat⇒both pat; gh-cli⇒github
    // session; az-login⇒ado session).
    adoAuth: args["ado-auth"] || (vcsAuth === "az-login" ? "az-login" : "pat"),   // pat | az-login
    githubAuth: args["github-auth"] || (vcsAuth === "gh-cli" ? "gh-cli" : "pat"), // pat | gh-cli
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
      (meta.optional ? `#   Optional: leave blank to skip — the MCP server above just stays disabled; not needed for /qa-fix.\n` : ``) +
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
