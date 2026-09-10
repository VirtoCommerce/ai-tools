#!/usr/bin/env node
/**
 * mirror:check — the `.claude/` ↔ `plugins/vc-fix/` mirror, declared rather than assumed.
 *
 * WHY. `vc-fix` is deliberately self-contained: it duplicates the root's `knowledge/`, agents,
 * hooks and several skills rather than referencing them, because Claude Code documents no reliable
 * way for an installed plugin to resolve a bare relative path against its own root (CLAUDE.md
 * §Project Overview). Duplication is therefore the design — but until now the only thing enforcing
 * it was `mirror-parity.test.mjs`, which listed the pairs that already happened to be identical.
 * Every other shared path was governed by prose, and the 2026-09-07 audit's item 13 measured the
 * result: 64 of 92 shared paths diverged, with no record anywhere of which divergences were meant.
 *
 * WHAT THIS CHANGES. Every shared path now lands in exactly one of three buckets, and the third
 * one must be DECLARED:
 *
 *   identical   byte-for-byte. Any drift fails.
 *   structural  identical once the paths that MUST differ between the two trees are normalised
 *               (see PATH_REWRITES). Any CONTENT drift fails. This bucket is new — those files
 *               were previously ungated, because byte-parity could never hold for them.
 *   forked      a real content difference, which must appear in FORKS with a reason. An
 *               UNDECLARED fork fails the gate; a declared fork that has become identical fails
 *               too, so the registry cannot rot (same burn-down shape as XREF_BASELINE).
 *
 * WHAT THE AUDIT GOT WRONG, measured here 2026-09-09. Item 13 proposed re-syncing the diverged
 * files. Checked one by one, the divergences are overwhelmingly DELIBERATE and a blind re-sync
 * would break the plugin: `vc-bug-catalog.md` de-links `skills/qa-sbtm/*` because vc-fix does not
 * ship it, `storefront-selectors.md` drops the `/qa-design` reference for the same reason,
 * `sign-off-templates.md` replaces `@qa-lead-orchestrator` with "assign in your tracker", and every
 * `skills/project-init/*` file is AHEAD of the root, not behind it. The 2026-09-08 BL/ECL re-sync
 * worked precisely because those two files carried no plugin-specific adaptation; that is the
 * exception, not the rule. So the deliverable is a declared, gated ledger — not a sync.
 *
 * Usage:  npm run mirror:check  [--json]
 * Exit:   0 = every shared path is identical, structural, or declared. 1 = otherwise.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const ROOT_DIR = ".claude";
export const PLUGIN_DIR = "plugins/vc-fix";
const EXTS = [".md", ".mjs", ".js", ".json"];

/**
 * Paths that are REQUIRED to differ between the two trees, mapped to a common token.
 *
 * Each entry is a structural fact about the two layouts, not a convenience:
 *  - the root cites the plugin by its in-repo path (`plugins/vc-fix/x`); inside the plugin that is
 *    just `x`;
 *  - `quality-gates.md` and the browser-lane reference moved out of the root's always-loaded
 *    `rules/` tier into `knowledge/execution/` (2026-09-07 audit action 3); the plugin keeps its
 *    own copies under its bundled `.claude/rules/`, which is correct for a plugin that ships them;
 *  - the `/qa-fix` routing data lives at `ci/config|lib/...` in the root and is relocated into
 *    `skills/qa-fix-routing/` in the plugin, which resolves it off `import.meta.url` (CLAUDE.md).
 *
 * Normalising these is what makes CONTENT drift visible. Without it a one-word change to a shared
 * doc hides behind a path difference that was always going to be there.
 */
