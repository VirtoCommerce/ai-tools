// WHICH PARTS OF A BUILD AN ENTRY'S BEHAVIOUR DEPENDS ON (VCST-6221) -- the input the variant gate
// (core/variant.mjs) compares two builds over. Several rules are kept side by side because the choice
// between them is a MEASUREMENT (bench/variant-replay.mjs, every dispute a judge has settled), not a
// judgement; `RELEVANCE` names the one the door uses.
//
// Nothing here is a transcribed list of modules. What a module owns is read from what the platform
// itself serves:
//   * a REST route -> the module whose `/docs/<ModuleId>/swagger.json` declares that path;
//   * a dotted DOMAIN type (`CustomerOrder.status`) -> the module whose swagger declares that schema;
//   * a GraphQL operation or type, and a storefront page -> the xAPI family, recognised by the shape of
//     the module id (`X…`, `…ExperienceApi…`), plus the theme for a page.
// The swagger index (`{ paths, schemas }`) is injected, so the rule stays pure.

const ALL = () => true;
const NONE = () => false;

/** The xAPI family, by id shape: VirtoCommerce.X…, VirtoCommerce.Xapi, VirtoCommerce.…ExperienceApi… */
export const isXapi = (id) => /^virtocommerce\.x/i.test(id) || /experienceapi/i.test(id);

/** A module id's own name, for matching against an entry's words: `VirtoCommerce.XCart` -> `cart`. */
export const stemOf = (id) => String(id).replace(/^virtocommerce\./i, '').replace(/^X(?=[A-Z])/, '')
  .replace(/(ExperienceApi)?(Module)?$/i, '').toLowerCase();

const words = (text) => new Set(String(text ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
const singular = (w) => w.replace(/(ies)$/, 'y').replace(/s$/, '');
// A concrete id in a route is a parameter too: the door keeps `/orders/3f2a…` as written (only `{id}`,
// `:id`, `<id>` are folded), and swagger declares `/orders/{id}`, so without this the owning module of an
// item route is never found (Cursor Bugbot on ai-tools#429).
const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|\d+|[a-z]{2,4}\d{4,}(?:-\d+)?)$/i;
const template = (p) => p.replace(/\{[^}]*\}/g, '{}').split('/').map((seg) => (ID_SEGMENT.test(seg) ? '{}' : seg)).join('/')
  .toLowerCase().replace(/\/+$/, '');

/** What an entry's anchors say it depends on: `{ platform, theme, xapi, modules: Set<lowercase id> }`. */
export function anchorOwners(entry, index) {
  const out = { platform: false, theme: false, xapi: false, modules: new Set() };
  const paths = Object.entries(index?.paths ?? {}).map(([p, ids]) => [template(p), ids]);
  for (const a of entry.anchors ?? []) {
    const c = String(typeof a === 'string' ? a : a?.coordinate ?? '').trim();
    const route = /^(?:(?:GET|POST|PUT|DELETE|PATCH)\s+)?(\/\S*)$/i.exec(c)?.[1];
    if (route && /^\/api\//i.test(route)) {
      const t = template(route.split('?')[0]);
      if (/^\/api\/platform\//.test(t)) out.platform = true;
      const owners = paths.filter(([p]) => p === t).flatMap(([, ids]) => ids);
      for (const id of owners) out.modules.add(id.toLowerCase());
      continue;
    }
    if (route) { out.theme = true; out.xapi = true; continue; } // a storefront (or admin) page
    const dotted = /^([A-Za-z]+)\.[A-Za-z]/.exec(c);
    if (dotted) {
      const owners = index?.schemas?.[dotted[1]] ?? [];
      if (owners.length && !/^(Query|Mutations?|Subscription)$/.test(dotted[1]) && !/Type$/.test(dotted[1])) {
        for (const id of owners) out.modules.add(id.toLowerCase());
      } else out.xapi = true;
    }
  }
  return out;
}

const textOf = (entry) => [entry.subject, entry.question, ...(entry.anchors ?? []).map((a) => (typeof a === 'string' ? a : a?.coordinate))].join(' ');

/** Modules the entry NAMES: a module whose stem is one of the entry's own words (subject, question, anchors). */
function named(entry, builds) {
  const w = new Set([...words(textOf(entry))].map(singular));
  const ids = new Set();
  for (const b of Object.values(builds)) for (const id of Object.keys(b.modules ?? {})) {
    const s = stemOf(id);
    if (s.length >= 4 && w.has(singular(s))) ids.add(id.toLowerCase());
  }
  return ids;
}

function rule({ narrowXapi = false, withNamed = false, index }) {
  return (entry, builds) => {
    const o = anchorOwners(entry, index);
    const ids = new Set(o.modules);
    if (withNamed) for (const id of named(entry, builds)) ids.add(id);
    let xapi = o.xapi ? isXapi : NONE;
    if (o.xapi && narrowXapi) {
      const w = new Set([...words(textOf(entry))].map(singular));
      const hit = (id) => isXapi(id) && (stemOf(id) === 'api' || w.has(singular(stemOf(id))));
      const any = Object.values(builds).some((b) => Object.keys(b.modules ?? {}).some(hit));
      if (any) xapi = hit;
    }
    // `known`: the entry depends on SOMETHING this rule could name. When it is false, "no relevant
    // difference" means "nothing to compare", never "same build" (buildLabel, gate.mjs).
    const known = o.platform || o.theme || o.xapi || ids.size > 0;
    return { known, platform: o.platform, theme: o.theme, modules: (id) => ids.has(id.toLowerCase()) || xapi(id) };
  };
}

export const rulesWith = (index) => ({
  // Every part of the build. The upper bound on variants: almost any two stands differ somewhere.
  all: () => ({ platform: true, theme: true, modules: ALL }),
  // Modules only: a platform bump alone never scopes a behaviour.
  modules: () => ({ platform: false, theme: false, modules: ALL }),
  anchors: rule({ index }),
  'anchors+named': rule({ index, withNamed: true }),
  'narrow+named': rule({ index, narrowXapi: true, withNamed: true }),
  // Only modules that provably own an anchor (swagger) or that the entry names; no family, no theme.
  strict: (entry, builds) => {
    const o = anchorOwners(entry, index);
    const ids = new Set([...o.modules, ...named(entry, builds)]);
    return { platform: o.platform, theme: false, modules: (id) => ids.has(id.toLowerCase()) };
  },
});
