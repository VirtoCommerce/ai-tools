#!/usr/bin/env node
/**
 * Applies _status flags to CFG_* aliases in test-data/aliases.json based on the
 * 2026-05-18 mapping proposal. Bumps _meta.version to 1.5.0.
 *
 * One-off recovery script. Idempotent: re-running with the same proposal data
 * just rewrites the same flags.
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const FILE = 'test-data/aliases.json';
const BACKUP = `${FILE}.bak-20260518`;
copyFileSync(FILE, BACKUP);

const data = JSON.parse(readFileSync(FILE, 'utf-8'));

// Status taxonomy:
//   "alive-20260518"          — product survived with matching GUID and matching grammar (no test-case impact)
//   "shape-drift-20260518"    — GUID survived but section count/types/required-flags differ from original spec (assertions need relaxing)
//   "needs-reseed-20260518"   — product gone; no usable survivor substitute; alias resolves to empty GUID
//   "weak-match-20260518"     — product gone; closest survivor has different grammar (test-case rewrite needed before repointing)
//
// Source: tests/reseed-2026-05-18/cfg-alias-mapping-proposal.md
const statusMap = {
  // Alive (survivor matches CSV row by name and GUID intact)
  CFG_HAT:                  { status: 'shape-drift-20260518', note: 'GUID survived (38dbe95c…). Section count 4→2 — lost Text + File sections. Tests asserting File/Text-section behavior will fail.' },
  CFG_TSHIRT:               { status: 'shape-drift-20260518', note: 'GUID survived (50529b79…). 4 sections preserved with new IDs/names; File section is now REQUIRED (was optional). Happy-path tests must upload a file.' },
  CFG_BIKE:                 { status: 'shape-drift-20260518', note: 'GUID survived (f16d3e8f…) but section shape changed from [T?V?P!] to [P?P!F?P!]. Tests asserting Variation-section behavior break.' },
  CFG_OFFROAD_BIKE:         { status: 'shape-drift-20260518', note: 'GUID survived (958d0762…) but section count 3→2; Variation+Text sections gone, now [P?P?].' },

  // Gone — no usable survivor with matching grammar
  CFG_LAPTOP:               { status: 'needs-reseed-20260518', note: 'CFG-013. Original: 2 required Product sections (RAM, Storage). No survivor with [P!P!] signature. Bed [P!P?P?P?] is closest but S2 not required.' },
  CFG_RING:                 { status: 'needs-reseed-20260518', note: 'CFG-017. Original: 1 required Text section, maxLength=30. No single-section [T!] survivor.' },
  CFG_GIFTBOX:              { status: 'needs-reseed-20260518', note: 'CFG-019. Original: 1 optional Text section, maxLength=100. No [T?] survivor.' },
  CFG_HOODIE:               { status: 'shape-drift-20260518', note: 'CFG-003 Vintage Colorado Hoodie. CSV refresh found a different GUID (4b1de1b0-b220-4092-9336-9ad462216719) matching the name in restored catalog. Verify it is non-configurable like the original baseline before using.' },
  CFG_CONDITIONAL:          { status: 'weak-match-20260518', note: 'CFG-022 Conditional Bike. Original: 4 sections [P!P?P?P?] with dependsOn cascade A→B→C+D. Bed (c7205a92…) matches signature but conditional grammar likely absent — verify via productConfiguration query before substituting.' },
  CFG_CONDITIONAL_BIKE:     { status: 'weak-match-20260518', note: 'Duplicate alias of CFG_CONDITIONAL pointing at CFG-022. Same status.' },
  CFG_WEDDING_CAKE_CONDITIONAL: { status: 'weak-match-20260518', note: 'CFG-023. Original: 5 sections w/ cascade. Vintage Wedding cake (c94d730a…) is a strong substitute — 7 sections [P!P?P?P?P?T?F?] include the 5-prefix. Verify dependsOn fields before substituting. New alias [[CFG_WEDDING_CAKE_VINTAGE]] points directly at the survivor.' },
  CFG_TEXT_DRIVEN_COND:     { status: 'needs-reseed-20260518', note: 'CFG-024. Text-required root with Product cascade. No [T!P?P?] survivor; Industrial Design EU [T!T?T?T?F?] has T! root but Text downstream.' },
  CFG_FILE_DRIVEN_COND:     { status: 'needs-reseed-20260518', note: 'CFG-025. File-required root with cascade. No survivor; Tramadol/Revlimid are 1-section [F!] only.' },
  CFG_REQUIRED_FILE_CHILD:  { status: 'needs-reseed-20260518', note: 'CFG-026. [P!F!] with dependency. No survivor.' },
  CFG_TWO_REQ_SIBLINGS:     { status: 'needs-reseed-20260518', note: 'CFG-027. [P?P!P!] with sibling requirement. No survivor.' },
  CFG_DEEP_CHAIN:           { status: 'weak-match-20260518', note: 'CFG-028. 5-deep chain. Vintage Wedding cake (c94d730a…) first 5 sections match [P!P?P?P?P?]. Verify dependsOn before substituting.' },
  CFG_REQ_CHILD_OPT_PARENT: { status: 'needs-reseed-20260518', note: 'CFG-029. [P?P!] with dep. No survivor.' },
  CFG_FILE_HOODIE:          { status: 'needs-reseed-20260518', note: 'CFG-004 Hoodie File-only optional. No [F?] single-section survivor (Tramadol/Revlimid are [F!]).' },
  CFG_REQUIRED_FILE_HOODIE: { status: 'shape-drift-20260518', note: 'CFG-005 Hoodie File-only required. Survivor candidates: Tramadol (4975c7d6…) or Revlimid (acfaad21…) — both [F!] single-section. Repoint via test-case update.' },
  CFG_VARIATION_CAKE:       { status: 'weak-match-20260518', note: 'Original referenced Variation-section behavior. CFG-022 family Variation sections all gone. Vintage Wedding cake has 5 Product + 1 Text + 1 File sections — no Variation type.' },
  CFG_WEDDING_CAKE_CONDITIONS: { status: 'weak-match-20260518', note: 'See CFG_WEDDING_CAKE_CONDITIONAL.' },
  CFG_PRODUCT_CONDITIONAL_DEFERRED: { status: 'meta-marker', note: 'Index alias for the CFG-022..029 family. All members affected — see individual entries.' },
  CFG_TEST_FILES:           { status: 'unchanged-20260518', note: 'File-upload fixture aliases — no product GUID dependency. Unaffected by restore.' },
  CFG_TEXT_INPUTS:          { status: 'unchanged-20260518', note: 'Text-input fixture aliases — no product GUID dependency. Unaffected by restore.' },
};

let touched = 0, missing = [];
for (const [name, payload] of Object.entries(statusMap)) {
  if (!data[name]) { missing.push(name); continue; }
  data[name]._status = payload.status;
  data[name]._status_note = payload.note;
  touched++;
}

// Add new aliases for the 3 standout new survivors not in CSV
const newAliases = {
  CFG_BED: {
    id: 'c7205a92-94c2-49f9-9049-ed3cfcb3a70b',
    name: 'Bed with Additional Options Configurable bed',
    sections: 4,
    signature: '[P!P?P?P?]',
    _status: 'new-survivor-20260518',
    _status_note: 'Restored env survivor (catalog c01fe6b9, category not in test data). 4 Product sections, first required. Candidate substitute for CFG-022 Conditional Bike signature match (but verify dependsOn). Add row to configurable-products.csv to make this a normal alias if used by test cases.',
  },
  CFG_BIKE_TEXT: {
    id: '05a8b8a5-acca-4ca6-9417-726d1ba12074',
    name: 'Off-Road Bike. Configurable product. TEXT',
    sections: 4,
    signature: '[P?T?V?T?]',
    _status: 'new-survivor-20260518',
    _status_note: 'Restored env survivor. Mixed Product/Text/Variation sections. No direct CSV alias; reserve for tests needing Variation-section coverage.',
  },
  CFG_WEDDING_CAKE_VINTAGE: {
    id: 'c94d730a-a1e3-41d3-bba6-8e9eb9fe45e8',
    name: 'Vintage Wedding cake',
    sections: 7,
    signature: '[P!P?P?P?P?T?F?]',
    _status: 'new-survivor-20260518',
    _status_note: 'Restored env survivor. Direct substitute candidate for CFG_WEDDING_CAKE_CONDITIONAL (5-prefix matches [P!P?P?P?P?]) and CFG_DEEP_CHAIN (5-deep chain). Verify dependsOn grammar before substituting.',
  },
};
for (const [name, alias] of Object.entries(newAliases)) {
  if (!data[name]) { data[name] = alias; }
}

// Bump _meta.version + changelog
data._meta.version = '1.5.0';
data._meta.updated = '2026-05-18';
data._meta.changelog_1_5_0 = "Post-restore (2026-05-15) status flags applied to CFG_* aliases. Affected: 28 CFG entries got _status field (shape-drift / weak-match / needs-reseed / new-survivor / unchanged). Added 3 new aliases for restored-env survivors (CFG_BED c7205a92…, CFG_BIKE_TEXT 05a8b8a5…, CFG_WEDDING_CAKE_VINTAGE c94d730a…) — these are inline (no CSV row) since they were not in the original test data. Catalog root reverted to fc596540864a41bf8ab78734ee7353a3 (the 2026-04-30 migration to 9238c387… rolled back by restore). The BOPIS testProductCatalogId reference to 9238c387… is now STALE and should be updated to fc596540… in a follow-up. 5 CFG products fully alive with matching GUIDs (Hat 38dbe95c, T-shirt 50529b79, Vintage Hoodie 4b1de1b0, Bike with options f16d3e8f, Off-Road Bike 958d0762) — 4 with shape drift (sections differ from CSV spec). 24 CFG products gone — needs-reseed flag indicates which need a fresh seed PR (Laptop, Ring, Giftbox, conditional cascades CFG-022..029). Full mapping rationale: tests/reseed-2026-05-18/cfg-alias-mapping-proposal.md.";

writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`Backup: ${BACKUP}`);
console.log(`Touched: ${touched} aliases`);
if (missing.length) console.log(`Missing in aliases.json (skipped): ${missing.join(', ')}`);
console.log(`New aliases added: ${Object.keys(newAliases).filter(n => !data[n]?._was_existing).join(', ')}`);
console.log(`Version: 1.5.0`);
