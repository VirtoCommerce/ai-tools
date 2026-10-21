/**
 * skills/project-init/lib/token-guide.mjs — what each onboarding TOKEN is, and where to get it.
 *
 * Until VCST-6402 these were placeholders scaffold-secrets.mjs wrote into `.env.local`, for the
 * operator to paste a PAT into. Now a token goes into vc-secrets — `node "$VC_SECRETS" set <name>`,
 * at a hidden prompt in a terminal — and never into a file. The texts survive unchanged: the pause
 * step of /project-init (and `/project-init --check`'s migration) prints them next to the command
 * that stores each token, so the operator still reads WHAT it is, WHY it is needed and WHERE to
 * create it, in the same three short lines as before.
 *
 * Keyed by the env var the runtime reads (the contract every script and prompt uses); `secret` is
 * the vc-secrets name write-secrets-decl.mjs declares and the bridge binds to that var.
 */

import { passwordSecret } from "./passwords.mjs";

/**
 * The test-user passwords (option B, lib/passwords.mjs keeps them in vc-secrets; option A in
 * .env.local, where scaffold-secrets.mjs writes the same texts as comments). A name not listed here
 * (MULTI_ORG_USER_PASSWORD, …) is the operator's own and gets a generic line.
 */
export const PASSWORD_GUIDE = {
  ADMIN_PASSWORD: {
    what: "Admin / back-office login password (an app TEST account — never a raw personal password).",
    why: "Required for every admin-side run.",
    where: "Your deployment's admin TEST account (ops/customer). Local start-local stack: Password1!",
  },
  USER_PASSWORD: {
    what: "Storefront test-user login password (app TEST account).",
    why: "Required for storefront runs.",
    where: "Your deployment's storefront TEST account.",
  },
};

/**
 * The password step of the pause (option B): per env and name, what it is and the exact command that
 * stores it. Plain lines the skill relays verbatim; the value is typed at vc-secrets' hidden prompt.
 * @param {{ passwords: Record<string,string[]>, vcSecrets: string }} opts  env → names (write-secrets-decl's report)
 * @returns {string[]}
 */
export function passwordSteps({ passwords, vcSecrets }) {
  const shim = JSON.stringify(vcSecrets || "<the shim path /project-init §0d printed>");
  const lines = [];
  for (const env of Object.keys(passwords || {}).sort()) {
    lines.push(`Test-user passwords for ${env} — typed at a hidden prompt, never into chat or a file:`);
    for (const name of passwords[env]) {
      const g = PASSWORD_GUIDE[name];
      lines.push(`  ${name} — ${g ? g.what : "a test-user login password this project uses"}`);
      lines.push(`    Store: node ${shim} set ${passwordSecret(name, env)}`);
    }
    lines.push("");
  }
  return lines;
}

export const TOKEN_GUIDE = {
  JIRA_API_TOKEN: {
    axis: "jira", secret: "jira-token",
    what: "Jira API token (used together with JIRA_EMAIL for Basic auth).",
    why: "Lets the plugins read, file, comment on and transition Jira issues.",
    where: "id.atlassian.com → Manage account → Security → API tokens → Create API token.",
  },
  GITHUB_FIX_BUGS_TOKEN: {
    axis: "github", secret: "github-pat",
    // ONE classic `repo` token is the prescribed answer (VCST-5582 A). The token has two jobs —
    // the client's own repos and the VirtoCommerce upstream — and a classic `repo` scope covers
    // both, so the operator has exactly one thing to create.
    //
    // A fine-grained PAT is scoped to a single resource owner and is READ-ONLY on public repos it
    // does not own — GitHub's own docs: "Only personal access tokens (classic) have write access
    // for public repositories that are not owned by you or an organization that you are not a
    // member of" — so it can never fork VirtoCommerce/*, open a fork-PR, or file an upstream Issue
    // (the platform delivery path of /qa-fix §1a and of /vc-self-check deliver).
    //
    // The `where:` line stays as short as every other token's. verify-access's "GitHub token kind /
    // upstream capability" row WARNs with the full remedy (probe-lib GITHUB_UPSTREAM_REMEDY) if the
    // token supplied cannot do the job. Exception path (org policy forbids classic PATs):
    // `gh auth login` for the upstream + a fine-grained token for the client's own org — vc-fix
    // .claude/rules/quality-gates.md §1a.
    what: "GitHub Personal Access Token — classic, NOT fine-grained.",
    why: "Lets the plugins read your repos, open PRs on them and contribute fixes/issues to the VirtoCommerce upstream.",
    // The last hop matters: even on the "Tokens (classic)" page the "Generate new token" button
    // opens a menu whose FIRST item is fine-grained, so the classic item is named verbatim.
    where: "github.com → Settings → Developer settings → Personal access tokens → Tokens (classic) → \"Generate new token\" ▾ → \"Generate new token (classic)\". Scope: repo.",
  },
  ADO_PAT: {
    axis: "ado", secret: "ado-pat",
    what: "Azure DevOps Personal Access Token.",
    why: "Azure Boards work items and/or Azure Repos pull requests.",
    where: "dev.azure.com → User settings → Personal access tokens. Scopes: Work Items R/W, Code R/W.",
  },
};

/**
 * The token step of the pause, as plain lines the skill relays verbatim: per PAT axis, what it is,
 * where to create it, and the exact command that stores it. Commands are written with the literal
 * shim path (the operator's terminal has no $VC_SECRETS unless they exported it themselves).
 * @param {{ secrets: string[], vcSecrets: string }} opts  secret names (write-secrets-decl's report)
 * @returns {string[]}
 */
export function tokenSteps({ secrets, vcSecrets }) {
  const shim = JSON.stringify(vcSecrets || "<the shim path /project-init §0d printed>");
  const lines = [];
  for (const [envVar, g] of Object.entries(TOKEN_GUIDE)) {
    if (!secrets.includes(g.secret)) continue;
    lines.push(`${g.secret} (${envVar}) — ${g.what}`);
    lines.push(`  Why:   ${g.why}`);
    lines.push(`  Where: ${g.where}`);
    lines.push(`  Store: node ${shim} set ${g.secret}`);
    lines.push("");
  }
  return lines;
}
