#!/usr/bin/env tsx
/**
 * Update fixtures under test-data/graphql/{queries,mutations}/ in a safe, auditable way.
 *
 * Modes (combinable; default = both):
 *   --bump            Bump `# last-validated:` to today for every fixture that is
 *                     currently schema-valid. Also updates the top-level
 *                     `lastValidated` in test-data/graphql/index.json.
 *   --apply-renames   For every fixture that fails validation, parse the validator
 *                     errors for `Did you mean "X"?` hints. When the error carries a
 *                     SINGLE suggestion (unambiguous), rewrite the field at the exact
 *                     line/column and re-validate. Only commits when the rewrite
 *                     produces a fully valid fixture.
 *
 * Flags:
 *   --dry-run         Print planned changes; do not write to disk.
 *   --refresh         Re-introspect the live schema before validating
 *                     (requires BACK_URL).
 *   --json            Emit a JSON change report instead of the human summary.
 *
 * Exits 0 unless a write failed. Validation failures are not fatal here —
 * use `npm run graphql:fixtures:validate` to gate CI.
 *
 * Usage:
 *   npx tsx scripts/update-graphql-fixtures.ts                 # bump + apply-renames
 *   npx tsx scripts/update-graphql-fixtures.ts --bump --dry-run
 *   npx tsx scripts/update-graphql-fixtures.ts --apply-renames --refresh
 */

import { config as loadDotenv } from "dotenv";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve, basename } from "path";
import {
  buildSchema,
  introspect,
  loadSchemaCache,
  saveSchemaCache,
  validateQuery,
  ValidationError,
} from "./lib/graphql-validator.js";

loadDotenv();

const ROOT = resolve(process.cwd());
const FIXTURES_DIR = join(ROOT, "test-data", "graphql");
const INDEX_PATH = join(FIXTURES_DIR, "index.json");
const SCHEMA_CACHE = join(ROOT, "scripts", ".graphql-schema.cache.json");

type Mode = "bump" | "apply-renames";

interface Args {
  modes: Set<Mode>;
  dryRun: boolean;
  refresh: boolean;
  json: boolean;
}

interface Fixture {
  path: string;
  relPath: string;
  kind: "query" | "mutation";
  headerLines: string[];
  body: string;
  eol: "\n" | "\r\n";
}

interface RenameApplied {
  line: number;
  column: number;
  from: string;
  to: string;
}

interface FixtureChange {
  relPath: string;
  name: string;
  bumped: boolean;
  renames: RenameApplied[];
  stillInvalidAfter: boolean;
  unsafeReasons: string[]; // why we skipped a rename
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const modes = new Set<Mode>();
  if (argv.includes("--bump")) modes.add("bump");
  if (argv.includes("--apply-renames")) modes.add("apply-renames");
  if (modes.size === 0) {
    modes.add("bump");
    modes.add("apply-renames");
  }
  return {
    modes,
    dryRun: argv.includes("--dry-run"),
    refresh: argv.includes("--refresh"),
    json: argv.includes("--json"),
  };
}

function today(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function detectEol(raw: string): "\n" | "\r\n" {
  return raw.includes("\r\n") ? "\r\n" : "\n";
}

function listFixtures(): Fixture[] {
  const fixtures: Fixture[] = [];
  for (const kind of ["queries", "mutations"] as const) {
    const dir = join(FIXTURES_DIR, kind);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".graphql")) continue;
      const full = join(dir, f);
      const raw = readFileSync(full, "utf-8");
      const eol = detectEol(raw);
      const lines = raw.split(/\r?\n/);
      const headerLines: string[] = [];
      const bodyLines: string[] = [];
      let inHeader = true;
      for (const line of lines) {
        if (inHeader) {
          if (line.startsWith("#")) {
            headerLines.push(line);
          } else if (line.trim() === "") {
            if (headerLines.length === 0) continue;
            inHeader = false;
          } else {
            inHeader = false;
            bodyLines.push(line);
          }
        } else {
          bodyLines.push(line);
        }
      }
      fixtures.push({
        path: full,
        relPath: `test-data/graphql/${kind}/${f}`,
        kind: kind === "queries" ? "query" : "mutation",
        headerLines,
        body: bodyLines.join("\n").replace(/\s+$/, ""),
        eol,
      });
    }
  }
  return fixtures.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function getHeaderName(headerLines: string[], path: string): string {
  for (const raw of headerLines) {
    const m = raw.replace(/^#\s?/, "").match(/^name:\s*(.+)$/i);
    if (m) return m[1].trim();
  }
  return basename(path, ".graphql");
}

function bumpHeader(headerLines: string[], date: string): { changed: boolean; lines: string[] } {
  let changed = false;
  const out = headerLines.map((raw) => {
    const m = raw.match(/^(#\s*last-validated:\s*)(.*)$/i);
    if (!m) return raw;
    const current = m[2].trim();
    if (current === date) return raw;
    changed = true;
    return `${m[1]}${date}`;
  });
  return { changed, lines: out };
}

/**
 * Extract a single-suggestion rename from a validator error.
 * Returns null when the error has zero or 2+ suggestions, or is not a field-name issue.
 */
function extractSingleRename(err: ValidationError): { from: string; to: string } | null {
  const fieldMatch =
    err.message.match(/Cannot query field "([^"]+)" on type "[^"]+"\./) ||
    err.message.match(/Field "([^"]+)" is not defined by type "[^"]+"/);
  if (!fieldMatch) return null;
  const from = fieldMatch[1];

  // "Did you mean "X"?" — exactly one quoted suggestion
  const single = err.message.match(/Did you mean\s+"([^"]+)"\s*\?\s*$/);
  if (single) return { from, to: single[1] };

  // Multiple suggestions like `Did you mean "a", "b", or "c"?` — ambiguous, skip.
  return null;
}

