// The ONLY door through which a spec gets test data (rules: .claude/rules/test-data.md).
import "../../config.js"; // runs the layered .env loader before anything reads process.env
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TestDataResolver } from "../../scripts/lib/test-data-resolver.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SECRET = /PASSWORD|SECRET|TOKEN|API_KEY/i;

/** A non-secret variable, resolved through process.env (never off one layer or the curated export). */
export function env(name: string): string {
  if (SECRET.test(name)) throw new Error(`env: ${name} is a secret — use the auth fixtures`);
  const value = process.env[name];
  if (!value) throw new Error(`env: ${name} is not set (TEST_ENV=${process.env.TEST_ENV})`);
  return value;
}

let resolver: TestDataResolver | undefined;

/** Resolve an `@td(ALIAS.field)` expression; throws, with the reason, when it does not resolve. */
export function td(ref: string): string {
  resolver ??= new TestDataResolver(join(ROOT, "test-data"), process.env.TEST_ENV);
  const out = resolver.resolve(ref);
  if (out.includes("@td(")) {
    const inner = ref.match(/@td\(([^)]*)\)/)?.[1] ?? ref;
    throw new Error(`td: ${ref} did not resolve — ${JSON.stringify(resolver.explainMiss(inner))}`);
  }
  return out;
}

export * as discover from "../../scripts/lib/live-discover.js";
export * as random from "../../scripts/lib/random-data.js";
