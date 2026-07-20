/**
 * Test Data Resolver
 *
 * Resolves @td() references in regression suite CSVs to actual values
 * from test-data/ CSV files using an alias registry.
 *
 * Syntax:
 *   @td(ALIAS.field)                           — alias lookup via aliases.json
 *   @td(file, key=val&key=val, column)          — direct CSV lookup
 *
 * Usage:
 *   import { TestDataResolver } from '../lib/test-data-resolver.js';
 *   const resolver = new TestDataResolver(join(process.cwd(), 'test-data'));
 *   const resolved = resolver.resolveCSV(csvContent);
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

interface AliasFields {
  [shortName: string]: string; // shortName → CSV column name
}

interface AliasEntry {
  file: string;
  filter: Record<string, string>;
  fields: AliasFields;
}

// JSON-fixture-backed alias (VCST-5482 pilot): static fields resolve from a Swagger-shaped JSON
// fixture under test-data/ (e.g. orders/completed-order); runtime GUIDs (id) come from the
// aliases.<env>.json overlay, which wins field-by-field in resolveAlias(). `fields` maps a short
// name → a dotted JSON path (defaults to the field name itself when a mapping is absent).
interface JsonAliasEntry {
  json: string; // path under test-data/, with or without the .json extension
  fields?: AliasFields;
}

interface AliasRegistry {
  _meta?: Record<string, string>;
  [aliasName: string]: AliasEntry | Record<string, string> | undefined;
}

type CSVRow = Record<string, string>;

// Simple CSV parser that handles quoted fields with commas
function parseCSV(content: string): CSVRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: CSVRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j].trim()] = (values[j] || "").trim();
    }
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  fields.push(current);
  return fields;
}

export class TestDataResolver {
  private testDataDir: string;
  private aliases: AliasRegistry;
  // Per-env overrides are kept SEPARATE from the base registry (not shallow-merged)
  // so they can supplement a base alias field-by-field: a CSV-backed alias keeps
  // its `file`/`fields`/`filter` from aliases.json (code, sku, name) while the env
  // file supplies only the runtime-drifting GUIDs (id, platform_id, …). See
  // resolveAlias() — env fields win per-field; anything absent falls back to base.
  private envOverrides: AliasRegistry = {};
  private csvCache: Map<string, CSVRow[]> = new Map();
  private jsonCache: Map<string, Record<string, unknown>> = new Map();
  private warnings: string[] = [];

  constructor(testDataDir: string, testEnv?: string) {
    this.testDataDir = testDataDir;

    // Load base aliases (shared across all environments)
    const basePath = join(testDataDir, "aliases.json");
    let base: AliasRegistry = {};
    if (existsSync(basePath)) {
      base = JSON.parse(readFileSync(basePath, "utf-8"));
    } else {
      console.warn(`[test-data-resolver] aliases.json not found at ${basePath}`);
    }
    this.aliases = base;

    // Load per-env overrides (per feature/qa-agentic-standardization). Defaults to
    // process.env.TEST_ENV so existing callers Just Work without passing an explicit
    // env. Seeders write runtime IDs here via seed-common's writeEnvAliasOverride();
    // the base aliases.json stays shared and definition-only. Resolution is
    // field-level (see resolveAlias), so an override needs only the drifting fields.
    const envName = testEnv ?? process.env.TEST_ENV;
    if (envName) {
      const envPath = join(testDataDir, `aliases.${envName}.json`);
      if (existsSync(envPath)) {
        this.envOverrides = JSON.parse(readFileSync(envPath, "utf-8")) as AliasRegistry;
        const overrideCount = Object.keys(this.envOverrides).filter(k => k !== "_meta").length;
        console.log(
          `[test-data-resolver] Layered ${overrideCount} env override(s) from aliases.${envName}.json`
        );
      }
    }
  }

  /** Resolve all @td() tokens in a string */
  resolve(input: string): string {
    return input.replace(/@td\(([^)]+)\)/g, (_match, inner: string) => {
      try {
        return this.resolveToken(inner.trim());
      } catch (err) {
        const msg = `[test-data-resolver] Failed to resolve @td(${inner}): ${(err as Error).message}`;
        this.warnings.push(msg);
        console.warn(msg);
        return _match; // pass through unresolved
      }
    });
  }

  /** Resolve all @td() tokens in an entire CSV content string */
  resolveCSV(csvContent: string): string {
    return this.resolve(csvContent);
  }

  /** Get warnings from the last resolve operation */
  getWarnings(): string[] {
    return [...this.warnings];
  }

  /** Clear accumulated warnings */
  clearWarnings(): void {
    this.warnings = [];
  }

  private resolveToken(inner: string): string {
    // Alias form: ALIAS_NAME.field, or ALIAS_NAME.field.subfield (nested,
    // for inline aliases with object values like UPLOAD_FIXTURES.primary.path).
    const aliasDotMatch = inner.match(/^([A-Z][A-Z0-9_]+)((?:\.\w+)+)$/);
    if (aliasDotMatch) {
      const fieldPath = aliasDotMatch[2].slice(1); // strip leading "."
      return this.resolveAlias(aliasDotMatch[1], fieldPath);
    }

    // Direct form: file, filter, column
    const parts = inner.split(",").map((s) => s.trim());
    if (parts.length === 3) {
      return this.resolveDirect(parts[0], parts[1], parts[2]);
    }

    throw new Error(`Invalid @td() syntax: "${inner}". Expected ALIAS.field or file, filter, column`);
  }

  /**
   * Soft dotted-path lookup on an inline-ish object (an alias value or an env
   * override). Returns the stringified value, or undefined when the path is
   * absent/null — the caller decides whether that's an error or a fallback.
   * Primitives stringify directly; arrays/objects serialize to JSON (for query
   * bodies). The reserved `_inline` marker is skipped for a bare field name.
   */
  private tryResolveObjectField(
    obj: Record<string, unknown>,
    fieldName: string
  ): string | undefined {
    let cur: unknown = obj;
    for (const seg of fieldName.split(".")) {
      if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[seg];
    }
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur === "string") return cur;
    if (typeof cur === "number" || typeof cur === "boolean") return String(cur);
    return JSON.stringify(cur);
  }

  private resolveAlias(aliasName: string, fieldName: string): string {
    // Per-env override wins field-by-field: a seeder-written aliases.{env}.json
    // supplies the runtime GUIDs (id, platform_id, section ids, …) while every
    // other field falls through to the shared base alias below (code, sku, name).
    const override = this.envOverrides[aliasName];
    if (override && typeof override === "object") {
      const ov = this.tryResolveObjectField(override as Record<string, unknown>, fieldName);
      if (ov !== undefined) return ov;
    }

    const alias = this.aliases[aliasName] as
      | (AliasEntry & { _inline?: boolean })
      | Record<string, unknown>
      | undefined;
    if (!alias) {
      throw new Error(`Unknown alias "${aliasName}"`);
    }

    // Inline alias: values live directly under the alias key (no CSV file).
    // Examples: CFG_OFFROAD_BIKE, CFG_FILE_HOODIE — see test-data/aliases.json.
    // fieldName may be dotted ("primary.path") for nested objects.
    if ((alias as { _inline?: boolean })._inline) {
      const resolved = this.tryResolveObjectField(alias as Record<string, unknown>, fieldName);
      if (resolved === undefined) {
        throw new Error(
          `Unknown or null field "${fieldName}" on inline alias "${aliasName}"`
        );
      }
      return resolved;
    }

    // JSON-fixture alias (VCST-5482): static fields resolve from a Swagger-shaped JSON fixture; the
    // runtime GUID (id) was already resolved from the env overlay above. `fields` maps short name →
    // dotted JSON path (falls back to the field name itself).
    if ((alias as JsonAliasEntry).json) {
      const j = alias as JsonAliasEntry;
      const path = j.fields?.[fieldName] ?? fieldName;
      const data = this.loadJSON(j.json);
      const resolved = this.tryResolveObjectField(data, path);
      if (resolved === undefined) {
        throw new Error(
          `Field "${fieldName}" (json path "${path}") not found in ${j.json}.json for alias "${aliasName}". ` +
          `If this is a runtime id, seed the env so aliases.<env>.json carries it.`
        );
      }
      return resolved;
    }

    if (!(alias as AliasEntry).file) {
      throw new Error(
        `Alias "${aliasName}" has neither _inline:true, a .json fixture, nor a .file field — cannot resolve`
      );
    }

    // Map field shortname to CSV column name
    const csvColumn = (alias as AliasEntry).fields?.[fieldName];
    if (!csvColumn) {
      throw new Error(
        `Unknown field "${fieldName}" on alias "${aliasName}". Available: ${Object.keys((alias as AliasEntry).fields || {}).join(", ")}`
      );
    }

    const csvAlias = alias as AliasEntry;
    const rows = this.loadCSV(csvAlias.file);
    const row = this.filterRows(rows, csvAlias.filter);
    if (!row) {
      throw new Error(
        `No matching row in ${csvAlias.file}.csv for filter ${JSON.stringify(csvAlias.filter)}`
      );
    }

    const value = row[csvColumn];
    if (value === undefined) {
      throw new Error(`Column "${csvColumn}" not found in ${csvAlias.file}.csv`);
    }

    return value;
  }

  private resolveDirect(file: string, filterStr: string, column: string): string {
    const filter: Record<string, string> = {};
    for (const part of filterStr.split("&")) {
      const eqIdx = part.indexOf("=");
      if (eqIdx > 0) {
        filter[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
      }
    }

    const rows = this.loadCSV(file);
    const row = this.filterRows(rows, filter);
    if (!row) {
      throw new Error(`No matching row in ${file}.csv for filter ${JSON.stringify(filter)}`);
    }

    const value = row[column];
    if (value === undefined) {
      throw new Error(`Column "${column}" not found in ${file}.csv`);
    }

    return value;
  }

  private loadCSV(file: string): CSVRow[] {
    // Normalize file path (strip .csv extension if provided)
    const normalizedFile = file.replace(/\.csv$/, "");

    if (this.csvCache.has(normalizedFile)) {
      return this.csvCache.get(normalizedFile)!;
    }

    const csvPath = join(this.testDataDir, `${normalizedFile}.csv`);
    if (!existsSync(csvPath)) {
      throw new Error(`CSV file not found: ${csvPath}`);
    }

    const content = readFileSync(csvPath, "utf-8");
    const rows = parseCSV(content);
    this.csvCache.set(normalizedFile, rows);
    return rows;
  }

  private loadJSON(file: string): Record<string, unknown> {
    const normalizedFile = file.replace(/\.json$/, "");
    if (this.jsonCache.has(normalizedFile)) {
      return this.jsonCache.get(normalizedFile)!;
    }
    const jsonPath = join(this.testDataDir, `${normalizedFile}.json`);
    if (!existsSync(jsonPath)) {
      throw new Error(`JSON fixture not found: ${jsonPath}`);
    }
    const data = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;
    this.jsonCache.set(normalizedFile, data);
    return data;
  }

  private filterRows(rows: CSVRow[], filter: Record<string, string>): CSVRow | null {
    for (const row of rows) {
      let match = true;
      for (const [key, value] of Object.entries(filter)) {
        if (row[key] !== value) {
          match = false;
          break;
        }
      }
      if (match) return row;
    }
    return null;
  }
}