/**
 * Apply one rename at an exact (1-based line, 1-based column) in the body.
 * Returns the new body, or null when the original token at that position
 * does not match `from` (defensive — refuse silent corruption).
 */
function applyRenameAt(
  body: string,
  line: number,
  column: number,
  from: string,
  to: string
): string | null {
  const lines = body.split("\n");
  if (line < 1 || line > lines.length) return null;
  const idx = line - 1;
  const col = column - 1;
  const row = lines[idx];
  if (row.slice(col, col + from.length) !== from) return null;
  // Word-boundary check: char before must not be identifier-ish, char after must not be either.
  const before = col > 0 ? row[col - 1] : "";
  const after = row[col + from.length] ?? "";
  if (/[A-Za-z0-9_]/.test(before) || /[A-Za-z0-9_]/.test(after)) return null;
  lines[idx] = row.slice(0, col) + to + row.slice(col + from.length);
  return lines.join("\n");
}

function serializeFixture(headerLines: string[], body: string, eol: string): string {
  const head = headerLines.join(eol);
  const trimmedBody = body.replace(/\s+$/, "");
  return `${head}${eol}${eol}${trimmedBody}${eol}`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const backUrl = process.env.BACK_URL;

  // Schema load
  if (args.refresh) {
    if (!backUrl) {
      console.error("--refresh requires BACK_URL in .env");
      process.exit(2);
    }
    console.log(`Refreshing schema from ${backUrl}/graphql ...`);
    const intro = await introspect({ backUrl });
    saveSchemaCache(intro, SCHEMA_CACHE);
    console.log(`Cached at ${SCHEMA_CACHE}\n`);
  } else if (!existsSync(SCHEMA_CACHE)) {
    console.error(`Schema cache missing at ${SCHEMA_CACHE}. Run with --refresh first.`);
    process.exit(2);
  }
  const schema = buildSchema(loadSchemaCache(SCHEMA_CACHE));

  const fixtures = listFixtures();
  const changes: FixtureChange[] = [];
  const writes: Array<{ path: string; content: string }> = [];
  const date = today();

  for (const f of fixtures) {
    const change: FixtureChange = {
      relPath: f.relPath,
      name: getHeaderName(f.headerLines, f.path),
      bumped: false,
      renames: [],
      stillInvalidAfter: false,
      unsafeReasons: [],
    };

    let body = f.body;
    let headerLines = f.headerLines;
    let initial = validateQuery(schema, body);

    // --apply-renames
    if (args.modes.has("apply-renames") && !initial.valid) {
      let workingBody = body;
      let workingErrors = initial.errors;
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const e of workingErrors) {
          const r = extractSingleRename(e);
          if (!r) {
            if (e.message.includes("Did you mean")) {
              change.unsafeReasons.push(
                `multi-suggestion error skipped: ${e.message}`
              );
            }
            continue;
          }
          if (e.line == null || e.column == null) {
            change.unsafeReasons.push(
              `missing location for rename ${r.from}→${r.to}`
            );
            continue;
          }
          const next = applyRenameAt(workingBody, e.line, e.column, r.from, r.to);
          if (next == null) {
            change.unsafeReasons.push(
              `position mismatch at ${e.line}:${e.column} for ${r.from}→${r.to}`
            );
            continue;
          }
          workingBody = next;
          change.renames.push({ line: e.line, column: e.column, from: r.from, to: r.to });
          progressed = true;
          break; // re-validate after each successful rewrite
        }
        if (progressed) {
          workingErrors = validateQuery(schema, workingBody).errors;
        }
      }
      const after = validateQuery(schema, workingBody);
      if (after.valid && change.renames.length > 0) {
        body = workingBody;
        initial = after;
      } else if (change.renames.length > 0) {
        // Renames didn't fully fix it — discard to keep the fixture intact.
        change.unsafeReasons.push(
          `${change.renames.length} rename(s) did not produce a valid fixture; discarded`
        );
        change.renames = [];
        change.stillInvalidAfter = true;
      } else {
        change.stillInvalidAfter = true;
      }
    }

    // --bump (only if fixture is valid)
    if (args.modes.has("bump") && initial.valid) {
      const bumped = bumpHeader(headerLines, date);
      if (bumped.changed) {
        headerLines = bumped.lines;
        change.bumped = true;
      }
    }

    if (change.bumped || change.renames.length > 0) {
      writes.push({ path: f.path, content: serializeFixture(headerLines, body, f.eol) });
    }
    if (change.bumped || change.renames.length > 0 || change.unsafeReasons.length > 0) {
      changes.push(change);
    }
  }

  // Write fixture files
  let writeCount = 0;
  for (const w of writes) {
    if (!args.dryRun) writeFileSync(w.path, w.content, "utf-8");
    writeCount++;
  }

  // Update index.json `lastValidated` whenever --bump is active and at least one
  // fixture is currently schema-valid — even if no fixture header needed bumping
  // (because they were already on today's date). Surgical line-level replacement
  // preserves the file's existing formatting (compact inline arrays, key ordering).
  const anyValidToday =
    args.modes.has("bump") &&
    fixtures.some((f) => validateQuery(schema, f.body).valid);
  let indexBumped = false;
  if (anyValidToday && existsSync(INDEX_PATH)) {
    const raw = readFileSync(INDEX_PATH, "utf-8");
    const re = /("lastValidated"\s*:\s*")(\d{4}-\d{2}-\d{2})(")/;
    const m = raw.match(re);
    if (!m) {
      console.error(
        `Could not locate top-level "lastValidated" in ${INDEX_PATH}; skipping index bump.`
      );
    } else if (m[2] !== date) {
      const next = raw.replace(re, `$1${date}$3`);
      if (!args.dryRun) writeFileSync(INDEX_PATH, next, "utf-8");
      indexBumped = true;
    }
  }

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ranAt: new Date().toISOString(),
          dryRun: args.dryRun,
          date,
          totalFixtures: fixtures.length,
          fixturesWritten: writeCount,
          indexBumped,
          changes,
        },
        null,
        2
      ) + "\n"
    );
    return;
  }

  console.log(`Mode: ${[...args.modes].join(", ")}${args.dryRun ? " (dry-run)" : ""}`);
  console.log(`Date stamp: ${date}\n`);

  const bumpedList = changes.filter((c) => c.bumped);
  const renamedList = changes.filter((c) => c.renames.length > 0);
  const blockedList = changes.filter((c) => c.stillInvalidAfter || c.unsafeReasons.length > 0);

  if (renamedList.length > 0) {
    console.log(`Renames applied (${renamedList.length}):`);
    for (const c of renamedList) {
      console.log(`  ${c.relPath} (${c.name})`);
      for (const r of c.renames) console.log(`    · ${r.from} → ${r.to}  @ ${r.line}:${r.column}`);
    }
    console.log();
  }

  if (bumpedList.length > 0) {
    console.log(`Bumped last-validated (${bumpedList.length}):`);
    for (const c of bumpedList) console.log(`  ${c.relPath}`);
    console.log();
  }

  if (blockedList.length > 0) {
    console.log(`Skipped / still invalid (${blockedList.length}):`);
    for (const c of blockedList) {
      console.log(`  ${c.relPath} (${c.name})`);
      for (const r of c.unsafeReasons) console.log(`    · ${r}`);
    }
    console.log();
  }

  console.log(
    `Summary: ${fixtures.length} fixtures scanned · ` +
      `${writeCount} written${args.dryRun ? " (would write)" : ""} · ` +
      `${bumpedList.length} bumped · ${renamedList.length} rewritten · ` +
      `${blockedList.length} skipped` +
      (indexBumped ? ` · index.json bumped` : "")
  );
}

main().catch((e) => {
  console.error(`FATAL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(3);
});
