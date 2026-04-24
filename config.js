import { config } from 'dotenv';

// Load environment variables from .env file
config({ path: '.env' });

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
    // Application URLs
    FRONT_URL: getEnvVar('FRONT_URL'),
    BACK_URL: getEnvVar('BACK_URL'),
    VIRTO_START_FRONT: getEnvVar('VIRTO_START_FRONT', ''),
    VIRTO_START_BACK: getEnvVar('VIRTO_START_BACK', ''),
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

