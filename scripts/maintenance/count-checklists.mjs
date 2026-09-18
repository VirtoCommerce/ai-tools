#!/usr/bin/env node
/**
 * count-checklists.mjs — print the /qa-checklist corpus inventory.
 *
 * WHY THIS EXISTS: the skill's SKILL.md used to transcribe every per-domain item
 * count into its own prose. Measured 2026-09-18, those numbers were stale in eight
 * places (738 claimed vs 753 actual) and one whole 35-item GraphQL section was
 * absent from the breakdown — the exact failure CLAUDE.md's "counts are never
 * transcribed into prose" rule names. The files are the source of truth; this
 * prints what they say.
 *
 *   npm run checklists:count           # human-readable table
 *   npm run checklists:count -- --json # machine-readable
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL_DIR = join(REPO, '.claude', 'skills', 'qa-checklist');

/** Sections that are front-matter prose, not a domain checklist. */
const NOT_A_DOMAIN = /^(Summary|Required Reading|Appendix|Template|When to Update)/i;

const FILES = [
  { file: 'domain-checklists.md', label: 'Storefront domains' },
  { file: 'backend-admin-checklists.md', label: 'Admin & API domains' },
  { file: 'graphql-checklist.md', label: 'GraphQL xAPI sections' },
];

/** Split a checklist file into `## ` sections and count `- [ ]` items in each. */
function parse(path) {
  const sections = [];
  let current = null;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.*)/);
    if (heading) {
      current = { name: heading[1].trim(), items: 0 };
      if (!NOT_A_DOMAIN.test(current.name)) sections.push(current);
      continue;
    }
    if (current && /^\s*-\s*\[\s*\]/.test(line)) current.items += 1;
  }
  return sections;
}

const result = FILES.map(({ file, label }) => {
  const sections = parse(join(SKILL_DIR, file));
  return {
    file,
    label,
    sections,
    sectionCount: sections.length,
    itemCount: sections.reduce((sum, s) => sum + s.items, 0),
  };
});

const totalSections = result.reduce((n, r) => n + r.sectionCount, 0);
const totalItems = result.reduce((n, r) => n + r.itemCount, 0);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ files: result, totalSections, totalItems }, null, 2));
} else {
  for (const r of result) {
    const shown = relative(REPO, join(SKILL_DIR, r.file)).split(sep).join('/');
    console.log('');
    console.log(`${r.label} — ${shown}`);
    console.log(`  ${r.sectionCount} sections · ${r.itemCount} items`);
    for (const s of r.sections) console.log(`  ${String(s.items).padStart(4)}  ${s.name}`);
  }
  console.log('');
  console.log(`TOTAL: ${totalSections} checklists · ${totalItems} items`);
}
