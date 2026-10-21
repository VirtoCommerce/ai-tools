/**
 * skills/project-init/lib/github-mcp.mjs — the GitHub MCP server, in its two shapes (VCST-6402).
 *
 * PAT axis: `.mcp.json` holds only a launcher call — `node ${VC_SECRETS} run github` — and the server
 * itself is declared in `.claude/vc-secrets.local.json` (write-secrets-decl.mjs). vc-secrets resolves
 * `github-pat` at launch and hands it to the hosted GitHub MCP through mcp-remote, which puts it in the
 * Authorization header from the environment. No token in .mcp.json, no token in a settings `env`.
 *
 *   Verified on Windows (npx.cmd) 2026-10-19: mcp-remote 0.14.3 launched by `vc-secrets run` sends
 *   `Authorization: Bearer <value of GITHUB_PERSONAL_ACCESS_TOKEN>` — the `${VAR}` in the --header
 *   argument is substituted from the env vc-secrets injected. The stdio github-mcp-server binary (the
 *   planned fallback) is therefore not needed.
 *
 * Session axis (gh auth login): the hosted server with no header — Claude Code runs its own OAuth
 * sign-in on first use, like atlassian and figma.
 *
 * The mcp-remote version is PINNED: it is the argv the operator approved with `vc-secrets trust`, and a
 * moving `@latest` would both change what runs and invalidate that approval. vc-secrets refuses a
 * NODE_OPTIONS key in a declaration, so this server gets npm's prefer-offline hint only.
 */

export const GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/";
export const MCP_REMOTE_SPEC = "mcp-remote@0.14.3";

/** The vc-secrets `servers.github` declaration for a PAT github axis. */
export const GITHUB_MCP_DECL = Object.freeze({
  command: "npx",
  args: ["-y", MCP_REMOTE_SPEC, GITHUB_MCP_URL, "--header", "Authorization:Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}"],
  env: {
    GITHUB_PERSONAL_ACCESS_TOKEN: "secret:github-pat",
    npm_config_prefer_offline: "literal:true",
  },
});

/** `.mcp.json` entry for a PAT github axis: a call to the vc-secrets shim, nothing else. */
export const githubMcpEntryPat = () => ({ type: "stdio", command: "node", args: ["${VC_SECRETS}", "run", "github"] });

/** `.mcp.json` entry for a session github axis: the hosted server, OAuth on first use. */
export const githubMcpEntryOAuth = () => ({ type: "http", url: GITHUB_MCP_URL });
