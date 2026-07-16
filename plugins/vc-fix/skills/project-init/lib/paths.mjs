/**
 * skills/project-init/lib/paths.mjs
 *
 * Two roots, kept deliberately separate — this is the whole point of the file:
 *
 *   outputRoot()  — where GENERATED PROJECT STATE goes (project-profile.json,
 *                   .env.<env>, .env.local, .mcp.json, .claude/settings.local.json,
 *                   the per-project playwright MCP configs). This MUST match where the
 *                   runtime READERS look: config.js dotenv-loads `.env.*` relative to
 *                   process.cwd(), and loadProjectProfile() reads project-profile.json
 *                   from process.cwd(). So the default is process.cwd() — the directory
 *                   Claude Code was launched in, i.e. the deployment project. VC_FIX_HOME
 *                   overrides it for callers that must launch a generator from somewhere
 *                   other than the project (CI, or the model cd'd into the plugin dir).
 *
 *   pluginRoot()  — where the PLUGIN'S OWN read-only assets live (templates/,
 *                   config/ source configs). When the plugin is installed from the
 *                   marketplace this is the versioned cache dir; when developing it is
 *                   the checked-out plugin folder. It is NEVER a write target.
 *                   CLAUDE_PLUGIN_ROOT when Claude Code sets it, else derived from THIS
 *                   file's own location via import.meta.url — which is correct regardless
 *                   of process.cwd(), the same technique skills/qa-fix-routing/skill-dir.ts
 *                   uses. That is why a generator can be launched by its absolute path
 *                   from a completely unrelated cwd and still find its templates.
 *
 * Hardcoding an absolute path (or the current user's name) is forbidden — it does not
 * survive a different user, OS, or a plugin upgrade (the cache dir is version-stamped).
 */
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

/**
 * Root for all generated project state. Symmetric with the readers (process.cwd()).
 * Override with VC_FIX_HOME when the generator is launched from outside the project.
 * @returns {string} absolute path
 */
export function outputRoot() {
  return process.env.VC_FIX_HOME
    ? resolve(process.env.VC_FIX_HOME)
    : process.cwd();
}

/**
 * Root of the plugin's own read-only assets (templates/, config/). Portable: honours
 * CLAUDE_PLUGIN_ROOT when set, else resolves from this file's location so it works from
 * any cwd. This file lives at <pluginRoot>/skills/project-init/lib/paths.mjs → climb 3.
 * @returns {string} absolute path
 */
export function pluginRoot() {
  if (process.env.CLAUDE_PLUGIN_ROOT) return resolve(process.env.CLAUDE_PLUGIN_ROOT);
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

/**
 * Stable, version-agnostic link that always resolves to the ACTIVE plugin root.
 * The SessionStart hook (hooks/vc-fix-latest-link.mjs) repoints `~/.claude/vc-fix-latest`
 * at the current versioned cache dir every session. gen-profile bakes THIS path into
 * paths.pluginRoot (for an installed plugin) so the profile self-heals across upgrades,
 * instead of the versioned dir that becomes stale/deleted on the next upgrade.
 * This string MUST match the `link` computed in hooks/vc-fix-latest-link.mjs.
 * @returns {string} absolute link path, or "" if the home directory is unresolvable
 */
export function stableLinkPath() {
  try {
    const home = homedir();
    return home ? join(home, ".claude", "vc-fix-latest") : "";
  } catch {
    return "";
  }
}

/**
 * Resolve a generator output path: an explicit --out (relative to outputRoot when not
 * absolute) wins; otherwise <outputRoot>/<defaultName>. Keeps every writer consistent.
 * @param {string|undefined} outFlag  the --out flag value (may be undefined/true)
 * @param {string} defaultName        default basename under outputRoot
 * @returns {string} absolute path
 */
export function resolveOutPath(outFlag, defaultName) {
  if (typeof outFlag === "string" && outFlag.length) {
    return resolve(outputRoot(), outFlag);
  }
  return resolve(outputRoot(), defaultName);
}
