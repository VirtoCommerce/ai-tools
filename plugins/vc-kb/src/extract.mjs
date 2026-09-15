// The extractor. Deterministic, zero-LLM, and it either reads a deployment or says it could not.

import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { loadEnv, require_ } from './env.mjs';
import { Unreachable, postForm } from './http.mjs';
import { fetchRestSurface, fetchGraphqlSchema, fetchModuleVersions, fetchSystemInfo, fetchReleaseRegistry } from './sources.mjs';
import { identifyRelease } from './release.mjs';
import { groupRest, groupGraphql, groupGraphqlTypes, groupEmptyModules, SPLIT_AT } from './group.mjs';
import { buildRestEntry, buildGraphqlEntry, buildNoRestEntry, renderEntryFile } from './build.mjs';
import { buildGraphqlTypeEntry } from './build-graphql-type.mjs';
import { deploymentPin, stableStringify, mintId } from './canonical.mjs';
import { buildIndex, renderCatalog } from './index-build.mjs';
import { DERIVED_DIR, DERIVED_ENTRIES, DERIVED_INDEX, DERIVED_CATALOG } from './planes.mjs';

export class Skipped extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'Skipped';
  }
}

const json = (data) => JSON.stringify(data, null, 2) + '\n';

async function adminToken(env) {
  const back = require_(env, 'BACK_URL', 'the deployment to extract from');
  const user = env.ADMIN ?? env.ADMIN_EMAIL;
  const pass = env.ADMIN_PASSWORD;
  if (!user || !pass) return { token: null, why: 'no admin identity or secret in the env layers' };
  try {
    const r = await postForm(`${back}/connect/token`, {
      grant_type: 'password',
      username: user,
      password: pass,
    });
    if (!r.ok || !r.json?.access_token) {
      return { token: null, why: `token endpoint returned HTTP ${r.status}` };
    }
    return { token: r.json.access_token, why: null };
  } catch (e) {
    return { token: null, why: e.message };
  }
}

