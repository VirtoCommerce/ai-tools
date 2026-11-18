// config.js — `import './config.js'` loads the active env into process.env and refuses to run without its CORE
// variables. That is all it does: read values with `process.env.X` after the import.
//
// Loading an env, the ONE way: scripts/lib/load-env.mjs `loadEnv()` (the layers, their order, TEST_ENV's choice:
// scripts/lib/env-layers.mjs and resolve-test-env.js). This file is `loadEnv` + `enforceEnv` (scripts/lib/env-check.mjs)
// for a process that cannot do anything without the stand's URLs and accounts — a suite runner, a seeder. A script
// that needs only BACK_URL calls `loadEnv()` itself, so it still works on a fresh clone and in CI.
//
// An ES-module import runs before the importing module's body, so `import './config.js'` first is what puts the env
// in place before any other import reads process.env.
import { TEST_ENV_PATTERN, testEnvChoice } from './scripts/lib/resolve-test-env.js';
import { loadEnvFor, selectTestEnv } from './scripts/lib/load-env.mjs';
import { enforceEnv } from './scripts/lib/env-check.mjs';
import { loadProjectProfile } from './scripts/lib/project-profile.mjs';

const TEST_ENV = selectTestEnv('vcst');

// The `_<ENV>` suffix promotion uppercases TEST_ENV into a variable name, so `customer-staging-eu` would silently
// build a suffix no variable can carry.
if (!TEST_ENV_PATTERN.test(TEST_ENV)) {
    console.error(`[config] Invalid TEST_ENV="${TEST_ENV}". Must match [a-z0-9_]+ — use underscores, not hyphens (e.g. "customer_staging_eu").`);
    process.exit(1);
}

loadEnvFor(TEST_ENV, { root: process.cwd() });

// The deployment profile: absent or malformed, it warns (scripts/lib/project-profile.mjs never throws here).
loadProjectProfile();
if (!enforceEnv(TEST_ENV, testEnvChoice('vcst').source)) process.exit(1);
