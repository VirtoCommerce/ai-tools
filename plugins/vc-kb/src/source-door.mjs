// The source door: what a MISS says when the answer lives in code.
//
// WHY THIS EXISTS, MEASURED RATHER THAN ASSUMED. Every arm of rounds two and three went to platform
// source for at least one answer, and the arrival replay of 2026-09-16 judged what they went for:
// of nine source subjects, six had nothing in this corpus that could have arrived, and all six were
// mechanism living in C#. The corpus holds 124 evidence rows and every one of them is
// `method: observation` -- it carries mechanism only where mechanism was visible from outside a
// running deployment. For anything whose mechanism is in code, the honest answer is a MISS, and a
// bare MISS sends the reader away with nothing.
//
// THE THING THE BASE ALREADY KNEW AND NEVER SAID. 119 of the 590 derived entries carry
// `appliesTo: [{ module, version }]` -- the owning module AND the version INSTALLED on the
// deployment the plane was projected from. `kb extract` has been recording it since the first day.
// Measured against what round two's arms actually did:
//
//   arm A  spent a call on `GET /api/platform/modules` and then pinned all 13 of its source fetches
//          to installed tags -- vc-module-order/3.1000.4, vc-module-cart/3.1000.3,
//          vc-module-marketing/3.1000.1, vc-module-x-cart/3.1000.6, vc-module-x-order/3.1000.1.
//          Every one of those five matches what this base already held. Six for six with Shipping.
//   arm B  read `dev`, twice.
//   arm C  read `dev`, eight times -- the arm WITH the base, reading a moving branch head while the
//          base it was given held the exact installed tag.
//
// So two of three arms justified answers from code that is not what is deployed, and the one that
// did it properly paid a call and a detour to find out what the base could have handed it for free.
//
// THIS IS NOT A SOURCE PLANE. No code is copied into the corpus, nothing is indexed, and no claim
// is made about speed. A MISS stays a MISS: it gains a coordinate -- module, installed version,
// repository -- and nothing else. The independent review rejected building a plane of source and
// the evidence supported that rejection; this is the other thing, the one VCST-5975 asks for.
//
// A REGISTRY NAMES A WAVE, NOT A MACHINE. Bundle v14 of `vc-modules` is the release wave whose
// PlatformVersion matches this deployment, and it disagrees with the deployment about 2 of 9 module
// versions (Shipping 3.1000.2 against 3.1000.1 installed; Catalog 3.1002.10 against 3.1002.9). So
// the installed version comes from the base's own extraction and never from the registry. The
// registry is used for exactly one thing: which repository a module lives in, which is a property
// of the ecosystem rather than of this deployment.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEntry } from './frontmatter.mjs';
import { DERIVED_ENTRIES } from './planes.mjs';

const MAP_PATH = fileURLToPath(new URL('./data/module-repos.json', import.meta.url));

let cachedMap = null;
export function moduleRepos() {
  if (cachedMap) return cachedMap;
  try {
    const raw = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
    cachedMap = { ...raw.modules, ...raw.known, _meta: { source: raw.source, fetchedAt: raw.fetchedAt } };
  } catch {
    // A missing or unreadable map must not turn a MISS into an error. The door simply names the
    // module and its version without a URL, which is still more than a bare MISS.
    cachedMap = { _meta: null };
  }
  return cachedMap;
}

/**
 * Where a module's source lives, and at which tag.
 *
 * The tag is the version string the deployment reports, used verbatim. Round two's arm A fetched
 * five modules at exactly these tags in 13 calls and used what came back, so the form is one that
 * resolves in practice -- but this function performs no network call and makes no promise that a
 * particular tag exists. A module the map does not know returns a location of null rather than a
 * guessed repository name: `VirtoCommerce.Orders` lives in `vc-module-order`, singular, and a rule
 * that lowercased the id would have produced `vc-module-orders` and a 404 nobody could explain.
 */
