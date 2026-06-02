/**
 * scripts/audit-agents-knowledge.ts
 *
 * Workstreams #10 + #11 from the v0.3 product audit plan. Tags every agent
 * and every knowledge file with a `customerApplicability` frontmatter field
 * and generates an audit report.
 *
 * Classification — same scheme as the suite audit:
 *   universal     — works for any VC deployment without modification
 *   reference     — universal PATTERN but examples are vcst-specific; customer
 *                   adapts to their own data/theme/modules
 *   vcst-specific — vcst-only assumptions baked in that block customer reuse
 *
 * For knowledge files (no existing frontmatter): prepends a `---` YAML block.
 * For agent files (existing YAML frontmatter): inserts `applicability:` after
 * the existing fields.
 *
 * Usage:   npx tsx scripts/audit-agents-knowledge.ts
 * Output:  reports/audits/agents-knowledge-applicability-{YYYY-MM-DD}.md
 *          + in-place frontmatter additions
 *
 * Plan ref: ~/.claude/plans/functional-singing-cosmos.md Section 4 #10, #11
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

type Applicability = "universal" | "reference" | "vcst-specific";

interface Classification {
  path: string;
  applicability: Applicability;
  rationale: string;
  category: "agent-qa" | "agent-ba" | "agent-shared" | "knowledge";
}

// --- Hand-classified mapping ---
// Reviewed file-by-file rather than auto-inferred to keep the audit honest.

const CLASSIFICATIONS: Classification[] = [
  // QA agents (10)
  { path: ".claude/agents/qa/qa-lead-orchestrator.md", category: "agent-qa", applicability: "universal",
    rationale: "Orchestration role — delegates to specialists, manages JIRA workflow, gates decisions. No VC-specific assumptions in the role itself." },
  { path: ".claude/agents/qa/qa-frontend-expert.md", category: "agent-qa", applicability: "reference",
    rationale: "LAYER 1 hardcodes BL-CHK-003 / BL-PRICE-001 / BL-CROSS-002. LAYER 2 is vc-frontend (Vue.js) patterns. Customer adapts for their storefront tech + BL refs to match their business invariants." },
  { path: ".claude/agents/qa/qa-backend-expert.md", category: "agent-qa", applicability: "reference",
    rationale: "Same pattern as qa-frontend-expert — LAYER 1 has VC BL refs, LAYER 2 is admin SPA + xAPI patterns. Reference for customers." },
  { path: ".claude/agents/qa/qa-testing-expert.md", category: "agent-qa", applicability: "universal",
    rationale: "Interactive testing methodology — exploratory, Figma comparison, console/network debug. Cross-surface, universal QA discipline." },
  { path: ".claude/agents/qa/test-management-specialist.md", category: "agent-qa", applicability: "universal",
    rationale: "Test planning craft (BA → test conditions → cases). Universal QA discipline; examples are storefront but pattern is general." },
  { path: ".claude/agents/qa/ui-ux-expert.md", category: "agent-qa", applicability: "reference",
    rationale: "Storybook (vc-frontend specific) + critical-ui-scope (vcst coverage matrix). Customer with a different storefront codebase clones for their Storybook." },
  { path: ".claude/agents/qa/regression-orchestrator.md", category: "agent-qa", applicability: "universal",
    rationale: "Parallel execution + retry logic + browser fallback. Pure orchestration mechanism." },
  { path: ".claude/agents/qa/autonomous-regression-orchestrator.md", category: "agent-qa", applicability: "universal",
    rationale: "Agent Teams variant of regression-orchestrator. Token-bucket + failure recovery. Mechanism, not domain." },
  { path: ".claude/agents/qa/test-runner-agent.md", category: "agent-qa", applicability: "universal",
    rationale: "Parameterized template ({{SUITE_ID}}, {{BROWSER_SERVER}}, etc.). Template is itself the contract; customer-runnable." },
  { path: ".claude/agents/qa/autonomous-test-runner.md", category: "agent-qa", applicability: "universal",
    rationale: "Autonomous variant of test-runner-agent. Same parameterized template pattern." },

  // Shared (1)
  { path: ".claude/agents/qa/shared-instructions.md", category: "agent-shared", applicability: "reference",
    rationale: "Four-layer agent architecture template — universal pattern. But agent-pool table at line 210 (slot 1/2/3 with @td(AGENT_POOL_SLOT_N.*) refs) shows vcst values as 'reference'. Customer fills agent-user-pool.csv." },

  // BA agents (4)
  { path: ".claude/agents/ba/ba-system-analyzer.md", category: "agent-ba", applicability: "universal",
    rationale: "VC module + system analysis. Uses GitHub MCP to search vc-module-* repos. Universal for any VC customer with module access." },
  { path: ".claude/agents/ba/ba-api-specialist.md", category: "agent-ba", applicability: "universal",
    rationale: "Postman / Swagger / GitHub MCP for VC API analysis. Universal." },
  { path: ".claude/agents/ba/ba-story-writer.md", category: "agent-ba", applicability: "universal",
    rationale: "Agile user stories + BDD acceptance criteria. Pure craft, no VC-specific assumptions." },
  { path: ".claude/agents/ba/ba-doc-writer.md", category: "agent-ba", applicability: "universal",
    rationale: "User-facing docs + admin guides. Pure docs craft." },

  // Knowledge files (24)
  { path: ".claude/agents/knowledge/api-auth.md", category: "knowledge", applicability: "universal",
    rationale: "VC platform OAuth2 token endpoint pattern. Same for every VC deployment." },
  { path: ".claude/agents/knowledge/browser-quirks.md", category: "knowledge", applicability: "universal",
    rationale: "Per-browser rendering differences. Cross-VC universal." },
  { path: ".claude/agents/knowledge/business-logic.md", category: "knowledge", applicability: "reference",
    rationale: "76 storefront BLs covering pricing, cart, checkout, B2B, etc. Universal as a STARTING POINT (most BLs are platform-level invariants). Customer adapts: some BLs encode vcst-specific assumptions (specific currency, specific tier rules, specific role names). Customer's own BL-{CUSTOMER}-* IDs namespace alongside." },
  { path: ".claude/agents/knowledge/catalog.md", category: "knowledge", applicability: "reference",
    rationale: "Storefront catalog reference — assumes vcst's catalog structure. Customer adapts." },
  { path: ".claude/agents/knowledge/critical-ui-scope.md", category: "knowledge", applicability: "reference",
    rationale: "vcst's 7 components × 8 pages coverage matrix. Customer adapts to their components/pages." },
  { path: ".claude/agents/knowledge/debugging-signals.md", category: "knowledge", applicability: "universal",
    rationale: "Console + network debugging heuristics. Cross-VC universal." },
  { path: ".claude/agents/knowledge/e-commerce-edge-cases-library.md", category: "knowledge", applicability: "reference",
    rationale: "13 generic ECL (universal) + 7 VC-specific (reference). File-level classification is reference because the VC-specific ones are intermixed; future refactor: split into universal + VC-specific files." },
  { path: ".claude/agents/knowledge/graphiql-interaction.md", category: "knowledge", applicability: "universal",
    rationale: "GraphiQL UI interaction guide — CodeMirror editor steps. Universal across VC deployments." },
  { path: ".claude/agents/knowledge/graphql-schema.md", category: "knowledge", applicability: "reference",
    rationale: "xAPI GraphQL schema reference. The schema SHAPE is universal across VC, but field availability varies by module set + customer modifications. Customer regenerates from their live introspection." },
  { path: ".claude/agents/knowledge/graphql-test-cases-runner.md", category: "knowledge", applicability: "universal",
    rationale: "Runner contract grammar (tag syntax, predicate shapes, @td()/{{VAR}} forms). Format spec, universal." },
  { path: ".claude/agents/knowledge/live-discovery.md", category: "knowledge", applicability: "universal",
    rationale: "Decision tree + xAPI discovery patterns + AGENT-TEST- prefix conventions. Pattern is universal; xAPI examples cross-VC." },
  { path: ".claude/agents/knowledge/module-suite-map.md", category: "knowledge", applicability: "reference",
    rationale: "vcst's module → suite mapping. Customer's mapping differs by module set + custom suites." },
  { path: ".claude/agents/knowledge/order-creation-matrix.md", category: "knowledge", applicability: "reference",
    rationale: "vcst's payment + shipping combinations matrix. Customer's processor + shipping set differs." },
  { path: ".claude/agents/knowledge/performance-thresholds.md", category: "knowledge", applicability: "universal",
    rationale: "Web Vitals + LCP/CLS/TTI budgets. Cross-app universal." },
  { path: ".claude/agents/knowledge/platform-patterns.md", category: "knowledge", applicability: "universal",
    rationale: "VC platform architecture patterns. Same for every VC deployment." },
  { path: ".claude/agents/knowledge/products.md", category: "knowledge", applicability: "reference",
    rationale: "Storefront product types + xAPI fields. Customer's products differ; pattern reusable." },
  { path: ".claude/agents/knowledge/sitemap.md", category: "knowledge", applicability: "reference",
    rationale: "Full storefront URL map. Customer's sitemap differs by storefront customizations. @td(VIRTUAL_CATALOG_B2B.id) already used in some entries." },
  { path: ".claude/agents/knowledge/store-settings.md", category: "knowledge", applicability: "reference",
    rationale: "Storefront store config patterns. Customer's settings differ." },
  { path: ".claude/agents/knowledge/storefront-config-flags.md", category: "knowledge", applicability: "reference",
    rationale: "vc-frontend $cfg.* flag inventory. Customer with stock vc-frontend = applicable; customer with custom storefront = adapt." },
  { path: ".claude/agents/knowledge/storefront-selectors.md", category: "knowledge", applicability: "reference",
    rationale: "vc-frontend stable selectors (data-test-id / role / aria-label). Customer with custom theme adapts selector strategy." },
  { path: ".claude/agents/knowledge/test-execution-preflight.md", category: "knowledge", applicability: "universal",
    rationale: "Pre-run readiness checklist (env health, fixture seed, MCP status). Universal." },
  { path: ".claude/agents/knowledge/test-runner-tags.md", category: "knowledge", applicability: "universal",
    rationale: "CSV column / step / assertion tag reference. Format spec, universal." },
  { path: ".claude/agents/knowledge/vc-bug-catalog.md", category: "knowledge", applicability: "reference",
    rationale: "Historical VC bug patterns indexed by domain. Customer reads as 'Familiar Problems' oracle but VC-specific entries (VCST-NNNN refs) are vcst's history. Useful learning artifact, adapt for customer's." },
  { path: ".claude/agents/knowledge/white-labeling.md", category: "knowledge", applicability: "reference",
    rationale: "Storefront white-labeling feature reference. Customer's branding differs." },
];

// --- Frontmatter manipulation ---

interface FrontmatterResult {
  changed: boolean;
  newContent: string;
  hadFrontmatter: boolean;
}

function ensureApplicabilityFrontmatter(
  filepath: string,
  applicability: Applicability,
  rationale: string
): FrontmatterResult {
  const original = readFileSync(filepath, "utf-8");

  // Detect existing frontmatter
  const fmMatch = original.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);

  if (fmMatch) {
    const fmBody = fmMatch[1];
    // Check if applicability field already present
    if (/^applicability:\s*(universal|reference|vcst-specific)/m.test(fmBody)) {
      // Already tagged — replace
      const newFmBody = fmBody.replace(
        /^applicability:\s*(?:universal|reference|vcst-specific).*$/m,
        `applicability: ${applicability}`
      );
      const newContent = original.replace(fmMatch[0], `---\n${newFmBody}\n---\n`);
      return { changed: newContent !== original, newContent, hadFrontmatter: true };
    }
    // Append to existing frontmatter
    const newFmBody = fmBody.replace(/\s*$/, "") + `\napplicability: ${applicability}\napplicability_rationale: "${rationale.replace(/"/g, '\\"')}"`;
    const newContent = original.replace(fmMatch[0], `---\n${newFmBody}\n---\n`);
    return { changed: true, newContent, hadFrontmatter: true };
  }

  // No frontmatter — prepend
  const newFm = `---\napplicability: ${applicability}\napplicability_rationale: "${rationale.replace(/"/g, '\\"')}"\n---\n\n`;
  return { changed: true, newContent: newFm + original, hadFrontmatter: false };
}

// --- Main ---

const REPO_ROOT = process.cwd();
const REPORT_DIR = join(REPO_ROOT, "reports", "audits");

let changed = 0;
let prepended = 0;
let mergedIntoExisting = 0;
let unchanged = 0;
let notFound = 0;

const counts: Record<Applicability, number> = { universal: 0, reference: 0, "vcst-specific": 0 };
const byCategoryAndApp: Record<string, Record<Applicability, number>> = {};

for (const c of CLASSIFICATIONS) {
  const filepath = join(REPO_ROOT, c.path);
  if (!existsSync(filepath)) {
    console.warn(`[audit-agents-knowledge] File not found: ${c.path}`);
    notFound++;
    continue;
  }
  const result = ensureApplicabilityFrontmatter(filepath, c.applicability, c.rationale);
  if (result.changed) {
    writeFileSync(filepath, result.newContent);
    changed++;
    if (result.hadFrontmatter) {
      mergedIntoExisting++;
    } else {
      prepended++;
    }
  } else {
    unchanged++;
  }
  counts[c.applicability]++;
  if (!byCategoryAndApp[c.category]) byCategoryAndApp[c.category] = { universal: 0, reference: 0, "vcst-specific": 0 };
  byCategoryAndApp[c.category][c.applicability]++;
}

// Report
if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
const datePart = "2026-06-02";
const reportPath = join(REPORT_DIR, `agents-knowledge-applicability-${datePart}.md`);

const total = CLASSIFICATIONS.length;
const universal = CLASSIFICATIONS.filter((c) => c.applicability === "universal");
const reference = CLASSIFICATIONS.filter((c) => c.applicability === "reference");
const vcstSpecific = CLASSIFICATIONS.filter((c) => c.applicability === "vcst-specific");

const renderTable = (items: Classification[]) => items.map((c) => `| \`${c.path}\` | ${c.category} | ${c.rationale} |`).join("\n");

const report = `# Agents + Knowledge Files — Customer Applicability Audit — ${datePart}

> Companion to the suite applicability audit (\`suite-applicability-${datePart}.md\`). Auto-tags every agent prompt and knowledge file with \`applicability: universal | reference | vcst-specific\` in YAML frontmatter. Re-run with \`npx tsx scripts/audit-agents-knowledge.ts\`.

## Summary

| Classification | Count | % |
|----------------|-------|---|
| **universal** | ${universal.length} | ${((universal.length / total) * 100).toFixed(1)}% |
| **reference** | ${reference.length} | ${((reference.length / total) * 100).toFixed(1)}% |
| **vcst-specific** | ${vcstSpecific.length} | ${((vcstSpecific.length / total) * 100).toFixed(1)}% |
| **Total** | ${total} | 100% |

## By category

| Category | Universal | Reference | Vcst-specific |
|----------|-----------|-----------|--------------|
| QA agents | ${byCategoryAndApp["agent-qa"]?.universal ?? 0} | ${byCategoryAndApp["agent-qa"]?.reference ?? 0} | ${byCategoryAndApp["agent-qa"]?.["vcst-specific"] ?? 0} |
| BA agents | ${byCategoryAndApp["agent-ba"]?.universal ?? 0} | ${byCategoryAndApp["agent-ba"]?.reference ?? 0} | ${byCategoryAndApp["agent-ba"]?.["vcst-specific"] ?? 0} |
| Shared instructions | ${byCategoryAndApp["agent-shared"]?.universal ?? 0} | ${byCategoryAndApp["agent-shared"]?.reference ?? 0} | ${byCategoryAndApp["agent-shared"]?.["vcst-specific"] ?? 0} |
| Knowledge files | ${byCategoryAndApp["knowledge"]?.universal ?? 0} | ${byCategoryAndApp["knowledge"]?.reference ?? 0} | ${byCategoryAndApp["knowledge"]?.["vcst-specific"] ?? 0} |

## Universal artifacts (work for any VC deployment without modification)

| File | Category | Rationale |
|------|---------|-----------|
${renderTable(universal)}

## Reference artifacts (universal patterns, vcst-specific examples; customer adapts)

| File | Category | Rationale |
|------|---------|-----------|
${renderTable(reference)}

${vcstSpecific.length > 0 ? `## Vcst-specific artifacts (vcst-only, move to Layer 2)

| File | Category | Rationale |
|------|---------|-----------|
${renderTable(vcstSpecific)}
` : `## Vcst-specific artifacts

None. Like the suite audit, the @td() discipline and the agent-architecture separation (Tier A/B/C) kept hard vcst-isms out of the agent + knowledge files. The vcst-specifics live in test-data + reports + sprint plans (Layer 2) instead.
`}

## Run results

- **Files processed:** ${total}
- **Frontmatter prepended (file had none):** ${prepended}
- **Frontmatter merged into existing:** ${mergedIntoExisting}
- **Already up-to-date:** ${unchanged}
- **Not found (script bug):** ${notFound}

## Implications for Phase 1 / v0.3

Combined with the suite audit:

| Layer | Universal | Reference | Vcst-specific |
|-------|-----------|-----------|--------------|
| Suites (99) | 48 | 51 | 0 |
| Agents + knowledge + shared (${total}) | ${universal.length} | ${reference.length} | ${vcstSpecific.length} |
| **Grand total (${total + 99})** | **${universal.length + 48}** | **${reference.length + 51}** | **${vcstSpecific.length}** |

**${(((universal.length + 48) / (total + 99)) * 100).toFixed(1)}% of the customer-facing surface is universal**, **${(((reference.length + 51) / (total + 99)) * 100).toFixed(1)}% is reference**, **0% is vcst-only**. Strong result for customer adoption — every shipped artifact is at least adaptable.

## Next workstreams unlocked

- **#6 (repo split)**: now has classification data across all customer-facing assets. Layer 1 ships everything tagged universal or reference (the entire shipped surface). Layer 2 keeps test-data + reports + sprint plans + agent-user-pool CSV + the parts of aliases.json that are vcst-only.
- **#9 (test-data audit)**: the actual vcst-isms live in test-data/. That audit is the last big classification work.
`;

writeFileSync(reportPath, report);

console.log(`[audit-agents-knowledge] Processed ${total} files:`);
console.log(`  universal:     ${universal.length} (${((universal.length / total) * 100).toFixed(1)}%)`);
console.log(`  reference:     ${reference.length} (${((reference.length / total) * 100).toFixed(1)}%)`);
console.log(`  vcst-specific: ${vcstSpecific.length} (${((vcstSpecific.length / total) * 100).toFixed(1)}%)`);
console.log(``);
console.log(`Frontmatter changes:`);
console.log(`  prepended (new):       ${prepended}`);
console.log(`  merged into existing:  ${mergedIntoExisting}`);
console.log(`  unchanged:             ${unchanged}`);
console.log(`  not found:             ${notFound}`);
console.log(``);
console.log(`Report written to: ${reportPath}`);
