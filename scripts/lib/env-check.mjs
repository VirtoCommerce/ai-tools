// scripts/lib/env-check.mjs — what a loaded env must hold, and the one judgement of it: config.js exits on `errors`,
// `npm run env:check` prints them. Self-contained: it reads the env it is given and changes nothing.

/** CORE — must exist for any suite to run (config.js exits 1 when one is missing). */
export const CORE_REQUIRED_VARS = Object.freeze([
  // URLs (both surfaces)
  'FRONT_URL',
  'BACK_URL',
  // Credentials (both surfaces)
  'ADMIN',
  'ADMIN_PASSWORD',
  'USER_EMAIL',
  'USER_PASSWORD',
  // Store context
  'STORE_ID',
]);


/** The admin-write guard's levels: production-risk envs block admin-write suites unless --allow-admin-writes-on-prod. */
export const ENV_RISKS = Object.freeze(['dev', 'test', 'staging', 'production']);

/**
 * FEATURE-GATED — required only when the feature runs: a missing set disables that feature with a warning, never
 * fails the load. Payment entries apply only to the processors PAYMENT_PROCESSORS_ENABLED names (all, when empty).
 */
export const FEATURE_GATED_VARS = Object.freeze({
  storybook: { vars: ['STORYBOOK_URL', 'STORYBOOK_DEV_URL'], gates: '/qa-storybook (visual regression)' },
  storefront_pair: { vars: ['USER2_EMAIL', 'USER2_PASSWORD'], gates: 'B2B / list-sharing / multi-user suites' },
  payment_skyflow: { vars: ['SKYFLOW_MASTERCARD', 'SKYFLOW_EXPIRY', 'SKYFLOW_CVV'], gates: 'PAYMENT_PROCESSORS_ENABLED includes "skyflow"', processor: 'skyflow' },
  payment_cybersource: { vars: ['CYBERSOURCE_CARD', 'CYBERSOURCE_EXPIRY', 'CYBERSOURCE_CVV'], gates: 'PAYMENT_PROCESSORS_ENABLED includes "cybersource"', processor: 'cybersource' },
  payment_authoriznet: { vars: ['AUTHORIZNET_CARD', 'AUTHORIZNET_EXPIRY', 'AUTHORIZNET_CVV'], gates: 'PAYMENT_PROCESSORS_ENABLED includes "authorize-net"', processor: 'authorize-net' },
  payment_datatrance: { vars: ['DATATRANCE_MASTERCARD', 'DATATRANCE_EXPIRY', 'DATATRANCE_CVV', 'DATATRANCE_OTP'], gates: 'PAYMENT_PROCESSORS_ENABLED includes "datatrance"', processor: 'datatrance' },
  figma: { vars: ['FIGMA_API_KEY'], gates: '/qa-design Figma comparison' },
  postman: { vars: ['POSTMAN_API_KEY'], gates: '/qa-postman, /qa-api test' },
  // App IDs gate the feature. Auth is AAD-first (az login / service principal / managed identity) — API keys are an
  // optional fallback, not required here.
  monitoring: { vars: ['APPINSIGHTS_APP_ID_BACKEND', 'APPINSIGHTS_APP_ID_STOREFRONT'], gates: '/qa-monitoring (App Insights online bug monitoring)' },
  teams: { vars: ['TEAMS_WEBHOOK_URL'], gates: '/qa-monitoring Teams card (vc-fix skills/qa-monitoring/notify-teams.ts) — optional, monitoring still runs without it' },
});

/**
 * What a loaded env lacks — the one judgement config.js (which exits on `errors`) and `npm run env:check` (which
 * prints it) share. Reads `env`; changes nothing.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ envRisk: string, errors: string[], missingCore: string[], warnings: string[] }}
 */
export function checkEnv(env = process.env) {
  const errors = [];
  const envRisk = (env.ENV_RISK || 'test').toLowerCase();
  if (!ENV_RISKS.includes(envRisk)) errors.push(`Invalid ENV_RISK="${env.ENV_RISK}". Must be one of: ${ENV_RISKS.join(', ')}.`);
  const missingCore = CORE_REQUIRED_VARS.filter((v) => !env[v]);
  if (missingCore.length) {
    errors.push(`Missing CORE environment variables (required for any run): ${missingCore.join(', ')}. ` +
      `Run /project-init, or put them in .env.${env.TEST_ENV} (URLs) and test-accounts.local.json (accounts) — npm run env:check to verify.`);
  }
  const processors = (env.PAYMENT_PROCESSORS_ENABLED || '').split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  const warnings = [];
  for (const { vars, gates, processor } of Object.values(FEATURE_GATED_VARS)) {
    if (processor && processors.length && !processors.includes(processor)) continue;
    const missing = vars.filter((v) => !env[v]);
    if (missing.length === vars.length) warnings.push(`FEATURE-GATED skipped: ${gates} — set ${vars.join(', ')} to enable`);
    else if (missing.length) warnings.push(`FEATURE-GATED partial: ${gates} — missing ${missing.join(', ')} (other vars present)`);
  }
  return { envRisk, errors, missingCore, warnings };
}

/**
 * config.js's verdict on the loaded env, printed: the active env and its risk class, feature warnings, errors.
 * `source` names what chose TEST_ENV. Returns false on an error — the caller exits.
 */
export function enforceEnv(testEnv, source) {
  const { envRisk, errors, warnings } = checkEnv(process.env);
  console.log(`[config] TEST_ENV=${testEnv} (from ${source}) ENV_RISK=${envRisk}`);
  if (envRisk === 'production') console.log('[config] ⚠ PRODUCTION-RISK ENV. Admin-write suites blocked unless --allow-admin-writes-on-prod is passed.');
  for (const w of warnings) console.warn(`[config] ${w}`);
  for (const e of errors) console.error(`[config] ${e}`);
  return !errors.length;
}

/**
 * `npm run env:check`'s report on the loaded env: every CORE and FEATURE-GATED variable as SET (with where it came
 * from) or EMPTY, then every other variable the env's files set — never a value. `sourceOf` is the LOAD's own (the
 * result of the load that filled process.env), so the source printed is the one the value came from; `fileKeys` are
 * the names the env's files set. Returns the exit code.
 */
export function reportEnv(testEnv, sourceLabel, sourceOf, fileKeys) {
  const { envRisk, errors, warnings } = checkEnv(process.env);
  console.log(`Active env: TEST_ENV=${testEnv} (${sourceLabel}) ENV_RISK=${envRisk}`);
  const report = (name) => console.log(process.env[name] ? `  ${name}: SET (${sourceOf(name)})` : `  ${name}: EMPTY`);
  const listed = new Set(CORE_REQUIRED_VARS);
  console.log('CORE');
  CORE_REQUIRED_VARS.forEach(report);
  for (const { vars, gates } of Object.values(FEATURE_GATED_VARS)) {
    console.log(`FEATURE — ${gates}`);
    vars.forEach((v) => { listed.add(v); report(v); });
  }
  const suffix = `_${testEnv.toUpperCase()}`;
  const others = [...fileKeys].filter((k) => k !== 'TEST_ENV' && !listed.has(k) && !k.endsWith(suffix) && process.env[k]).sort();
  if (others.length) { console.log('OTHER — set by the env files'); others.forEach(report); }
  for (const w of warnings) console.warn(w);
  for (const e of errors) console.error(e);
  return errors.length ? 1 : 0;
}
