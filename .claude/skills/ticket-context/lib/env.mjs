// .claude/skills/ticket-context/lib/env.mjs — the layered .env loader, copied from config.js and
// scripts/lib/resolve-test-env.js + env-core.js (M1). Keep in step by hand:
//   TEST_ENV: process env > .env.test-env > "vcst"
//   .env.defaults → .env.<TEST_ENV> (override) → .env.local (override) → _<ENV> suffix promotion
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config, parse } from "dotenv";

export function resolveTestEnv(root, env = process.env) {
  const fromEnv = env.TEST_ENV?.trim();
  if (fromEnv) return fromEnv;
  const f = join(root, ".env.test-env");
  const fromFile = existsSync(f) ? parse(readFileSync(f)).TEST_ENV?.trim() : "";
  return fromFile || "vcst";
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
