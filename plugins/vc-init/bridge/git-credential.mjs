#!/usr/bin/env node
/**
 * bridge/git-credential.mjs — a git credential helper that answers only for a pinned host.
 *
 * The bridge's inner side configures git with `credential.helper=` (reset — no helper from the
 * user's or the repository's config is consulted) followed by this script, so a `git push` through
 * the bridge authenticates with the token vc-secrets resolved and with nothing else. The token never
 * appears in a URL, a remote, `.git/config` or argv.
 *
 * It answers `get` only when the request is https to a host the token belongs to:
 *   github.com                          → GITHUB_FIX_BUGS_TOKEN or GITHUB_TOKEN (username x-access-token)
 *   dev.azure.com, *.visualstudio.com   → ADO_PAT               (username pat; Azure DevOps ignores it)
 * Any other host — a remote somebody pointed elsewhere, a redirect — gets an empty answer, so git
 * fails to authenticate there instead of handing the token over. `store` and `erase` are no-ops: the
 * credential lives in vc-secrets, never in a git credential store.
 *
 * Invoked by git as: <helper> get|store|erase, with `key=value` lines on stdin.
 */
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hostAllowed } from "./allowlist.mjs";

const RULES = [
  { hosts: ["github.com"], env: ["GITHUB_FIX_BUGS_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"], username: "x-access-token" },
  { hosts: ["dev.azure.com", "*.visualstudio.com"], env: ["ADO_PAT"], username: "pat" },
];

/** Parse git's credential protocol input. */
export function parseCredentialInput(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq > 0) out[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return out;
}

/** The answer for a `get` request, or "" when this helper must not answer. Pure. */
export function answerFor(request, env = process.env) {
  if (request.protocol !== "https") return "";
  const host = String(request.host || "").replace(/:\d+$/, "");
  const rule = RULES.find((r) => hostAllowed(host, r.hosts));
  if (!rule) return "";
  const token = rule.env.map((k) => env[k]).find((v) => typeof v === "string" && v.length > 0);
  if (!token) return "";
  return `username=${rule.username}\npassword=${token}\n`;
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) {
  const action = process.argv[process.argv.length - 1];
  if (action === "get") {
    let input = "";
    try {
      input = readFileSync(0, "utf8");
    } catch {
      /* no stdin — nothing to answer */
    }
    const answer = answerFor(parseCredentialInput(input));
    if (answer) process.stdout.write(answer);
  }
  // store / erase: deliberately nothing.
}