export const PATH_REWRITES = [
  [/plugins\/vc-fix\//g, ""],
  [/(?:\.\.\/)*(?:ci\/config|skills\/qa-fix-routing)\/fix-repos\.json/g, "@FIXREPOS"],
  [/(?:\.\.\/)*(?:ci\/lib|skills\/qa-fix-routing)\/repo-router\.ts/g, "@ROUTER"],
  [/(?:\.\.\/)*(?:ci\/lib|skills\/qa-fix-routing)\/module-registry\.ts/g, "@MODREG"],
  [/(?:\.\.\/)*(?:ci\/config|skills\/qa-fix-routing)\/\.module-registry\.cache\.json/g, "@MODCACHE"],
  [/(?:\.\.\/)*(?:\.claude\/)?rules\/quality-gates\.md/g, "@QUALITY_GATES"],
  [/(?:\.\.\/)*(?:\.claude\/)?knowledge\/execution\/quality-gates\.md/g, "@QUALITY_GATES"],
  [/(?:\.\.\/)*(?:\.claude\/)?rules\/mcp-browsers\.md/g, "@BROWSERS"],
  [/(?:\.\.\/)*(?:\.claude\/)?knowledge\/execution\/browser-lanes\.md/g, "@BROWSERS"],
  [/(?:\.\.\/)*(?:\.claude\/)?rules\/([a-z-]+\.md)/g, "@RULES/$1"],
  [/(?:\.\.\/)*\.claude\//g, "@CLAUDE/"],
  // Strip the `../` prefix entirely rather than tokenising it. The two trees sit at different
  // depths, so `knowledge/foo.md` and `../../knowledge/foo.md` name the SAME target and must
  // compare equal; tokenising to `@REL/` made them differ, which forced a spurious FORKS entry —
  // and a FORKS entry exempts the file from content-drift detection for good. `*` cannot be used
  // here the way the anchored rules above use it: unanchored, it matches the empty string at
  // every position.
  [/(?:\.\.\/)+/g, ""],
  [/\.claude\//g, "@CLAUDE/"],
];

/** The closed vocabulary of reasons a shared path is allowed to fork. */
export const REASONS = {
  "plugin-scope":
    "vc-fix does not ship some surface the root has (suites, seeders, the qa-* agent roster, sibling skills), so the plugin copy omits or annotates it. Syncing would reintroduce references a client cannot follow.",
  "plugin-ahead":
    "the PLUGIN is canonical and the root copy is a fossil. /project-init is developed against the installed-plugin layout (VC_FIX_HOME vs CLAUDE_PLUGIN_ROOT), so the plugin gets the work and the root copy is not on any path that runs.",
  "root-ahead":
    "the ROOT is canonical and the plugin copy is a frozen snapshot. Needs a manual, adaptation-preserving re-sync — NOT an overwrite, because the plugin copy carries scope edits of its own.",
  "tracker-agnostic":
    "the root is JIRA-specific where the plugin must serve Azure Boards clients too, so the plugin speaks slots and tracker-neutral wording.",
  "plugin-frontmatter":
    "plugin-only skill frontmatter (e.g. disable-model-invocation) that would change behaviour if applied in this repo.",
  undecided:
    "DECLARED BUT NOT ADJUDICATED. Nobody has decided which side wins or why. This is the burn-down list — pick a side, record the real reason, and remove the entry.",
};

/**
 * Every shared path that legitimately differs, and why.
 *
 * Line counts are deliberately NOT stored here: a transcribed count is correct once and then rots
 * silently (.claude/rules/test-data.md GOLDEN RULE). `mirror:check` prints the live numbers.
 */
export const FORKS = {
  "agents/frontend-reviewer.md": "plugin-scope",
  "agents/fullstack-backend.md": "undecided",
  "agents/fullstack-frontend.md": "undecided",
  "agents/qa-backend-expert.md": "plugin-scope",
  "agents/qa-frontend-expert.md": "plugin-scope",
  "agents/qa-testing-expert.md": "plugin-scope",
  "knowledge/README.md": "plugin-scope",
  "knowledge/agents/README.md": "plugin-scope",
  "knowledge/agents/developers/shared-instructions.md": "undecided",
  "knowledge/agents/qa/shared-instructions.md": "plugin-scope",
  "knowledge/api/graphql-schema.md": "root-ahead",
  "knowledge/api/graphql-test-cases-runner.md": "plugin-scope",
  "knowledge/architecture/vc-frontend-architecture.md": "plugin-scope",
  "knowledge/architecture/vc-module-architecture.md": "undecided",
  "knowledge/automation/storefront-selectors.md": "plugin-scope",
  "knowledge/domain/catalog.md": "plugin-scope",
  "knowledge/domain/store-settings.md": "plugin-scope",
  "knowledge/execution/live-discovery.md": "plugin-scope",
  "knowledge/execution/module-suite-map.md": "plugin-scope",
  "knowledge/execution/tracker-ops.md": "undecided",
  "knowledge/oracles/critical-ui-scope.md": "plugin-scope",
  "knowledge/oracles/vc-bug-catalog.md": "plugin-scope",
  "skills/project-init/SKILL.md": "plugin-ahead",
  "skills/project-init/derive-context.mjs": "plugin-ahead",
  "skills/project-init/discover-repos.mjs": "plugin-ahead",
  "skills/project-init/ensure-session.mjs": "plugin-ahead",
  "skills/project-init/gen-mcp.mjs": "plugin-ahead",
  "skills/project-init/gen-profile.mjs": "plugin-ahead",
  "skills/project-init/probe-lib.mjs": "plugin-ahead",
  "skills/project-init/reconcile-profile.mjs": "plugin-ahead",
  "skills/project-init/scaffold-env.mjs": "plugin-ahead",
  "skills/project-init/scaffold-secrets.mjs": "plugin-ahead",
  "skills/project-init/verify-access.mjs": "plugin-ahead",
  "skills/project-init/write-env.mjs": "plugin-ahead",
  "skills/qa-checklist/SKILL.md": "plugin-scope",
  "skills/qa-checklist/backend-admin-checklists.md": "plugin-scope",
  "skills/qa-checklist/checklist-creation-guide.md": "plugin-scope",
  "skills/qa-checklist/domain-checklists.md": "plugin-scope",
  "skills/qa-checklist/graphql-checklist.md": "plugin-scope",
  // Was `plugin-frontmatter` until 2026-09-09, when the root copy gained an Integration row for
  // `/qa-postman bug-evidence`. vc-fix ships no qa-postman sibling, so that row's link is
  // unfollowable for a client — which is `plugin-scope` by definition, and it now outweighs the
  // frontmatter difference that originally justified the entry.
  "skills/qa-defect/SKILL.md": "plugin-scope",
  "skills/qa-defect/defect-lifecycle-workflow.md": "undecided",
  "skills/qa-defect/defect-report-templates.md": "tracker-agnostic",
  "skills/qa-evidence/SKILL.md": "plugin-frontmatter",
  "skills/qa-evidence/output-paths.md": "undecided",
  "skills/qa-evidence/sign-off-templates.md": "plugin-scope",
  "skills/qa-investigate/SKILL.md": "plugin-scope",
  "skills/qa-investigate/bug-investigation-flow.md": "undecided",
  "skills/qa-investigate/evidence-and-root-cause.md": "plugin-scope",
  "skills/qa-monitoring/SKILL.md": "plugin-scope",
  "skills/qa-risk/SKILL.md": "plugin-frontmatter",
  "skills/vc-docs/SKILL.md": "undecided",
  "skills/vc-self-check/SKILL.md": "undecided",
};

/**
 * The self-diagnostics containment core. These are held to BYTE identity and are called out
 * separately because a one-sided drift here is a security regression, not a documentation one:
 * both copies are registered and hooks are AND-gated, so a stale copy denies what the fresh one
 * allows, and the redaction / closed-schema upstream path is what keeps client data from leaving.
 * Originally guarded by `scripts/unit/mirror-parity.test.mjs` (PR #143).
 */
export const BYTE_IDENTICAL = [
  // Pairs held to BYTE identity, not merely content identity. Two separate reasons to be here:
  //
  //   1. The containment core below — a one-sided drift is a security regression.
  //   2. Everything else that IS byte-identical today. Without this ratchet a byte-gated pair can
  //      slide quietly into the `structural` bucket on a one-sided path edit, or into "equal after
  //      normalisation" on a line-ending flip — which is exactly the masking that hid the
  //      `business-logic.md` drift until the 2026-09-07 audit found 81 missing invariants (§4.3).
  //      The predecessor of this file asserted byte equality for these; losing that was a
  //      regression the buckets alone did not replace.
  //
  // A pair leaves this list only in the commit that deliberately forks it, with the reason added
  // to FORKS. `mirror:check` fails if a listed pair stops being byte-identical, and fails if an
  // unlisted pair has BECOME byte-identical (add it — the ratchet only tightens).
  "hooks/enforce-real-user.mjs",
  "hooks/expected.mjs",
  "hooks/redact.mjs",
  "hooks/session-telemetry.mjs",
  "knowledge/api/api-auth.md",
  "knowledge/api/graphiql-interaction.md",
  "knowledge/api/order-creation-matrix.md",
  "knowledge/api/platform-patterns.md",
  "knowledge/automation/browser-quirks.md",
  "knowledge/automation/storefront-config-flags.md",
  "knowledge/domain/products.md",
  "knowledge/domain/sitemap.md",
  "knowledge/execution/debugging-signals.md",
  "knowledge/execution/performance-thresholds.md",
  "knowledge/oracles/business-logic.md",
  "knowledge/oracles/e-commerce-edge-cases-library.md",
  "skills/angular-admin/angular-patterns.md",
  "skills/angular-admin/css-layout-patterns.md",
  "skills/angular-admin/scratch-harness-patterns.md",
  "skills/dotnet-fix/dotnet10-best-practices.md",
  "skills/dotnet-fix/fix-patterns.md",
  "skills/dotnet-unit-test/xunit-patterns.md",
  "skills/qa-risk/risk-prioritization-framework.md",
  "skills/vc-self-check/deliver.mjs",
  "skills/vc-self-check/upstream-reduce.mjs",
  "skills/vc-shell-fix/vc-shell-scratch-harness-patterns.md",
  "skills/vue-fix/vue-fix-patterns.md",
  "skills/vue-fix/vue3-best-practices.md",
  "skills/vue-unit-test/vitest-patterns.md",
];

export const CONTAINMENT_CORE = [
  "hooks/redact.mjs",
  "hooks/expected.mjs",
  "hooks/session-telemetry.mjs",
  "skills/vc-self-check/deliver.mjs",
  "skills/vc-self-check/upstream-reduce.mjs",
  // The AND-gated allowlist hook: both copies are registered, so the stale one denies what the
  // fresh one allows. Its own MIRROR NOTE records the 6-week drift that did exactly that
  // (REG-2026-09-07-2225). It was declared a permanent fork until 2026-09-09, which left the
  // "executable content is in lock-step" claim asserted by nobody.
  "hooks/enforce-real-user.mjs",
];

// --- mechanics ---------------------------------------------------------------------------------

/**
 * Directories that are never part of the mirror. `worktrees/` is not hypothetical: a checked-out
 * worktree under `.claude/` has already broken `context:check` once by doubling the corpus. The
 * walk also uses dirents rather than `statSync` and SKIPS symlinks — a dangling link anywhere
 * under either tree would otherwise throw ENOENT and take down a PR-blocking gate.
 */
const SKIP_DIRS = new Set(["node_modules", ".git", "worktrees", "dist", "build", "coverage"]);

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, base, out);
    } else if (entry.isFile() && EXTS.some((e) => entry.name.endsWith(e))) {
      out.push(relative(base, full).split("\\").join("/"));
    }
  }
  return out;
}

