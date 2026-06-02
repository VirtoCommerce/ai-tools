import { config } from 'dotenv';

// Layered env loader. Precedence (later overrides earlier):
//   1. .env.defaults       — cross-env constants (sandbox cards, builder.io URL)
//   2. .env.${TEST_ENV}    — per-env URLs/identifiers (vcst | vcptcore | virtostart)
//   3. .env.local          — secrets (passwords, tokens) — gitignored
//   4. process.env         — already wins (CI passes via -e flags)
// The legacy single .env file is loaded last as a backwards-compat fallback —
// it fills gaps but does NOT override the above. Remove once everyone migrates.
const TEST_ENV = process.env.TEST_ENV || 'vcst';

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
config({ path: '.env' });

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
// Required = core flows (URLs, storefront/admin auth, base payment cards) that must exist for any suite to run.
// Scope-specific vars (staging, 3DS, lockout, BrowserStack) are optional — suites that need them fail fast at runtime.
const requiredVars = [
    'FRONT_URL',
    'BACK_URL',
    'STORYBOOK_URL',
    'STORYBOOK_DEV_URL',
    'ADMIN',
    'ADMIN_PASSWORD',
    'USER_EMAIL',
    'USER_PASSWORD',
    'USER2_EMAIL',
    'USER2_PASSWORD',
    'STORE_ID',
    'SKYFLOW_MASTERCARD',
    'SKYFLOW_EXPIRY',
    'SKYFLOW_CVV',
    'CYBERSOURCE_CARD',
    'CYBERSOURCE_EXPIRY',
    'CYBERSOURCE_CVV',
    'AUTHORIZNET_CARD',
    'AUTHORIZNET_EXPIRY',
    'AUTHORIZNET_CVV',
    'DATATRANCE_MASTERCARD',
    'DATATRANCE_EXPIRY',
    'DATATRANCE_CVV',
    'DATATRANCE_OTP',
    'FIGMA_API_KEY',
    'POSTMAN_API_KEY'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars.join(', '));
    process.exit(1);
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

