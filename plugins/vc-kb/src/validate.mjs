// The corpus gate. It runs against whatever is on disk and needs no deployment.
//
// It must be green on an EMPTY corpus. That is not a nicety: a gate that only starts working once
// there is content cannot tell you the day the extractor writes nothing, which is the day you most
// need it to speak. So every check below is written to pass vacuously over zero entries and to
// fail loudly over one bad one. Step 2 adds a second writer and the rule holds unchanged: an empty
// experiential plane is a legitimate state, not a fault.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { installedVersionOf } from './source-door.mjs';
import { publishedOperations, contradictions } from './contradiction.mjs';
import { join } from 'node:path';
import { parseEntry, FIELD_ORDER } from './frontmatter.mjs';
import { mintId } from './canonical.mjs';
import { normalizeAnchor, namespaceOf, LOOKS_LIKE_A_MENU_PATH, LOOKS_LIKE_A_LOCAL_PATH } from './anchors.mjs';
import { CAPTURED_DIR, CAPTURED_INDEX, CAPTURED_CATALOG, FLOWS_DIR, FLOWS_INDEX, FLOWS_CATALOG, fingerprint, buildCapturedArtifacts } from './capture.mjs';
import { RULES_DIR, RULES_INDEX, RULES_CATALOG } from './planes.mjs';
import { ruleIdOf } from './rules.mjs';
import { DERIVED_ENTRIES, DERIVED_INDEX, DERIVED_CATALOG } from './planes.mjs';
import { catalogBudgetNotice } from './catalog-budget.mjs';

const REQUIRED = ['id', 'subject', 'plane', 'question', 'status', 'refutableBy'];



// One typo apart. A TRANSPOSITION counts, and it is the reason this is not plain edit distance:
// `grahpql` for `graphql` swaps two neighbours, which Levenshtein scores as 2 -- so the most
// common way a person misspells a word is the one shape a distance-1 rule cannot see. Bounded
// there all the same, because anything looser starts pairing values that genuinely differ.
function oneTypoApart(a, b) {
  if (a === b) return false;
  if (a.length === b.length) {
    const at = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) at.push(i);
    if (at.length === 2) {
      const [i, j] = at;
      if (j === i + 1 && a[i] === b[j] && a[j] === b[i]) return true; // neighbours swapped
    }
  }
  return oneEditApart(a, b);
}

function oneEditApart(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let slack = 1;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i += 1; j += 1; continue; }
    if (slack === 0) return false;
    slack = 0;
    if (short.length === long.length) i += 1;
    j += 1;
  }
  return true;
}

// One value contained in the other as whole segments: `rest` inside `platform-rest`. This is the
// drift the corpus actually produced, and edit distance is blind to it -- those two are nine edits
// apart and one value.
function oneIsASegmentOfTheOther(a, b) {
  const seg = (v) => v.split(/[-_.]/).filter(Boolean);
  const [x, y] = [seg(a), seg(b)];
  if (!x.length || !y.length || x.length === y.length) return false;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  const key = short.join(String.fromCharCode(31));
  const joined = long.join(String.fromCharCode(31));
  return joined.endsWith(key) || joined.startsWith(key);
}
const REFUTABLE_BY = ['derivation', 'anchor', 'observation', 'artifact', 'practice'];
// `flow` joins the closed vocabulary. `normative` has been in it since the schema was written and
// has never held an entry; `flow` arrives with a measurement behind it rather than a plan.
const PLANES = ['derived-first', 'experiential', 'normative', 'flow'];
const STATUSES = ['active', 'retired'];

function readPlane(base, dir) {
  const abs = join(base, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).filter((f) => f.endsWith('.md')).sort().map((f) => ({ file: f, rel: `${dir}/${f}`, abs: join(abs, f) }));
}

