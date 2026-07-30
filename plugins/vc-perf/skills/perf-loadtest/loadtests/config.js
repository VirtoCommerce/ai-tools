// Store context constants (userId comes from the auth token at runtime).
// All values come from the profile's perf block in project-profile.json — pass them
// through as env vars (k6 has no direct file-read access to project-profile.json).
export const STORE = {
    // no baked-in store default — set per deployment
    storeId: __ENV.STORE_ID || '',
    currencyCode: __ENV.CURRENCY_CODE || 'USD',
    cultureName: __ENV.CULTURE_NAME || 'en-US',
};
