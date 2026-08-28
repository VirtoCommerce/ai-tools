// Shared scaffolding for the kb-*.test.mjs suites (VCST-5818).
//
// The fixture mini-corpus under fixtures/kb/ is READ-ONLY as far as the tests are
// concerned: every suite that writes copies a root into a temp directory first, so a run
// can never leave a generated index or a promoted entry behind in the repo. That is also
// why fixtures/kb/ carries no committed knowledge-index.json — a stale committed index
// would make the drift gate look green while checking nothing.
import { mkdtempSync, rmSync, cpSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(HERE, "../..");
export const KB_FIXTURES = join(HERE, "fixtures", "kb");
export const KB_SUITES = join(KB_FIXTURES, "suites");
/** The canonical (plugin) copy — the mirror is proven byte-identical elsewhere. */
export const KB_DIR = join(REPO_ROOT, "plugins", "vc-fix", "skills", "kb");
export const HOOKS_DIR = join(REPO_ROOT, "plugins", "vc-fix", "hooks");

/** Import a kb module by filename, CWD-independently. */
export const kbModule = (file) => import(pathToFileURL(join(KB_DIR, file)).href);
export const hookModule = (file) => import(pathToFileURL(join(HOOKS_DIR, file)).href);

/** Run `fn(dir)` in a fresh temp directory, always removed afterward (even on throw). */
export async function withTempDir(fn, prefix = "kb-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Copy a fixture root ("platform" | "client") into `dest`, optionally rewriting
 * brain.json (the fixture platform root is readOnly, which most write tests must relax).
 */
export function copyRoot(name, dest, brainOverrides) {
  cpSync(join(KB_FIXTURES, name), dest, { recursive: true });
  if (brainOverrides) {
    const brain = Object.assign(
      { name: "test-" + name, scope: name === "client" ? "client" : "platform", readOnly: false },
      brainOverrides,
    );
    writeFileSync(join(dest, "brain.json"), JSON.stringify(brain, null, 2) + "\n", "utf8");
  }
  return dest;
}

/** A minimal knowledge root with nothing in it but a brain.json. */
export function emptyRoot(dest, brain) {
  writeFileSync(
    join(dest, "brain.json"),
    JSON.stringify(Object.assign({ name: "empty", scope: "client", readOnly: false }, brain), null, 2) + "\n",
    "utf8",
  );
  return dest;
}

/**
 * Turn `dir` into a real git repo with one seed commit. The consolidation exam gate
 * reverts an actual commit, so its test needs actual git — not a stub.
 */
export function initGitRepo(dir) {
  const run = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  run("init", "-q", "-b", "main");
  run("config", "user.email", "kb-test@vc-fix.local");
  run("config", "user.name", "kb test");
  // Byte-for-byte round-tripping is the point of the index drift gate; a line-ending
  // rewrite on checkout would make it flap on Windows.
  run("config", "core.autocrlf", "false");
  run("add", "-A", ".");
  run("commit", "-qm", "seed");
  return {
    git: run,
    head: () => run("rev-parse", "HEAD").trim(),
    log: () => run("log", "--oneline").trim().split("\n"),
  };
}

/** A capture-shaped observation with every required field filled in. */
export function observation(overrides) {
  return Object.assign(
    {
      kind: "quirk",
      scope: "client",
      subject: "checkout-payment",
      claim: "The place order button stays disabled until a billing address is confirmed",
      evidence: { method: "live", at: "2026-08-27", ref: "acme/run-9/CHK-014" },
      triangulation: ["live", "source"],
    },
    overrides,
  );
}