export function validate(base) {
  const problems = [];
  const note = (m) => problems.push(m);
  // A NOTICE IS NOT A PROBLEM. What the notices below describe is a corpus working as intended with
  // something in it worth a second look -- an anchor nothing can raise, an observation about a
  // surface this base does not project. Made failures, they would either be ignored or, worse,
  // answered by deleting the anchor that carries the honest part of the record.
  const notices = [];
  const notice = (m) => notices.push(m);

  const configPath = join(base, 'kb.json');
  if (!existsSync(configPath)) return { ok: false, entries: 0, captured: 0, problems: ['kb.json is missing'] };
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  const derivedFiles = readPlane(base, DERIVED_ENTRIES);
  const capturedFiles = readPlane(base, CAPTURED_DIR);
  const flowFiles = readPlane(base, FLOWS_DIR);
  const ruleFiles = readPlane(base, RULES_DIR);

  const byId = new Map();
  const statusById = new Map();
  const bySubject = new Map();
  const derivedIds = new Set();
  const activeCapturedIds = new Set();
  const allCapturedIds = new Set();
  const activeExperiential = [];
  const axisValues = new Map();
  const derivedCoordinates = new Set();
  const anchorsByEntry = new Map();
  const supersededPointers = [];

  for (const { file, rel, abs } of [...derivedFiles, ...capturedFiles, ...flowFiles, ...ruleFiles]) {
    const experientialFile = rel.startsWith(`${CAPTURED_DIR}/`);
    const flowFile = rel.startsWith(`${FLOWS_DIR}/`);
    const ruleFile = rel.startsWith(`${RULES_DIR}/`);
    const writtenFile = experientialFile || flowFile || ruleFile;
    let parsed;
    try {
      parsed = parseEntry(readFileSync(abs, 'utf8'), rel);
    } catch (e) {
      note(`${rel}: ${e.message}`);
      continue;
    }
    const d = parsed.data;

    // `question` is exempt on the normative plane, and the gate has to agree with the door or the
    // corpus fails its own check the moment a rule is written. A fact is an ANSWER and is found by
    // the question somebody would ask; a rule is a CONSTRAINT and is found by the domain it governs.
    // See NORMATIVE_EXEMPT in capture.mjs for the whole argument.
    for (const k of REQUIRED) {
      if (k === 'question' && d.plane === 'normative') continue;
      if (d[k] === undefined) note(`${rel}: missing required field ${k}`);
    }
    for (const k of Object.keys(d)) if (!FIELD_ORDER.includes(k)) note(`${rel}: unknown field ${k}`);

    // The namespace check is a PARSE, never a prefix compare: "KB-C-3F9A2C1D".startsWith("KB")
    // is true, so a prefix test would admit a client id into the platform namespace and call the
    // collision impossible by construction. The namespace is every segment but the last.
    const segments = String(d.id ?? '').split('-');
    const ns = segments.slice(0, -1).join('-');
    const disc = segments.at(-1) ?? '';
    if (ns !== config.namespace || !new RegExp(`^[0-9A-F]{${config.idWidth}}$`).test(disc)) {
      note(`${rel}: id "${d.id}" is not <${config.namespace}>-<${config.idWidth} hex digits>`);
    } else if (d.plane === 'derived-first' && d.subject !== undefined && d.id !== mintId(d.subject, config.namespace)) {
      // Checkable only on the DERIVED plane, where the subject is itself derived from a route or a
      // schema coordinate and a change to it means a different surface. An authored subject can be
      // re-normalized later, and an id must survive that -- ids are eternal (ADR §4.3) -- so on the
      // experiential plane the id is minted once at capture and then lives in the file.
      note(`${rel}: id "${d.id}" is not what subject "${d.subject}" derives (${mintId(d.subject, config.namespace)})`);
    }
    if (file !== `${d.id}.md`) note(`${rel}: file name does not match its id ${d.id}`);

    if (!PLANES.includes(d.plane)) note(`${rel}: plane "${d.plane}" is outside the closed vocabulary`);
    if (!REFUTABLE_BY.includes(d.refutableBy)) note(`${rel}: refutableBy "${d.refutableBy}" is outside the closed vocabulary`);
    if (!STATUSES.includes(d.status)) note(`${rel}: status "${d.status}" is outside the closed vocabulary`);

    // A directory is not a plane. Which plane an entry is on is stated in the entry, and the two
    // must agree, or the extractor's wipe and the capture door disagree about who owns a file.
    if (experientialFile && d.plane !== 'experiential') note(`${rel}: lives in ${CAPTURED_DIR}/ but declares plane "${d.plane}"`);
    if (flowFile && d.plane !== 'flow') note(`${rel}: lives in ${FLOWS_DIR}/ but declares plane "${d.plane}"`);
    if (ruleFile && d.plane !== 'normative') note(`${rel}: lives in ${RULES_DIR}/ but declares plane "${d.plane}"`);
    if (!writtenFile && (d.plane === 'experiential' || d.plane === 'flow' || d.plane === 'normative')) note(`${rel}: declares a written plane but lives where the extractor wipes`);
    // A rule's ID is its identity, so a rule that has lost it from its subject is unfindable by the
    // citations that point at it and indistinguishable from the next rule on the same subject. The
    // door refuses this; the gate catches a file edited by hand afterwards.
    if (ruleFile && d.subject !== undefined && !ruleIdOf(d.subject)) {
      note(`${rel}: a rule's subject must lead with its ID (e.g. "BL-CART-003 …"); this one reads "${d.subject}"`);
    }

    // An entry that names no anchor cannot be reached by a coordinate, which is how BOTH planes
    // find things: regeneration diffs the derived plane, consolidation groups the experiential one.
    //
    // A RULE IS EXEMPT, and this is the gate half of the door's NORMATIVE_EXEMPT -- the two must
    // agree or a rule the door admits fails the gate that ships it. A rule is reached by its id and
    // by its domain: `kb rules BL-CART`, `kb show BL-CART-003`, and the domain index the session
    // hook injects. 143 of the 216 invariants being imported name no coordinate at all, so this
    // notice would have tripled the corpus's notice count while reporting the design.
    if (d.plane !== 'normative' && !(d.anchors?.length > 0)) note(`${rel}: carries no anchors`);
    for (const anchor of d.anchors ?? []) {
      const coordinate = String(anchor?.coordinate ?? '');
      if (LOOKS_LIKE_A_LOCAL_PATH.test(coordinate)) {
        note(`${rel}: anchor "${coordinate}" is a path on one machine, not a coordinate anyone can look up` +
          ' (a leading "/route" under Git Bash is rewritten by MSYS; pass MSYS_NO_PATHCONV=1 or use the "VERB /route" form)');
      }
    }
    for (const anchor of d.anchors ?? []) {
      const key = normalizeAnchor(anchor?.coordinate);
      if (!key) continue;
      if (d.plane === 'experiential' || d.plane === 'flow' || d.plane === 'normative') {
        if (!anchorsByEntry.has(rel)) anchorsByEntry.set(rel, { id: d.id, anchors: [] });
        anchorsByEntry.get(rel).anchors.push({ raw: String(anchor.coordinate), key });
      } else derivedCoordinates.add(key);
    }
    if (!(d.evidence?.length > 0)) note(`${rel}: carries no evidence`);
    // A delivery address must still be a coordinate. It is NOT checked for reachability: the whole
    // point of the field is that a fact can be wanted somewhere the contract does not project, such
    // as a storefront page, and reporting that as a missing coordinate would be reporting the design.
    for (const at of d.arrivesAt ?? []) {
      if (!at || !at.coordinate) note(`${rel}: an arrivesAt row carries no coordinate: ${JSON.stringify(at)}`);
    }
    // A CLAIM READ OUT OF CODE HAS TO SAY WHICH CODE. `method: source` without a module, a version
    // and a path is the same failure as an observation without a deployment: unrefutable, because
    // nobody can go back to where it came from. The version must be one the base records as
    // installed -- `kb capture` resolves it rather than accepting it, so a row that disagrees with
    // the derived plane was either hand-edited or survived a re-extract, and both are worth a flag.
    for (const e of d.evidence ?? []) {
      if (e.method !== 'source') continue;
      const missing = ['module', 'version', 'path'].filter((k) => !e[k]);
      if (missing.length) note(`${rel}: a source-backed evidence row names no ${missing.join(', ')}`);
      if (e.deployment) note(`${rel}: a source-backed evidence row carries a deployment (${e.deployment}); source is read from a tag, not from a deployment`);
      if (e.module && e.version) {
        const installed = installedVersionOf(base, e.module);
        if (installed && installed !== e.version) {
          note(`${rel}: source row cites ${e.module}:${e.version} while this base records ${installed} as installed`);
        }
      }
    }
    if ('costIfMissing' in d) note(`${rel}: costIfMissing must be asked or omitted, never defaulted`);

    if (d.plane === 'experiential' || d.plane === 'flow' || d.plane === 'normative') {
      // Scope is what decides whether two records are one fact. An entry without it claims to hold
      // everywhere, which is almost never what was observed and is exactly the shape that makes a
      // wrong merge possible.
      //
      // A RULE IS EXEMPT, because for a rule "everywhere" is usually the truth and its identity is
      // its id rather than its scope. `BL-PRICE-003` says money rounds to two decimals on this
      // platform; there is no axis that narrows it, and making an importer invent one would put 216
      // unobserved values into the corpus to satisfy a check.
      if (d.plane !== 'normative' && !(d.appliesTo?.length > 0)) note(`${rel}: experiential entry records no scope axis`);
      for (const s of d.appliesTo ?? []) {
        if (!s.axis || s.value === undefined || s.value === '') note(`${rel}: appliesTo row is not axis=value: ${JSON.stringify(s)}`);
        else {
          // A writer with a fact that holds on two surfaces has no single value for it, and run 02
          // reached for `surface=rest+admin-ui` and `surface=xapi+rest`. The schema already allows
          // what was wanted -- appliesTo is a list, so an axis may simply appear twice -- but nothing
          // said so, and a joined value defeats the fingerprint that scope exists to compute: it
          // matches neither of the two records it is trying to be.
          if (/[+&]|plus|and/i.test(String(s.value))) {
            note(`${rel}: scope value "${s.axis}=${s.value}" reads as two values joined. An axis may repeat` +
              ' -- write one row per value -- and a joined value matches neither of them.');
          }
          if (!axisValues.has(s.axis)) axisValues.set(s.axis, new Map());
          if (!axisValues.get(s.axis).has(s.value)) axisValues.get(s.axis).set(s.value, rel);
        }
      }
      // Regeneration cannot refute something nobody generated.
      if (d.refutableBy === 'derivation') note(`${rel}: refutableBy "derivation" cannot refute an observed fact`);
      if (d.supersededBy) supersededPointers.push([rel, d.supersededBy]);
      if (d.status === 'active' && d.supersededBy) note(`${rel}: is active and yet names supersededBy ${d.supersededBy}`);
      // Both written planes reach here, because evidence, supersededBy, scope axes and the identity
      // rule apply to a procedure exactly as to a fact. The id SETS below do not: they exist to
      // check the captured store's own index and catalog, and a flow is correctly absent from both.
      // Widening them was the first thing the flow tests caught -- the gate demanded that
      // captured-index.json carry an entry that lives in flows/.
      // The BODY travels with it: the cross-plane contradiction check below reads prose, and the
      // first version of it silently found nothing because this list carried frontmatter only.
      if (d.status === 'active') activeExperiential.push({ rel, data: d, body: parsed.body });
      if (d.plane === 'experiential') {
        allCapturedIds.add(d.id);
        if (d.status === 'active') activeCapturedIds.add(d.id);
      }
    } else {
      derivedIds.add(d.id);
    }

    if (byId.has(d.id)) note(`${rel}: id ${d.id} is also used by ${byId.get(d.id)}`);
    byId.set(d.id, rel);
    statusById.set(d.id, d.status);
    if (bySubject.has(d.subject)) note(`${rel}: subject ${d.subject} is also used by ${bySubject.get(d.subject)}`);
    bySubject.set(d.subject, rel);
  }

  // THE IDENTITY RULE, ENFORCED. The base states that two records are the same fact when their
  // normalized anchors and scope axes agree. Until this check the rule was written down and never
  // applied, so a corpus holding one fact twice passed the gate while `deliver` served both claims
  // side by side at the same trust level, each reading as an independent observation.
  // A retirement pointer that names nothing is the dead end this field exists to remove, written
  // down instead of avoided.
  for (const [rel, target] of supersededPointers) {
    if (!byId.has(target)) note(`${rel}: supersededBy names ${target}, which is not an entry in this base`);
  }

  // WHICH ANCHORS ANYTHING CAN RAISE. An anchor's whole job is to be a coordinate somebody else
  // arrives at -- a contract diff, `kb consolidate`, the arrival hook when an agent touches the same
  // place. An anchor no derived entry names does none of that.
  //
  // Reported by NAMESPACE, because the first cut of this check produced 24 lines over 24 entries and
  // a gate that long is a gate nobody reads. Three of those lines were worth acting on and the rest
  // said one thing twenty times: this base projects the platform REST API and the GraphQL schema,
  // and the corpus records observations about the storefront's own pages and about the REST domain
  // model. `GET /company/members` appears in six entries; `Discount.discountAmount` and
  // `CustomerOrder.discounts` are the C# model, where the schema has `DiscountType` and
  // `CustomerOrderType`. None of those is a mistake. They are coverage, said once.
  //
  // What the namespace split buys is the line that is NOT coverage. `Mutations.` is a namespace this
  // base projects in full, so `Mutations.deleteOrganizationContact` -- which no derived entry names,
  // in a family where 200 siblings are named -- is a different kind of fact from a whole surface
  // being absent. It was an invented coordinate on an otherwise sound entry, and it read exactly
  // like a real one.
  const derivedNamespaces = new Set();
  for (const key of derivedCoordinates) {
    const ns = namespaceOf(key);
    if (ns) derivedNamespaces.add(ns);
  }

  const uncovered = new Map();
  for (const [rel, e] of anchorsByEntry) {
    const known = e.anchors.filter((a) => derivedCoordinates.has(a.key));
    for (const a of e.anchors) {
      if (derivedCoordinates.has(a.key)) continue;
      if (LOOKS_LIKE_A_MENU_PATH.test(a.raw)) {
        notice(`${rel}: anchor "${a.raw}" is a menu path. Nothing can raise one -- no diff notices`
          + ' that a blade moved, and the next release renames it in silence. Keep the path in the body'
          + ' and anchor on the call the screen makes.');
        continue;
      }
      const ns = namespaceOf(a.raw);
      if (ns && derivedNamespaces.has(ns)) {
        notice(`${rel}: anchor "${a.raw}" names nothing, in a namespace this base projects in full.`
          + ` Every other "${ns}" coordinate resolves; this one does not, so it is misspelled or it was`
          + ' never there. An anchor that reads like a real coordinate and resolves to nothing is worse'
          + ' than no anchor: it looks reached.');
        continue;
      }
      const key = ns ?? '(bare identifiers)';
      if (!uncovered.has(key)) uncovered.set(key, new Set());
      uncovered.get(key).add(e.id);
    }
    if (!known.length) {
      notice(`${rel}: ${e.id} carries no anchor the derived plane names at all, so no contract change`
        + ' can reach it. Expected for an observation about a surface this base does not project;'
        + ' a defect if one of its anchors was meant to name a real coordinate.');
    }
  }
  for (const [ns, ids] of [...uncovered].sort()) {
    notice(`coverage: ${ids.size} experiential entr${ids.size === 1 ? 'y anchors' : 'ies anchor'} on "${ns}",`
      + ` which the derived plane does not project — ${[...ids].sort().join(', ')}.`
      + ' Honest anchors about a surface this base has never extracted; nothing generated will raise them'
      + ' until it does.');
  }

  const byFingerprint = new Map();
  for (const e of activeExperiential) {
    const fp = fingerprint(e.data);
    const seen = byFingerprint.get(fp);
    if (seen) {
      note(`${e.rel}: same fingerprint as ${seen} (${fp}) — identical normalized anchors and scope, so by` +
        ' the identity rule the base states, these are one fact. Either one is a duplicate, or they differ on an axis neither records.');
    } else byFingerprint.set(fp, e.rel);
  }

  // AXIS VALUES HAVE NO VOCABULARY, so every misspelling is a new scope: it defeats the fingerprint
  // above and blocks a merge for a difference that does not exist. The corpus produced one without
  // anyone noticing -- `surface=rest` beside `surface=platform-rest`, from one author, hours apart.
  // Both shapes below are SUSPICIONS, and both are cheap to settle by renaming one value; a gate
  // that only flags what it can prove would have let this one through, which it did.
  for (const [axis, values] of axisValues) {
    const list = [...values.keys()].sort();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        const why = oneTypoApart(a, b) ? 'one typo apart'
          : oneIsASegmentOfTheOther(a, b) ? 'one contained in the other as whole segments'
            : null;
        if (why) {
          note(`${values.get(a)} and ${values.get(b)}: scope axis "${axis}" carries both "${a}" and "${b}" — ${why}.` +
            ' If they are one value, spell it one way; if they are two, they need names that do not read as a typo.');
        }
      }
    }
  }

  // Catalog and index must cover exactly the corpus — no more, no fewer.
  const catalogPath = join(base, DERIVED_CATALOG);
  if (existsSync(catalogPath)) {
    const text = readFileSync(catalogPath, 'utf8');
    for (const id of derivedIds) if (!text.includes(id)) note(`derived-catalog.md does not list ${id}`);
  } else if (derivedFiles.length) {
    note('derived-catalog.md is missing while entries exist');
  }

  const indexPath = join(base, DERIVED_INDEX);
  if (existsSync(indexPath)) {
    const idx = JSON.parse(readFileSync(indexPath, 'utf8'));
    const indexed = new Set(Object.values(idx.storedFields ?? {}).map((s) => s.id));
    for (const id of derivedIds) if (!indexed.has(id)) note(`derived-index.json does not carry ${id}`);
    for (const id of indexed) if (!derivedIds.has(id)) note(`derived-index.json carries ${id}, which has no entry file`);
  } else if (derivedFiles.length) {
    note('derived-index.json is missing while entries exist');
  }

  // The captured index carries the ACTIVE entries only. A retired entry stays on disk because ids
  // are eternal, and stays out of the index because nothing may be served from it.
  const capturedIndexPath = join(base, CAPTURED_INDEX);
  if (existsSync(capturedIndexPath)) {
    const idx = JSON.parse(readFileSync(capturedIndexPath, 'utf8'));
    const indexed = new Set(Object.values(idx.storedFields ?? {}).map((s) => s.id));
    for (const id of activeCapturedIds) if (!indexed.has(id)) note(`${CAPTURED_INDEX} does not carry active entry ${id}`);
    for (const id of indexed) {
      if (!allCapturedIds.has(id)) note(`${CAPTURED_INDEX} carries ${id}, which has no captured entry file`);
      else if (!activeCapturedIds.has(id)) note(`${CAPTURED_INDEX} carries ${id}, which is retired`);
    }
  } else if (capturedFiles.length) {
    // ABSENT IS A NOTICE; STALE IS STILL A PROBLEM. The written stores' indexes are rebuilt from
    // the entries on disk by `kb reindex`, and from 2026-09-17 they are untracked — so the normal
    // state of a fresh clone is "entries, no index", and a gate that failed there would be red on
    // every checkout and in CI before anybody had done anything wrong. That is the shape of gate
    // people learn to ignore.
    //
    // Nothing is lost by demoting it, because the RETRIEVAL path already refuses: `openBase` and
    // `openFlows` return `degraded` — "captured-index.json is missing while its corpus holds
    // entries" — so `kb ask` and `kb how` answer with an infrastructure miss rather than out of
    // half a corpus. The gate was the second statement of that, and the louder one was the wrong
    // one to keep.
    //
    // The derived index above keeps FAILING, and the asymmetry is the point: nothing rebuilds it
    // from disk. `kb extract` writes it from a running deployment, so an absent one is damage a
    // clone cannot repair, not a step somebody has not run yet.
    notice(`${CAPTURED_INDEX} is absent — rebuilt from the entries on disk by \`kb reindex\`; it is untracked on purpose`);
  }

  // REGENERATE AND BYTE-COMPARE, the check `kb check` gives the derived plane and the experiential
  // plane had none. The id-level checks above ask whether the index MENTIONS the right entries; an
  // index built from an older version of a body mentions exactly the right ids while serving text
  // that is no longer in the corpus. Only rebuilding catches that.
  if (capturedFiles.length) {
    const built = buildCapturedArtifacts(base);
    if (existsSync(capturedIndexPath) && readFileSync(capturedIndexPath, 'utf8') !== built.index) {
      note(`${CAPTURED_INDEX} is not what the entries on disk build — it is stale; run a verb that rebuilds it`);
    }
    if (existsSync(join(base, CAPTURED_CATALOG)) && readFileSync(join(base, CAPTURED_CATALOG), 'utf8') !== built.catalog) {
      note(`${CAPTURED_CATALOG} is not what the entries on disk build — it is stale; run a verb that rebuilds it`);
    }
  }

  const capturedCatalogPath = join(base, CAPTURED_CATALOG);
  if (existsSync(capturedCatalogPath)) {
    const text = readFileSync(capturedCatalogPath, 'utf8');
    for (const id of allCapturedIds) if (!text.includes(id)) note(`${CAPTURED_CATALOG} does not list ${id}`);
  } else if (capturedFiles.length) {
    note(`${CAPTURED_CATALOG} is missing while captured entries exist`);
  }

  // The flow plane gets the SAME artifact checks, written as a loop over one store rather than as a
  // second copy of the forty lines above. A gate that covers two of three written stores is how a
  // plane grows for a month without anything comparing it to its own entries.
  if (flowFiles.length) {
    const flowIds = new Set(flowFiles.map((f) => f.file.replace(/\.md$/, '')));
    const built = buildCapturedArtifacts(base, 'flow');
    const indexPath = join(base, FLOWS_INDEX);
    const catalogPath = join(base, FLOWS_CATALOG);
    // Absent is a notice, stale is a problem — see the captured store above for why.
    if (!existsSync(indexPath)) notice(`${FLOWS_INDEX} is absent — rebuilt from the files on disk by \`kb reindex\`; it is untracked on purpose`);
    else if (readFileSync(indexPath, 'utf8') !== built.index) {
      note(`${FLOWS_INDEX} is not what the flows on disk build — it is stale; run \`kb reindex\``);
    }
    if (!existsSync(catalogPath)) note(`${FLOWS_CATALOG} is missing while flows exist`);
    else {
      const text = readFileSync(catalogPath, 'utf8');
      if (text !== built.catalog) note(`${FLOWS_CATALOG} is not what the flows on disk build — it is stale; run \`kb reindex\``);
      for (const id of flowIds) if (!text.includes(id)) note(`${FLOWS_CATALOG} does not list ${id}`);
    }

    // A step may cite another flow, which is the whole reason a flow is worth splitting: the
    // checkout half of "place an order" is the same procedure as the checkout half of everything
    // else. A citation that resolves to nothing reads exactly like one that resolves, which is the
    // defect three anchors sat in this corpus with for a day.
    for (const { rel, abs } of flowFiles) {
      const body = readFileSync(abs, 'utf8');
      // Any citation, not only a well-formed id: a malformed one reads exactly as reached as a
      // valid one, and a pattern that admits only <NS>-<hex> cannot see @kb(KB-NOTHERE) at all.
      for (const [, cited] of body.matchAll(/@kb\(([^)\s]+)\)/g)) {
        if (!byId.has(cited)) note(`${rel}: cites @kb(${cited}), which is not an entry in this base`);
        else if (statusById.get(cited) === 'retired') {
          notice(`${rel} cites @kb(${cited}), which is retired — the step it stands for may no longer work`);
        }
      }
    }
  } else if (existsSync(join(base, FLOWS_INDEX))) {
    note(`${FLOWS_INDEX} exists while ${FLOWS_DIR}/ holds no flows`);
  }

  // THE RULES STORE GETS THE SAME ARTIFACT CHECKS, written as the flow block's sibling rather than
  // as a third copy of it: rebuild the index and the catalog from the files on disk and byte-compare.
  // An index that merely MENTIONS the right ids is what a stale one looks like, and the normative
  // plane is the one most likely to be edited by hand -- 216 entries arriving from a migration is
  // exactly the situation where somebody fixes a typo in a file and nothing rebuilds.
  if (ruleFiles.length) {
    const built = buildCapturedArtifacts(base, 'normative');
    const indexPath = join(base, RULES_INDEX);
    const catalogPath = join(base, RULES_CATALOG);
    // Absent is a notice, stale is a problem — see the captured store above for why.
    if (!existsSync(indexPath)) notice(`${RULES_INDEX} is absent — rebuilt from the files on disk by \`kb reindex\`; it is untracked on purpose`);
    else if (readFileSync(indexPath, 'utf8') !== built.index) {
      note(`${RULES_INDEX} is not what the rules on disk build — it is stale; run \`kb reindex\``);
    }
    if (!existsSync(catalogPath)) note(`${RULES_CATALOG} is missing while rules exist`);
    else {
      const text = readFileSync(catalogPath, 'utf8');
      if (text !== built.catalog) note(`${RULES_CATALOG} is not what the rules on disk build — it is stale; run \`kb reindex\``);
      for (const { file } of ruleFiles) {
        const id = file.replace(/\.md$/, '');
        if (!text.includes(id)) note(`${RULES_CATALOG} does not list ${id}`);
      }
    }
  } else if (existsSync(join(base, RULES_INDEX))) {
    note(`${RULES_INDEX} exists while ${RULES_DIR}/ holds no rules`);
  }

  // THE PLANES, COMPARED. Everything above checks that entries are well-formed and that indexes
  // match their contents. Nothing checked that a WRITTEN claim survives the contract sitting beside
  // it, and the cost of that gap is on the record: "an order cannot be deleted on this platform"
  // rode through twelve runs, three briefs and a controlled comparison while the derived plane
  // published `DELETE /api/order/customerOrders` the whole time. See src/contradiction.mjs for what
  // this looks for, what it cannot see, and why it is a notice rather than a failure.
  const ops = publishedOperations(base);
  if (ops.length) {
    for (const { data, body, rel } of activeExperiential) {
      // ONE NOTICE PER ENTRY AND COORDINATE, not per sentence. An AMENDMENT quotes the claim it
      // corrects -- KB-AFB2D3C5 carries both "an order cannot be deleted once placed" and, below
      // it, "The step said an order cannot be deleted, only cancelled" as part of the correction --
      // so a per-sentence notice makes every fix generate a permanent second complaint. The entry
      // is the unit a reader judges anyway.
      const seen = new Set();
      for (const c of contradictions(body ?? '', ops)) {
        if (seen.has(c.coordinate)) continue;
        seen.add(c.coordinate);
        notice(`${rel}: ${data.id} says "${c.sentence.slice(0, 110)}" while the contract publishes `
          + `${c.coordinate}${c.operationId ? ` (${c.operationId})` : ''} — @kb(${c.via}). A published operation is not `
          + 'proof it works, and it may be permission-gated; check the platform rather than the sentence.');
      }
    }
  }

  // THE CATALOG IS MEANT TO BE HANDED OVER WHOLE, so its size is a property of the design and not
  // an accident. The gate asks the question so that nobody has to remember to.
  for (const catalogFile of [CAPTURED_CATALOG, FLOWS_CATALOG]) {
    const abs = join(base, catalogFile);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, 'utf8');
    const rows = text.split(/\r?\n/).filter((l) => /^\| *\[?`?KB-/.test(l)).length;
    const n = catalogBudgetNotice({ rows, bytes: Buffer.byteLength(text), label: catalogFile });
    if (n) notice(n);
  }

  return { ok: problems.length === 0, entries: derivedFiles.length, captured: capturedFiles.length, flows: flowFiles.length, rules: ruleFiles.length, problems, notices };
}
