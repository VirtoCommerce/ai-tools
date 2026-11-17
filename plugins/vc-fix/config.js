// config.js — `import './config.js'` loads the active env into process.env and refuses to run without its CORE
// variables. That is all it does: read values with `process.env.X` after the import.
//
// Loading an env, the ONE way in this plugin: scripts/lib/load-layered-env.mjs `loadLayeredEnv()` (the layers, their
// order, TEST_ENV's choice: scripts/lib/env-layers.mjs and resolve-test-env.js — the ai-tools repo's own files,
// copied byte for byte). This file is that + `checkEnv` (scripts/lib/env-check.mjs) for a process that cannot do
// anything without the stand's URLs and accounts. A script that needs only BACK_URL calls `loadLayeredEnv()` itself.
import { testEnvChoice } from './scripts/lib/resolve-test-env.js';
import { loadLayeredEnv } from './scripts/lib/load-layered-env.mjs';
import { checkEnv } from './scripts/lib/env-check.mjs';

let TEST_ENV;
try {
    TEST_ENV = loadLayeredEnv('vcst');
} catch (e) {
    console.error(`[config] ${e.message}`);
    process.exit(1);
}

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
