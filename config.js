import dotenv from 'dotenv';

dotenv.config();

export const env = {
    VCST_FRONT_URL: process.env.VCST_FRONT_URL,
    VCST_BACK_URL: process.env.VCST_BACK_URL,
    VIRTO_START_FRONT: process.env.VIRTO_START_FRONT,
    VIRTO_START_BACK: process.env.VIRTO_START_BACK,
    ADMIN: process.env.ADMIN,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD, 
    FRONT_ADMIN: process.env.FRONT_ADMIN,
    FRONT_ADMIN_PASSWORD: process.env.FRONT_ADMIN_PASSWORD,
    USER_EMAIL: process.env.USER_EMAIL,
    USER_PASSWORD: process.env.USER_PASSWORD,
    USER2_EMAIL: process.env.USER2_EMAIL,
    USER2_PASSWORD: process.env.USER2_PASSWORD,
    STORE_ID: process.env.STORE_ID,

    SKYFLOW_VISA: process.env.SKYFLOW_VISA,
    SKYFLOW_MASTERCARD: process.env.SKYFLOW_MASTERCARD,
    SKYFLOW_EXPIRY: process.env.SKYFLOW_EXPIRY,
    SKYFLOW_CVV: process.env.SKYFLOW_CVV,
    CVV: process.env.CVV,
    EXPIRY: process.env.EXPIRY,    
    CARD_HOLDER: process.env.CARD_HOLDER,
    CARD_EXPIRY: process.env.CARD_EXPIRY,

    CYBERSOURCE_CARD: process.env.CYBERSOURCE_CARD,    
    CYBERSOURCE_EXPIRY: process.env.CYBERSOURCE_EXPIRY,  
    CYBERSOURCE_CVV: process.env.CYBERSOURCE_CVV,

    AUTHORIZNET_CARD: process.env.AUTHORIZNET_CARD,
    AUTHORIZNET_EXPIRY: process.env.AUTHORIZNET_EXPIRY,
    AUTHORIZNET_CVV: process.env.AUTHORIZNET_CVV
  
}