export async function extract({ base, root = process.cwd(), testEnv, write = true } = {}) {
  const { env } = loadEnv({ root, testEnv });
  const back = require_(env, 'BACK_URL', 'the deployment to extract from');

  // --- read the deployment -------------------------------------------------
  let rest;
  let schema;
  try {
    rest = await fetchRestSurface(back);
  } catch (e) {
    if (e instanceof Unreachable) throw new Skipped(`REST surface unreadable — ${e.message}`);
    throw e;
  }
  try {
    // Mandatory, not optional: ten of the modules that expose no REST surface are the xAPI
    // modules, so without introspection the entire storefront contract is simply absent.
    schema = await fetchGraphqlSchema(back);
  } catch (e) {
    if (e instanceof Unreachable) throw new Skipped(`GraphQL introspection unreadable — ${e.message}`);
    throw e;
  }

  const unresolved = [...rest.unresolved];

  const { token, why } = await adminToken(env);
  let versions = new Map();
  let platformVersion = null;
  if (token) {
    try {
      versions = await fetchModuleVersions(back, token);
    } catch (e) {
      unresolved.push({ coordinate: 'module inventory', reason: e.message });
    }
    try {
      ({ platformVersion } = await fetchSystemInfo(back, token));
    } catch (e) {
      unresolved.push({ coordinate: 'platform version', reason: e.message });
    }
  } else {
    // A version we cannot read is reported, never guessed. appliesTo simply omits the version on
    // every entry, which is visibly missing; a placeholder would look like an answer.
    unresolved.push({
      coordinate: 'module inventory',
      reason: `versions unavailable (${why}); every appliesTo omits its version`,
    });
  }


  // The release identification: the environment pins the SOURCE, and which release this is gets
  // READ from it. When no source is pinned there is simply no identification -- visibly absent,
  // rather than a version copied into a config file where it would drift.
  let release = null;
  if (env.RELEASE_REGISTRY) {
    let registry;
    try {
      registry = await fetchReleaseRegistry(env.RELEASE_REGISTRY);
    } catch (e) {
      if (e instanceof Unreachable) {
        throw new Skipped(
          `release registry unreadable — ${e.message}. It is pinned by RELEASE_REGISTRY, so it is ` +
          `a required source: identifying the release from a stale local copy is what this pin exists to avoid.`,
        );
      }
      throw e;
    }
    if (!versions.size) {
      unresolved.push({
        coordinate: 'release identification',
        reason: 'the module inventory is unavailable, so no bundle comparison is possible',
      });
    } else {
      release = identifyRelease(registry, versions, platformVersion);
    }
  }

  const pin = deploymentPin({ platformVersion, modules: versions });

  const prerelease = [...versions.entries()]
    .filter(([, m]) => m.isInstalled && String(m.version).includes('-'))
    .map(([id, m]) => ({ module: id, version: m.version }));

  // --- group and build -----------------------------------------------------
  const restGroups = groupRest(rest.coordinates);
  const gqlGroups = groupGraphql(schema);
  const gqlTypeGroups = groupGraphqlTypes(schema);
  const emptyGroups = groupEmptyModules(rest.documents);

  const ctx = {
    deployment: env.TEST_ENV ?? testEnv,
    pin,
    versions,
    schema,
    documentCount: rest.documents.length,
    noRestCount: emptyGroups.length,
    platformVersion,
    prerelease,
    hostOwners: new Set(),
  };

  // Reported, never inferred: the one construct this extractor cannot resolve.
  unresolved.push({
    coordinate: 'graphql field -> module',
    reason:
      'introspection publishes no attribution of a schema field to the contributing module, so a ' +
      'GraphQL fact cannot be labelled at a module version; it is labelled at the platform version ' +
      'and, when the deployment runs pre-release modules, marked as not shown to be a release fact',
  });

  const entries = [
    ...restGroups.map((g) => buildRestEntry(g, ctx)),
    ...gqlGroups.map((g) => buildGraphqlEntry(g, ctx)),
    ...gqlTypeGroups.map((g) => buildGraphqlTypeEntry(g, ctx)),
    ...emptyGroups.map((g) => buildNoRestEntry(g, ctx)),
  ].sort((a, b) => a.subject.localeCompare(b.subject));

  for (const owner of [...ctx.hostOwners].sort()) {
    unresolved.push({
      coordinate: `module ${owner}`,
      reason: `not present in the module inventory; versioned at the platform host version ${platformVersion}`,
    });
  }

  const subjects = new Set();
  for (const e of entries) {
    if (subjects.has(e.subject)) throw new Error(`two entries claim the subject "${e.subject}"`);
    subjects.add(e.subject);
  }

  // --- ids -----------------------------------------------------------------
  const files = new Map(); // relative path -> contents
  const byId = new Map();

  const catalogRows = [];
  const indexDocs = [];
  for (const e of entries) {
    const id = mintId(e.subject);
    if (byId.has(id)) {
      throw new Error(`id ${id} collides: "${byId.get(id)}" and "${e.subject}" hash the same`);
    }
    byId.set(id, e.subject);
    files.set(`${DERIVED_ENTRIES}/${id}.md`, renderEntryFile(e, id, ctx));
    if (e.table) files.set(`derived/${e.table.dir}/${e.table.name}.json`, json(e.table.data));
    catalogRows.push({ id, subject: e.subject, question: e.frontmatter.question, path: `${DERIVED_ENTRIES}/${id}.md` });
    indexDocs.push({ id, subject: e.subject, question: e.frontmatter.question, text: e.indexText, path: `${DERIVED_ENTRIES}/${id}.md` });
  }

  files.set('derived/modules.json', json({
    deployment: ctx.deployment,
    pin,
    platformVersion,
    documents: rest.documents,
    prerelease,
    versions: Object.fromEntries([...versions.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
  }));
  files.set('derived/pin.json', json({
    deployment: ctx.deployment,
    pin,
    platformVersion,
    coordinates: rest.coordinates.length,
    graphqlRoots: schema.roots,
    // The pinned SOURCE of the release definition. The identification read from it lives in
    // derived/release.json; nothing here states a version.
    releaseRegistry: env.RELEASE_REGISTRY ?? null,
    granularity: { rule: 'route-prefix depth 2, deepened to 3 above the threshold', splitAt: SPLIT_AT },
  }));
  if (release) files.set('derived/release.json', json(release));
  files.set('derived/unresolved.json', json(unresolved));
  files.set(DERIVED_INDEX, json(buildIndex(indexDocs)));
  files.set(DERIVED_CATALOG, renderCatalog(catalogRows, { pin, deployment: ctx.deployment }));

  // --- write ---------------------------------------------------------------
  if (write) {
    // Regeneration is authoritative: an entry whose surface disappeared must disappear too, or the
    // corpus quietly accumulates facts about a deployment that no longer serves them.
    for (const dir of [DERIVED_ENTRIES, `${DERIVED_DIR}/rest`, `${DERIVED_DIR}/graphql`]) {
      const p = join(base, dir);
      if (existsSync(p)) rmSync(p, { recursive: true, force: true });
      mkdirSync(p, { recursive: true });
      writeFileSync(join(p, '.gitkeep'), '');
    }
    for (const [rel, contents] of files) {
      const abs = join(base, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, contents);
    }
  }

  return {
    files,
    stats: {
      documents: rest.documents.length,
      aggregate: rest.documents.filter((d) => d.role === 'aggregate').map((d) => d.name),
      coordinates: rest.coordinates.length,
      restEntries: restGroups.length,
      graphqlEntries: gqlGroups.length,
      graphqlTypeEntries: gqlTypeGroups.length,
      noRestEntries: emptyGroups.length,
      entries: entries.length,
      graphqlRoots: schema.roots,
      pin,
      platformVersion,
      prerelease,
      unresolved,
      versionsKnown: versions.size > 0,
      release,
    },
  };
}

export { stableStringify };
