import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const VC_SECRETS = join(HERE, "..", "..", "vc-secrets");
const MODULE = pathToFileURL(join(HERE, "vc-secrets-path.mjs")).href;

// vc-secrets' installer picks the data directory of the client whose plugin tree it sits in. /project-init sets up
// a Claude Code session and reads the shim back from Claude Code's directory, so it has to say where it wants it:
// otherwise a vc-secrets found in Codex's cache puts the shim in Codex's, and a successful install reads as failed.
test("installVcSecretsShim: a vc-secrets found in Codex's cache still installs the shim where /project-init reads it", (t) => {
  const home = mkdtempSync(join(tmpdir(), "vcinit-shim-home-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const install = join(home, ".codex", "plugins", "cache", "ai-tools", "vc-secrets", "0.2.0");
  for (const rel of [".claude-plugin/plugin.json", "scripts/install-shim.mjs", "scripts/shim-path.mjs", "vc-secrets-shim.mjs", "vc-secrets.mjs"]) {
    mkdirSync(dirname(join(install, rel)), { recursive: true });
    copyFileSync(join(VC_SECRETS, rel), join(install, rel));
  }
  // A vc-init with no vc-secrets beside it, outside any cache, and no registry: Codex's cache is the only install.
  const root = join(home, "checkout", "vc-init");
  mkdirSync(root, { recursive: true });

  const opts = JSON.stringify({ root, home, cwd: home });
  const script = `import { installVcSecretsShim } from ${JSON.stringify(MODULE)};\n`
    + `process.stdout.write(JSON.stringify(installVcSecretsShim(${opts})));\n`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env: { ...process.env, HOME: home } });
  assert.equal(r.status, 0, r.stderr);

  const result = JSON.parse(r.stdout);
  const shim = join(home, ".claude", "plugins", "data", "vc-secrets-ai-tools", "vc-secrets-shim.mjs");
  assert.deepEqual({ ok: result.ok, path: result.path }, { ok: true, path: shim }, r.stdout);
  assert.ok(existsSync(shim), "the shim is where the result says");
  assert.equal(existsSync(join(home, ".codex", "plugins", "data")), false, "nothing lands in Codex's data directory");
});
