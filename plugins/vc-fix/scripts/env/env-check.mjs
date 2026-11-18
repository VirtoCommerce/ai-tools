#!/usr/bin/env node
// scripts/env/env-check.mjs — `npm run env:check`: load the active env the one way (loadLayeredEnv) and report it with
// scripts/lib/env-check.mjs `reportEnv` (names and sources, never a value; exit 1 on what config.js refuses).
import { resolve } from 'node:path';
import { loadLayeredEnv } from '../lib/load-layered-env.mjs';
import { layered } from '../lib/env-layers.mjs';
import { envDir, testEnvChoice } from '../lib/resolve-test-env.js';
import { reportEnv } from '../lib/env-check.mjs';
import { loadProjectProfile } from '../lib/project-profile.mjs';

const SOURCE = { TEST_ENV: 'TEST_ENV in the environment', session: "this session's binding (npm run env:use)", '.env.test-env': '.env.test-env', default: 'the default' };
const testEnv = loadLayeredEnv('vcst');
// A malformed or too-new profile throws here, as it does in config.js; a missing one is named.
if (!loadProjectProfile(undefined, { optional: true })) console.warn('No project-profile.json in this project — run /project-init (the vc-init plugin) before /qa-fix, /qa-bug or /qa-verify-fix.');
process.exit(reportEnv(testEnv, SOURCE[testEnvChoice('vcst').source], layered(testEnv, { root: resolve(envDir()), ambient: {}, legacy: true, masterValues: false })));
