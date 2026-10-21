// .claude/skills/ticket-context/lib/env.mjs — the layered .env loader, copied from config.js and
// scripts/lib/resolve-test-env.js + env-core.js (M1). Keep in step by hand:
//   TEST_ENV: process env > this session's binding (.vc-fix/session-env/<CLAUDE_CODE_SESSION_ID>,
//             `npm run env:use`) > .env.test-env > "vcst"
//   .env.defaults → .env.<TEST_ENV> (override) → .env.local (override) → _<ENV> suffix promotion
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config, parse } from "dotenv";

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
  config({ path: join(root, ".env.defaults"), quiet: true });
  config({ path: join(root, `.env.${testEnv}`), override: true, quiet: true });
  config({ path: join(root, ".env.local"), override: true, quiet: true });
  const suffix = `_${testEnv.toUpperCase()}`;
  for (const [k, v] of Object.entries(process.env)) if (k.endsWith(suffix) && v) process.env[k.slice(0, -suffix.length)] = v;
  return testEnv;
}
