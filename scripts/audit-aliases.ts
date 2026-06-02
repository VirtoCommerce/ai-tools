/**
 * scripts/audit-aliases.ts
 *
 * Workstream #9 from the v0.3 product audit plan. Classifies every alias in
 * test-data/aliases.json as either `template` (universal pattern customer
 * needs) or `vcst-data` (vcst's seeded values, replaced wholesale by customer).
 *
 * Output:
 *   - reports/audits/aliases-applicability-{date}.md (audit report)
 *   - Suggested additions to templates/aliases.json.template (printed; not auto-applied)
 *
 * Plan ref: ~/.claude/plans/functional-singing-cosmos.md Section 4 #9
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

type Applicability = "template" | "vcst-data";

interface Classification {
  key: string;
  applicability: Applicability;
  rationale: string;
}

const ALIASES_PATH = join(process.cwd(), "test-data", "aliases.json");
const TEMPLATE_PATH = join(process.cwd(), "templates", "aliases.json.template");
const REPORT_DIR = join(process.cwd(), "reports", "audits");

const aliases = JSON.parse(readFileSync(ALIASES_PATH, "utf-8")) as Record<string, unknown>;
const templateExisting = JSON.parse(readFileSync(TEMPLATE_PATH, "utf-8")) as Record<string, unknown>;

// Universal-template alias keys — the pattern is universal; vcst's values
// happen to be the current contents. Customer overrides via aliases.{TEST_ENV}.json
// or replaces these entries in their own fork.
const TEMPLATE_PATTERNS = [
  /^ADMIN_ROLE_TESTER$/,
  /^ADMIN_ROLES_COMMON$/,
  /^ADMIN_USER$/,
  /^AGENT_POOL_SLOT_\d+$/,
  /^VIRTUAL_CATALOG_B2B$/,
  // Generic test entities (customer fills with their own)
  /^TEST_CATALOG_ROOT$/,
  /^TEST_STORE$/,
  /^TEST_PRODUCT_(SIMPLE|CONFIGURABLE)$/,
  /^TEST_USER_(B2C|B2B|GUEST)$/,
  /^TEST_ORG_(PRIMARY|SECONDARY)$/,
  /^TEST_ADDRESS_(DOMESTIC|INTERNATIONAL)$/,
  /^TEST_COUPON_VALID$/,
];

function classify(key: string): Classification {
  if (key.startsWith("_")) {
    return { key, applicability: "vcst-data", rationale: "Metadata key, not an alias entry." };
  }
  for (const pattern of TEMPLATE_PATTERNS) {
    if (pattern.test(key)) {
      return { key, applicability: "template", rationale: "Generic alias name — universal pattern. Customer overrides values; alias key + structure stays." };
    }
  }
  // Default: vcst-data
  // Sub-categorize for the audit report
  if (key.startsWith("CFG_")) {
    return { key, applicability: "vcst-data", rationale: "vcst-seeded configurable-product alias. Customer's CFG products differ." };
  }
  if (/^(CYBERSOURCE|SKYFLOW|AUTHORIZENET|DATATRANCE)_/i.test(key)) {
    return { key, applicability: "vcst-data", rationale: "Payment-processor sandbox card. Values are processor-sandbox conventions (some universal, some vcst). Customer fork-and-adapt to their sandbox setup." };
  }
  if (key.startsWith("SEED_")) {
    return { key, applicability: "vcst-data", rationale: "vcst-seed-run-specific alias (from a particular qa-seed-data execution). Customer's seed runs produce their own SEED_* aliases." };
  }
  if (key.startsWith("LOCKOUT_") || key.startsWith("LOYALTY_")) {
    return { key, applicability: "vcst-data", rationale: "vcst-seeded user / group with specific platform_id. Customer seeds equivalent." };
  }
  if (/^(SUPPORT_AGENT|IMPERSONATE_TARGET|TECHFLOW_|OTHER_ORG_USER|BUILDRIGHT_|ACMECORP_)/.test(key)) {
    return { key, applicability: "vcst-data", rationale: "vcst-seeded user / org reference with specific identity. Customer's users differ." };
  }
  if (key.startsWith("PROD_") || key.startsWith("ALCE") || key.startsWith("LOGI_") || key.startsWith("AGENT_TEST_")) {
    return { key, applicability: "vcst-data", rationale: "vcst-seeded product / test entity. Customer's catalog differs." };
  }
  if (key.startsWith("USER_GROUP_") || key === "BUYABLE_NO_MIN_QTY") {
    return { key, applicability: "vcst-data", rationale: "vcst-specific user group / product reference." };
  }
  return { key, applicability: "vcst-data", rationale: "vcst-specific alias (default classification — review if this should be a template)." };
}

const classifications = Object.keys(aliases)
  .filter((k) => k !== "_meta")
  .map(classify);

const templates = classifications.filter((c) => c.applicability === "template");
const vcstData = classifications.filter((c) => c.applicability === "vcst-data");

// Find templates missing from the customer-facing template file
const templateKeysInJson = new Set(templates.map((t) => t.key));
const templateKeysInFile = new Set(Object.keys(templateExisting).filter((k) => !k.startsWith("_")));
const missingFromTemplateFile = [...templateKeysInJson].filter((k) => !templateKeysInFile.has(k));
const extraInTemplateFile = [...templateKeysInFile].filter((k) => !templateKeysInJson.has(k));

if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
const datePart = "2026-06-02";
const reportPath = join(REPORT_DIR, `aliases-applicability-${datePart}.md`);

// Sub-categorize vcst-data for the report
const byCategory: Record<string, Classification[]> = {};
for (const c of vcstData) {
  let cat = "Other";
  if (c.key.startsWith("CFG_")) cat = "Configurable products (CFG_*)";
  else if (/^(CYBERSOURCE|SKYFLOW|AUTHORIZENET|DATATRANCE)_/i.test(c.key)) cat = "Payment-processor sandbox cards";
  else if (c.key.startsWith("SEED_")) cat = "Seed-run-specific (SEED_*)";
  else if (c.key.startsWith("LOCKOUT_")) cat = "Lockout / auth test users";
  else if (c.key.startsWith("LOYALTY_") || c.key.startsWith("USER_GROUP_")) cat = "Loyalty / user groups";
  else if (/^(SUPPORT_AGENT|IMPERSONATE_TARGET|TECHFLOW_|OTHER_ORG_USER|BUILDRIGHT_|ACMECORP_)/.test(c.key)) cat = "vcst-seeded users / orgs";
  else if (c.key.startsWith("PROD_") || c.key.startsWith("ALCE") || c.key.startsWith("LOGI_") || c.key.startsWith("AGENT_TEST_") || c.key === "BUYABLE_NO_MIN_QTY") cat = "vcst-seeded products";
  if (!byCategory[cat]) byCategory[cat] = [];
  byCategory[cat].push(c);
}

const report = `# Alias Applicability Audit — ${datePart}

> Classifies all ${classifications.length} aliases in \`test-data/aliases.json\` as either \`template\` (universal pattern customer needs) or \`vcst-data\` (vcst's seeded values; customer replaces wholesale).

## Summary

| Classification | Count | % |
|----------------|-------|---|
| **template** — universal alias name + structure, customer fills values | ${templates.length} | ${((templates.length / classifications.length) * 100).toFixed(1)}% |
| **vcst-data** — vcst-seeded entities, customer replaces with their own | ${vcstData.length} | ${((vcstData.length / classifications.length) * 100).toFixed(1)}% |
| **Total** | ${classifications.length} | 100% |

## Template aliases (universal — customer needs equivalents)

These represent universal concepts every VC customer needs. The current values in \`aliases.json\` are vcst's; the alias NAMES + STRUCTURE are the customer-facing contract.

| Alias key | Rationale |
|-----------|-----------|
${templates.map((t) => `| \`${t.key}\` | ${t.rationale} |`).join("\n")}

## Gaps in templates/aliases.json.template

Aliases that are classified as \`template\` but **not yet present in \`templates/aliases.json.template\`**. These should be added so customers see the full pattern when they install:

${missingFromTemplateFile.length > 0
  ? missingFromTemplateFile.map((k) => `- \`${k}\``).join("\n")
  : "(none — template file is in sync with the classification)"}

Extra in templates/aliases.json.template (not in main aliases.json, may be aspirational):

${extraInTemplateFile.length > 0
  ? extraInTemplateFile.map((k) => `- \`${k}\``).join("\n")
  : "(none)"}

## vcst-data aliases (${vcstData.length} entries)

These are vcst's seeded entity references. Customer's deployment has different products / orgs / users / groups, so customers fork the entire \`aliases.json\` and replace these wholesale. Categorized for readability:

${Object.entries(byCategory).map(([cat, items]) => `### ${cat} (${items.length})\n\n${items.slice(0, 10).map((c) => `- \`${c.key}\``).join("\n")}${items.length > 10 ? `\n- _…and ${items.length - 10} more_` : ""}`).join("\n\n")}

## Recommended actions (Layer 1 / Layer 2 implications for workstream #6)

**Layer 1 (customer-facing plugin) ships:**
- \`templates/aliases.json.template\` with the **${templates.length} template aliases** plus generic \`TEST_*\` placeholders the customer fills in (already 9 generic ones present)
- Documentation in \`docs/test-authoring.md\` § "@td() resolver" already references this pattern

**Layer 2 (vcst-internal deployment) keeps:**
- \`test-data/aliases.json\` with **${vcstData.length} vcst-seeded entries** plus their backing CSVs (\`test-data/orgs/\`, \`test-data/products/\`, \`test-data/users/\`)
- All historical changelog entries in \`_meta\`
- Sprint-run-specific \`SEED_${datePart.replace(/-/g, "")}_*\` aliases

## Verification

After Layer 1 / Layer 2 split:

\`\`\`bash
# Layer 1 customer would have only templates + an empty aliases.json starting point
# Their workflow:
cp templates/aliases.json.template test-data/aliases.json   # then edit with their values

# Layer 2 vcst keeps the current 211-alias aliases.json as-is.
\`\`\`

## Notes for human reviewer

1. **Payment-processor sandbox cards** are arguably universal (the sandbox PANs work across processor sandboxes). Currently classified as \`vcst-data\` because the specific selections are vcst's convention. Could split into a separate \`templates/sandbox-cards.json\` that customers reuse as-is.
2. **AGENT_POOL_SLOT_\\*** is classified as \`template\` because the SLOT PATTERN is universal even though the underlying CSV holds vcst's values. The pattern \`@td(AGENT_POOL_SLOT_1.email)\` works for any customer with an agent-user-pool.csv populated for their team.
3. Some aliases like \`IMPERSONATE_TARGET_MANY_ORGS\` are vcst-internal test fixtures (specific lockout / blocked / invited states) — these are vcst-data even though the CONCEPT is universal. Customer would seed their own equivalents.
`;

writeFileSync(reportPath, report);

console.log(`[audit-aliases] Classified ${classifications.length} aliases:`);
console.log(`  template:  ${templates.length}`);
console.log(`  vcst-data: ${vcstData.length}`);
console.log(``);
console.log(`Template aliases missing from templates/aliases.json.template:`);
if (missingFromTemplateFile.length === 0) {
  console.log(`  (none)`);
} else {
  missingFromTemplateFile.forEach((k) => console.log(`  - ${k}`));
}
console.log(``);
console.log(`Report written to: ${reportPath}`);
