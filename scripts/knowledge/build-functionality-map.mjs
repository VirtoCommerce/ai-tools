#!/usr/bin/env node
/**
 * Build the EXISTING FUNCTIONALITY MAP — per product domain, what already exists and
 * what we already know about it: suites, oracle citations, domain knowledge docs, prior
 * BA analysis, prior test models, and the tickets already tested there.
 *
 * WHY THIS EXISTS
 * ---------------
 * The pipeline gathered ticket + PR + oracles + docs-MCP and skipped the two cheapest,
 * most specific sources it owns. Measured 2026-09-03:
 *
 *   1. `reports/ba/` holds 53 markdown deliverables in seven domain folders (11 of them
 *      Sales-rep, 9 Organization roles, 8 Configurable products, 8 Loyalty). Exactly ONE
 *      line in the whole surface reads them — `ba-system-analyzer.md` "Skim `reports/ba/`
 *      for prior BA reports to avoid duplicating past work" — which is dedup framing, not
 *      context. `/qa-test` Step 2 §2-load never mentions the tree, `1c` has no return
 *      field for prior analysis, and no gate checks either.
 *   2. `reports/ba/test-models/` is a durable file for the stated reason that "the next
 *      ticket on this surface REUSES the model" (`skills/qa-test/test-model.md`), and
 *      NOTHING reads one. The consequence is already on disk: VCST-5346 has two models
 *      (2026-08-28 and 2026-09-02) — the exact fork that file forbids.
 *   3. `.claude/knowledge/domain/{catalog,products,store-settings,sitemap,white-labeling}.md`
 *      are cited only inside the four BA agent definitions, and cited there as bare
 *      `knowledge/domain/…` paths. There is no top-level `knowledge/` directory, so from a
 *      sub-agent's CWD those paths resolve to nothing — the exact failure `/qa-test`'s own
 *      Constraints section warns about.
 *
 * So the answer is not "tell the agents to look harder": it is ONE generated artifact that
 * answers "what already exists on this surface, and where is it written down", cheap enough
 * to read in `1b` wave A and specific enough to hand into a `1c` brief.
 *
 * GOLDEN RULE (`.claude/rules/test-data.md`): nothing here is transcribed. The domain
 * vocabulary is `config/test-suites.json`'s own `domain` field; oracle associations are
 * MEASURED from the citations in the suite CSVs rather than from a hand-written
 * domain->BL-prefix table (which would be correct once and then wrong silently).
 *
 * ATTRIBUTION — only DISCRIMINATING tokens attribute, and a NAME outranks a TAG
 * -----------------------------------------------------------------------------
 * A BA/knowledge document carries no machine-readable domain field, so it is attributed by
 * matching its FOLDER + BASENAME + H1 TITLE against each domain's vocabulary. Four rules,
 * each of which was a measured false positive in the first render:
 *
 *   - **Container segments attribute nothing.** They are derived from the scanned directory
 *     constants themselves, not a hand list. Without this, every file under
 *     `.claude/knowledge/domain/` matched `purchase-flow` on the token `domain`, because
 *     that domain owns the tag `cross-domain` — so all six knowledge docs landed there and
 *     `catalog.md` never reached `catalog-search`.
 *   - **A domain's OWN NAME token outranks the same token appearing in another domain's
 *     tags.** `catalog` is a tag of both `catalog-search` and `purchase-flow`, so pure
 *     ownership counting made it ambiguous and dropped it — while it is a *name* token of
 *     exactly one domain, which is the stronger claim.
 *   - **A tag token attributes only in PAIRS.** One weak hit is how `member-status-invites`
 *     reached `purchase-flow` (which owns the tag `status-workflow`). Two independent weak
 *     hits is evidence; one is a coincidence.
 *   - a token owned by more than one domain at the same strength attributes nothing, and
 *     tokens shorter than MIN_TOKEN are dropped (`api`, `crud`, `b2b` as bare tokens).
 *
 * Matching is whole-token on a normalised string — `order` must not capture `orders` — the
 * same rule `scope-existing-coverage.ts` applies. A document that matches nothing is listed
 * in §5 Unattributed with its path: fail-open and ALWAYS NAMED, never silently dropped.
 *
 * A test model is the exception: it declares `Domains: <name>` in its header block, so that
 * declaration is read and only falls back to inference when absent (and says which it used).
 *
 * USAGE
 *   npm run map:refresh          rewrite .claude/knowledge/domain/functionality-map.md
 *   npm run map:check            drift gate — exit 1 on drift, 2 on an unreadable source
 *   node …/build-functionality-map.mjs --json     the model, for a tool rather than a reader
 *
 * EXIT CODES (the repo's `tokens:check` convention)
 *   0 clean · 1 drift (check mode) · 2 a source could not be read — never a silent pass
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = '.claude/knowledge/domain/functionality-map.md';
const MANIFEST = 'config/test-suites.json';
const BL_ORACLE = '.claude/knowledge/oracles/business-logic.md';
const BA_DIR = 'reports/ba';
const MODELS_DIR = 'reports/ba/test-models';
const RELEASE_NOTES_DIR = 'reports/ba/release-notes';
const KNOWLEDGE_DOMAIN_DIR = '.claude/knowledge/domain';
const TICKETS_DIR = 'reports/tickets';

const MIN_TOKEN = 4;
const BT = String.fromCharCode(96); // backtick, kept out of template literals

const argv = process.argv.slice(2);
const MODE = argv.includes('--check') ? 'check' : argv.includes('--json') ? 'json' : 'refresh';

/** A source that cannot be read is exit 2 — never a silent pass. */
function die(msg) {
  console.error(`map: ${msg}`);
  process.exit(2);
}