export function canonicalise(text) {
  let s = text.replace(/\r\n/g, "\n");
  for (const [re, to] of PATH_REWRITES) s = s.replace(re, to);
  return s;
}

/** `identical` · `structural` · `forked`. */
export function classify(rootText, pluginText) {
  if (rootText === pluginText) return "identical";
  if (canonicalise(rootText) === canonicalise(pluginText)) return "structural";
  return "forked";
}

/**
 * Lines present on exactly one side, after canonicalisation — the live drift size.
 *
 * A MULTISET difference, not set membership: with sets, a line duplicated on one side only reads
 * as present on both and the drift shows as 0. And when the two sides hold the same lines in a
 * different order the honest answer is 0/0 plus `reordered: true` — printing a bare "0 root-only /
 * 0 plugin-only" next to an undeclared fork reads as "no difference", which is the one thing this
 * number must never say about files that differ.
 */
export function driftSize(rootText, pluginText) {
  const count = (text) => {
    const m = new Map();
    for (const line of canonicalise(text).split("\n")) {
      if (!line.trim()) continue;
      m.set(line, (m.get(line) ?? 0) + 1);
    }
    return m;
  };
  const xs = count(rootText);
  const ys = count(pluginText);
  const excess = (a, b) => {
    let n = 0;
    for (const [line, c] of a) n += Math.max(0, c - (b.get(line) ?? 0));
    return n;
  };
  const rootOnly = excess(xs, ys);
  const pluginOnly = excess(ys, xs);
  return {
    rootOnly,
    pluginOnly,
    reordered: rootOnly === 0 && pluginOnly === 0 && canonicalise(rootText) !== canonicalise(pluginText),
  };
}

