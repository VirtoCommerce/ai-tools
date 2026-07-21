#!/usr/bin/env node
/**
 * scripts/seed-data/cms/validate-pagebuilder-pages-data.mjs  (td:validate:cms-pages)
 *
 * STATIC drift-guard for the canonical qa-* PageBuilder page fixture (no network). Asserts:
 *   1. spec coherence — unique aliases + permalinks, valid expectStatus, permalinks start with '/';
 *   2. no runtime GUID leaked into the spec module (ids live in aliases.<env>.json);
 *   3. every canonical page's @td alias is registered in test-data/aliases.json and GUID-free.
 * Exit 1 on any violation.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_PAGES, STATUS, findGuidLeaks, CONTENT_FILE, contentDocFor, blockCount, DISCOVER_RE } from './pagebuilder-pages-specs.mjs';
import { existsSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };

console.log('=== validate PageBuilder qa-* pages fixture (static drift-guard) ===');

// 1. spec coherence
const aliases = new Set(); const permalinks = new Set(); let dupe = false;
const validStatus = new Set(Object.values(STATUS));
for (const p of CANONICAL_PAGES) {
  if (aliases.has(p.alias)) { fail(`duplicate alias ${p.alias}`); dupe = true; } aliases.add(p.alias);
  if (permalinks.has(p.permalink)) { fail(`duplicate permalink ${p.permalink}`); dupe = true; } permalinks.add(p.permalink);
  if (!p.permalink.startsWith('/')) fail(`permalink ${p.permalink} must start with '/'`);
  if (!validStatus.has(p.expectStatus)) fail(`${p.alias}: invalid expectStatus ${p.expectStatus}`);
}
if (!dupe && !problems.length) ok(`${CANONICAL_PAGES.length} canonical pages: unique aliases + permalinks, valid expectStatus`);

// 2. no GUID in spec module
const specSrc = readFileSync(join(ROOT, 'scripts/seed-data/cms/pagebuilder-pages-specs.mjs'), 'utf8');
const specLeaks = findGuidLeaks(specSrc);
if (specLeaks.length) fail(`spec module leaks runtime GUID(s): ${specLeaks.join(', ')}`);
else ok('spec module carries no runtime GUID (groupIds belong in aliases.<env>.json)');

// 3. aliases registered + GUID-free
const registry = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const aliasNames = [];
for (const p of CANONICAL_PAGES) { aliasNames.push(p.alias); if (p.frAlias) aliasNames.push(p.frAlias); }
for (const name of aliasNames) {
  const a = registry[name];
  if (!a) { fail(`alias ${name} not registered in aliases.json`); continue; }
  if ((a.permalink || '') === '') fail(`alias ${name} missing permalink`);
  const leaks = findGuidLeaks(JSON.stringify(a));
  if (leaks.length) fail(`alias ${name} carries a runtime GUID in aliases.json (${leaks.join(', ')}) — belongs in aliases.<env>.json`);
}
if (!problems.some((m) => m.includes('alias'))) ok(`all ${aliasNames.length} page aliases registered + GUID-free in aliases.json`);

// 4. content fixture (test-data/cms/page-content.json)
const cPath = join(ROOT, CONTENT_FILE);
if (!existsSync(cPath)) fail(`content fixture ${CONTENT_FILE} not found`);
else {
  const fixture = JSON.parse(readFileSync(cPath, 'utf8'));
  const cLeaks = findGuidLeaks(JSON.stringify(fixture));
  if (cLeaks.length) fail(`content fixture leaks runtime GUID(s): ${cLeaks.join(', ')}`);
  else ok('content fixture carries no runtime GUID');
  const KNOWN = new Set(['title', 'text', 'image', 'predefined-product-list']);
  let blocks = 0, bad = 0;
  for (const spec of CANONICAL_PAGES) {
    const cultures = spec.multiLang ? ['en-US', 'de-DE', ...(spec.frName ? ['fr-FR'] : [])] : [spec.culture];
    for (const cul of cultures) {
      const doc = contentDocFor(fixture, spec, cul);
      if (!doc) { fail(`${spec.alias} (${cul}): no content doc in fixture`); continue; }
      if (blockCount(doc) < 1) { fail(`${spec.alias} (${cul}): content doc has 0 blocks`); continue; }
      for (const b of doc.content) {
        blocks++;
        if (!KNOWN.has(b.type)) { fail(`${spec.alias} (${cul}): unknown block type "${b.type}"`); bad++; }
        if (typeof b.skus === 'string' && !DISCOVER_RE.test(b.skus)) { fail(`${spec.alias} (${cul}): skus string must be "@discover:N", got "${b.skus}"`); bad++; }
      }
    }
  }
  if (!bad) ok(`content fixture: ${blocks} block(s) across all pages, all known types, sku markers well-formed`);
}

console.log(`\n${problems.length ? `FAILED — ${problems.length} problem(s)` : 'OK'}`);
process.exit(problems.length ? 1 : 0);
