// .claude/skills/ticket-context/lib/env.mjs — the layered .env loader. TEST_ENV is resolved here, against `root` (copied
// from scripts/lib/resolve-test-env.js — keep in step by hand). The files are applied by the repo's
// scripts/lib/env-layers.mjs, the one order every loader applies, when this install has it: imported at run time, so
// the skill stays self-contained (M1). Without it the minimal order applies, and LAYERS_GAP says what is missing:
//   TEST_ENV: process env > this session's binding (.vc-fix/session-env/<CLAUDE_CODE_SESSION_ID>,
//             `npm run env:use`) > .env.test-env > "vcst"
//   .env.defaults → .env.<TEST_ENV> (override) → .env.local (override) → _<ENV> suffix promotion
//   (env-layers only:) → the env's QA_ENV_PATH files → on a PASSWORDS=master stand, the master password
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config, parse } from "dotenv";

let layers = null;
try {
  layers = await import("../../../../scripts/lib/env-layers.mjs");
} catch (e) {
  if (e?.code !== "ERR_MODULE_NOT_FOUND") throw e; // a broken loader fails loudly; only a missing one falls back
}

/** Null when the repo's loader applies the env; else the GAP detail the bundle carries. */
export const LAYERS_GAP = layers ? null
  : "scripts/lib/env-layers.mjs is not in this install: the env was read from the project root's .env.defaults, .env.<env> and .env.local only — no QA_ENV_PATH folder, no master stand";

export function resolveTestEnv(root, env = process.env) {
  const fromEnv = env.TEST_ENV?.trim();
  if (fromEnv) return fromEnv;
  const read = (f) => (existsSync(f) ? parse(readFileSync(f)).TEST_ENV?.trim() : "");
  const sid = env.CLAUDE_CODE_SESSION_ID;
  const fromSession = sid && /^[A-Za-z0-9-]+$/.test(sid) ? read(join(root, ".vc-fix", "session-env", sid)) : "";
  return fromSession || read(join(root, ".env.test-env")) || "vcst";
}

/** `ticket`: the ticket being analysed. It fills QA_ENV_PATH's `<ticket>`, so this process and the `deploy:pr` /
 *  `preflight --ticket` children it starts (which keep what they inherit) see that ticket's stands. */
export function loadLayeredEnv(root, ticket) {
  const testEnv = resolveTestEnv(root);
  process.env.TEST_ENV = testEnv;
  if (layers) {
    layers.applyLayered(testEnv, { root, ticket });
    return testEnv;
  }
  config({ path: join(root, ".env.defaults"), quiet: true });
  config({ path: join(root, `.env.${testEnv}`), override: true, quiet: true });
  config({ path: join(root, ".env.local"), override: true, quiet: true });
  const suffix = `_${testEnv.toUpperCase()}`;
  for (const [k, v] of Object.entries(process.env)) if (k.endsWith(suffix) && v) process.env[k.slice(0, -suffix.length)] = v;
  return testEnv;
}