export function auditMirror(root = ROOT) {
  const a = new Set(walk(join(root, ROOT_DIR)));
  const b = new Set(walk(join(root, PLUGIN_DIR)));
  const shared = [...a].filter((p) => b.has(p)).sort();

  const buckets = { identical: [], structural: [], forked: [] };
  for (const p of shared) {
    const x = readFileSync(join(root, ROOT_DIR, p), "utf-8");
    const y = readFileSync(join(root, PLUGIN_DIR, p), "utf-8");
    const kind = classify(x, y);
    buckets[kind].push(kind === "forked" ? { path: p, ...driftSize(x, y) } : { path: p });
  }

  const forkedPaths = new Set(buckets.forked.map((f) => f.path));
  const sharedSet = new Set(shared);
  const identicalPaths = new Set(buckets.identical.map((f) => f.path));
  const eol = (t) => (t.includes("\r\n") ? "CRLF" : "LF");

  return {
    shared,
    rootOnly: [...a].filter((p) => !b.has(p)).length,
    pluginOnly: [...b].filter((p) => !a.has(p)).length,
    ...buckets,
    /** A fork nobody declared — the gate's whole point. */
    undeclared: buckets.forked.filter((f) => !Object.hasOwn(FORKS, f.path)),
    /**
     * Declared with a reason outside the vocabulary. `Object.hasOwn`, not `in`: `in` walks
     * Object.prototype, so "toString", "constructor" and "valueOf" passed the closed-vocabulary
     * check — in the CLI and in the unit test that was supposed to catch it.
     */
    badReason: buckets.forked.filter(
      (f) => Object.hasOwn(FORKS, f.path) && !Object.hasOwn(REASONS, FORKS[f.path]),
    ),
    /**
     * A declared fork that is no longer forked, split by WHY — because the remedy is opposite.
     * Conflating them told you to "delete the FORKS entry" for a pair whose plugin copy had been
     * DELETED, which turns a fork-by-omission green.
     */
    resyncedDeclarations: Object.keys(FORKS)
      .filter((p) => sharedSet.has(p) && !forkedPaths.has(p))
      .sort(),
    orphanedDeclarations: Object.keys(FORKS).filter((p) => !sharedSet.has(p)).sort(),
    /** Same split for the byte-gated list. */
    byteDrift: BYTE_IDENTICAL.filter((p) => sharedSet.has(p) && !identicalPaths.has(p)),
    byteOrphaned: BYTE_IDENTICAL.filter((p) => !sharedSet.has(p)),
    /** Byte-identical today but not on the ratchet — add it; the ratchet only tightens. */
    unratcheted: buckets.identical
      .map((f) => f.path)
      .filter((p) => !BYTE_IDENTICAL.includes(p))
      .sort(),
    /** Containment-core files that are not byte-identical. */
    containmentDrift: CONTAINMENT_CORE.filter((p) => !identicalPaths.has(p)),
    /**
     * Line-ending divergence on ANY shared path. `canonicalise` folds CRLF to LF so that a
     * structural comparison is possible at all — which means without this check a line-ending
     * flip is invisible, and that is precisely what hid the business-logic.md drift (audit §4.3).
     */
    eolDrift: shared.filter(
      (p) =>
        eol(readFileSync(join(root, ROOT_DIR, p), "utf-8")) !==
        eol(readFileSync(join(root, PLUGIN_DIR, p), "utf-8")),
    ),
    undecided: buckets.forked.filter((f) => FORKS[f.path] === "undecided"),
  };
}

