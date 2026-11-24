// config.js — `import './config.js'` loads the active env into process.env and refuses to run without its CORE
// variables. That is all it does: read values with `process.env.X` after the import.
//
// Loading an env, the ONE way in this plugin: scripts/lib/load-layered-env.mjs `loadLayeredEnv()` (the layers, their
// order, TEST_ENV's choice: scripts/lib/env-layers.mjs and resolve-test-env.js — the ai-tools repo's own files,
// copied byte for byte). This file is that + `enforceEnv` (scripts/lib/env-check.mjs) for a process that cannot do
// anything without the stand's URLs and accounts. A script that needs only BACK_URL calls `loadLayeredEnv()` itself.
import { testEnvChoice } from './scripts/lib/resolve-test-env.js';
import { loadLayeredEnv } from './scripts/lib/load-layered-env.mjs';
import { enforceEnv } from './scripts/lib/env-check.mjs';
import { loadProjectProfile } from './scripts/lib/project-profile.mjs';

let TEST_ENV;
try {
    TEST_ENV = loadLayeredEnv('vcst');
} catch (e) {
    console.error(`[config] ${e.message}`);
    process.exit(1);
}

// Deployment profile (written by vc-init's /project-init). Loaded OPTIONALLY: a missing profile is reported, not a
// crash — the commands that act on it (/qa-fix, /qa-bug, …) STOP themselves. A malformed or too-new profile still
// throws: that is never a state to report past.
if (!loadProjectProfile(undefined, { optional: true })) {
    console.warn('No project-profile.json in this project — run /project-init (the vc-init plugin) before /qa-fix, /qa-bug or /qa-verify-fix.');
}
if (!enforceEnv(TEST_ENV, testEnvChoice('vcst').source)) process.exit(1);
