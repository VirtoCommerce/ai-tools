#!/usr/bin/env node
// scripts/env/env-check.mjs — `npm run env:check`: load the active env the one way (loadLayeredEnv) and say what it lacks.
//
// Prints which env is active and why, then every CORE and FEATURE-GATED variable (scripts/lib/env-check.mjs) as SET
// or EMPTY — never a value. Exits 1 on what config.js would refuse to run with, so a script and a person get the
// same verdict.
import { loadLayeredEnv } from '../lib/load-layered-env.mjs';
import { testEnvChoice } from '../lib/resolve-test-env.js';
import { CORE_REQUIRED_VARS, FEATURE_GATED_VARS, checkEnv } from '../lib/env-check.mjs';

const SOURCE = { TEST_ENV: 'TEST_ENV in the environment', session: "this session's binding (npm run env:use)", '.env.test-env': '.env.test-env', default: 'the default' };

const testEnv = loadLayeredEnv('vcst');
const { envRisk, errors, warnings } = checkEnv(process.env);
console.log(`Active env: TEST_ENV=${testEnv} (${SOURCE[testEnvChoice('vcst').source]}) ENV_RISK=${envRisk}`);

const report = (name) => console.log(`  ${name}: ${process.env[name] ? 'SET' : 'EMPTY'}`);
console.log('CORE');
CORE_REQUIRED_VARS.forEach(report);
for (const { vars, gates } of Object.values(FEATURE_GATED_VARS)) {
  console.log(`FEATURE — ${gates}`);
  vars.forEach(report);
}
for (const w of warnings) console.warn(w);
for (const e of errors) console.error(e);
process.exit(errors.length ? 1 : 0);
