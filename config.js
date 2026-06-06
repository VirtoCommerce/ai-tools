import { config } from 'dotenv';
import { resolveTestEnv } from './scripts/lib/resolve-test-env.js';

// Layered env loader. Precedence (later overrides earlier):
//   1. .env.defaults       — cross-env constants (sandbox cards, builder.io URL)
//   2. .env.${TEST_ENV}    — per-env URLs/identifiers (vcst | vcptcore | virtostart)
//   3. .env.local          — secrets (passwords, tokens) — gitignored
//   4. process.env         — already wins (CI passes via -e flags)
// The legacy monolithic .env file was removed — all values live in the layered
// files above. Per-env scaffolds are committed; secrets stay in .env.local.
//
// TEST_ENV selects WHICH .env.${TEST_ENV} loads, so it must be resolved before any
// dotenv file is read. Precedence: process.env.TEST_ENV > .env.test-env (gitignored
// team/per-dev default) > 'vcst'. See scripts/lib/resolve-test-env.js.
const TEST_ENV = resolveTestEnv('vcst');

// Validate TEST_ENV: must match [a-z0-9_]+ so the per-env suffix-promotion
// (which uppercases TEST_ENV and appends as a var suffix) works correctly.
// Kebab-case names like `customer-staging-eu` silently break suffix promotion
// because `_CUSTOMER-STAGING-EU` is not a valid env-var suffix.
if (!/^[a-z0-9_]+$/.test(TEST_ENV)) {
    console.error(
        `[config] Invalid TEST_ENV="${TEST_ENV}". Must match [a-z0-9_]+. ` +
        `Use underscores instead of hyphens (e.g. "customer_staging_eu", not "customer-staging-eu"). ` +
        `This is required so per-env secrets in .env.local (e.g. USER_PASSWORD_${TEST_ENV.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}) resolve correctly.`
    );
    process.exit(1);
}

config({ path: '.env.defaults' });
config({ path: `.env.${TEST_ENV}`, override: true });
config({ path: '.env.local', override: true });

// Per-env override promotion: any key ending in `_${TEST_ENV.toUpperCase()}`
// is promoted to its base name. Lets `.env.local` carry per-env password
// variants (e.g. USER_PASSWORD_VIRTOSTART) without leaking into committed files.
const ENV_SUFFIX = `_${TEST_ENV.toUpperCase()}`;
for (const [key, value] of Object.entries(process.env)) {
    if (key.endsWith(ENV_SUFFIX) && value) {
        process.env[key.slice(0, -ENV_SUFFIX.length)] = value;
    }
}

// ENV_RISK: safety-by-config (not by env name). Production-risk envs block
// admin-write suites by default; opt-in via --allow-admin-writes-on-prod.
// Values: dev | test | staging | production. Defaults to 'dev' for backwards-compat.
const ENV_RISK = (process.env.ENV_RISK || 'dev').toLowerCase();
if (!['dev', 'test', 'staging', 'production'].includes(ENV_RISK)) {
    console.error(`[config] Invalid ENV_RISK="${ENV_RISK}". Must be one of: dev, test, staging, production.`);
    process.exit(1);
}

console.log(`[config] TEST_ENV=${TEST_ENV} ENV_RISK=${ENV_RISK}`);
if (ENV_RISK === 'production') {
    console.log(`[config] ⚠ PRODUCTION-RISK ENV. Admin-write suites blocked unless --allow-admin-writes-on-prod is passed.`);
}

// Validate required environment variables.
//
// CORE — must exist for any suite to run. Missing = exit 1, fail loudly.
// FEATURE-GATED — only required if the customer plans to use the corresponding
//   feature. Missing = warn (not exit) and disable the gated feature.
//
// Customer plugin (per feature/v0.2-prep): the previous "everything required"
// stance forced customers who don't use Figma or Postman to set placeholder
// keys just to run env:check. Splitting unblocks the smoke flow.

const coreRequiredVars = [
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
];

