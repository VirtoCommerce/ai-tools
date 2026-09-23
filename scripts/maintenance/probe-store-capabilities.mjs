#!/usr/bin/env node
/**
 * Print the STOREFRONT CAPABILITY MANIFEST of the live environment — which modules the
 * storefront can see, at which version, and which public settings (feature flags) each one
 * exposes — by replaying vc-frontend's own app-boot query, anonymously.
 *
 * WHY THIS EXISTS
 * ---------------
 * An agent deciding "is this feature testable here?" had two vantages, and both miss a class
 * of answer:
 *
 *   declared            `vc-deploy-dev` backend/packages.json     — what git says SHOULD be on the env
 *   deployed            GET {BACK_URL}/api/platform/modules       — what IS installed (needs an admin bearer token)
 *   storefront-visible  THIS SCRIPT (InitializeApplication)       — what the STOREFRONT can see, anonymously
 *
 * The third is not a cheaper version of the second. It is a different fact. vc-frontend builds its
 * FEATURE MAP from this payload and gates every later query against it — `apply-gates-link` strips
 * any `@needsModule` selection whose module is absent, before the request leaves the browser. So a
 * module that is installed and healthy at the
 * platform level but absent HERE is a module whose storefront features will not render — and the
 * platform manifest will call that env perfectly healthy. That gap is invisible from the other
 * two vantages, and it is the shape of "the feature is deployed but the button isn't there".
 *
 * It is also the only one of the three that needs no token, so any lane can run it as a pre-flight.
 *
 * Documented: https://docs.virtocommerce.org/storefront/developer-guide/application-initialization
 * (VirtoOZ calls this payload the "capability manifest"). Note the storefront CACHES it per session
 * under localStorage["vc:initialStore:v1:<domain>"], shared across tabs and single-fire across
 * navigations — this script always asks the server, so it can disagree with what an open browser
 * session believes. That disagreement is the point when a flag flip "has not taken effect".
 *
 * GOLDEN RULE (.claude/rules/test-data.md): nothing here is transcribed. The query is READ from
 * the schema-gated fixture (`test-data/graphql/queries/initializeApplicationClient.graphql`, kept
 * honest by `npm run graphql:fixtures:validate:refresh`), the host comes from the layered env, and
 * the module list is whatever the env answers. There is deliberately NO committed snapshot and no
 * `--check` drift gate: the deployed manifest changes on every deploy, so a snapshot of it would be
 * stale by design and a gate over it would be red for reasons nobody caused. Print it, read it, act.
 *
 * WHAT IT DOES NOT TELL YOU
 * -------------------------
 * 1. WHETHER ABSENCE MEANS ANYTHING DEPENDS ON ONE TOGGLE, so the script prints which mode it is in.
 *    With `XAPI.Security.ReturnModuleVersion` ON (the default, and how vcst-qa answered on
 *    2026-09-23) every installed module is listed WITH its version — including modules exposing
 *    zero public settings — so the list is a full deployed manifest, obtained without a token.
 *    With that setting OFF, `version` comes back "" (empty string, not null — it preserves the
 *    String! contract) AND modules with no public settings drop out entirely; in THAT mode absence
 *    is not evidence of anything and versions must come from the platform manifest. The OFF
 *    behaviour is carried from the fixture's known-issues (VCST-4642); it was not re-measured here.
 * 2. Public settings only. A setting appears under a module only if its `SettingDescriptor` is
 *    marked `IsPublic`. A flag missing from `--settings` output may still exist server-side —
 *    check `IsPublic` on the backend descriptor before concluding the store is misconfigured.
 * 3. Version here is the module's, not the theme's. The deployed storefront bundle is a separate
 *    artifact (`theme/artifact.json`) and is not visible from this query at all.
 *
 * USAGE
 *   npm run store:caps                      # module | version | #public settings
 *   npm run store:caps -- --settings        # every public setting name=value, per module
 *   npm run store:caps -- --module loyalty  # filter (substring, case-insensitive)
 *   npm run store:caps -- --store           # + the store-level scalars (flags, languages, currencies)
 *   npm run store:caps -- --json            # machine-readable
 *   npm run store:caps -- --domain <host>   # probe another storefront host
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 ? argv[i + 1] : null;
};

const AS_JSON = flag('json');
const SHOW_SETTINGS = flag('settings');
const SHOW_STORE = flag('store');
const FILTER = (opt('module') || '').toLowerCase();

const backUrl = (opt('url') || process.env.BACK_URL || '').trim().replace(/\/+$/, '');
if (!backUrl) {
  console.error('BACK_URL not resolved (layered .env) and --url not given.');
  process.exit(1);
}

let domain = opt('domain');
if (!domain) {
  const front = process.env.FRONT_URL;
  if (!front) {
    console.error('FRONT_URL not resolved (layered .env) and --domain not given.');
    process.exit(1);
  }
  domain = new URL(front).host;
}

/** Read a fixture body, dropping its `#` metadata header. */
function fixture(name) {
  const p = resolve(ROOT, 'test-data/graphql/queries', `${name}.graphql`);
  return readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .trim();
}

