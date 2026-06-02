/**
 * bootstrap/install.ts
 *
 * VC QA plugin — interactive customer onboarding.
 *
 * Reads manifest.json, prompts the customer for required env values (per
 * envSchema), writes .env.local with their secrets and .env.${TEST_ENV} with
 * their per-env values, scaffolds an empty test-data/aliases.${TEST_ENV}.json,
 * then runs `npm run env:check` to confirm reachability.
 *
 * Goals:
 *   - Zero-edit happy path: customer types answers, plugin writes files.
 *   - Multi-env aware: explicitly asks which env they're configuring; can be
 *     re-run for additional envs without overwriting other env profiles.
 *   - Safe: refuses to overwrite existing .env.${TEST_ENV} without --force.
 *   - Privacy by default: .env.local is gitignored; bootstrap reminds the
 *     customer never to commit secrets.
 *
 * Usage:
 *   npx tsx bootstrap/install.ts                  # interactive
 *   npx tsx bootstrap/install.ts --env=staging    # configure a named env
 *   npx tsx bootstrap/install.ts --check          # validate existing setup, don't prompt
 *   npx tsx bootstrap/install.ts --force          # overwrite existing .env.${TEST_ENV}
 *
 * Re-runnable: customers can run it again to add a second env profile.
 * Each invocation configures one env at a time.
 *
 * Plan ref: ~/.claude/plans/functional-singing-cosmos.md Phase 2
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

interface EnvVarSchema {
  bucket: "plugin-supplied" | "customer-required" | "customer-secret";
  required: boolean;
  default?: string;
  pattern?: string;
  enum?: string[];
  description: string;
}

interface Manifest {
  name: string;
  version: string;
  envSchema: Record<string, EnvVarSchema | { description?: string }>;
  requiredMcpServers: Array<{ name: string; purpose: string }>;
  optionalMcpServers: Array<{ name: string; purpose: string; enables?: string[] }>;
}

const FORCE = process.argv.includes("--force");
const CHECK_ONLY = process.argv.includes("--check");
const ENV_ARG = process.argv.find((a) => a.startsWith("--env="))?.split("=")[1];

const REPO_ROOT = process.cwd();
const MANIFEST_PATH = join(REPO_ROOT, "manifest.json");

if (!existsSync(MANIFEST_PATH)) {
  console.error(`[install] manifest.json not found at ${MANIFEST_PATH}. Are you in the plugin repo root?`);
  process.exit(1);
}

const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));

async function main(): Promise<void> {
  console.log("");
  console.log(`╔═══════════════════════════════════════════════════════════════╗`);
  console.log(`║  ${manifest.name} v${manifest.version} — customer onboarding`.padEnd(64) + "║");
  console.log(`╚═══════════════════════════════════════════════════════════════╝`);
  console.log("");

  if (CHECK_ONLY) {
    await runCheckOnly();
    return;
  }

  const rl = createInterface({ input, output });

  try {
    // Step 1: env name + risk
    const envName = ENV_ARG || (await rl.question(
      "Step 1/5 — Environment name to configure.\n" +
      "  Pick any short identifier: dev, qa, staging, prod, customer_eu, …\n" +
      "  Must match [a-z0-9_]+ (no hyphens — they break per-env secret promotion).\n" +
      "  > "
    )).trim();

    if (!/^[a-z0-9_]+$/.test(envName)) {
      console.error(`[install] Invalid env name "${envName}". Use [a-z0-9_]+ only.`);
      process.exit(1);
    }

    const envFile = join(REPO_ROOT, `.env.${envName}`);
    if (existsSync(envFile) && !FORCE) {
      console.error(`[install] .env.${envName} already exists. Pass --force to overwrite, or pick a different env name.`);
      process.exit(1);
    }

    const envRisk = (await rl.question(
      `\nStep 2/5 — Risk class for "${envName}".\n` +
      "  dev:        scratchpad, anything goes.\n" +
      "  test:       shared QA env, no PII.\n" +
      "  staging:    pre-prod, real-like data.\n" +
      "  production: live env. Admin-write suites WILL refuse to run by default.\n" +
      "  > "
    )).trim().toLowerCase() || "dev";

    if (!["dev", "test", "staging", "production"].includes(envRisk)) {
      console.error(`[install] Invalid ENV_RISK "${envRisk}".`);
      process.exit(1);
    }

    // Step 2: surfaces
    console.log(`\nStep 3/5 — Surfaces. The plugin tests both storefront and Admin SPA.`);
    const frontUrl = (await rl.question("  Storefront URL (FRONT_URL): ")).trim();
    const backUrl = (await rl.question("  Admin SPA / platform URL (BACK_URL): ")).trim();
    const storeId = (await rl.question("  Primary store ID (STORE_ID): ")).trim();

    if (!frontUrl || !backUrl || !storeId) {
      console.error("[install] FRONT_URL, BACK_URL, and STORE_ID are required.");
      process.exit(1);
    }

    // Step 3: storefront profile + modules
    const storefrontProfile = (await rl.question(
      `\nStep 4/5 — Storefront flavor + installed modules.\n` +
      "  STOREFRONT_PROFILE (b2b/b2c/hybrid) [hybrid]: "
    )).trim().toLowerCase() || "hybrid";

    if (!["b2b", "b2c", "hybrid"].includes(storefrontProfile)) {
      console.error(`[install] Invalid STOREFRONT_PROFILE "${storefrontProfile}".`);
      process.exit(1);
    }

    const modulesEnabled = (await rl.question(
      "  MODULES_ENABLED (comma-separated, e.g. catalog,customer,marketing,cms,orders) [empty = no filter]: "
    )).trim();

    const jiraProjectKey = (await rl.question(
      "  JIRA_PROJECT_KEY [VCST]: "
    )).trim() || "VCST";

    // Step 4: secrets
    console.log(`\nStep 5/5 — Credentials. These go into .env.local (gitignored).`);
    console.log(`  Per-env variants: secrets will be stored as USER_PASSWORD_${envName.toUpperCase()},`);
    console.log(`  ADMIN_PASSWORD_${envName.toUpperCase()}, etc. config.js auto-promotes them when TEST_ENV=${envName}.\n`);

    const userEmail = (await rl.question("  USER_EMAIL (storefront test user): ")).trim();
    const userPassword = (await rl.question("  USER_PASSWORD: ")).trim();
    const adminEmail = (await rl.question("  ADMIN (Admin SPA user email): ")).trim();
    const adminPassword = (await rl.question("  ADMIN_PASSWORD: ")).trim();

    if (!userEmail || !userPassword || !adminEmail || !adminPassword) {
      console.error("[install] All four credential fields are required.");
      process.exit(1);
    }

    rl.close();

    // Write .env.${envName} — per-env, committable (no secrets)
    const envContents = [
      `# .env.${envName} — generated by bootstrap/install.ts`,
      `# Per-env values for the "${envName}" environment. Safe to commit.`,
      `# Secrets live in .env.local (gitignored) with per-env suffix promotion.`,
      "",
      `ENV_RISK=${envRisk}`,
      `STOREFRONT_PROFILE=${storefrontProfile}`,
      `MODULES_ENABLED=${modulesEnabled}`,
      `JIRA_PROJECT_KEY=${jiraProjectKey}`,
      "",
      `FRONT_URL=${frontUrl}`,
      `BACK_URL=${backUrl}`,
      `STORE_ID=${storeId}`,
      "",
      `# Storybook URLs (optional — set if you maintain a Storybook deployment)`,
      `STORYBOOK_URL=`,
      `STORYBOOK_DEV_URL=`,
      "",
    ].join("\n");

    writeFileSync(envFile, envContents);
    console.log(`\n✓ Wrote ${envFile}`);

    // Append to .env.local with per-env-suffixed secrets
    const localFile = join(REPO_ROOT, ".env.local");
    const localExisting = existsSync(localFile) ? readFileSync(localFile, "utf-8") : "";
    const suffix = envName.toUpperCase();

    const localAppend = [
      "",
      `# === Credentials for env "${envName}" (added by install.ts at ${new Date().toISOString()}) ===`,
      `# config.js auto-promotes _${suffix}-suffixed vars to base names when TEST_ENV=${envName}.`,
      `USER_EMAIL_${suffix}=${userEmail}`,
      `USER_PASSWORD_${suffix}=${userPassword}`,
      `ADMIN_${suffix}=${adminEmail}`,
      `ADMIN_PASSWORD_${suffix}=${adminPassword}`,
      "",
    ].join("\n");

    if (!localExisting.includes(`Credentials for env "${envName}"`)) {
      appendFileSync(localFile, localAppend);
      console.log(`✓ Appended secrets to ${localFile} (gitignored)`);
    } else {
      console.log(`⚠ Skipped .env.local append — block for "${envName}" already exists. Edit manually if you need to change creds.`);
    }

    // Scaffold per-env aliases override (optional, empty stub)
    const aliasesEnvFile = join(REPO_ROOT, "test-data", `aliases.${envName}.json`);
    if (!existsSync(aliasesEnvFile)) {
      const aliasesStub = JSON.stringify(
        {
          _meta: {
            description: `Per-env aliases override for "${envName}". Layered on top of test-data/aliases.json by test-data-resolver. Only put entries here that DIFFER from the base aliases.json — anything else stays inherited.`,
            generated: new Date().toISOString().slice(0, 10),
          },
        },
        null,
        2
      );
      writeFileSync(aliasesEnvFile, aliasesStub + "\n");
      console.log(`✓ Created ${aliasesEnvFile} (empty stub — fill in per-env entity overrides as needed)`);
    }

    // Run env:check
    console.log(`\n--- Running npm run env:check (TEST_ENV=${envName}) ---\n`);
    process.env.TEST_ENV = envName;
    const { execSync } = await import("child_process");
    try {
      execSync(`npm run env:check`, { stdio: "inherit", env: { ...process.env, TEST_ENV: envName } });
    } catch {
      console.error(`\n⚠ env:check reported issues — review missing vars above. Plugin will not run until they're resolved.`);
      process.exit(2);
    }

    console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
    console.log(`║  Install complete. Try:`.padEnd(64) + "║");
    console.log(`║    TEST_ENV=${envName} /qa-env-check`.padEnd(64) + "║");
    console.log(`║    TEST_ENV=${envName} /qa-smoke`.padEnd(64) + "║");
    console.log(`║`.padEnd(64) + "║");
    console.log(`║  Configure another env by re-running with --env=<name>.`.padEnd(64) + "║");
    console.log(`║  Docs: docs/onboarding.md`.padEnd(64) + "║");
    console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);
  } finally {
    rl.close();
  }
}

async function runCheckOnly(): Promise<void> {
  // Validate manifest, env files, MCP servers reachable. Delegates to
  // npm run env:check (which loads .env.defaults + .env.${TEST_ENV} + .env.local
  // via config.js, so the validation sees the merged env the orchestrator
  // would see at runtime). Bootstrap's job here is just to report manifest +
  // env-file presence; the heavy validation lives in env:check.
  console.log("[install --check] Validating plugin install...\n");

  // Manifest sanity
  if (!manifest.name || !manifest.version) {
    console.error("[install --check] FAIL: manifest.json missing required fields (name, version).");
    process.exit(1);
  }
  console.log(`[install --check] manifest.json OK: ${manifest.name} v${manifest.version}`);

  // Env file presence
  const envName = process.env.TEST_ENV || "vcst";
  const envFile = join(REPO_ROOT, `.env.${envName}`);
  const localFile = join(REPO_ROOT, ".env.local");
  if (!existsSync(envFile)) {
    console.error(`[install --check] FAIL: .env.${envName} not found. Run: npx tsx bootstrap/install.ts --env=${envName}`);
    process.exit(1);
  }
  console.log(`[install --check] .env.${envName} present`);
  if (!existsSync(localFile)) {
    console.warn(`[install --check] WARN: .env.local not found. Secrets-required suites will fail.`);
  } else {
    console.log(`[install --check] .env.local present (gitignored)`);
  }

  // Delegate to env:check for the full required-var validation
  console.log(`\n--- npm run env:check (TEST_ENV=${envName}) ---\n`);
  const { execSync } = await import("child_process");
  try {
    execSync(`npm run env:check`, { stdio: "inherit", env: { ...process.env, TEST_ENV: envName } });
  } catch {
    console.error(`\n[install --check] FAIL: env:check reported issues.`);
    process.exit(2);
  }
  console.log(`\n[install --check] OK.`);
}

main().catch((err) => {
  console.error("[install] Fatal:", err);
  process.exit(1);
});
