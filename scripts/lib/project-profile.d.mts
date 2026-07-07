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
}

export interface ProjectProfile {
  projectType: "platform" | "client";
  operator: "virto-engineer" | "client" | "ask";
  tracker: {
    kind: "jira" | "azure";
    baseUrl: string;
    projectKey: string;
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
  };
  upstream: {
    host: "github";
    org: string;
    fileIssues: boolean;
    contributionMode: "fork" | "direct";
    clientGithubAccount: string;
  };
  repos: { client: ProfileRepo[]; platform: ProfileRepo[] };
}

export const PROFILE_DEFAULTS: ProjectProfile;
export function loadProjectProfile(repoRoot?: string): ProjectProfile;
export function resetProjectProfileCache(): void;