const abs = (p) => path.join(ROOT, p);
const readIf = (p) => {
  try {
    return fs.readFileSync(abs(p), 'utf8');
  } catch {
    return null;
  }
};

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(abs(dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

/* ---------------- 1. the domain vocabulary — the manifest's own ---------------- */

const manifestRaw = readIf(MANIFEST);
if (!manifestRaw) die(`cannot read ${MANIFEST} — the domain vocabulary has no source`);
let manifest;
try {
  manifest = JSON.parse(manifestRaw);
} catch (e) {
  die(`${MANIFEST} is not valid JSON: ${e.message}`);
}
const suites = manifest.suites || [];
if (!suites.length) die(`${MANIFEST} declares no suites`);

const domains = [...new Set(suites.map((s) => s.domain).filter(Boolean))].sort();
if (!domains.length) die(`${MANIFEST} declares no suite domains`);

/** Normalise to a whole-token list: split on non-alphanumerics AND camelCase humps. */
function tokens(str) {
  return String(str)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Container segments attribute nothing — derived from the directory constants this tool
 * scans, so renaming a scanned directory cannot leave a stale hand-written stoplist behind.
 */
const CONTAINER = new Set(
  [BA_DIR, MODELS_DIR, RELEASE_NOTES_DIR, KNOWLEDGE_DOMAIN_DIR, TICKETS_DIR, 'reports', 'suites', 'sprint']
    .flatMap((p) => tokens(p)),
);

/** Two strengths: a domain's own NAME tokens, and the tags of the suites carrying it. */
const nameVocab = new Map(domains.map((d) => [d, new Set(tokens(d).filter((t) => t.length >= MIN_TOKEN))]));
const tagVocab = new Map(domains.map((d) => [d, new Set()]));
for (const s of suites) {
  if (!s.domain || !tagVocab.has(s.domain)) continue;
  for (const tag of s.tags || []) {
    for (const t of tokens(tag)) if (t.length >= MIN_TOKEN) tagVocab.get(s.domain).add(t);
  }
}

/** Own a token at a strength only when exactly ONE domain claims it at that strength. */
function soleOwners(vocabMap) {
  const owners = new Map();
  for (const [d, set] of vocabMap) {
    for (const t of set) {
      if (CONTAINER.has(t)) continue;
      if (!owners.has(t)) owners.set(t, new Set());
      owners.get(t).add(d);
    }
  }
  const sole = new Map();
  let ambiguous = 0;
  for (const [t, ds] of owners) {
    if (ds.size === 1) sole.set(t, [...ds][0]);
    else ambiguous++;
  }
  return { sole, ambiguous };
}

const { sole: strongOwner, ambiguous: ambiguousNameTokens } = soleOwners(nameVocab);
// A name token anywhere outranks the same token as a tag, so remove it from every tag set
// before deciding tag ownership — this is what lets `catalog.md` reach `catalog-search`.
const allNameTokens = new Set([...nameVocab.values()].flatMap((s) => [...s]));
for (const [, set] of tagVocab) for (const t of [...set]) if (allNameTokens.has(t)) set.delete(t);
const { sole: weakOwner, ambiguous: ambiguousTagTokens } = soleOwners(tagVocab);
const ambiguousTokens = ambiguousNameTokens + ambiguousTagTokens;

/**
 * Attribute folder + basename + title to zero or more domains.
 * One STRONG (name-token) hit attributes; a TAG token needs a second, independent tag hit.
 */
function attribute(...strings) {
  const toks = new Set(strings.flatMap((s) => tokens(s || '')).filter((t) => !CONTAINER.has(t)));
  const strong = new Set();
  const weak = new Map();
  for (const t of toks) {
    if (strongOwner.has(t)) strong.add(strongOwner.get(t));
    else if (weakOwner.has(t)) weak.set(weakOwner.get(t), (weak.get(weakOwner.get(t)) || 0) + 1);
  }
  for (const [d, n] of weak) if (n >= 2) strong.add(d);
  return domains.filter((d) => strong.has(d));
}

/** Attribute a document by its own identity, never by the tree it happens to sit in. */
const docKeys = (rel, title) => [path.basename(path.dirname(rel)), path.basename(rel, '.md'), title];

/* ---------------- 2. suites + MEASURED oracle citations per domain ---------------- */

const BL_RE = /\bBL-[A-Z][A-Z0-9]*-\d+\b/g;
const ECL_RE = /\bECL-\d+\.\d+\b/g;

const TD_RE = /@td\(([A-Z][A-Z0-9_]*)/g;
const VAR_RE = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

const byDomain = new Map(
  domains.map((d) => [
    d,
    {
      suites: [],
      cases: 0,
      tags: new Set(),
      layers: new Set(),
      bl: new Set(),
      ecl: new Set(),
      // --- test-object model: what you can DO to it, and what it is tested AGAINST ---
      ops: new Set(), // schema operations this domain's suites actually exercise
      opSections: new Map(), // schema section -> how many of its ops are exercised here
      tdAliases: new Set(),
      envVars: new Set(),
    },
  ]),
);

/**
 * The OPERATION VOCABULARY, harvested from the schema doc rather than guessed.
 *
 * `graphql-schema.md` lists one operation per line inside a fenced block under
 * `### <Section>`, itself under `## Queries` / `## Mutations`. So the section -> operation
 * mapping is the schema's own, and "which section does this domain touch" becomes a
 * MEASUREMENT (does any of that section's operations appear in the domain's suites?) rather
 * than a token guess at a one-word section label — which is what a heuristic would have to do,
 * and it would place `### Orders` in both `purchase-flow` and `sales-rep` with no way to choose.
 */
const SCHEMA_DOC = '.claude/knowledge/api/graphql-schema.md';
const schemaDoc = readIf(SCHEMA_DOC);
const opSection = new Map(); // opName -> "Queries > Cart"
if (schemaDoc) {
  let kind = null;
  let section = null;
  for (const line of schemaDoc.split(/\r?\n/)) {
    const h2 = line.match(/^##\s+(Queries|Mutations)\s*$/);
    if (h2) {
      kind = h2[1];
      section = null;
      continue;
    }
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      section = h3[1];
      continue;
    }
    if (!kind || !section) continue;
    const op = line.match(/^([a-z][A-Za-z0-9_]*)\(/);
    // Operation names are only unique per kind, and a name can legitimately repeat; first
    // sighting wins so the reported section is stable across runs.
    if (op && !opSection.has(op[1])) opSection.set(op[1], `${kind} > ${section}`);
  }
}
const opNames = [...opSection.keys()];

let unreadableSuites = 0;
for (const s of suites) {
  const rec = byDomain.get(s.domain);
  if (!rec) continue;
  rec.suites.push(s.id);
  rec.cases += Number(s.testCount) || 0;
  if (s.layer) rec.layers.add(s.layer);
  for (const t of s.tags || []) rec.tags.add(t);
  // Citations are grepped, not column-parsed: a legacy 11-column header maps fields
  // positionally, so parsing would read the wrong cell — a raw token scan cannot.
  const csv = s.file ? readIf(s.file) : null;
  if (csv === null) {
    unreadableSuites++;
    continue;
  }
  for (const m of csv.match(BL_RE) || []) rec.bl.add(m);
  for (const m of csv.match(ECL_RE) || []) rec.ecl.add(m);
  for (const m of csv.matchAll(TD_RE)) rec.tdAliases.add(m[1]);
  for (const m of csv.matchAll(VAR_RE)) rec.envVars.add(m[1]);
  // An operation counts as exercised only where it appears CALLED — `name(` — because the
  // vocabulary contains ordinary words (`cart`, `product`, `carts`) that would match prose
  // on a bare word-boundary test. This under-reports a `cart { … }` selection with no args,
  // so the figure is a measured LOWER BOUND and is labelled as one.
  for (const op of opNames) {
    if (csv.includes(op + '(')) {
      rec.ops.add(op);
      const sec = opSection.get(op);
      rec.opSections.set(sec, (rec.opSections.get(sec) || 0) + 1);
    }
  }
}

/** Declared BL ids, so a domain's citations can be reported as declared vs dangling. */
const blOracle = readIf(BL_ORACLE);
if (blOracle === null) die(`cannot read ${BL_ORACLE}`);
const declaredBl = new Set(blOracle.match(BL_RE) || []);

/**
 * What a violation COSTS, per invariant — the severity tag the oracle already declares in its
 * own heading (`### BL-PRICE-001: … [P0-revenue]`). Read, never inferred: `oracle-significance.ts`
 * treats an absent tag as `unknown` rather than guessing one, and so does this.
 */
const blSeverity = new Map();
for (const line of blOracle.split(/\r?\n/)) {
  const m = line.match(/^#{3,4}\s+(BL-[A-Z][A-Z0-9]*-\d+)\b.*?\[(P[0-9])-([a-z]+)\]/);
  if (m) blSeverity.set(m[1], m[2]);
}

/**
 * VARIANTS — the config flags that change behaviour. A flag is attributed by a discriminating
 * token in its NAME ONLY. Unlike a document path (§ATTRIBUTION), a single WEAK hit is accepted
 * here: a flag name is a short deliberate label with no room for a second corroborating token,
 * so requiring pairs would attribute nothing at all.
 *
 * Its "what it gates" prose is deliberately NOT matched. Including it put 17 flags on
 * `catalog-search` — among them `checkout_comment_enabled` and `checkout_coupon_enabled`, whose
 * descriptions merely mention a cart or a product. A flag list that wrong is worse than none,
 * because a variant list is read as "these are the switches that change MY object".
 *
 * Whatever reaches no domain is listed once at the end rather than dropped.
 */
const FLAGS_DOC = '.claude/knowledge/automation/storefront-config-flags.md';
const flagsDoc = readIf(FLAGS_DOC);
const flags = [];
if (flagsDoc) {
  for (const line of flagsDoc.split(/\r?\n/)) {
    const m = line.match(/^\|\s*`([a-z][a-z0-9_]*)`\s*\|([^|]*)\|(.*)\|\s*$/);
    if (!m) continue;
    const toks = new Set(tokens(m[1]).filter((t) => !CONTAINER.has(t)));
    const hits = new Set();
    for (const t of toks) {
      if (strongOwner.has(t)) hits.add(strongOwner.get(t));
      else if (weakOwner.has(t)) hits.add(weakOwner.get(t));
    }
    flags.push({ flag: m[1], default: m[2].trim(), domains: [...hits] });
  }
}

/* ---------------- 3. the documents ---------------- */

const h1 = (text) => (text.match(/^#\s+(.+)$/m) || text.match(/^([A-Z][^\n]{3,80})$/m) || [, ''])[1].trim();

/**
 * A document's own date — the STALENESS signal a reader has to triangulate against. Prefer the
 * date the author put in the filename (this repo's own convention) over an mtime, which a fresh
 * checkout or a bulk line-ending pass rewrites without any content having changed.
 */
function docDate(rel) {
  const m = path.basename(rel).match(/(20[0-9][0-9])-([0-9][0-9])-([0-9][0-9])/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  try {
    return fs.statSync(abs(rel)).mtime.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/** BA analysis + guides — everything under reports/ba/ except the two named sub-trees. */
const baDocs = [];
for (const rel of walk(BA_DIR)) {
  if (!rel.endsWith('.md')) continue;
  if (rel.startsWith(`${MODELS_DIR}/`) || rel.startsWith(`${RELEASE_NOTES_DIR}/`)) continue;
  const body = readIf(rel) ?? '';
  const title = h1(body);
  baDocs.push({ path: rel, title, date: docDate(rel), domains: attribute(...docKeys(rel, title)) });
}

/** Test models declare their domains; inference is the fallback and is labelled. */
const models = [];
for (const rel of walk(MODELS_DIR)) {
  if (!rel.endsWith('.md')) continue;
  const body = readIf(rel) ?? '';
  const marker = body.match(/\bDomains?:\s*([^\n]{0,200})/i);
  let hits = [];
  let how = 'inferred';
  if (marker) {
    hits = domains.filter((d) => marker[1].toLowerCase().includes(d));
    if (hits.length) how = 'declared';
  }
  if (!hits.length) hits = domains.filter((d) => body.toLowerCase().includes(d));
  models.push({
    path: rel,
    ticket: (rel.match(/([A-Z]+-\d+)/) || [, path.basename(rel, '.md')])[1],
    domains: hits,
    how: hits.length ? how : 'unattributed',
    date: docDate(rel),
    // Part 0 is the only place in the repo that states what a surface is FOR, in the form
    // `trigger -> effect -> persisted state -> user-visible surface -> what it unlocks`
    // (`/qa-test-design` §1a). Lifted verbatim; never paraphrased, because a paraphrase of a
    // value chain is a new claim about the product.
    valueChain: valueChainOf(body),
    reverseEdges: /^\s*Reverse edges?\b/im.test(body),
  });
}

/**
 * Lift the value chain out of a Test Model's Part 0 — verbatim, capped, or `null`.
 *
 * `null` is the important return: it becomes `UNDECLARED` in the map, which is a FINDING (nobody
 * has written down what this surface is for) rather than a rendering gap. The alternative —
 * synthesising a purpose from suite titles — would put an invented claim about the product into
 * the artifact every later run reads as context, which is the `GRD-002` invented-literal failure
 * one level up.
 */
function valueChainOf(body) {
  const lines = body.split(/\r?\n/);
  // The label carries an author's parenthetical often enough that anchoring on `Value chain:`
  // exactly is wrong: VCST-5733 writes `Value chain (one line per link, rep's words):`, and a
  // strict match silently reported that domain as having no declared purpose while the same
  // model's reverse edges resolved — a contradiction visible in the rendered output.
  const at = lines.findIndex((l) => /^\s*Value chain\b[^:\n]*:/i.test(l));
  if (at === -1) return null;
  const out = [];
  const first = lines[at].replace(/^\s*Value chain\b[^:\n]*:\s*/i, '').trim();
  if (first) out.push(first);
  // The model wraps its prose at ~100 chars, so a chain LINK spans several source lines. A new
  // link starts only at an explicit marker (`L1`, `→`, `1.`); anything else continues the one
  // above. Treating each source line as a link split sentences mid-clause — which read as five
  // broken fragments rather than the four-link chain the model actually states.
  for (let i = at + 1; i < lines.length && out.length < 8; i++) {
    const t = lines[i].trim();
    if (!t || /^-{3,}$/.test(t) || /^(Variants|Mechanism|Reverse|Part\b|##)/i.test(t)) break;
    // A new link starts at a link marker OR at its own labelled line (`Unlocks:`), which would
    // otherwise be glued onto the last link and read as part of it.
    if (/^(L\d+\b|→|\d+\.|[A-Z][a-z]+:)/.test(t) || !out.length) out.push(t);
    else out[out.length - 1] += ' ' + t;
  }
  return out.length ? out : null;
}

const releaseNotes = walk(RELEASE_NOTES_DIR)
  .filter((r) => r.endsWith('.md'))
  .map((rel) => {
    const title = h1(readIf(rel) ?? '');
    return { path: rel, domains: attribute(...docKeys(rel, title)) };
  });

/** Domain knowledge docs. */
const knowledgeDocs = [];
for (const rel of walk(KNOWLEDGE_DOMAIN_DIR)) {
  if (!rel.endsWith('.md')) continue;
  if (rel === OUT) continue; // never attribute the map to itself
  const body = readIf(rel) ?? '';
  const title = h1(body);
  knowledgeDocs.push({ path: rel, title, domains: attribute(...docKeys(rel, title)) });
}

/**
 * Tickets already tested, attributed by the BL ids their own run verified — derived from
 * the artifact, never from a folder name.
 *
 * `business_rules_verified[]` is FREE PROSE that happens to contain ids (measured: one
 * VCST-5733 entry is a 60-word paragraph carrying `BL-SR-002`), so the ids are extracted
 * with the same regex used on the suites rather than compared as whole strings — an
 * equality test matched nothing and reported every domain as never tested.
 */
const testedTickets = [];
let summariesWithRules = 0;
for (const rel of walk(TICKETS_DIR)) {
  if (!rel.endsWith('summary.json')) continue;
  const raw = readIf(rel);
  if (!raw) continue;
  let j;
  try {
    j = JSON.parse(raw);
  } catch {
    continue; // a malformed run artifact is not this tool's finding
  }
  const ids = new Set((j.business_rules_verified || []).flatMap((r) => String(r).match(BL_RE) || []));
  if (ids.size) summariesWithRules++;
  const hits = domains.filter((d) => [...ids].some((id) => byDomain.get(d).bl.has(id)));
  testedTickets.push({
    ticket: j.ticket || path.basename(path.dirname(rel)),
    verdict: j.verdict || '—',
    date: j.date || '',
    path: rel,
    domains: hits,
  });
}

/* ---------------- 4. render ---------------- */

const pick = (arr, d) => arr.filter((x) => x.domains.includes(d));
const unattributed = (arr) => arr.filter((x) => !x.domains.length);
const fmtRange = (ids) => (ids.length > 8 ? `${ids.slice(0, 8).join(', ')} … (+${ids.length - 8})` : ids.join(', '));
const today = new Date().toISOString().slice(0, 10);

function render() {
  const L = [];
  L.push('# Existing Functionality Map');
  L.push('');
  L.push('> **GENERATED — never hand-edit.** `npm run map:refresh` rewrites this file;');
  L.push('> `npm run map:check` is the drift gate. Editing it by hand is reverted by the next refresh,');
  L.push('> silently. To change what it says, change the source it is derived from.');
  L.push('>');
  L.push(`> **Rev:** ${today}`);
  L.push(`> **Sources:** \`${MANIFEST}\` (${suites.length} suites, ${domains.length} domains) ·`);
  L.push(`> the suite CSVs' own \`BL-*\`/\`ECL-*\` citations · \`${BL_ORACLE}\` ·`);
  L.push(`> \`${BA_DIR}/\` (${baDocs.length} docs) · \`${MODELS_DIR}/\` (${models.length}) ·`);
  L.push(`> \`${KNOWLEDGE_DOMAIN_DIR}/\` (${knowledgeDocs.length}) · \`${TICKETS_DIR}/\` (${testedTickets.length} runs)`);
  L.push('');
  L.push('---');
  L.push('');

  L.push('## 1. What this answers, and what it does not');
  L.push('');
  L.push('**It answers:** *for the surface I am about to analyse, what already exists in this product,');
  L.push('and where is what we already know about it written down?* Read your domain\'s section BEFORE');
  L.push('analysing a ticket — the point is to start from what is known rather than re-deriving it, and to');
  L.push('AMEND the prior artifact instead of forking a second one.');
  L.push('');
  L.push('**A dated document is a HYPOTHESIS about current behaviour, never the baseline.** Every prior-art');
  L.push('entry above carries its own date for exactly one reason: the product moved after it was written, and');
  L.push('nothing in the tree tells you whether it moved *here*. So a claim taken from a prior report is');
  L.push('triangulated before it is relied on — the discipline `/qa-review-oracles` and `/qa-review-tests`');
  L.push('Dim 11 already apply to oracles and assertions, applied to prior analysis:');
  L.push('');
  L.push('| Axis | Answers | Limits |');
  L.push('|---|---|---|');
  L.push('| the **prior document** + its date | what we believed, and when | may be stale in ways nothing flags |');
  L.push('| **release documentation** — `release-ledger.md` for what shipped since that date, VirtoOZ for how the feature is meant to work | *did this component move after the doc was written?* | the ledger records **released upstream, never deployed here**, is **non-exhaustive** (a miss is not evidence of absence) and **carries no behaviour** — so it raises a staleness SUSPICION and can never settle one |');
  L.push('| **live** — the running environment | what it does now | the only axis that settles a disagreement |');
  L.push('');
  L.push('Carry a verdict per claim, in the repo vocabulary: **CONFIRMED** (prior doc still true) ·');
  L.push('**DRIFT** (it changed — say to what, and amend the document) · **MISSING** (documented behaviour is');
  L.push('gone) · **UNVERIFIED** (not checked — which is honest, and is *not* a pass). A `DRIFT` found this way');
  L.push('is a finding about the DOCUMENT, not a product bug: it enters the run like any other observation and');
  L.push('is filed only if the live behaviour is itself wrong.');
  L.push('');
  L.push('**Two questions, and the second is the one that lets you design a test.** §3 answers *where is');
  L.push('the prior art* — a bibliography. Each domain then carries a **Test object** block answering *what');
  L.push('IS this thing*: its purpose (the value chain), the operations you can perform on it, the data whose');
  L.push('properties its assertions read, the variants that change its behaviour without changing its code,');
  L.push('and the constraints that must always hold. **You cannot design an experiment on an object whose');
  L.push('properties you do not know** — you can only walk its screens, which is the measured Loyalty');
  L.push('Missions failure (127 cases, 71 of them placing zero orders, the mechanism end-to-end at 11%).');
  L.push('');
  L.push('**`UNDECLARED` is a finding, not a rendering gap.** Purpose and reverse edges exist in exactly one');
  L.push('place — a Test Model Part 0 — so where no model covers a domain the cell says `UNDECLARED` rather');
  L.push('than a synthesised guess. Inventing a purpose from suite titles would put a fabricated claim about');
  L.push('the product into the artifact every later run reads as context. It also makes the incentive right:');
  L.push('`1e` writing a model FILLS the cell for the next ticket, so the map improves as a by-product of');
  L.push('work already mandated — the same reason the `Audited:` stamp is the rotation state rather than a');
  L.push('second ledger to desync.');
  L.push('');
  L.push('**It does not** carry behaviour. It is an index of surfaces and pointers, so it can tell you that');
  L.push('a prior analysis or a fault model for this surface exists, and it can never ground an assertion —');
  L.push('the same limit `release-ledger.md` carries. `{DOC}`/`{BL}` grounding still comes from the oracle,');
  L.push('the docs and the live system.');
  L.push('');
  L.push('**Two facts about attribution, so a gap is readable as a gap:** a document is attributed by');
  L.push('matching its path and title against each domain\'s own vocabulary using only tokens that');
  L.push(`**discriminate** (${ambiguousTokens} tokens were owned by more than one domain this run and`);
  L.push('therefore attribute nothing) — so §5 is a list of documents this tool could not place, **not** a');
  L.push('list of documents that do not matter. And a domain with no prior BA analysis is a real gap, not a');
  L.push('rendering artifact: the row says `none`.');
  L.push('');

  L.push('## 2. Domain index');
  L.push('');
  L.push('| Domain | Suites | Cases | Layers | BL cited | ECL cited | BA docs | Models | Knowledge |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const d of domains) {
    const r = byDomain.get(d);
    L.push(
      `| \`${d}\` | ${r.suites.length} | ${r.cases} | ${[...r.layers].sort().join(' + ') || '—'} | ` +
        `${r.bl.size} | ${r.ecl.size} | ${pick(baDocs, d).length} | ${pick(models, d).length} | ` +
        `${pick(knowledgeDocs, d).length} |`,
    );
  }
  L.push('');
  L.push('**Domain knowledge — the whole set, always available.** Each of these is broader than one');
  L.push('domain, so they are listed in full rather than attributed away: a doc that reaches no domain');
  L.push('below is cross-cutting, not irrelevant. **These are the paths to cite** — every reference to');
  L.push('them inside an agent definition used to be a bare `knowledge/domain/…`, which resolves to');
  L.push('nothing from a sub-agent CWD because there is no top-level `knowledge/` directory.');
  L.push('');
  L.push('| Document | Covers | Attributed to |');
  L.push('|---|---|---|');
  for (const k of knowledgeDocs) {
    const to = k.domains.length ? k.domains.map((d) => '`' + d + '`').join(' · ') : 'cross-cutting';
    L.push('| [`' + k.path + '`](../../../' + k.path + ') | ' + (k.title || '—') + ' | ' + to + ' |');
  }
  L.push('');

  L.push('## 3. Per domain — the existing surface and its prior art');
  L.push('');
  for (const d of domains) {
    const r = byDomain.get(d);
    const dangling = [...r.bl].filter((b) => !declaredBl.has(b));
    L.push(`### ${d}`);
    L.push('');
    L.push(`- **Suites** (${r.suites.length}, ${r.cases} cases): ${fmtRange(r.suites) || 'none'}`);
    L.push(`- **Tags**: ${[...r.tags].sort().slice(0, 24).join(' · ') || 'none'}`);
    L.push(
      `- **Oracles cited by those suites**: ${r.bl.size} \`BL-*\`` +
        (dangling.length ? ` (**${dangling.length} not declared in the oracle** — \`npm run bl:lint\` owns that)` : '') +
        ` · ${r.ecl.size} \`ECL-*\``,
    );
    const kd = pick(knowledgeDocs, d);
    L.push(`- **Domain knowledge**: ${kd.length ? kd.map((x) => `[\`${x.path}\`](../../../${x.path})`).join(' · ') : 'none'}`);
    const ba = pick(baDocs, d);
    const baSorted = ba.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    L.push(
      '- **Prior BA analysis** (' + ba.length + '): ' +
        (ba.length
          ? baSorted.map((x) => '[' + BT + path.basename(x.path) + BT + '](../../../' + x.path + ') *(' + (x.date || 'undated') + ')*').join(' · ')
          : '**none — a real gap**'),
    );
    const md = pick(models, d);
    L.push(
      '- **Prior test models** (' + md.length + '): ' +
        (md.length
          ? md.map((x) => '[' + BT + x.ticket + BT + '](../../../' + x.path + ') *(' + (x.date || 'undated') + ', ' + x.how + ')*').join(' · ')
          : 'none — the first FULL run on this domain writes one'),
    );
    const rn = pick(releaseNotes, d);
    if (rn.length) L.push(`- **Release notes**: ${rn.map((x) => `[\`${path.basename(x.path)}\`](../../../${x.path})`).join(' · ')}`);
    const tt = pick(testedTickets, d);
    L.push(
      `- **Already tested here** (${tt.length}): ${tt.length ? tt.map((x) => `${x.ticket} → ${x.verdict}`).join(' · ') : 'no run has verified a BL in this domain'}`,
    );
    L.push(`- **Checklist**: \`/qa-checklist ${d}\``);
    L.push('');

    // ---- the TEST OBJECT: what it is, and what you can vary ----
    L.push('  **Test object** — you cannot design an experiment on an object whose properties you do');
    L.push('  not know. `UNDECLARED` below is a finding, not a rendering gap.');
    L.push('');

    const withChain = md.filter((x) => x.valueChain);
    if (withChain.length) {
      const src = withChain.sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      L.push(`  - **Purpose (value chain)** — from ${src.ticket}'s Part 0, verbatim:`);
      for (const line of src.valueChain) L.push('    - ' + line);
    } else {
      L.push('  - **Purpose (value chain)**: **`UNDECLARED`** — no Test Model Part 0 covers this domain, so');
      L.push('    nothing in the repo states what this surface is FOR. Deriving it is `1e`\'s first job, and');
      L.push('    writing that model is what fills this cell for the next ticket.');
    }

    // Count DISTINCT ops per section from the op set, not the running tally: the collection loop
    // increments once per suite, so a shared op inflated its section (catalog-search reported 14
    // ops across sections summing to 25).
    const perSection = new Map();
    for (const op of r.ops) {
      const sec = opSection.get(op);
      perSection.set(sec, (perSection.get(sec) || 0) + 1);
    }
    const secs = [...perSection.entries()].sort((a, b) => b[1] - a[1]);
    L.push(
      '  - **Operations exercised** (lower bound, measured — `name(` in this domain\'s suites): ' +
        (r.ops.size
          ? `${r.ops.size} of ${opNames.length} schema ops — ` +
            secs.map(([s, n]) => `§${s} (${n})`).join(' · ') +
            `. Full surface: [\`${SCHEMA_DOC}\`](../../../${SCHEMA_DOC})`
          : `**none found** — this domain's suites are UI-driven, or its surface is not GraphQL. Check [\`${SCHEMA_DOC}\`](../../../${SCHEMA_DOC}) before concluding it has no API`),
    );

    L.push(
      '  - **Tested against** (the data whose properties the assertions read): ' +
        `${r.tdAliases.size} \`@td()\` alias(es)` +
        (r.tdAliases.size ? ` — ${[...r.tdAliases].sort().slice(0, 10).join(', ')}${r.tdAliases.size > 10 ? ' …' : ''}` : '') +
        ` · ${r.envVars.size} \`{{VAR}}\` token(s)`,
    );

    const df = flags.filter((f) => f.domains.includes(d));
    L.push(
      '  - **Variants** (what changes its behaviour without changing its code): ' +
        (df.length
          ? `${df.length} config flag(s) — ${df.map((f) => `\`${f.flag}\` (${f.default || '?'})`).join(' · ')}`
          : 'no config flag attributed') +
        `. Store-level defaults (currency, language, catalog, payment methods) always apply: [\`${KNOWLEDGE_DOMAIN_DIR}/store-settings.md\`](store-settings.md)`,
    );

    const sev = { P0: 0, P1: 0, P2: 0, undeclared: 0 };
    for (const id of r.bl) {
      const t = blSeverity.get(id);
      if (t === 'P0') sev.P0++;
      else if (t === 'P1') sev.P1++;
      else if (t === 'P2') sev.P2++;
      else sev.undeclared++;
    }
    L.push(
      '  - **Constraints** (what must always hold — what a violation COSTS): ' +
        `${r.bl.size} \`BL-*\` — **${sev.P0} P0** · ${sev.P1} P1 · ${sev.P2} P2 · ${sev.undeclared} undeclared` +
        ` · ${r.ecl.size} \`ECL-*\`. Severity is the oracle's own tag, read and never inferred`,
    );

    const rev = md.filter((x) => x.reverseEdges);
    L.push(
      '  - **Reverse edges** (does every forward effect on money / points / stock / entitlement undo?): ' +
        (rev.length
          ? `resolved in ${rev.map((x) => x.ticket).join(', ')}'s model`
          : '**`UNDECLARED`** — no model resolved them. An unresolved reverse edge is itself a finding'),
    );
    L.push('');
  }

  L.push('## 4. Which domains a change is likely to touch');
  L.push('');
  L.push('This map is keyed on the manifest\'s `domain`, which is also what `npm run tc:scope` and');
  L.push('`npm run regression:select` score against — so the domain you resolve at `1a` is the same key');
  L.push('here, in the scope triage, and in suite selection. **Do not derive a domain from a diff path**:');
  L.push('`regression:select --path client-app/pages/company/customer-orders.vue` misses `sales-rep`');
  L.push('entirely and reports itself fully mapped (`.claude/skills/qa-test/coverage-triage.md` §1).');
  L.push('');

  L.push('## 5. Unattributed documents — named, never dropped');
  L.push('');
  const ua = [...unattributed(baDocs), ...unattributed(releaseNotes)];
  const uaModels = models.filter((m) => !m.domains.length);
  if (!ua.length && !uaModels.length) {
    L.push('None — every document placed into at least one domain.');
  } else {
    L.push('These exist and are worth reading; this tool could not place them from path + title alone.');
    L.push('**A document here is unplaced, not unimportant.**');
    L.push('');
    for (const x of ua) L.push(`- [\`${x.path}\`](../../../${x.path})`);
    for (const x of uaModels) L.push(`- [\`${x.path}\`](../../../${x.path}) — test model, no \`Domains:\` line and nothing inferable`);
  }
  L.push('');

  const uaFlags = flags.filter((f) => !f.domains.length);
  if (uaFlags.length) {
    L.push('**Config flags no domain claimed** — they still change behaviour somewhere, so read them');
    L.push(`in [\`${FLAGS_DOC}\`](../../../${FLAGS_DOC}) when your surface looks config-dependent:`);
    L.push('');
    L.push(uaFlags.map((f) => `\`${f.flag}\``).join(' · '));
    L.push('');
  }

  L.push('## 6. Self-report');
  L.push('');
  L.push('| | |');
  L.push('|---|---|');
  L.push(`| Domains | ${domains.length} |`);
  L.push(`| Suites read | ${suites.length - unreadableSuites} of ${suites.length}${unreadableSuites ? ` — **${unreadableSuites} unreadable**` : ''} |`);
  L.push(`| BA docs placed | ${baDocs.filter((x) => x.domains.length).length} of ${baDocs.length} |`);
  L.push(`| Test models placed | ${models.filter((x) => x.domains.length).length} of ${models.length} (${models.filter((x) => x.how === 'declared').length} by their own \`Domains:\` line) |`);
  L.push(`| Knowledge docs placed | ${knowledgeDocs.filter((x) => x.domains.length).length} of ${knowledgeDocs.length} |`);
  L.push(`| Ambiguous tokens (attribute nothing) | ${ambiguousTokens} |`);
  L.push('| Runs recording a verified BL invariant | ' + summariesWithRules + ' of ' + testedTickets.length + ' — the rest reach no domain because the field is empty, not because nothing was tested |');
  const declaredPurpose = domains.filter((d) => pick(models, d).some((m) => m.valueChain)).length;
  L.push(
    `| **Purpose DECLARED** | **${declaredPurpose} of ${domains.length} domains** — the other ${domains.length - declaredPurpose} have no Test Model Part 0, so nothing in the repo states what those surfaces are for. This is the map's most actionable number |`,
  );
  L.push(
    `| Schema operations harvested | ${opNames.length} from \`${SCHEMA_DOC}\`${schemaDoc ? '' : ' — **UNREADABLE, every operation figure below is absent rather than zero**'} |`,
  );
  L.push(
    `| Config flags parsed | ${flags.length} from \`${FLAGS_DOC}\`${flagsDoc ? '' : ' — **UNREADABLE**'} · ${flags.filter((f) => f.domains.length).length} attributed |`,
  );
  L.push(`| BL invariants carrying a severity tag | ${blSeverity.size} of ${declaredBl.size} declared |`);
  L.push('');
  L.push('A count here that drops is drift to explain, not a number to update by hand.');
  L.push('');

  // The repo is CRLF throughout; write that convention rather than fighting it.
  return L.join('\r\n') + '\r\n';
}

/* ---------------- 5. modes ---------------- */

if (MODE === 'json') {
  const model = {
    rev: today,
    domains: domains.map((d) => {
      const r = byDomain.get(d);
      return {
        domain: d,
        suites: r.suites,
        cases: r.cases,
        layers: [...r.layers].sort(),
        bl: [...r.bl].sort(),
        ecl: [...r.ecl].sort(),
        knowledge: pick(knowledgeDocs, d).map((x) => x.path),
        ba: pick(baDocs, d).map((x) => x.path),
        models: pick(models, d).map((x) => ({ ticket: x.ticket, path: x.path, how: x.how })),
        tested: pick(testedTickets, d).map((x) => ({ ticket: x.ticket, verdict: x.verdict })),
        object: {
          // `null`, never a synthesised string — see §1: an invented purpose is a fabricated
          // claim about the product, and every later run would read it as context.
          purpose: (pick(models, d).find((m) => m.valueChain) || {}).valueChain || null,
          operations: [...r.ops].sort(),
          operationsTotal: opNames.length,
          testedAgainst: { td: [...r.tdAliases].sort(), vars: [...r.envVars].sort() },
          variants: flags.filter((f) => f.domains.includes(d)).map((f) => f.flag),
          constraints: {
            bl: r.bl.size,
            ecl: r.ecl.size,
            p0: [...r.bl].filter((id) => blSeverity.get(id) === 'P0').length,
            undeclared: [...r.bl].filter((id) => !blSeverity.has(id)).length,
          },
          reverseEdges: pick(models, d).some((m) => m.reverseEdges) || null,
        },
      };
    }),
    unattributed: [...unattributed(baDocs), ...unattributed(knowledgeDocs)].map((x) => x.path),
  };
  process.stdout.write(JSON.stringify(model, null, 2) + '\n');
  process.exit(0);
}

const rendered = render();
// Compared EOL-normalised, so a checkout with other line endings reports content drift only.
const strip = (s) =>
  s.replace(/\r\n/g, '\n').replace(/^> \*\*Rev:\*\*.*$/m, '> **Rev:** <date>');

if (MODE === 'check') {
  const current = readIf(OUT);
  if (current === null) {
    console.error(`map:check — ${OUT} does not exist. Run \`npm run map:refresh\`.`);
    process.exit(1);
  }
  if (strip(current) !== strip(rendered)) {
    console.error(`map:check — DRIFT: ${OUT} disagrees with its sources. Run \`npm run map:refresh\`.`);
    process.exit(1);
  }
  console.log(`map:check — clean (${domains.length} domains, ${suites.length} suites, ${baDocs.length} BA docs).`);
  process.exit(0);
}

fs.writeFileSync(abs(OUT), rendered, 'utf8');
console.log(
  `map:refresh — wrote ${OUT}\n` +
    `  ${domains.length} domains · ${suites.length} suites · ${baDocs.length} BA docs ` +
    `(${baDocs.filter((x) => x.domains.length).length} placed) · ${models.length} models · ${knowledgeDocs.length} knowledge docs`,
);
