/**
 * scripts/detect-vcst-isms.ts
 *
 * Audit-only scanner that finds vcst-qa-specific values (catalog GUIDs, org
 * names, hardcoded emails/URLs, specific admin role names) that haven't been
 * routed through @td() or {{VAR}}. These will break for customers when the
 * plugin ships — every match here is a Phase 3 cleanup target.
 *
 * Does NOT mutate any files. Read-only. Run before opening a PR.
 *
 * Usage:
 *   npx tsx scripts/detect-vcst-isms.ts                # full scan
 *   npx tsx scripts/detect-vcst-isms.ts --suites       # only regression/suites/
 *   npx tsx scripts/detect-vcst-isms.ts --agents       # only .claude/agents/
 *   npx tsx scripts/detect-vcst-isms.ts --quiet        # summary only (CI mode)
 *
 * Exit code: 0 if zero findings, 1 if any findings.
 *
 * Plan ref: ~/.claude/plans/functional-singing-cosmos.md cleanup #4
 *           (Strip vcst-qa-isms from suite CSVs and agent LAYER 2)
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const REPO_ROOT = process.cwd();
const ARGS = new Set(process.argv.slice(2));
const SUITES_ONLY = ARGS.has("--suites");
const AGENTS_ONLY = ARGS.has("--agents");
const QUIET = ARGS.has("--quiet");

interface Pattern {
  id: string;
  regex: RegExp;
  description: string;
  remediation: string;
  // Lines we should NOT flag (historical references, intentional examples).
  // Match against the line content; if any allowList substring matches, skip.
  allowListSubstrings?: string[];
}

// vcst-qa-isms to detect. Each pattern has a remediation hint so the fixer
// knows what to do. Order matters — more specific patterns first so they're
// reported under the right rule.
const PATTERNS: Pattern[] = [
  {
    id: "VCST-CATALOG-ROOT",
    regex: /fc596540864a41bf8ab78734ee7353a3/gi,
    description: "Hardcoded B2B virtual catalog root GUID (vcst-qa specific)",
    remediation: "Replace with @td(VIRTUAL_CATALOG_B2B.id)",
    allowListSubstrings: [
      "memory/",
      "MEMORY.md",
      "knowledge/vc-bug-catalog.md",
      "knowledge/sitemap.md",       // educational refs that explicitly say "vcst-qa value, customer differs"
      ".env.vcst",                   // intentional env file
      "test-data/aliases.json",      // the alias DEFINES the GUID — by definition
      "archive/",
      "docs/Sprint plans/",
      "CLAUDE.md",
      "/feedback_",                  // memory feedback files
      "/project_",                   // memory project files
      "/reference_",                 // memory reference files
    ],
  },
  {
    id: "VCST-OLD-CATALOG-ROOT",
    regex: /9238c387[a-f0-9]{4,}/gi,
    description: "Hardcoded OLD B2B virtual catalog root GUID (pre-2026-05-15 restore, stale)",
    remediation: "Replace with @td(VIRTUAL_CATALOG_B2B.id) — the 9238c387… root was rolled back",
    allowListSubstrings: ["memory/", "MEMORY.md", "archive/", "docs/Sprint plans/"],
  },
  {
    id: "VCST-ORG-TECHFLOW",
    regex: /\bTechFlow\b/g,
    description: "Hardcoded vcst-qa org name 'TechFlow'",
    remediation: "Replace with @td(TEST_ORG_PRIMARY.name) and route through aliases.json",
    allowListSubstrings: [
      "memory/",
      "MEMORY.md",
      "knowledge/vc-bug-catalog.md",
      "test-data/",                  // test-data CSVs DEFINE TechFlow (it's the subject of the alias)
      "test-data/aliases.json",
      "archive/",
      "docs/Sprint plans/",
      "tests/",
      "CLAUDE.md",
      "/feedback_",
      "/project_",
      "/reference_",
      "/user_",
    ],
  },
  {
    id: "VCST-ORG-BUILDRIGHT",
    regex: /\bBuildRight\b/g,
    description: "Hardcoded vcst-qa org name 'BuildRight'",
    remediation: "Replace with @td(TEST_ORG_SECONDARY.name) and route through aliases.json",
    allowListSubstrings: [
      "memory/",
      "MEMORY.md",
      "knowledge/vc-bug-catalog.md",
      "test-data/",
      "archive/",
      "docs/Sprint plans/",
      "tests/",
      "CLAUDE.md",
      "/feedback_",
      "/project_",
      "/reference_",
    ],
  },
  {
    id: "VCST-ORG-ACMECORP",
    regex: /\bAcmeCorp\b/g,
    description: "Hardcoded vcst-qa org name 'AcmeCorp'",
    remediation: "Replace with @td() — or rename the alias if it's already in aliases.json",
    allowListSubstrings: [
      "memory/",
      "MEMORY.md",
      "test-data/",
      "archive/",
      "docs/Sprint plans/",
      "tests/",
      "/feedback_",
      "/project_",
      "/reference_",
    ],
  },
  {
    id: "VCST-USER-YOPMAIL",
    regex: /[a-zA-Z0-9._-]+@yopmail\.com/g,
    description: "Hardcoded yopmail.com test user (vcst-qa convention)",
    remediation: "Replace with @td(TEST_USER_*.email) — customer's email domain differs",
    allowListSubstrings: [
      "memory/", "MEMORY.md", "test-data/", "archive/",
      "docs/Sprint plans/", "tests/", "CLAUDE.md",
      "/feedback_", "/project_", "/reference_", "/user_",
    ],
  },
  {
    id: "VCST-USER-TESTVC",
    regex: /[a-zA-Z0-9._-]+@test\.virtocommerce\.com/g,
    description: "Hardcoded @test.virtocommerce.com test user (vcst-qa convention)",
    remediation: "Replace with @td(TEST_USER_*.email)",
    allowListSubstrings: [
      "memory/", "MEMORY.md", "test-data/", "archive/",
      "docs/Sprint plans/", "tests/",
      "/feedback_", "/project_", "/reference_",
    ],
  },
  {
    id: "VCST-URL-VCST-QA",
    regex: /vcst-qa\.virtocommerce\.com|vcst-storefront\.virtocommerce\.com/g,
    description: "Hardcoded vcst-qa.virtocommerce.com URL",
    remediation: "Replace with {{FRONT_URL}} or {{BACK_URL}} env var",
    allowListSubstrings: [".env.vcst"], // the actual env file is allowed to have it
  },
  {
    id: "VCST-URL-VIRTOSTART",
    regex: /virtostart-demo[a-z-]*\.virtocommerce\.com/g,
    description: "Hardcoded virtostart-demo URL",
    remediation: "Replace with {{FRONT_URL}} or {{BACK_URL}} — virtostart is a vcst-internal env",
    allowListSubstrings: [".env.virtostart"],
  },
  {
    id: "VCST-EMAIL-VIRTOWORKS",
    regex: /[a-zA-Z0-9._-]+@virtoworks\.com/g,
    description: "Hardcoded @virtoworks.com email (internal VC team)",
    remediation: "Replace with @td(SUPPORT_AGENT.email) or remove — these are VC internal addresses",
    allowListSubstrings: [
      "memory/", "MEMORY.md", "CLAUDE.md",
      "test-data/", "archive/",
      "docs/Sprint plans/", "tests/",
      "/feedback_", "/project_", "/reference_", "/user_",
      "reports/ba/",  // BA reports may legitimately mention VC team contacts
    ],
  },
];

interface Finding {
  pattern: Pattern;
  file: string;
  line: number;
  excerpt: string;
}

function shouldScan(path: string): boolean {
  if (path.includes("node_modules")) return false;
  if (path.includes(".git/")) return false;
  if (path.includes(".claude/worktrees/")) return false;
  if (path.includes(".module-registry.cache.json")) return false;
  if (path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".har")) return false;
  if (path.endsWith(".lock") || path.endsWith("package-lock.json")) return false;

  // Skip evidence/reports from past runs (they're snapshots, not source)
  if (path.includes("/reports/regression/REG-")) return false;
  if (path.includes("/reports/exploratory/")) return false;
  if (path.includes("/tests/Sprint")) return false;

  // Restrict by --suites/--agents flags
  if (SUITES_ONLY && !path.includes("/regression/suites/")) return false;
  if (AGENTS_ONLY && !path.includes("/.claude/agents/")) return false;

  return true;
}

function* walk(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

const findings: Finding[] = [];
const filesByPattern: Record<string, Set<string>> = {};

for (const filepath of walk(REPO_ROOT)) {
  if (!shouldScan(filepath)) continue;

  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    continue;
  }

  const lines = content.split("\n");
  const relPath = relative(REPO_ROOT, filepath).replace(/\\/g, "/");

  for (const pattern of PATTERNS) {
    // Reset regex state for global patterns
    pattern.regex.lastIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip allow-listed contexts
      if (pattern.allowListSubstrings?.some((s) => relPath.includes(s))) continue;

      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(line)) {
        findings.push({
          pattern,
          file: relPath,
          line: i + 1,
          excerpt: line.length > 120 ? line.slice(0, 117) + "..." : line,
        });
        if (!filesByPattern[pattern.id]) filesByPattern[pattern.id] = new Set();
        filesByPattern[pattern.id].add(relPath);
      }
    }
  }
}

// Output
console.log("\n[detect-vcst-isms] Scan complete.\n");

const grouped: Record<string, Finding[]> = {};
for (const f of findings) {
  if (!grouped[f.pattern.id]) grouped[f.pattern.id] = [];
  grouped[f.pattern.id].push(f);
}

if (!QUIET) {
  for (const pattern of PATTERNS) {
    const group = grouped[pattern.id] || [];
    if (group.length === 0) continue;
    console.log(`──── ${pattern.id} (${group.length} matches in ${filesByPattern[pattern.id].size} files) ────`);
    console.log(`Description: ${pattern.description}`);
    console.log(`Remediation: ${pattern.remediation}\n`);
    // Show first 5 matches per pattern
    for (const f of group.slice(0, 5)) {
      console.log(`  ${f.file}:${f.line}`);
      console.log(`    ${f.excerpt.trim()}`);
    }
    if (group.length > 5) console.log(`  …and ${group.length - 5} more`);
    console.log();
  }
}

// Summary table
console.log("──── Summary ────");
console.log(`Total findings: ${findings.length}`);
for (const pattern of PATTERNS) {
  const count = grouped[pattern.id]?.length ?? 0;
  const files = filesByPattern[pattern.id]?.size ?? 0;
  console.log(`  ${pattern.id.padEnd(28)} ${String(count).padStart(4)} match(es) in ${files} file(s)`);
}

if (findings.length > 0) {
  console.log(`\nRun with --quiet to suppress per-finding output. Fix and re-run; goal is 0 findings before customer GA.\n`);
  process.exit(1);
}

console.log(`\n✓ Clean. No vcst-qa-isms detected outside allow-listed contexts.\n`);
process.exit(0);
