/**
 * GithubVcs — Vcs implementation over the `gh` CLI. This is the DEFAULT host and
 * its `direct`-mode openPullRequest is the verbatim equivalent of the
 * `gh pr create --repo … --draft …` call that used to live inline in
 * run-fix-cycle.ts, so VirtoCommerce-internal runs are unchanged.
 *
 * Adds two profile-driven extensions used only by a CLIENT deployment:
 *   - fork-mode PRs: `--head <forkOwner>:<branch>` (operator = client contributes
 *     to the VirtoCommerce upstream from their own fork);
 *   - fileIssue (with title-dedup) + ensureFork, for platform bugs that are real
 *     but not auto-fixable (G0/G1 BAIL with class too-complex|multi-repo).
 *
 * Auth: whatever `gh` is authenticated as (ambient `gh auth login`, or a
 * GH_TOKEN/GITHUB_FIX_BUGS_TOKEN exported by the caller). This module stays
 * token-name-agnostic — it just runs `gh`.
 */
import { execSync } from "child_process";
import type { Vcs, VcsDeps, PrSpec, IssueSpec } from "./vcs.js";

function sh(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export class GithubVcs implements Vcs {
  readonly kind = "github" as const;
  readonly enabled: boolean;
  private dryRun: boolean;
  private log: (msg: string) => void;

  constructor(deps: VcsDeps) {
    this.dryRun = deps.dryRun;
    this.log = deps.log;
    // `gh` present on PATH ⇒ usable. (run-fix-cycle's validateEnv already proves
    // `gh --version`; auth is verified at push time.)
    let ok = false;
    try {
      execSync("gh --version", { stdio: "ignore" });
      ok = true;
    } catch {
      ok = false;
    }
    this.enabled = ok;
  }

  async openPullRequest(spec: PrSpec): Promise<string> {
    const head = spec.forkOwner ? `${spec.forkOwner}:${spec.workBranch}` : spec.workBranch;
    const labelArgs = (spec.labels || [])
      .map((l) => `--label ${JSON.stringify(l)}`)
      .join(" ");
    const cmd =
      `gh pr create --repo ${spec.targetRepo}${spec.draft ? " --draft" : ""} ` +
      `--base ${spec.baseBranch} --head ${JSON.stringify(head)} ` +
      `--title ${JSON.stringify(spec.title)} --body-file ${JSON.stringify(spec.bodyFile)} ` +
      labelArgs;

    if (this.dryRun) {
      this.log(`gh: (dry-run) would open PR on ${spec.targetRepo} (head ${head}): ${spec.title}`);
      return "(dry-run — no PR created)";
    }
    return sh(cmd);
  }

  async fileIssue(spec: IssueSpec): Promise<string> {
    // Dedup: if an OPEN issue with the same title already exists on the repo,
    // return it rather than filing a duplicate (the pipeline may re-see the same
    // unfixable platform bug across runs).
    if (!this.dryRun) {
      try {
        const found = sh(
          `gh issue list --repo ${spec.repo} --state open ` +
            `--search ${JSON.stringify(`${spec.title} in:title`)} --json number,title,url`,
        );
        const arr = JSON.parse(found || "[]") as Array<{ title: string; url: string }>;
        const hit = arr.find((i) => i.title.trim() === spec.title.trim());
        if (hit) {
          this.log(`gh: issue already exists on ${spec.repo} — reusing ${hit.url}`);
          return hit.url;
        }
      } catch {
        /* search failure is non-fatal — fall through to create */
      }
    }

    const labelArgs = (spec.labels || [])
      .map((l) => `--label ${JSON.stringify(l)}`)
      .join(" ");
    const cmd =
      `gh issue create --repo ${spec.repo} ` +
      `--title ${JSON.stringify(spec.title)} --body-file ${JSON.stringify(spec.bodyFile)} ` +
      labelArgs;

    if (this.dryRun) {
      this.log(`gh: (dry-run) would file issue on ${spec.repo}: ${spec.title}`);
      return "(dry-run — no issue created)";
    }
    return sh(cmd);
  }

  async ensureFork(repo: string, forkOwner: string): Promise<void> {
    if (this.dryRun) {
      this.log(`gh: (dry-run) would ensure fork ${forkOwner}/${repo.split("/")[1]}`);
      return;
    }
    // Idempotent: `gh repo fork` succeeds (and prints the existing fork) when the
    // fork already exists. --clone=false: we clone it ourselves in checkoutForFix.
    try {
      sh(`gh repo fork ${repo} --clone=false`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // A pre-existing fork can still surface as a non-zero exit on some gh
      // versions; treat "already exists" as success.
      if (/already exists/i.test(msg)) {
        this.log(`gh: fork of ${repo} already exists`);
        return;
      }
      throw err;
    }
  }
}
