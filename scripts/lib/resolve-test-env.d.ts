/**
 * Resolve the active TEST_ENV from (in precedence order): process.env.TEST_ENV,
 * a gitignored `.env.test-env` file, then `fallback`. Writes the result back to
 * process.env.TEST_ENV. See resolve-test-env.js for full docs.
 */
export declare function resolveTestEnv(fallback?: string): string;

/** What picked the env: the environment's TEST_ENV, this session's binding, .env.test-env, or the default. */
export type TestEnvSource = 'TEST_ENV' | 'session' | '.env.test-env' | 'default';

/** The TEST_ENV resolveTestEnv() would pick and its source, without side effects. */
export declare function testEnvChoice(fallback?: string): { env: string; source: TestEnvSource };

/** This Claude Code session's binding file (`.vc-fix/session-env/<id>`), or null outside a session. */
export declare function sessionEnvFile(sessionId?: string): string | null;

/** Valid TEST_ENV names: `[a-z0-9_]+`, so `KEY${envSuffix(env)}` is a valid variable name. */
export declare const TEST_ENV_PATTERN: RegExp;

/** `_<ENV>` for an env (vcst_qa → `_VCST_QA`): the suffix every loader promotes over `.env.local`. */
export declare function envSuffix(testEnv: string): string;