// Feature-gated: required ONLY when the corresponding skill/suite runs.
// The orchestrator/skill checks at dispatch time; env:check just warns here.
const featureGatedVars = {
    storybook: {
        vars: ['STORYBOOK_URL', 'STORYBOOK_DEV_URL'],
        gates: '/qa-storybook (visual regression)',
    },
    storefront_pair: {
        vars: ['USER2_EMAIL', 'USER2_PASSWORD'],
        gates: 'B2B / list-sharing / multi-user suites',
    },
    payment_skyflow: {
        vars: ['SKYFLOW_MASTERCARD', 'SKYFLOW_EXPIRY', 'SKYFLOW_CVV'],
        gates: 'PAYMENT_PROCESSORS_ENABLED includes "skyflow"',
    },
    payment_cybersource: {
        vars: ['CYBERSOURCE_CARD', 'CYBERSOURCE_EXPIRY', 'CYBERSOURCE_CVV'],
        gates: 'PAYMENT_PROCESSORS_ENABLED includes "cybersource"',
    },
    payment_authoriznet: {
        vars: ['AUTHORIZNET_CARD', 'AUTHORIZNET_EXPIRY', 'AUTHORIZNET_CVV'],
        gates: 'PAYMENT_PROCESSORS_ENABLED includes "authorize-net"',
    },
    payment_datatrance: {
        vars: ['DATATRANCE_MASTERCARD', 'DATATRANCE_EXPIRY', 'DATATRANCE_CVV', 'DATATRANCE_OTP'],
        gates: 'PAYMENT_PROCESSORS_ENABLED includes "datatrance"',
    },
    figma: {
        vars: ['FIGMA_API_KEY'],
        gates: '/qa-design Figma comparison',
    },
    postman: {
        vars: ['POSTMAN_API_KEY'],
        gates: '/qa-postman, /qa-api test',
    },
    monitoring: {
        // App IDs gate the feature. Auth is AAD-first (az login / service principal /
        // managed identity) — API keys are an OPTIONAL fallback, not required here.
        vars: [
            'APPINSIGHTS_APP_ID_BACKEND',
            'APPINSIGHTS_APP_ID_STOREFRONT',
        ],
        gates: '/qa-monitoring, ci:monitor (App Insights online bug monitoring)',
    },
};

const missingCore = coreRequiredVars.filter(v => !process.env[v]);
if (missingCore.length > 0) {
    console.error('[config] Missing CORE environment variables (required for any run):', missingCore.join(', '));
    console.error('[config] Run: npm run plugin:install   (or edit .env.${TEST_ENV} + .env.local manually)');
    process.exit(1);
}

const enabledProcessors = (process.env.PAYMENT_PROCESSORS_ENABLED || '')
    .split(',')
    .map(p => p.trim().toLowerCase())
    .filter(Boolean);

const warnings = [];
for (const [featureKey, { vars, gates }] of Object.entries(featureGatedVars)) {
    // Payment-processor gates check the enabledProcessors set
    if (featureKey.startsWith('payment_')) {
        const processor = featureKey.replace('payment_', '').replace('authoriznet', 'authorize-net');
        // If PAYMENT_PROCESSORS_ENABLED is empty, all processors are "potentially enabled" — warn for missing
        // If PAYMENT_PROCESSORS_ENABLED is set, only warn for processors the customer enabled
        const customerWantsThisProcessor = enabledProcessors.length === 0 || enabledProcessors.includes(processor);
        if (!customerWantsThisProcessor) continue;
    }
    const missing = vars.filter(v => !process.env[v]);
    if (missing.length === vars.length) {
        warnings.push(`[config] FEATURE-GATED skipped: ${gates} — set ${vars.join(', ')} to enable`);
    } else if (missing.length > 0) {
        warnings.push(`[config] FEATURE-GATED partial: ${gates} — missing ${missing.join(', ')} (other vars present)`);
    }
}
if (warnings.length > 0) {
    for (const w of warnings) console.warn(w);
}

// Helper function to get environment variable with optional default
const getEnvVar = (name, defaultValue = undefined) => {
    const value = process.env[name];
    if (value === undefined && defaultValue === undefined) {
        console.warn(`Environment variable ${name} is not set`);
    }
    return value || defaultValue;
};

