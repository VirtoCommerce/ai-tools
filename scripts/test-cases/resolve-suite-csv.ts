/**
 * Resolves @td() tokens in a suite CSV and writes the resolved version.
 * Usage: npx tsx scripts/resolve-suite-csv.ts <input-csv> <output-csv>
 */
import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TestDataResolver } from '../lib/test-data-resolver.js';
import { resolveTestEnv } from '../lib/resolve-test-env.js';

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error('Usage: resolve-suite-csv.ts <input> <output>');
  process.exit(1);
}

// The resolver layers aliases.<TEST_ENV>.json. Resolve the env as config.js does (TEST_ENV, else
// .env.test-env, else vcst): unresolved, it ignored .env.test-env and layered no overlay at all.
resolveTestEnv('vcst');
const resolver = new TestDataResolver(join(process.cwd(), 'test-data'));
const content = readFileSync(inputPath, 'utf-8');
const resolved = resolver.resolveCSV(content);
writeFileSync(outputPath, resolved, 'utf-8');
console.log(`Resolved: ${inputPath} → ${outputPath}`);
