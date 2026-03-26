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
  private csvCache: Map<string, CSVRow[]> = new Map();
  private warnings: string[] = [];

  constructor(testDataDir: string) {
    this.testDataDir = testDataDir;

    const aliasPath = join(testDataDir, "aliases.json");
    if (existsSync(aliasPath)) {
      this.aliases = JSON.parse(readFileSync(aliasPath, "utf-8"));
    } else {
      this.aliases = {};
      console.warn(`[test-data-resolver] aliases.json not found at ${aliasPath}`);
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
    // Check if alias form: ALIAS_NAME.field
    const aliasDotMatch = inner.match(/^([A-Z][A-Z0-9_]+)\.(\w+)$/);
    if (aliasDotMatch) {
      return this.resolveAlias(aliasDotMatch[1], aliasDotMatch[2]);
    }

    // Direct form: file, filter, column
    const parts = inner.split(",").map((s) => s.trim());
    if (parts.length === 3) {
      return this.resolveDirect(parts[0], parts[1], parts[2]);
    }

    throw new Error(`Invalid @td() syntax: "${inner}". Expected ALIAS.field or file, filter, column`);
  }

  private resolveAlias(aliasName: string, fieldName: string): string {
    const alias = this.aliases[aliasName] as AliasEntry | undefined;
    if (!alias || !alias.file) {
      throw new Error(`Unknown alias "${aliasName}"`);
    }

    // Map field shortname to CSV column name
    const csvColumn = alias.fields?.[fieldName];
    if (!csvColumn) {
      throw new Error(
        `Unknown field "${fieldName}" on alias "${aliasName}". Available: ${Object.keys(alias.fields || {}).join(", ")}`
      );
    }

    const rows = this.loadCSV(alias.file);
    const row = this.filterRows(rows, alias.filter);
    if (!row) {
      throw new Error(
        `No matching row in ${alias.file}.csv for filter ${JSON.stringify(alias.filter)}`
      );
    }

    const value = row[csvColumn];
    if (value === undefined) {
      throw new Error(`Column "${csvColumn}" not found in ${alias.file}.csv`);
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