// Export configuration object
export const env = {
    // Multi-env metadata (per feature/qa-agentic-standardization)
    TEST_ENV,                                           // The active env name (arbitrary string, validated above)
    ENV_RISK,                                           // dev | test | staging | production — gates destructive ops
    STOREFRONT_PROFILE: getEnvVar('STOREFRONT_PROFILE', 'hybrid'),  // b2b | b2c | hybrid — gates which suites apply
    MODULES_ENABLED: getEnvVar('MODULES_ENABLED', ''),  // CSV of installed VC modules; orchestrator skips suites whose requiresModules[] not satisfied (empty = no filter)
    PAYMENT_PROCESSORS_ENABLED: getEnvVar('PAYMENT_PROCESSORS_ENABLED', ''),  // CSV of payment processors customer uses (cybersource,skyflow,authorize-net,datatrance,stripe); orchestrator skips payment suites for processors not in this list (empty = no filter)
    JIRA_PROJECT_KEY: getEnvVar('JIRA_PROJECT_KEY', 'VCST'),  // Customer's JIRA project for bug filing

    // Application URLs
    FRONT_URL: getEnvVar('FRONT_URL'),
    BACK_URL: getEnvVar('BACK_URL'),
    VIRTO_START_FRONT: getEnvVar('VIRTO_START_FRONT', ''),       // TODO(qa-agentic-standardization): deprecate; switch consumers to TEST_ENV=virtostart
    VIRTO_START_BACK: getEnvVar('VIRTO_START_BACK', ''),         // TODO(qa-agentic-standardization): deprecate; switch consumers to TEST_ENV=virtostart
    STORYBOOK_URL: getEnvVar('STORYBOOK_URL'),
    STORYBOOK_DEV_URL: getEnvVar('STORYBOOK_DEV_URL'),

    // Admin credentials
    ADMIN: getEnvVar('ADMIN'),
    ADMIN_PASSWORD: getEnvVar('ADMIN_PASSWORD'),

    // User credentials
    USER_EMAIL: getEnvVar('USER_EMAIL'),
    USER_PASSWORD: getEnvVar('USER_PASSWORD'),
    USER2_EMAIL: getEnvVar('USER2_EMAIL'),
    USER2_PASSWORD: getEnvVar('USER2_PASSWORD'),
    USER_VIRTO: getEnvVar('USER_VIRTO', ''),
    USER_VIRTO_PASSWORD: getEnvVar('USER_VIRTO_PASSWORD', ''),
    
    // Store configuration
    STORE_ID: getEnvVar('STORE_ID'),
    STOREFRONT_DOMAIN: getEnvVar('STOREFRONT_DOMAIN', ''),
    TEST_USER_ID: getEnvVar('TEST_USER_ID', ''),
    
    // Skyflow payment configuration
    SKYFLOW_VISA: getEnvVar('SKYFLOW_VISA', ''),
    SKYFLOW_MASTERCARD: getEnvVar('SKYFLOW_MASTERCARD'),
    SKYFLOW_EXPIRY: getEnvVar('SKYFLOW_EXPIRY'),
    SKYFLOW_CVV: getEnvVar('SKYFLOW_CVV'),   

    
    // CyberSource payment configuration
    CYBERSOURCE_CARD: getEnvVar('CYBERSOURCE_CARD'),
    CYBERSOURCE_EXPIRY: getEnvVar('CYBERSOURCE_EXPIRY'),
    CYBERSOURCE_CVV: getEnvVar('CYBERSOURCE_CVV'),
    CYBERSOURCE_3DS_FRICTIONLESS_CARD: getEnvVar('CYBERSOURCE_3DS_FRICTIONLESS_CARD', ''),
    CYBERSOURCE_3DS_CHALLENGE_CARD: getEnvVar('CYBERSOURCE_3DS_CHALLENGE_CARD', ''),
    CYBERSOURCE_3DS_OTP: getEnvVar('CYBERSOURCE_3DS_OTP', ''),

    // Dedicated lockout-test account (for SEC-AUTH-003, SEC-RATE-001/002)
    // Isolated from the agent pool so brute-force lockout tests do not block parallel slot accounts.
    LOCKOUT_TEST_EMAIL: getEnvVar('LOCKOUT_TEST_EMAIL', ''),
    LOCKOUT_TEST_PASSWORD: getEnvVar('LOCKOUT_TEST_PASSWORD', ''),
    
    // Authorize.Net payment configuration
    AUTHORIZNET_CARD: getEnvVar('AUTHORIZNET_CARD'),
    AUTHORIZNET_EXPIRY: getEnvVar('AUTHORIZNET_EXPIRY'),
    AUTHORIZNET_CVV: getEnvVar('AUTHORIZNET_CVV'),

    // Datatrance payment configuration
    DATATRANCE_MASTERCARD: getEnvVar('DATATRANCE_MASTERCARD'),
    DATATRANCE_EXPIRY: getEnvVar('DATATRANCE_EXPIRY'),
    DATATRANCE_CVV: getEnvVar('DATATRANCE_CVV'),
    DATATRANCE_OTP: getEnvVar('DATATRANCE_OTP'),

    // Azure / Application Insights — online bug monitoring (/qa-monitoring, ci:monitor)
    // Resource IDs are per-env identifiers (Bucket #2, committed in .env.${TEST_ENV});
    // API keys are secrets (Bucket #3, .env.local only). All optional — the monitor
    // flow no-ops with a clear message when the App IDs / keys are unset.
    AZURE_SUBSCRIPTION_ID: getEnvVar('AZURE_SUBSCRIPTION_ID', ''),
    AZURE_RESOURCE_GROUP: getEnvVar('AZURE_RESOURCE_GROUP', ''),
    APPINSIGHTS_APP_ID_BACKEND: getEnvVar('APPINSIGHTS_APP_ID_BACKEND', ''),
    APPINSIGHTS_APP_ID_STOREFRONT: getEnvVar('APPINSIGHTS_APP_ID_STOREFRONT', ''),
    APPINSIGHTS_API_KEY_BACKEND: getEnvVar('APPINSIGHTS_API_KEY_BACKEND', ''),
    APPINSIGHTS_API_KEY_STOREFRONT: getEnvVar('APPINSIGHTS_API_KEY_STOREFRONT', ''),
    // Resource NAMES — used only to build portal deep-links; per-env, never hardcoded.
    APPINSIGHTS_RESOURCE_BACKEND: getEnvVar('APPINSIGHTS_RESOURCE_BACKEND', ''),
    APPINSIGHTS_RESOURCE_STOREFRONT: getEnvVar('APPINSIGHTS_RESOURCE_STOREFRONT', ''),

    // Figma API key
    FIGMA_API_KEY: getEnvVar('FIGMA_API_KEY'),

    // Browserstack credentials (optional — only needed for cross-browser cloud runs)
    BROWSERSTACK_USERNAME: getEnvVar('BROWSERSTACK_USERNAME', ''),
    BROWSERSTACK_ACCESS_KEY: getEnvVar('BROWSERSTACK_ACCESS_KEY', ''),

    // Builder.io integration (optional)
    BUILDER_IO_URL: getEnvVar('BUILDER_IO_URL', 'https://builder.io/content'),
    BUILDER_IO_EMAIL: getEnvVar('BUILDER_IO_EMAIL'),
    BUILDER_IO_PASSWORD: getEnvVar('BUILDER_IO_PASSWORD'),
    BUILDER_IO_SPACE: getEnvVar('BUILDER_IO_SPACE', 'VCST QA'),
    POSTMAN_API_KEY: getEnvVar('POSTMAN_API_KEY'),

    // Pending-seed fixtures (optional — unblock suites 028-030, 011-013 once provisioned in QA).
    // See test-data/README.md "Test Fixture Gaps" + reports/regression/REG-2026-04-20-1000/test-suite-review.md Seeder Checklist.
    VALID_COUPON_CODE: getEnvVar('VALID_COUPON_CODE', ''),
    OOS_SKU: getEnvVar('OOS_SKU', ''),
    LOW_STOCK_SKU: getEnvVar('LOW_STOCK_SKU', ''),
    PACK_SIZE_SKU: getEnvVar('PACK_SIZE_SKU', ''),
    TIER_PRICED_SKU: getEnvVar('TIER_PRICED_SKU', ''),
    CONFIGURABLE_SKU: getEnvVar('CONFIGURABLE_SKU', ''),
    MULTI_ORG_USER_EMAIL: getEnvVar('MULTI_ORG_USER_EMAIL', ''),
    MULTI_ORG_USER_PASSWORD: getEnvVar('MULTI_ORG_USER_PASSWORD', ''),
    EUR_USER_EMAIL: getEnvVar('EUR_USER_EMAIL', ''),
    EUR_USER_PASSWORD: getEnvVar('EUR_USER_PASSWORD', ''),
    ORG_USER_EMAIL: getEnvVar('ORG_USER_EMAIL', '')
};

// Optional: Export individual getters for sensitive data
export const getSecureVar = (name) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Secure environment variable ${name} is not set`);
    }
    return value;
};

