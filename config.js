// config.js — `import './config.js'` loads the active env into process.env and refuses to run without its CORE
// variables. That is all it does: read values with `process.env.X` after the import.
//
// Loading an env, the ONE way: scripts/lib/load-env.mjs `loadEnv()` (the layers, their order, TEST_ENV's choice:
// scripts/lib/env-layers.mjs and resolve-test-env.js). This file is `loadEnv` + `checkEnv` (scripts/lib/env-check.mjs)
// for a process that cannot do anything without the stand's URLs and accounts — a suite runner, a seeder. A script
// that needs only BACK_URL calls `loadEnv()` itself, so it still works on a fresh clone and in CI.
//
// An ES-module import runs before the importing module's body, so `import './config.js'` first is what puts the env
// in place before any other import reads process.env.
import { TEST_ENV_PATTERN, testEnvChoice } from './scripts/lib/resolve-test-env.js';
import { loadEnvFor, selectTestEnv } from './scripts/lib/load-env.mjs';
import { checkEnv } from './scripts/lib/env-check.mjs';

const TEST_ENV = selectTestEnv('vcst');

// The `_<ENV>` suffix promotion uppercases TEST_ENV into a variable name, so `customer-staging-eu` would silently
// build a suffix no variable can carry.
if (!TEST_ENV_PATTERN.test(TEST_ENV)) {
    console.error(`[config] Invalid TEST_ENV="${TEST_ENV}". Must match [a-z0-9_]+ — use underscores, not hyphens (e.g. "customer_staging_eu").`);
    process.exit(1);
}

loadEnvFor(TEST_ENV, { root: process.cwd() });

const { envRisk, errors, warnings } = checkEnv(process.env);
console.log(`[config] TEST_ENV=${TEST_ENV} (from ${testEnvChoice('vcst').source}) ENV_RISK=${envRisk}`);
if (envRisk === 'production') {
    console.log(`[config] ⚠ PRODUCTION-RISK ENV. Admin-write suites blocked unless --allow-admin-writes-on-prod is passed.`);
}
for (const w of warnings) console.warn(`[config] ${w}`);
if (errors.length) {
    for (const e of errors) console.error(`[config] ${e}`);
    process.exit(1);
}
