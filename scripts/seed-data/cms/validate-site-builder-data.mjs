#!/usr/bin/env node
/**
 * scripts/seed-data/cms/validate-site-builder-data.mjs — static drift guard for the Site Builder fixtures
 * (npm run td:validate:site-builder). No network.
 *
 * Fails when a declaration would make its fixture decide nothing (announcement colours that are not palette
 * tokens, a rule whose product type equals its control's, two editor roles that do not differ by
 * builder:theme, a publish permission on a role that must not publish, a legacy page whose settings header
 * equals its name or does not hide the breadcrumbs), when a reused fixture lost what it is reused for, when a
 * runtime GUID leaks into the committed declarations, or when the declared theme no longer builds into files
 * that keep the storefront's built-in rules.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THEME_ALIAS, EDITOR_ALIASES, REUSE_ALIASES, PAGE_ALIAS, themeProblems, editorProblems, desiredFiles, FILES,
  templateFile, findGuidLeaks,
} from './site-builder-specs.mjs';
import { CANONICAL_PAGES, CONTENT_FILE } from './pagebuilder-pages-specs.mjs';
import { routesFor, familyOf, FAMILIES } from './builder-routes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const aliases = JSON.parse(read('test-data/aliases.json'));
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const section = (name, list) => { if (list.length) list.forEach((p) => fail(`${name}: ${p}`)); else ok(name); };

console.log('=== validate Site Builder fixtures (static drift guard) ===');

// 1. route families: one per module, no shared prefix (a seeder on the wrong family 404s on every call)
const fam = Object.keys(FAMILIES).map(routesFor);
const prefixes = fam.flatMap((r) => [r.pages, r.shared, r.assets]);
section('route families distinct per module', [
  ...(new Set(prefixes).size !== prefixes.length ? ['two families share a route prefix'] : []),
  ...(familyOf([{ id: FAMILIES['site-builder'].moduleId }, { id: FAMILIES['page-builder'].moduleId }]) !== 'site-builder' ? ['Site Builder must win when both modules are installed'] : []),
]);

// 2. declarations decide something
section(`${THEME_ALIAS} declaration`, themeProblems(aliases[THEME_ALIAS]));
section('editor declarations (scope, no publish, the pair differs by builder:theme)', editorProblems(Object.fromEntries(EDITOR_ALIASES.map((a) => [a, aliases[a]]))));

// 3. the declared theme still builds, from an absent found state, into files that keep the built-in rules
const theme = aliases[THEME_ALIAS];
if (theme && !themeProblems(theme).length) {
  const files = desiredFiles(theme, {}, { light: {}, dark: {} });
  const rules = files[FILES.rules].product.map((r) => r.id);
  const header = files[FILES.header].content;
  section('declared theme builds non-vacuous files', [
    ...(rules[0] !== theme.rule.id ? [`our rule is not first (${rules.join(', ')})`] : []),
    ...theme.rules_when_absent.product.filter((r) => !rules.includes(r.id)).map((r) => `built-in rule ${r.id} dropped`),
    ...(!header.some((x) => x.type === 'site-header') ? ['header group lost its site header'] : []),
    ...(header.filter((x) => x.type === 'announcement-bar').length !== 1 ? ['header group must hold exactly one announcement bar'] : []),
    ...(!JSON.stringify(files[templateFile(theme.template.key)]).includes(theme.template.marker) ? ['template does not carry the marker'] : []),
  ]);
}

// 4. the AC-7 legacy page: settings header differs from name and title, breadcrumbs hidden
const page = aliases[PAGE_ALIAS];
const spec = CANONICAL_PAGES.find((p) => p.alias === PAGE_ALIAS);
const doc = JSON.parse(read(CONTENT_FILE))[PAGE_ALIAS];
const titles = (doc?.content || []).filter((b) => b.type === 'title').map((b) => b.title);
section(`${PAGE_ALIAS} (legacy page settings)`, [
  ...(!page ? ['not declared in aliases.json'] : []),
  ...(!spec ? ['not in CANONICAL_PAGES (seed:cms-pages would not provision it)'] : []),
  ...(spec && page && (spec.name !== page.name || spec.permalink !== page.permalink) ? ['alias and CANONICAL_PAGES disagree on name/permalink'] : []),
  ...(!doc ? [`no content in ${CONTENT_FILE}`] : []),
  ...(doc && doc.settings?.hideBreadcrumbs !== true ? ['settings.hideBreadcrumbs must be true'] : []),
  ...(doc && page && doc.settings?.header !== page.header ? ['settings.header differs from the alias header'] : []),
  ...(doc && [page?.name, ...titles].includes(doc.settings?.header) ? ['settings.header equals the page name or a title block — the H1 check would pass without it'] : []),
]);

// 5. reused fixtures still carry what they are reused for
const wlOrg = aliases[aliases.SB_WL_ORG_BUYER?.org];
const wlBuyer = aliases[aliases.SB_WL_ORG_BUYER?.buyer];
const orgCsv = read('test-data/white-labeling/organizations.csv').split(/\r?\n/);
const head = orgCsv[0].split(',');
const orgRow = orgCsv.slice(1).map((l) => l.split(',')).find((c) => c[head.indexOf('org_id')] === wlOrg?.filter?.org_id);
const personal = aliases[aliases.SB_PERSONAL_BUYER?.buyer];
section('reused combos (SB_WL_ORG_BUYER, SB_PERSONAL_BUYER)', [
  ...REUSE_ALIASES.filter((a) => !aliases[a]).map((a) => `${a} not declared`),
  ...(!wlOrg || !wlBuyer ? ['SB_WL_ORG_BUYER points at an undeclared alias'] : []),
  ...(orgRow && !(orgRow[head.indexOf('logo_source')] && orgRow[head.indexOf('theme_preset')]) ? ['the WL org row lost its logo or theme preset — it no longer brands anything'] : []),
  ...(!orgRow ? ['the WL org row is missing from white-labeling/organizations.csv'] : []),
  ...(!personal ? ['SB_PERSONAL_BUYER points at an undeclared alias'] : []),
  ...(personal && personal.org_id ? ['the personal buyer declares an organization'] : []),
]);

// 6. no runtime GUID in the committed declarations or the spec module
const leaks = [...[THEME_ALIAS, ...EDITOR_ALIASES, PAGE_ALIAS, ...REUSE_ALIASES].flatMap((a) => findGuidLeaks(JSON.stringify(aliases[a] || {}))), ...findGuidLeaks(read('scripts/seed-data/cms/site-builder-specs.mjs'))];
section('no runtime GUID in declarations or spec module', leaks.map((g) => `leak ${g}`));

// 7. the npm entry points the declarations name exist
const scripts = JSON.parse(read('package.json')).scripts || {};
section('npm scripts present', ['seed:site-builder', 'seed:site-builder:teardown', 'td:validate:site-builder', 'seed:cms-pages'].filter((s) => !scripts[s]).map((s) => `missing ${s}`));

console.log(`\n${problems.length ? `FAILED — ${problems.length} problem(s)` : 'OK'}`);
process.exit(problems.length ? 1 : 0);