// --- CLI ---------------------------------------------------------------------------------------

function main() {
  const r = auditMirror();
  const json = process.argv.includes("--json");
  if (json) {
    // stdout carries the JSON and NOTHING else, or `JSON.parse` on the output fails. Every human
    // line below — including the closing OK — is suppressed; failures still go to stderr.
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(
      `[mirror:check] ${r.shared.length} shared path(s) — ${r.identical.length} identical, ` +
        `${r.structural.length} structural, ${r.forked.length} declared fork(s). ` +
        `${r.rootOnly} .claude-only, ${r.pluginOnly} plugin-only.`,
    );
    const byReason = {};
    for (const f of r.forked) (byReason[FORKS[f.path] ?? "UNDECLARED"] ??= []).push(f);
    for (const k of Object.keys(byReason).sort()) console.log(`   ${String(byReason[k].length).padStart(3)}  ${k}`);
    if (r.undecided.length > 0) {
      console.log(
        `[mirror:check] burn-down: ${r.undecided.length} fork(s) declared "undecided" — nobody has picked a side:`,
      );
      for (const f of r.undecided)
        console.log(
          `     ${f.rootOnly} root-only / ${f.pluginOnly} plugin-only${f.reordered ? " (reordered)" : ""}  ${f.path}`,
        );
    }
  }

  let failed = false;
  const fail = (msg, rows) => {
    failed = true;
    console.error(`[mirror:check] FAIL — ${msg}`);
    for (const row of rows) console.error(`  - ${row}`);
  };
  if (r.containmentDrift.length > 0)
    fail(
      "the self-diagnostics containment core is NOT byte-identical. Both copies are registered and hooks are AND-gated, so the stale one denies what the fresh one allows",
      r.containmentDrift,
    );
  if (r.byteDrift.length > 0)
    fail(
      "pair(s) on the BYTE_IDENTICAL ratchet are no longer byte-identical. Re-sync them, or fork them deliberately: remove from BYTE_IDENTICAL and add to FORKS with a reason, in the same commit",
      r.byteDrift,
    );
  if (r.byteOrphaned.length > 0)
    fail(
      "pair(s) on the BYTE_IDENTICAL ratchet no longer exist in BOTH trees. Restore the missing copy, or delete the file from BOTH trees — do NOT just drop the entry",
      r.byteOrphaned,
    );
  if (r.eolDrift.length > 0)
    fail(
      "shared path(s) whose line endings differ between the trees. Normalisation folds CRLF to LF, so this is invisible to every other check here — and it is what hid the business-logic.md drift",
      r.eolDrift,
    );
  if (r.unratcheted.length > 0)
    fail(
      "pair(s) are byte-identical but not on the BYTE_IDENTICAL ratchet. Add them — a pair that matches today should not be free to drift tomorrow",
      r.unratcheted,
    );
  if (r.undeclared.length > 0)
    fail(
      `${r.undeclared.length} undeclared fork(s). Sync the pair, or add it to FORKS in scripts/maintenance/mirror-check.mjs with a reason from REASONS`,
      r.undeclared.map(
        (f) =>
          `${f.path}  (${f.rootOnly} root-only / ${f.pluginOnly} plugin-only${f.reordered ? ", same lines REORDERED or re-duplicated" : ""})`,
      ),
    );
  if (r.badReason.length > 0)
    fail("fork(s) declared with a reason outside the closed vocabulary", r.badReason.map((f) => `${f.path} → "${FORKS[f.path]}"`));
  if (r.resyncedDeclarations.length > 0)
    fail(
      "fork(s) declared in FORKS that are no longer forked — delete the entry so the ledger stays honest",
      r.resyncedDeclarations,
    );
  if (r.orphanedDeclarations.length > 0)
    fail(
      "fork(s) declared in FORKS that no longer exist in BOTH trees. This is a fork BY OMISSION, not a re-sync: restore the missing copy, or delete the file from BOTH trees. Deleting only the FORKS entry hides it",
      r.orphanedDeclarations,
    );
  if (!failed && !json) console.log("[mirror:check] OK");
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("mirror-check.mjs")) main();
