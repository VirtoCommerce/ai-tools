import { config } from 'dotenv';

// Load environment variables from .env file
config({ path: '.env' });

// Validate required environment variables
const requiredVars = [
    'VCST_FRONT_URL',
    'VCST_BACK_URL',
    'VIRTO_START_FRONT',
    'VIRTO_START_BACK',
    'ADMIN',
    'ADMIN_PASSWORD',   
    'USER_EMAIL',
    'USER_PASSWORD',
    'USER2_EMAIL',
    'USER2_PASSWORD',
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
    'AUTHORIZNET_CARD',
    'AUTHORIZNET_EXPIRY',
    'AUTHORIZNET_CVV',
    'DATATRANCE_MASTERCARD',
    'DATATRANCE_EXPIRY',
    'DATATRANCE_CVV',
    'DATATRANCE_OTP',
    'FIGMA_API_KEY',
    'BROWSERSTACK_USERNAME',
    'BROWSERSTACK_ACCESS_KEY'
    
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
    VCST_FRONT_URL: getEnvVar('VCST_FRONT_URL'),
    VCST_BACK_URL: getEnvVar('VCST_BACK_URL'),
    VIRTO_START_FRONT: getEnvVar('VIRTO_START_FRONT'),
    VIRTO_START_BACK: getEnvVar('VIRTO_START_BACK'),
    
    // Admin credentials
    ADMIN: getEnvVar('ADMIN'),
    ADMIN_PASSWORD: getEnvVar('ADMIN_PASSWORD'),
    
    // User credentials
    USER_EMAIL: getEnvVar('USER_EMAIL'),
    USER_PASSWORD: getEnvVar('USER_PASSWORD'),
    USER2_EMAIL: getEnvVar('USER2_EMAIL'),
    USER2_PASSWORD: getEnvVar('USER2_PASSWORD'),
    USER_VIRTO: getEnvVar('USER_VIRTO'),
    USER_VIRTO_PASSWORD: getEnvVar('USER_VIRTO_PASSWORD'),
    
    // Store configuration
    STORE_ID: getEnvVar('STORE_ID'),
    
    // Skyflow payment configuration
    SKYFLOW_VISA: getEnvVar('SKYFLOW_VISA'),
    SKYFLOW_MASTERCARD: getEnvVar('SKYFLOW_MASTERCARD'),
    SKYFLOW_EXPIRY: getEnvVar('SKYFLOW_EXPIRY'),
    SKYFLOW_CVV: getEnvVar('SKYFLOW_CVV'),   

    
    // CyberSource payment configuration
    CYBERSOURCE_CARD: getEnvVar('CYBERSOURCE_CARD'),
    CYBERSOURCE_EXPIRY: getEnvVar('CYBERSOURCE_EXPIRY'),
    CYBERSOURCE_CVV: getEnvVar('CYBERSOURCE_CVV'),
    
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

    // Browserstack credentials
    BROWSERSTACK_USERNAME: getEnvVar('BROWSERSTACK_USERNAME'),
    BROWSERSTACK_ACCESS_KEY: getEnvVar('BROWSERSTACK_ACCESS_KEY')
};

// Optional: Export individual getters for sensitive data
export const getSecureVar = (name) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Secure environment variable ${name} is not set`);
    }
    return value;
};

