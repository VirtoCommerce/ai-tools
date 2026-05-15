/**
 * Resolves @td() tokens in a suite CSV and writes the resolved version.
 * Usage: npx tsx scripts/resolve-suite-csv.ts <input-csv> <output-csv>
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TestDataResolver } from './lib/test-data-resolver.js';

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error('Usage: resolve-suite-csv.ts <input> <output>');
  process.exit(1);
}

const resolver = new TestDataResolver(join(process.cwd(), 'test-data'));
const content = readFileSync(inputPath, 'utf-8');
const resolved = resolver.resolveCSV(content);
writeFileSync(outputPath, resolved, 'utf-8');
console.log(`Resolved: ${inputPath} → ${outputPath}`);
