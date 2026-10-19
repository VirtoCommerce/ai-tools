// .claude/skills/ticket-context/lib/env.mjs — the layered .env loader. TEST_ENV is resolved here, against `root` (copied
// from scripts/lib/resolve-test-env.js — keep in step by hand); the files are applied by scripts/lib/env-layers.mjs, the
// one order every loader applies:
//   TEST_ENV: process env > this session's binding (.vc-fix/session-env/<CLAUDE_CODE_SESSION_ID>,
//             `npm run env:use`) > .env.test-env > "vcst"
//   .env.defaults → .env.<TEST_ENV> (override) → .env.local (override) → _<ENV> suffix promotion
//   → the env's QA_ENV_PATH files → on a PASSWORDS=master stand, the master password
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import { applyLayered } from "../../../../scripts/lib/env-layers.mjs";

export function resolveTestEnv(root, env = process.env) {
  const fromEnv = env.TEST_ENV?.trim();
  if (fromEnv) return fromEnv;
  const read = (f) => (existsSync(f) ? parse(readFileSync(f)).TEST_ENV?.trim() : "");
  const sid = env.CLAUDE_CODE_SESSION_ID;
  const fromSession = sid && /^[A-Za-z0-9-]+$/.test(sid) ? read(join(root, ".vc-fix", "session-env", sid)) : "";
  return fromSession || read(join(root, ".env.test-env")) || "vcst";
}

export function loadLayeredEnv(root) {
  const testEnv = resolveTestEnv(root);
  process.env.TEST_ENV = testEnv;
  applyLayered(testEnv, { root });
  return testEnv;
}
