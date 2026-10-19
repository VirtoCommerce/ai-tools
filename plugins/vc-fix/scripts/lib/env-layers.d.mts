/**
 * Type declarations for `env-layers.mjs` — where an env's files are (the project root and the QA_ENV_PATH
 * folders) and the one order every loader applies them in, the master password included. See env-layers.mjs.
 */

/** `.env.playwright.master` — the master password's file, in the project root. */
export declare const MASTER_FILE: string;
/** `MASTER_PASSWORD` — the one name a lane types on a master stand. */
export declare const MASTER_NAME: string;
/** `.env.<name>` files that are not envs (local, defaults, backup, master). */
export declare const NOT_AN_ENV: Set<string>;

/** A login password name (`X_PASSWORD`), never a token/key-shaped one. */
export declare function isLoginSecretName(name: string): boolean;
/** A dotenv file's pairs, or null when it cannot be read. */
export declare function readEnvFile(file: string): Record<string, string> | null;

export interface LookupOptions {
  /** The run's ticket for `<ticket>` (default: QA_TICKET, else the session's bound run; null: none). */
  ticket?: string | null;
  /** The project root (default: the cwd). */
  root?: string;
  /** The environment before any loading (default: process.env). */
  ambient?: Record<string, string | undefined>;
}

/** QA_ENV_PATH's folders as written. */
export declare function envPathTemplates(options?: { root?: string; ambient?: Record<string, string | undefined> }): string[];
/** The run's ticket: the given one, else QA_TICKET, else the session's bound run; or null. */
export declare function currentTicket(options?: LookupOptions): string | null;
/** The dedicated folders for an env, absolute, highest priority first. */
export declare function envFolders(options?: LookupOptions & { env?: string }): string[];
/** The file that defines an env (a dedicated folder's first, else the root's), or null. */
export declare function findEnv(env: string, options?: LookupOptions): string | null;
/** What an env declares itself: its `.env.<env>` files (`vars`) and `.env.playwright.<env>` files (`passwords`), merged, dedicated over root. */
export declare function ownEnv(env: string, options?: LookupOptions): { vars: Record<string, string>; passwords: Record<string, string> };
/** The envs the project root defines. */
export declare function knownEnvs(root?: string): string[];
/** Where an unknown env was looked for, for an error message. */
export declare function lookedIn(env: string, options?: LookupOptions): string;
/** Every env file in the dedicated folders, across every ticket (`secrets`: a `.env.playwright.<env>`). */
export declare function dedicatedEnvs(options?: { root?: string; ambient?: Record<string, string | undefined> }): { env: string; ticket: string | null; dir: string; file: string; secrets: boolean }[];

/** Whether a layered env says PASSWORDS=master. */
export declare function usesMaster(env: Record<string, string | undefined> | null | undefined): boolean;
/** The master password and its file; value null when there is none. */
export declare function readMaster(options?: { root?: string; ambient?: Record<string, string | undefined> }): { file: string; value: string | null };
/** The test accounts' login-password names: the CORE two, `extra`, and every name the suites and test-data use. */
export declare function testAccountPasswordNames(root?: string, extra?: Iterable<string>): Set<string>;

export interface Layered {
  env: Record<string, string | undefined>;
  ticket: string | null;
  /** Whether the project root has `.env.<env>`. */
  rootFile: boolean;
  /** The dedicated files that applied, lowest priority first. */
  dedicated: string[];
  /** Keys a dedicated file set. */
  dedicatedKeys: Set<string>;
  /** Keys holding this env's own value: a KEY_<ENV> pin, a dedicated file, the master password. */
  perEnv: Set<string>;
  /** Set when the env says PASSWORDS=master. */
  master: { file: string; found: boolean; names: string[] } | null;
  /** What supplied a key's value. */
  sourceOf(key: string): string;
}

export interface LayerOptions extends LookupOptions {
  /** What the environment already holds beats every file and pin (CI `-e`). */
  ambientWins?: boolean;
  /** Test-account password names beyond the scan (a role registry). */
  passwordNames?: Iterable<string>;
}

/** An env's variables in the one order, without touching process.env. */
export declare function layered(testEnv: string, options?: LayerOptions): Layered;
/** `layered`, written into process.env, with the once-per-run warnings. */
export declare function applyLayered(testEnv: string, options?: Omit<LayerOptions, 'ambient'>): Layered;
