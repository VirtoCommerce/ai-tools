/**
 * author-fixtures.ts — stage 3 of /qa-generate-data: write the GAP fixtures + aliases.
 *
 * Given a resolved combination plan (cells already marked reuse-vs-gap by the skill),
 * this:
 *   1. appends each gap-fixture row into the right `test-data/<domain>/<file>.csv`
 *      (header-matched), enforcing the no-hardcode guardrails;
 *   2. registers a CSV-backed `@td()` alias per gap fixture (filter on its business key);
 *   3. registers an inline `@td()` combination alias per combo (ties the entities together);
 *   4. bumps `aliases.json` `_meta.version` + adds a changelog entry;
 *   5. runs `validate-td-refs.ts` (unless --no-validate).
 *
 * It is the ONLY on-disk output of the skill (the matrix/inventory are returned inline).
 * Idempotent: a gap row whose business key already exists is skipped (reuse), so a
 * re-run never duplicates. --dry-run prints the diff and writes nothing.
 *
 * Guardrails enforced (test-data.md / DV-013):
 *   - GUID/id columns (`*_guid`, `*_id_guid`, `platform_id`) are forced blank.
 *   - Any bare UUID/32-hex value anywhere in a row is REJECTED (would rot to BLOCKED).
 *   - `seeded` (if present) forced to "false"; `test_purpose`/`used_by` tagged by Combo ID.
 *   - The business-key value must carry the `AGENT-TEST-` prefix (warn otherwise).
 *
 * Usage:
 *   npx tsx scripts/author-fixtures.ts --plan plan.json          # author + validate
 *   npx tsx scripts/author-fixtures.ts --plan plan.json --dry-run
 *   cat plan.json | npx tsx scripts/author-fixtures.ts -         # plan via stdin
 *
 * Plan shape: see the PlanSchema interfaces below (and the /qa-generate-data SKILL.md).
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const TEST_DATA_DIR = join(ROOT, "test-data");
const ALIASES_PATH = join(TEST_DATA_DIR, "aliases.json");

const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
const HEX32_RE = /\b[0-9a-f]{32}\b/i;
const GUID_COL_RE = /(_guid$|^id$|_id_guid$|^platform_id$|_platform_id$)/i;

interface GapFixture {
  combo: string; // Combo ID this row serves
  scenario?: string; // human scenario → test_purpose
  file: string; // CSV path under test-data/ (no .csv), e.g. "products/standard"
  businessKey: Record<string, string>; // identity filter (stable business key, e.g. product_code)
  row: Record<string, string>; // column → value (full row; missing cols filled blank)
  alias?: { name: string; fields: Record<string, string> }; // CSV-backed alias to register
}

interface ComboAlias {
  name: string; // ALIAS name (UPPER_SNAKE)
  combo: string; // Combo ID
  inline: Record<string, unknown>; // entity references that make up the combination
  fields: Record<string, string>; // @td() field map
  notes?: string;
}

interface Plan {
  feature: string;
  fixtures?: GapFixture[];
  comboAliases?: ComboAlias[];
}

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const NO_VALIDATE = argv.includes("--no-validate");

/* ───────────────────────── CSV helpers ───────────────────────── */

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function csvField(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/* ───────────────────────── core ───────────────────────── */

interface Change {
  file: string;
  combo: string;
  action: "append" | "reuse-existing";
  businessKey: string;
}

function loadPlan(): Plan {
  const planFlagIdx = argv.indexOf("--plan");
  if (planFlagIdx >= 0 && argv[planFlagIdx + 1]) {
    return JSON.parse(readFileSync(argv[planFlagIdx + 1], "utf-8"));
  }
  if (argv.includes("-")) {
    return JSON.parse(readFileSync(0, "utf-8")); // fd 0 = stdin
  }
  console.error(
    "Usage: npx tsx scripts/author-fixtures.ts --plan <plan.json> [--dry-run] [--no-validate]   (or pipe plan via stdin with '-')"
  );
  process.exit(2);
}

function bumpVersion(v: string): string {
  const parts = v.split(".");
  parts[parts.length - 1] = String(Number(parts[parts.length - 1] || 0) + 1);
  return parts.join(".");
}

function main() {
  const plan = loadPlan();
  const changes: Change[] = [];
  const warnings: string[] = [];

  const aliases = existsSync(ALIASES_PATH)
    ? (JSON.parse(readFileSync(ALIASES_PATH, "utf-8")) as Record<string, unknown>)
    : {};
  let aliasesDirty = false;
  const addedAliases: string[] = [];

  // 1+2. Gap fixtures → CSV rows + CSV-backed aliases.
  for (const fx of plan.fixtures ?? []) {
    const csvPath = join(TEST_DATA_DIR, `${fx.file.replace(/\.csv$/, "")}.csv`);
    if (!existsSync(csvPath)) {
      console.error(`ABORT: target CSV not found: ${fx.file}.csv — create the fixture file first.`);
      process.exit(2);
    }
    const content = readFileSync(csvPath, "utf-8");
    const lines = content.split(/\r?\n/);
    const header = parseCSVLine(lines[0]);

    // Idempotency: does a row already match the business key?
    const dataLines = lines.slice(1).filter((l) => l.trim() !== "");
    const keyCols = Object.keys(fx.businessKey);
    const exists = dataLines.some((l) => {
      const cells = parseCSVLine(l);
      return keyCols.every((k) => {
        const idx = header.indexOf(k);
        return idx >= 0 && cells[idx] === fx.businessKey[k];
      });
    });
    const bkStr = keyCols.map((k) => `${k}=${fx.businessKey[k]}`).join("&");

    if (exists) {
      changes.push({ file: `${fx.file}.csv`, combo: fx.combo, action: "reuse-existing", businessKey: bkStr });
    } else {
      // Build the row in header order, applying guardrails.
      const merged: Record<string, string> = { ...fx.row, ...fx.businessKey };
      // Force GUID columns blank; tag provenance columns; force seeded=false.
      for (const col of header) {
        if (GUID_COL_RE.test(col) && !keyCols.includes(col)) merged[col] = "";
        if (col === "seeded") merged[col] = "false";
        if (col === "used_by") merged[col] = merged[col] || fx.combo;
        if (col === "test_purpose" || col === "notes") {
          if (!merged[col]) merged[col] = `${fx.scenario || fx.combo} (gap fixture by /qa-generate-data; seeded=false → provision via /qa-seed-data)`;
        }
      }
      // Reject bare GUIDs anywhere (would rot to BLOCKED — DV-013).
      for (const [col, val] of Object.entries(merged)) {
        if (val && (UUID_RE.test(val) || HEX32_RE.test(val))) {
          console.error(`ABORT: gap fixture for ${fx.combo} has a bare GUID in column "${col}" = "${val}". Leave GUIDs blank; reference by business key.`);
          process.exit(2);
        }
      }
      // Warn if business key isn't AGENT-TEST- prefixed.
      const bkVal = fx.businessKey[keyCols[0]] || "";
      if (!/AGENT-TEST-/i.test(bkVal)) warnings.push(`Business key "${bkVal}" (${fx.combo}) lacks AGENT-TEST- prefix — teardown won't sweep it.`);

      const newLine = header.map((c) => csvField(merged[c] ?? "")).join(",");
      if (!DRY) {
        // Append, keeping a single trailing newline.
        const trimmed = content.replace(/\s*$/, "");
        writeFileSync(csvPath, `${trimmed}\n${newLine}\n`, "utf-8");
      }
      changes.push({ file: `${fx.file}.csv`, combo: fx.combo, action: "append", businessKey: bkStr });
    }

    // Register CSV-backed alias.
    if (fx.alias) {
      if (aliases[fx.alias.name] && !DRY) {
        warnings.push(`Alias ${fx.alias.name} already exists — left unchanged.`);
      } else {
        aliases[fx.alias.name] = {
          file: fx.file.replace(/\.csv$/, ""),
          filter: fx.businessKey,
          fields: fx.alias.fields,
          notes: `Gap fixture for ${fx.combo} (${fx.scenario || ""}). Generated by /qa-generate-data; seeded=false — provision via /qa-seed-data.`,
        };
        aliasesDirty = true;
        addedAliases.push(fx.alias.name);
      }
    }
  }

  // 3. Inline combination aliases.
  for (const ca of plan.comboAliases ?? []) {
    if (aliases[ca.name]) {
      warnings.push(`Combination alias ${ca.name} already exists — left unchanged.`);
      continue;
    }
    aliases[ca.name] = {
      _inline: true,
      combo: ca.combo,
      ...ca.inline,
      fields: ca.fields,
      _notes: ca.notes || `Combination ${ca.combo} for ${plan.feature}. Generated by /qa-generate-data.`,
    };
    aliasesDirty = true;
    addedAliases.push(ca.name);
  }

  // 4. Version + changelog bump.
  if (aliasesDirty) {
    const meta = (aliases._meta as Record<string, string>) || {};
    const newVer = bumpVersion(meta.version || "1.0.0");
    const key = `changelog_${newVer.replace(/\./g, "_")}`;
    meta.version = newVer;
    meta.updated = "GENERATED"; // resolver doesn't read this; date stamped by caller if needed
    meta[key] = `/qa-generate-data (${plan.feature}): added ${addedAliases.length} alias(es) [${addedAliases.join(", ")}] for combinations; gap fixtures seeded=false pending /qa-seed-data.`;
    aliases._meta = meta;
    if (!DRY) writeFileSync(ALIASES_PATH, JSON.stringify(aliases, null, 2) + "\n", "utf-8");
  }

  // Report.
  console.log(`\n📝 author-fixtures (${plan.feature})${DRY ? " [DRY RUN]" : ""}`);
  for (const c of changes) console.log(`  ${c.action === "append" ? "＋ append" : "↺ reuse "} ${c.file}  [${c.combo}]  ${c.businessKey}`);
  if (addedAliases.length) console.log(`  aliases ${DRY ? "would add" : "added"}: ${addedAliases.join(", ")}`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);

  // 5. Validate.
  if (!DRY && !NO_VALIDATE) {
    console.log(`\n▶ validate-td-refs.ts`);
    try {
      // execSync (shell) so Windows resolves `npx.cmd`; execFileSync("npx",…) ENOENTs on win32.
      const out = execSync("npx tsx scripts/validate-td-refs.ts", { cwd: ROOT, encoding: "utf-8", stdio: "pipe" });
      console.log(out.split(/\r?\n/).slice(-6).join("\n"));
      console.log("  ✓ validation green");
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      console.error((err.stdout || "") + (err.stderr || ""));
      console.error("  ✗ validation FAILED — fix the new aliases/fixtures above.");
      process.exit(1);
    }
  } else if (DRY) {
    console.log(`\n(skipped validate-td-refs.ts — dry run)`);
  }

  console.log(`\nNext: gap fixtures are templates (seeded=false). Run /qa-seed-data <domains> to provision, then tests reference @td(<combo alias>).\n`);
}

main();
