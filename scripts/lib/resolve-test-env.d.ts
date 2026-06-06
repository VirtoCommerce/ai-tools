/**
 * Resolve the active TEST_ENV from (in precedence order): process.env.TEST_ENV,
 * a gitignored `.env.test-env` file, then `fallback`. Writes the result back to
 * process.env.TEST_ENV. See resolve-test-env.js for full docs.
 */
export declare function resolveTestEnv(fallback?: string): string;
