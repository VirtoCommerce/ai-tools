import { env } from './config.js';

// Mask values — never print raw secrets. Report presence + length only.
// If you need to see a value, read .env directly.
const report = (name) => {
    const value = env[name];
    if (value === undefined || value === null || value === '') {
        console.log(`${name}: EMPTY`);
    } else {
        console.log(`${name}: SET (len=${String(value).length})`);
    }
};

[
    'FRONT_URL',
    'BACK_URL',
    'VIRTO_START_FRONT',
    'VIRTO_START_BACK',
    'STORYBOOK_URL',
    'STORYBOOK_DEV_URL',
    'ADMIN',
    'ADMIN_PASSWORD',
    'USER2_EMAIL',
    'USER2_PASSWORD',
    'USER_EMAIL',
    'USER_PASSWORD',
    'USER_VIRTO',
    'USER_VIRTO_PASSWORD',
    'STORE_ID',
    'SKYFLOW_VISA',
    'SKYFLOW_MASTERCARD',
    'SKYFLOW_EXPIRY',
    'SKYFLOW_CVV',
    'CYBERSOURCE_CARD',
    'CYBERSOURCE_EXPIRY',
    'CYBERSOURCE_CVV',
    'CYBERSOURCE_3DS_FRICTIONLESS_CARD',
    'CYBERSOURCE_3DS_CHALLENGE_CARD',
    'CYBERSOURCE_3DS_OTP',
    'LOCKOUT_TEST_EMAIL',
    'LOCKOUT_TEST_PASSWORD',
    'MULTI_ORG_USER_EMAIL',
    'MULTI_ORG_USER_PASSWORD',
    'ORG_USER_EMAIL',
    'EUR_USER_EMAIL',
    'EUR_USER_PASSWORD',
    'AUTHORIZNET_CARD',
    'AUTHORIZNET_EXPIRY',
    'AUTHORIZNET_CVV',
    'DATATRANCE_MASTERCARD',
    'DATATRANCE_EXPIRY',
    'DATATRANCE_CVV',
    'DATATRANCE_OTP',
    'FIGMA_API_KEY',
    'BROWSERSTACK_USERNAME',
    'BROWSERSTACK_ACCESS_KEY',
    'POSTMAN_API_KEY',
].forEach(report);