async function gql(query, variables) {
  const res = await fetch(`${backUrl}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    console.error(`GraphQL error (HTTP ${res.status}):`);
    console.error(JSON.stringify(json.errors ?? json, null, 2));
    process.exit(1);
  }
  return json.data;
}

// The storefront's own payload — modules + versions + public settings.
const data = await gql(fixture('initializeApplicationClient'), { domain });
const store = data.store;
if (!store) {
  console.error(`No store resolved for domain "${domain}" — check FRONT_URL / --domain.`);
  process.exit(1);
}

const modules = (store.settings?.modules ?? [])
  .slice()
  .sort((a, b) => a.moduleId.localeCompare(b.moduleId));
const shown = FILTER ? modules.filter((m) => m.moduleId.toLowerCase().includes(FILTER)) : modules;
const versionsHidden = modules.length > 0 && modules.every((m) => !m.version);

// Optional: the broader store-level contract surface (the scalars, not the manifest).
let broad = null;
if (SHOW_STORE || AS_JSON) {
  const d = await gql(fixture('initializeApplication'), { domain });
  broad = d.store;
}

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        probedIso: new Date().toISOString(),
        backUrl,
        domain,
        storeId: broad?.storeId ?? null,
        storeUrl: store.storeUrl,
        versionsHidden,
        moduleCount: modules.length,
        modules: shown,
        storeSettings: broad ? { ...broad.settings, modules: undefined } : null,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log(`Storefront capability manifest — ${domain}  (via ${backUrl}/graphql, anonymous)`);
console.log(`storeUrl: ${store.storeUrl}`);
console.log(
  `modules visible to the storefront: ${modules.length}` +
    (FILTER ? `  (showing ${shown.length} matching "${FILTER}")` : ''),
);
if (versionsHidden) {
  console.log(
    'NOTE: every version is empty — `XAPI.Security.ReturnModuleVersion` is OFF on this env.\n' +
      '      That is a setting, not a broken manifest. Ask the platform manifest for versions.',
  );
}
console.log('');

const pad = Math.max(8, ...shown.map((m) => m.moduleId.length));
for (const m of shown) {
  const settings = m.settings ?? [];
  console.log(
    `${m.moduleId.padEnd(pad)}  ${(m.version || '(hidden)').padEnd(12)}  ${settings.length} public setting(s)`,
  );
  if (SHOW_SETTINGS) {
    for (const s of settings) console.log(`${' '.repeat(pad + 4)}${s.name} = ${JSON.stringify(s.value)}`);
  }
}

if (SHOW_STORE && broad) {
  const s = broad.settings;
  console.log('\nStore-level settings (scalars — not the per-module manifest):');
  for (const [k, v] of Object.entries(s)) {
    if (k === 'modules' || k === 'passwordRequirements') continue;
    console.log(`  ${k} = ${JSON.stringify(v)}`);
  }
  console.log(
    `  defaultLanguage = ${broad.defaultLanguage?.cultureName}` +
      `  available = ${(broad.availableLanguages ?? []).map((l) => l.cultureName).join(', ')}`,
  );
  console.log(
    `  defaultCurrency = ${broad.defaultCurrency?.code}` +
      `  available = ${(broad.availableCurrencies ?? []).map((c) => c.code).join(', ')}`,
  );
}

console.log(
  versionsHidden
    ? '\nReminder: versions are hidden on this env, and in that mode modules exposing no public\n' +
        'setting drop out of the list entirely — absence here is NOT evidence a module is absent.'
    : '\nVersions are being returned, so this is the full set of modules the storefront can see.\n' +
        'A public setting missing from a module still only means its descriptor is not IsPublic.',
);
