#!/usr/bin/env node
// scripts/env/env-check.mjs — `npm run env:check`: load the active env the one way (loadEnv) and report it with
// scripts/lib/env-check.mjs `reportEnv` (names and sources, never a value; exit 1 on what config.js refuses).
import '../lib/sync-stdio.mjs';
import { loadEnv } from '../lib/load-env.mjs';
import { layered } from '../lib/env-layers.mjs';
import { testEnvChoice } from '../lib/resolve-test-env.js';
import { reportEnv } from '../lib/env-check.mjs';

const SOURCE = { TEST_ENV: 'TEST_ENV in the environment', session: "this session's binding (npm run env:use)", '.env.test-env': '.env.test-env', default: 'the default' };
const root = process.cwd();
const { testEnv } = loadEnv({ root });
process.exit(reportEnv(testEnv, SOURCE[testEnvChoice('vcst').source], layered(testEnv, { root, ambient: {}, masterValues: false })));