export function locate(moduleId, version) {
  const entry = moduleRepos()[moduleId];
  if (!entry || !entry.repo) return { module: moduleId, version, owner: null, repo: null, tree: null, raw: null };
  return {
    module: moduleId,
    version,
    owner: entry.owner,
    repo: entry.repo,
    tree: `https://github.com/${entry.owner}/${entry.repo}/tree/${version}`,
    raw: `https://raw.githubusercontent.com/${entry.owner}/${entry.repo}/${version}/`,
  };
}

/**
 * Every module this base says is installed, with the version and one entry that names it.
 *
 * Read from the derived plane's own `appliesTo`, which is where `kb extract` puts it. This walks
 * the entries it is given rather than the whole plane, because the caller already has a ranked list
 * and reading 590 files to answer one MISS is how a door becomes a thing people turn off.
 */
export function modulesNamedBy(base, entries) {
  const out = new Map();
  for (const e of entries) {
    if (!e.path) continue;
    const abs = join(base, e.path);
    if (!existsSync(abs)) continue;
    let data;
    try { ({ data } = parseEntry(readFileSync(abs, 'utf8'), e.path)); } catch { continue; }
    if (data.plane !== 'derived-first') continue;
    for (const a of data.appliesTo ?? []) {
      if (!a.module || !a.version || out.has(a.module)) continue;
      out.set(a.module, { ...locate(a.module, a.version), via: { id: data.id, subject: data.subject } });
    }
  }
  return [...out.values()];
}

/**
 * Which version of a module this deployment runs, read out of the derived plane.
 *
 * The same principle as `stampOf` in capture.mjs: a writer is never asked to retype a value the
 * base already holds. A claim read from source has to say WHICH source, and the tag is the half of
 * that coordinate the writer is most likely to get wrong -- round two's arms got it wrong two
 * times in three, by reading `dev`.
 *
 * This walks the whole derived plane, unlike `modulesNamedBy`, because there is no ranked list to
 * start from and the caller is `kb capture`, which is not on any hot path.
 */
export function installedVersionOf(base, moduleId) {
  const dir = join(base, DERIVED_ENTRIES);
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    let data;
    try { ({ data } = parseEntry(readFileSync(join(dir, f), 'utf8'), f)); } catch { continue; }
    for (const a of data.appliesTo ?? []) {
      if (a.module === moduleId && a.version) return a.version;
    }
  }
  return null;
}

/** Every module id the derived plane names, for an error message that can be acted on. */
export function knownModules(base) {
  const dir = join(base, DERIVED_ENTRIES);
  if (!existsSync(dir)) return [];
  const out = new Set();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    let data;
    try { ({ data } = parseEntry(readFileSync(join(dir, f), 'utf8'), f)); } catch { continue; }
    for (const a of data.appliesTo ?? []) if (a.module) out.add(a.module);
  }
  return [...out].sort();
}

/**
 * The door itself: given the hits a question produced but that did not clear the relevance floor,
 * which modules does the question sit in?
 *
 * `scan` bounds the file reads. `evidence` is the gate, and it is deliberately not zero: a question
 * that matched nothing exactly gets no module pointer, because pointing a reader at
 * `vc-module-order` for "how do I bake sourdough bread" is the confident-wrong-answer failure this
 * whole contract exists to prevent, wearing a different hat.
 */
export function sourceDoor(base, nearMisses, { limit = 3, scan = 25 } = {}) {
  const candidates = nearMisses.filter((h) => (h.evidence ?? 0) >= 1).slice(0, scan);
  if (!candidates.length) return [];
  return modulesNamedBy(base, candidates).slice(0, limit);
}

export function renderSourceDoor(doors) {
  if (!doors.length) return [];
  const out = [
    '  source     : no entry here, but the deployment names the code that decides this:',
  ];
  for (const d of doors) {
    out.push(`      ${d.module} ${d.version}`);
    out.push(`        ${d.tree ?? '(this module is in no registry the tool knows; the version above is still what is installed)'}`);
    out.push(`        named by @kb(${d.via.id}) ${d.via.subject}`);
  }
  out.push('    That version is what THIS deployment runs, not a branch head. Two of three arms in');
  out.push('    round two read `dev` and answered from code that is not installed here.');
  out.push('    If you settle it from source, record it with `kb capture` and say where you read it.');
  return out;
}
