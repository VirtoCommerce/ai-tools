#!/usr/bin/env node
/**
 * skills/project-init/derive-context.mjs
 *
 * The /project-init "DERIVE BLOCK" (step 6). After the operator has filled .env.<env>
 * + .env.local and the repo scan (discover-repos.mjs) has produced projectType +
 * clientOrg, this script derives — WITHOUT asking any more questions — the remaining
 * profile fields from the token + the live sessions:
 *
 *   - auth mode actually present per axis (github: pat|gh-cli|none, ado: pat|az-login|
 *     none, jira: token|none) — what the operator really filled / logged into.
 *   - contributionMode + operator — from the token's PERMISSION on the platform upstream
 *     (VirtoCommerce/vc-platform): push/maintain/admin ⇒ direct / virto-engineer;
 *     otherwise ⇒ fork / client (you PR from your own fork).
 *   - forkAccount — the GitHub token owner's login (PR head = <forkAccount>:<branch>).
 *
 * Prints ONE JSON object on stdout so the skill can read it and feed gen-profile.mjs
 * (--operator / --contribution-mode / --upstream-account / --vcs-auth). Human-readable
 * notes go to stderr. Never throws; never prints secret values.
 *
 * Usage:
 *   TEST_ENV=<env> node skills/project-init/derive-context.mjs \
 *     --tracker jira|azure --client-vcs github|azure-repos [--upstream-org VirtoCommerce]
 */
import { config as dotenv } from "dotenv";
import { resolveTestEnv } from "../../../scripts/lib/resolve-test-env.js";
import { probeGithubUpstream, resolveGithubToken, tryCmd } from "./probe-lib.mjs";

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tracker = args.tracker || "jira";
  const clientVcs = args["client-vcs"] || "github";
  const upstreamOrg = args["upstream-org"] || "VirtoCommerce";

  // Load env the same way config.js / verify-access do, incl. per-env suffix promotion
  // (ADMIN_PASSWORD_<ENV> → ADMIN_PASSWORD, ADO_PAT_<ENV> → ADO_PAT, …) so filled creds
  // are seen regardless of which file they landed in.
  const TEST_ENV = resolveTestEnv("vcst");
  // quiet: keep stdout pure JSON (dotenv v17 prints promo tips to stdout otherwise).
  dotenv({ path: ".env.defaults", quiet: true });
  dotenv({ path: `.env.${TEST_ENV}`, override: true, quiet: true });
  dotenv({ path: ".env.local", override: true, quiet: true });
  const SUF = `_${TEST_ENV.toUpperCase()}`;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.endsWith(SUF) && v) process.env[k.slice(0, -SUF.length)] = v;
  }

  // --- auth actually present, per axis ---
  const gh = resolveGithubToken();
  const githubAuth = process.env.GITHUB_FIX_BUGS_TOKEN ? "pat" : gh.token ? "gh-cli" : "none";
  const adoApplicable = tracker === "azure" || clientVcs === "azure-repos";
  const adoAuth = !adoApplicable ? "n/a" : process.env.ADO_PAT ? "pat" : tryCmd("az account show") ? "az-login" : "none";
  const jiraAuth =
    tracker !== "jira" ? "n/a"
      : process.env.JIRA_API_TOKEN && process.env.JIRA_EMAIL && (process.env.JIRA_BASE_URL || "") ? "token"
      : "none";

  // --- contribution mode + fork owner from the upstream permission probe ---
  const probe = await probeGithubUpstream({ upstreamOrg, token: gh.token });
  const contributionMode = probe.ok ? probe.contributionMode : "fork"; // safe default: fork
  const operator = contributionMode === "direct" ? "virto-engineer" : "client";
  const forkAccount = probe.login;

  const out = {
    auth: { github: githubAuth, ado: adoAuth, jira: jiraAuth },
    github: {
      login: probe.login,
      upstreamPerm: probe.ok ? probe.perm : "unknown",
      contributionMode,
      forkAccount,
      via: gh.via,
    },
    operator,
    upstreamOrg,
  };

  // Human notes → stderr (stdout stays pure JSON for the skill to parse).
  console.error(
    `[derive-context] auth: github=${githubAuth} ado=${adoAuth} jira=${jiraAuth}`,
  );
  console.error(
    probe.ok
      ? `[derive-context] upstream ${probe.repo}: perm=${probe.perm} → contributionMode=${contributionMode}, operator=${operator}, forkAccount='${forkAccount || "?"}' (${gh.via})`
      : `[derive-context] upstream perm not probed (no GitHub token / offline) — defaulting contributionMode=fork; verify-access will confirm.`,
  );

  console.log(JSON.stringify(out, null, 2));
}

main();
