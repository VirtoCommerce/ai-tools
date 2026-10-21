/**
 * Type declarations for `run-dir.mjs` — a ticket run's folder (`QA_OUTPUT_DIR` template, its layout, the
 * session's bound run). See run-dir.mjs for the rules.
 */

/** Where a project's state goes: VC_FIX_HOME, else the cwd. Relative templates resolve against it. */
export declare function outputRoot(): string;
/** The template when `QA_OUTPUT_DIR` is unset; `<env>` is appended like any template's. */
export declare const DEFAULT_TEMPLATE: string;
/** A tracker key: Jira-style VCST-1234, or a bare-number Azure Boards id. */
export declare const TICKET_KEY: RegExp;

/** A sprint's folder name (`Sprint26-21`): any number of digits on each side, as `reports:prune` reads it. */
export declare const SPRINT_DIR: RegExp;

/** `Sprint-current`, else the numerically newest `reports/tickets/Sprint<n>-<n>`, else null. */
export declare function resolveSprint(root?: string): string | null;

/** `QA_OUTPUT_DIR` (trimmed) or the default template. */
export declare function runDirTemplate(env?: Record<string, string | undefined>): string;

/** The template with `/<ticket>` and then `/<env>` appended where it lacks them. */
export declare function completeTemplate(template: string): string;

/** The absolute run folder of one ticket on one env. Throws on a bad key, env or unresolvable `<sprint>`. */
export declare function resolveRunDir(opts: { ticket: string; env: string; sprint?: string | null; template?: string; root?: string }): string;

export interface RunLayout {
  dir: string; summary: string; verdict: string; strategy: string; checklist: string; model: string;
  screenshots: string; exploratory: string; bugs: string; knowledge: string; domain: string;
  schema: string; schemaCache: string; fixturesReport: string;
}

/** Where each artifact of a run lives inside its folder. */
export declare function runLayout(dir: string): RunLayout;

/** The directories matching an absolute path whose segments may hold `*` (one segment each). */
export declare function globDirs(pattern: string): string[];

/** Every existing run folder of a ticket (all envs, both templates, the pre-env layouts); env null when pre-env. */
export declare function priorRunDirs(opts: { ticket: string; template?: string; root?: string }): { dir: string; env: string | null }[];

/** The ticket key a run folder belongs to (its last path segment shaped like one), or null. */
export declare function ticketOfRunDir(dir: string): string | null;

/** Every existing run folder of every ticket, as priorRunDirs finds them. */
export declare function allRunDirs(opts?: { template?: string; root?: string }): { dir: string; env: string | null; ticket: string }[];

/** The run's screenshot folder in the form a Playwright lane can write (project-relative), or null outside the project. */
export declare function laneScreenshots(dir: string, root?: string): string | null;

/** This session's bound run, or null. */
export declare function sessionRun(sessionId?: string, root?: string): { dir: string; ticket: string; env: string } | null;

/** The bound run's path for a layout key when its ticket and env match (or are not given); else null. */
export declare function sessionRunPath(key: keyof RunLayout, filter?: { ticket?: string; env?: string }): string | null;
