/**
 * Type declarations for project-profile.mjs so the TypeScript side (ci/lib/*,
 * ci/run-fix-cycle.ts) gets real types under strict mode instead of implicit any.
 * Keep in sync with PROFILE_DEFAULTS in project-profile.mjs.
 */
export interface ProfileRepo {
  name: string;
  kind?: "frontend" | "module" | "platform";
  host?: "github" | "azure-repos";
  defaultBranch?: string;
  /** The platform repo a client fork was derived from (provenance). */
  upstream?: string;
  /** A concrete, resolvable upstream tag (the fork line's base, e.g. "2.49.0"). */
  upstreamRef?: string;
  /** Whether upstreamRef was verified to resolve in the upstream repo at discovery. */
  upstreamRefResolved?: boolean;
  /** The fork's own package.json version (e.g. "2.49.7"), kept for reference. */
  forkVersion?: string;
}

/** One discovered field of a work-item type's process contract (VCST-5582 E-a). */
export interface BugContractField {
  ref: string;
  name: string;
  /** `alwaysRequired` — PROCESS-level only; conditional form rules are not covered. */
  required: boolean;
  /** html | plainText | string | picklistString | identity | treePath | integer | … */
  type: string;
  allowedValues?: string[];
  defaultValue?: string;
}

export interface ProjectProfile {
  projectType: "platform" | "client";
  operator: "virto-engineer" | "client" | "ask";
  tracker: {
    kind: "jira" | "azure";
    baseUrl: string;
    projectKey: string;
    /**
     * Per-work-item-type BUG FIELD CONTRACT, discovered by /project-init (VCST-5582 E).
     * Empty ⇒ metadata unreachable ⇒ the create path uses "unverified defaults".
     */
    fields?: Record<string, BugContractField[]>;
    /** Operator-owned semantic-slot → field-ref override (and the persisted answers). */
    fieldMap?: Record<string, string>;
    /** Per-deployment constants the operator confirmed once, e.g. { "Custom.Environment": "QA" }. */
    fieldDefaults?: Record<string, string>;
    azure: {
      organization: string;
      project: string;
      team: string;
      stateMap: Record<string, string>;
    };
  };
  vcs: {
    clientHost: "github" | "azure-repos";
    clientOrg: string;
    azure: { organization: string; project: string };
    auth: "gh-cli" | "pat" | "az-login";
    /** Env var holding the client host's write credential ("" ⇒ ambient session). */
    authEnv?: string;
    /**
     * PROBED kind of the GitHub credential (VCST-5582 A). "" = never probed.
     * A `fine-grained` PAT can NEVER take the upstream fork/fork-PR/issue path — it is
     * read-only on public repos it does not own — so consumers must gate on
     * `githubForkCapable === "yes"`, treating "" / "unknown" as NOT capable.
     */
    githubTokenKind?: "" | "classic" | "fine-grained" | "gh-cli" | "none";
    githubForkCapable?: "" | "yes" | "no" | "unknown";
  };
  upstream: {
    host: "github";
    org: string;
    fileIssues: boolean;
    contributionMode: "fork" | "direct";
    clientGithubAccount: string;
  };
  repos: { client: ProfileRepo[]; platform: ProfileRepo[] };
  /** Opt-in for the passive session-telemetry CAPTURE hook. true ⇒ record to <outputRoot>/.vc-fix/; absent/false ⇒ the hook is a full no-op. */
  selfDiagnostics: boolean;
  /** Consent for UPSTREAM delivery of self-diagnostics (VCST-5509). Gates deliver.mjs only; local capture/diagnosis need no consent. off = never send; ask (default) = dry-run + confirm; auto = Issue auto-files, PR/fork-PR handed off. */
  feedback: { mode: "auto" | "ask" | "off" };
}

export const PROFILE_DEFAULTS: ProjectProfile;
export function loadProjectProfile(repoRoot?: string): ProjectProfile;
export function resetProjectProfileCache(): void;
