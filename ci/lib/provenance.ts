/**
 * Frontend provenance routing — the "is this bug in the CLIENT's customization or in
 * the PLATFORM's code?" decision for a storefront that is a vc-frontend fork/copy.
 *
 * A client storefront is almost always a fork of VirtoCommerce/vc-frontend: some files
 * are modified/added (client customization), the rest are byte-identical to the platform.
 * The symptom alone can't tell them apart — only the CODE PROVENANCE of the RCA anchor
 * can. Given the anchor's presence/identity vs the upstream ref (both fetched by the
 * caller via the GitHub/Azure Repos APIs — this module is a PURE decision), classify
 * ownership and decide how the fix is delivered under the deployment's policy.
 *
 * Both /qa-fix (interactive) and ci/run-fix-cycle.ts (headless) call these so the
 * decision can't drift between the twins. See .claude/rules/quality-gates.md §1a/§2a.
 */
import type { RepoOwnership } from "./repo-router.js";

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface ProvenanceVerdict {
  ownership: RepoOwnership;
  confidence: Confidence;
  /** Set when the bug is platform code already fixed upstream — an upgrade, not a fix. */
  bailClass?: "already-fixed-upstream";
  note: string;
}

/**
 * Signals the caller gathers by comparing the RCA anchor (file[:line] from the /qa-bug
 * Fix Routing block) between the client repo and the upstream platform repo at the
 * fork's `upstreamRef`:
 *  - anchorInClient     — the anchor file exists in the client repo
 *  - anchorInUpstream   — it also exists in vc-frontend @ upstreamRef
 *  - filesIdentical     — when in both: byte-identical? (null ⇒ couldn't compare)
 *  - fixedOnUpstreamHead — when identical & the defect is confirmed: is it already fixed
 *                          on the upstream default branch? (null/undefined ⇒ not checked)
 */
export interface ProvenanceSignals {
  anchorInClient: boolean;
  anchorInUpstream: boolean;
  filesIdentical: boolean | null;
  fixedOnUpstreamHead?: boolean | null;
}

/**
 * Classify a storefront bug as client-owned vs platform-owned from its RCA-anchor
 * provenance. Containment-first: whenever provenance can't be established, the verdict
 * is `client` + LOW (⇒ /qa-fix STOPs for human routing) — never a speculative upstream
 * route on maybe-client code (§2a).
 */
export function classifyFrontendProvenance(s: ProvenanceSignals): ProvenanceVerdict {
  if (!s.anchorInClient) {
    return {
      ownership: "client",
      confidence: "LOW",
      note: "RCA anchor not found in the client repo — provenance unestablished; treat as client and STOP (containment-first, §2a).",
    };
  }
  if (!s.anchorInUpstream) {
    return {
      ownership: "client",
      confidence: "HIGH",
      note: "RCA anchor exists ONLY in the client repo (custom component/page) — fix in the client fork.",
    };
  }
  if (s.filesIdentical === null) {
    return {
      ownership: "client",
      confidence: "LOW",
      note: "RCA anchor is in both client and upstream but content couldn't be compared — treat as client and STOP (containment-first).",
    };
  }
  if (s.filesIdentical === false) {
    return {
      ownership: "client",
      confidence: "HIGH",
      note: "RCA anchor DIFFERS from upstream — the defect lives in the client customization; fix in the client fork.",
    };
  }
  // Byte-identical to unmodified upstream ⇒ platform code.
  if (s.fixedOnUpstreamHead === true) {
    return {
      ownership: "platform",
      confidence: "MEDIUM",
      bailClass: "already-fixed-upstream",
      note: "RCA anchor is identical to upstream and ALREADY FIXED on the upstream default branch — the client needs a fork sync / platform upgrade, not a new fix.",
    };
  }
  return {
    ownership: "platform",
    confidence: "HIGH",
    note: "RCA anchor is byte-identical to unmodified upstream code — this is a platform bug.",
  };
}

export type FrontendDeliveryPolicy = "fork-and-issue" | "fork-only" | "upstream-only";

export interface DeliveryPlan {
  /**
   *  - fix-client-fork  — patch the client's own storefront repo (repairs the site now)
   *  - upstream-normal  — the ordinary platform path (direct or fork PR per contributionPlan)
   *  - stop-upgrade     — don't fix; the platform bug is already fixed upstream, so the
   *                       client should sync the fork / upgrade rather than re-fix
   */
  action: "fix-client-fork" | "upstream-normal" | "stop-upgrade";
  /** Additionally file a platform-generic upstream GitHub ISSUE (never a client-code PR). */
  fileUpstreamIssue: boolean;
  reason: string;
}

/**
 * Turn an ownership verdict into a concrete delivery action under the deployment's
 * frontend-delivery policy. Pure. Keeps §2a intact: a client-owned bug never routes
 * upstream; `fileUpstreamIssue` only ever attaches an ISSUE (no client code) to a
 * PLATFORM-owned bug on a client deployment.
 */
export function frontendDeliveryPlan(s: {
  ownership: RepoOwnership;
  projectType: "platform" | "client";
  policy: FrontendDeliveryPolicy;
  bailClass?: string;
}): DeliveryPlan {
  if (s.ownership === "client") {
    return { action: "fix-client-fork", fileUpstreamIssue: false, reason: "Client-owned code — fix in the client fork." };
  }
  // platform-owned bug
  if (s.projectType === "platform") {
    return { action: "upstream-normal", fileUpstreamIssue: false, reason: "Native platform — ordinary upstream PR path." };
  }
  // platform-owned bug on a CLIENT deployment
  if (s.bailClass === "already-fixed-upstream") {
    return {
      action: "stop-upgrade",
      fileUpstreamIssue: false,
      reason: "Already fixed upstream — the client should sync the fork / upgrade the platform version rather than re-fix.",
    };
  }
  if (s.policy === "upstream-only") {
    return {
      action: "upstream-normal",
      fileUpstreamIssue: false,
      reason: "Policy upstream-only — PR/issue upstream; the client picks up the fix on the next release + fork sync.",
    };
  }
  // fork-and-issue (default) or fork-only
  return {
    action: "fix-client-fork",
    fileUpstreamIssue: s.policy === "fork-and-issue",
    reason:
      s.policy === "fork-and-issue"
        ? "Patch the client fork to repair the site now; file a platform-generic upstream issue so VirtoCommerce fixes the root cause."
        : "Patch the client fork to repair the site now (fork-only policy — no upstream signal).",
  };
}
