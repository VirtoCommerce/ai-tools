// Reading what the platform publishes about itself. Nothing here guesses a route shape:
// the document list comes from the index the platform serves, the owning module comes from
// the vendor extension each operation carries, and the GraphQL root type names come from
// introspection rather than from a constant.

import { getText, getJson, postJson, Unreachable } from './http.mjs';

const VERBS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];

// ---------------------------------------------------------------- the document list

export async function listDocuments(backUrl) {
  const html = await getText(`${backUrl}/docs/index.html`);
  const m = html.match(/"urls"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
  if (!m) {
    throw new Unreachable(`${backUrl}/docs/index.html`, 'no "urls" list in the document index');
  }
  let list;
  try {
    list = JSON.parse(m[1]);
  } catch (e) {
    throw new Unreachable(`${backUrl}/docs/index.html`, `"urls" is not JSON (${e.message})`);
  }
  return list
    .map((d) => ({ name: d.name, path: String(d.url).replace(/^\.\//, '') }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- the REST surface

// Every operation says which module owns it (x-virtocommerce-module-id). That is what makes the
// aggregate document safe to read: this deployment serves one -- /docs/PlatformUI carries all
// 825 coordinates a second time -- and a sweep that trusted the document name would count the
// whole surface twice and attribute half of it to a module that does not exist.
//
// The rule is stated over the data rather than over a name: for each coordinate the canonical
// record is the one published by the document the operation itself names. A coordinate served
// only by a document that does not own it is kept and reported, never dropped.
export async function fetchRestSurface(backUrl) {
  const documents = await listDocuments(backUrl);
  const coordinates = new Map(); // "VERB /route" -> record
  const docInfo = new Map();     // document name -> { ops, selfAttributed, paths }
  const unresolved = [];

  for (const doc of documents) {
    const json = await getJson(`${backUrl}/docs/${doc.path}`);
    const paths = json.paths ?? {};
    let ops = 0;
    let selfAttributed = 0;

    for (const route of Object.keys(paths).sort()) {
      for (const verb of VERBS) {
        const op = paths[route]?.[verb];
        if (!op) continue;
        ops++;
        const owner = op['x-virtocommerce-module-id'] ?? null;
        const isCanonical = owner === doc.name;
        if (isCanonical) selfAttributed++;

        const coordinate = `${verb.toUpperCase()} ${route}`;
        const existing = coordinates.get(coordinate);
        if (!existing || (isCanonical && !existing.canonical)) {
          coordinates.set(coordinate, {
            coordinate,
            verb: verb.toUpperCase(),
            route,
            operationId: op.operationId ?? null,
            module: owner,
            tag: op.tags?.[0] ?? null,
            document: doc.name,
            canonical: isCanonical,
            op,
          });
        }
      }
    }
    docInfo.set(doc.name, { ops, selfAttributed, paths: Object.keys(paths).length });
  }

  for (const rec of coordinates.values()) {
    if (!rec.canonical) {
      unresolved.push({
        coordinate: rec.coordinate,
        reason: rec.module
          ? `owned by ${rec.module}, which serves no document of its own on this deployment`
          : 'the operation declares no x-virtocommerce-module-id',
      });
    }
  }

  // A document is classified by what its operations say, never by its name.
  const classified = documents.map((d) => {
    const info = docInfo.get(d.name);
    let role;
    if (info.ops === 0) role = 'empty';
    else if (info.selfAttributed === 0) role = 'aggregate';
    else role = 'module';
    return { name: d.name, role, paths: info.paths, operations: info.ops };
  });

  return {
    documents: classified,
    coordinates: [...coordinates.values()].sort((a, b) => a.coordinate.localeCompare(b.coordinate)),
    unresolved: unresolved.sort((a, b) => a.coordinate.localeCompare(b.coordinate)),
  };
}

// ---------------------------------------------------------------- the GraphQL schema

const INTROSPECTION = `
query {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      name
      kind
      description
      fields(includeDeprecated: true) {
        name
        description
        args { name description defaultValue type { ...Ref } }
        type { ...Ref }
      }
      inputFields { name description defaultValue type { ...Ref } }
      enumValues(includeDeprecated: true) { name }
      interfaces { name }
    }
  }
}
fragment Ref on __Type {
  kind
  name
  ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
}`;

export function renderType(t) {
  if (!t) return null;
  if (t.kind === 'NON_NULL') return `${renderType(t.ofType)}!`;
  if (t.kind === 'LIST') return `[${renderType(t.ofType)}]`;
  return t.name;
}

// The root types are READ, not assumed. This deployment names them Query / Mutations /
// Subscriptions -- two of the three plural. An extractor that asked for "Mutation" would find
// nothing and report a schema with no mutations, which is a lie shaped exactly like a fact.
export async function fetchGraphqlSchema(backUrl) {
  const res = await postJson(`${backUrl}/graphql`, { query: INTROSPECTION });
  if (res.errors?.length) {
    throw new Unreachable(`${backUrl}/graphql`, `introspection returned errors: ${res.errors[0]?.message}`);
  }
  const s = res.data?.__schema;
  if (!s) throw new Unreachable(`${backUrl}/graphql`, 'introspection returned no __schema');

  const roots = {
    query: s.queryType?.name ?? null,
    mutation: s.mutationType?.name ?? null,
    subscription: s.subscriptionType?.name ?? null,
  };
  const types = new Map(
    s.types.filter((t) => !t.name.startsWith('__')).map((t) => [t.name, t]),
  );
  return { roots, types };
}

// ---------------------------------------------------------------- the release registry

// What a release IS has a source of truth, so it is read rather than stated.
//
// Naming a version in a config file ("this is stable bundle v14") is the transcription this repo's
// GOLDEN RULE forbids: the value has a publisher, it moves without us, and a copy of it drifts
// silently. So the environment pins the SOURCE -- the registry URL -- and the version, the module
// pins, and even where to fetch the platform image from are all read out of it.
//
// The registry publishes no tags and no releases, so there is no release ref to pin to and the URL
// necessarily names a branch. That is recorded rather than hidden, together with a hash of exactly
// the bytes that were read, so an identification can be audited after the branch has moved on.
export async function fetchReleaseRegistry(registryUrl) {
  const index = await getJson(registryUrl);
  const bundles = [];
  for (const [key, url] of Object.entries(index)) {
    let manifest;
    try {
      manifest = await getJson(url);
    } catch (e) {
      throw new Unreachable(url, `bundle "${key}" listed by the registry is unreadable: ${e.cause ?? e.message}`);
    }
    const modules = {};
    for (const s of manifest.Sources ?? []) {
      for (const m of s.Modules ?? []) modules[m.Id] = m.Version;
    }
    bundles.push({
      key,
      url,
      bundleVersion: manifest.BundleVersion ?? null,
      platformVersion: manifest.PlatformVersion ?? null,
      // The manifest is also the answer to "where do I get it": the image, its tag, the module
      // feeds. Carried so the corpus records how its reference release could be stood up.
      platformImage: manifest.PlatformImage ?? null,
      platformImageTag: manifest.PlatformImageTag ?? null,
      platformAssetUrl: manifest.PlatformAssetUrl || null,
      themeB2BVue: manifest.ThemeB2BVue ?? null,
      moduleSources: (manifest.Sources ?? []).flatMap((s) => s.ModuleSources ?? (s.ServiceUri ? [s.ServiceUri] : [])),
      modules,
    });
  }
  return { registryUrl, index, bundles };
}

// ---------------------------------------------------------------- the running platform version

// A module record carries a `platformVersion` field, and it is NOT the deployment's platform
// version -- it is the platform version that module was built against. There are 22 distinct
// values of it across this deployment's 106 module records, so reading any one of them stamps
// the corpus with a number that is wrong and looks right. The running version has its own source.
export async function fetchSystemInfo(backUrl, token) {
  const r = await fetch(`${backUrl}/api/platform/diagnostics/systeminfo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Unreachable(`${backUrl}/api/platform/diagnostics/systeminfo`, `HTTP ${r.status}`);
  const j = await r.json();
  return { platformVersion: j.platformVersion ?? null, environmentName: j.environmentName ?? null };
}

// ---------------------------------------------------------------- module versions

// The OpenAPI document's own info.version is "v1" on every module and is not a module version,
// so versions come from the platform's module inventory -- which needs a token.
export async function fetchModuleVersions(backUrl, token) {
  const r = await fetch(`${backUrl}/api/platform/modules`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Unreachable(`${backUrl}/api/platform/modules`, `HTTP ${r.status}`);
  const list = await r.json();
  const out = new Map();
  for (const m of list) {
    const tag = m.versionTag ? String(m.versionTag) : '';
    out.set(m.id, {
      version: tag ? `${m.version}-${tag}` : (m.version ?? null),
      prerelease: Boolean(tag),
      isInstalled: Boolean(m.isInstalled),
      title: m.title ?? null,
      description: m.description ?? null,
    });
  }
  return out;
}
