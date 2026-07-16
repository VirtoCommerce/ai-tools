#!/usr/bin/env node
/**
 * hooks/vc-fix-latest-link.mjs  —  SessionStart hook (plugin-declared).
 *
 * Maintains a STABLE, version-agnostic OS link `~/.claude/vc-fix-latest` that always
 * points at the CURRENTLY-ACTIVE plugin root. This is what makes `paths.pluginRoot`
 * in project-profile.json survive a plugin upgrade.
 *
 * Why it is needed:
 *   The marketplace installs the plugin into a VERSION-STAMPED cache dir
 *   (…/vc-tools/vc-fix/<version>). On upgrade a NEW sibling dir appears and old
 *   versions are NOT pruned. /project-init used to bake that absolute versioned path
 *   into the profile, so every command's `node "$pluginRoot/skills/…"` invocation
 *   pointed at a version that, after any upgrade, is either gone (path error) or
 *   stale (silently runs the OLD scripts). gen-profile now bakes THIS link instead.
 *
 * Why a hook can do this when gen-profile cannot:
 *   `$CLAUDE_PLUGIN_ROOT` is NOT exported into an ordinary node process (see
 *   skills/project-init/SKILL.md §6), but the harness DOES substitute it into
 *   plugin-declared hook commands and always loads the ACTIVE (newest installed)
 *   version's hooks. So this hook always knows the current root — no semver scan —
 *   and just repoints the link at its own root each session.
 *
 * Contract (never break a session):
 *   - Idempotent: if the link already resolves to the current root, no-op.
 *   - Safe: if the link path exists and is a REAL directory (not a symlink), refuse
 *     to touch it.
 *   - Non-blocking: every path exits 0; all diagnostics go to stderr only.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

// Current plugin root: the harness-substituted $CLAUDE_PLUGIN_ROOT when present, else
// this file's own location climbed one level (<root>/hooks/vc-fix-latest-link.mjs).
const root =
  process.env.CLAUDE_PLUGIN_ROOT ||
  path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Canonical stable link path — MUST match skills/project-init/lib/paths.mjs
// stableLinkPath() (what gen-profile bakes into paths.pluginRoot).
const link = path.join(os.homedir(), ".claude", "vc-fix-latest");

// junction on Windows (no admin rights needed); dir symlink on POSIX.
const linkType = process.platform === "win32" ? "junction" : "dir";

const same = (a, b) => {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return false;
  }
};

try {
  let st;
  try {
    st = fs.lstatSync(link);
  } catch {
    st = null; // missing — will create below
  }

  if (st) {
    if (!st.isSymbolicLink()) {
      console.error(`[vc-fix-latest] ${link} is a real directory — refusing to replace it.`);
      process.exit(0);
    }
    if (same(link, root)) process.exit(0); // already correct → no-op
    // stale link → remove it (unlink first; rmdir fallback for a dangling junction)
    try {
      fs.unlinkSync(link);
    } catch {
      try {
        fs.rmdirSync(link);
      } catch {
        /* leave it; the create below will surface the reason */
      }
    }
  }

  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(root, link, linkType);
  console.error(`[vc-fix-latest] linked → ${path.basename(root)} (${link})`);
} catch (e) {
  console.error(`[vc-fix-latest] link maintenance skipped: ${e.message}`);
}

process.exit(0);
