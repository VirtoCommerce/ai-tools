/**
 * bundle-evidence.ts — scaffold & validate a structured bug-investigation evidence package.
 *
 * Companion to the /qa-investigate skill (.claude/skills/qa-investigate/
 * evidence-and-root-cause.md). It does NOT capture evidence itself (the MCP browser tools do that,
 * live, during reproduction) — it gives every artifact one home, a manifest with the mandatory slots
 * (incl. the easily-lost trace/operation ID), and a completeness gate before the bug report is written.
 *
 * Usage:
 *   # scaffold a package at the start of reproduction
 *   npx tsx scripts/bundle-evidence.ts VCST-5391 --sprint=Sprint-current --browser=chrome \
 *     --symptom="extendedPrice null after editing a configured item"
 *
 *   # re-scan the newest package and report what's still missing (gate before writing the report)
 *   npx tsx scripts/bundle-evidence.ts VCST-5391 --sprint=Sprint-current --check
 *
 * Flags:
 *   --sprint=<S>     place the package under reports/tickets/<S>/<TICKET>/ (else reports/tickets/<TICKET>/)
 *   --browser=<b>    which test-results/<b>/ to scan for raw HAR/video/console (default: chrome)
 *   --symptom="..."  one-line symptom pre-filled into the manifest + worksheet
 *   --check          re-scan an existing package and print the completeness report (no scaffold)
 *
 * Env: resolves TEST_ENV via scripts/lib/resolve-test-env.js, then reads the layered .env files
 *      (.env.defaults → .env.${TEST_ENV} → .env.local) to pre-fill the env header. No hardcoding.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'dotenv';
import { resolveTestEnv } from '../lib/resolve-test-env.js';

// ---------- args ----------
const argv = process.argv.slice(2);
const ticket = argv.find((a) => !a.startsWith('--'));
const flag = (name: string): string | undefined => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf('=');
  return eq === -1 ? '' : hit.slice(eq + 1);
};
const isCheck = flag('check') !== undefined;
const sprint = flag('sprint');
const browser = flag('browser') || 'chrome';
const symptom = flag('symptom') || '';

if (!ticket) {
  console.error(
    'Usage: npx tsx scripts/bundle-evidence.ts <TICKET> [--sprint=<S>] [--browser=chrome] [--symptom="..."] [--check]',
  );
  process.exit(2);
}

// ---------- env header (no hardcoding) ----------
const testEnv = resolveTestEnv();
function loadEnvLayers(env: string): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const f of ['.env.defaults', `.env.${env}`, '.env.local']) {
    if (existsSync(f)) Object.assign(merged, parse(readFileSync(f)));
  }
  return merged;
}
const envVars = loadEnvLayers(testEnv);
const FRONT_URL = process.env.FRONT_URL || envVars.FRONT_URL || '<FRONT_URL>';
const BACK_URL = process.env.BACK_URL || envVars.BACK_URL || '<BACK_URL>';
const ENV_RISK = process.env.ENV_RISK || envVars.ENV_RISK || 'unknown';

// ---------- package location ----------
const baseDir = sprint
  ? join('reports', 'tickets', sprint, ticket)
  : join('reports', 'tickets', ticket);

const SUBDIRS = ['screenshots', 'network', 'console', 'har', 'source'] as const;

// UTC stamp without Date.now-style nondeterminism concerns — this is a CLI run, real time is fine here.
function utcStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
  );
}

function findExistingPackage(): string | undefined {
  if (!existsSync(baseDir)) return undefined;
  const pkgs = readdirSync(baseDir)
    .filter((n) => n.startsWith('evidence-'))
    .map((n) => join(baseDir, n))
    .filter((p) => statSync(p).isDirectory())
    .sort();
  return pkgs[pkgs.length - 1];
}

// ---------- raw browser-artifact discovery ----------
type RawArtifact = { kind: string; path: string };
function discoverRawArtifacts(): RawArtifact[] {
  const out: RawArtifact[] = [];
  const root = join('test-results', browser);
  if (!existsSync(root)) return out;
  const scan = (dir: string, kind: (f: string) => string | null) => {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (statSync(full).isFile()) {
        const k = kind(f);
        if (k) out.push({ kind: k, path: full });
      }
    }
  };
  scan(join(root, 'har'), (f) => (f.endsWith('.har') ? 'HAR' : null));
  scan(root, (f) =>
    f.endsWith('.har')
      ? 'HAR'
      : f.endsWith('.webm') || f.endsWith('.mp4')
        ? 'video'
        : /console.*\.(log|json|txt)$/i.test(f)
          ? 'console-log'
          : null,
  );
  // Keep only the newest 3 per kind — test-results/ accumulates hundreds of console logs and a giant
  // manifest defeats the purpose. The full set stays on disk; the manifest references the latest.
  const byKind = new Map<string, RawArtifact[]>();
  for (const a of out) (byKind.get(a.kind) ?? byKind.set(a.kind, []).get(a.kind)!).push(a);
  const capped: RawArtifact[] = [];
  for (const [, list] of byKind) {
    list.sort((x, y) => statSync(y.path).mtimeMs - statSync(x.path).mtimeMs);
    capped.push(...list.slice(0, 3));
  }
  return capped;
}

// ---------- mandatory-slot completeness ----------
type Slot = {
  id: string;
  label: string;
  mandatory: boolean;
  present: (pkg: string) => boolean;
};
function dirHasFiles(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).some((f) => statSync(join(dir, f)).isFile());
}
const SLOTS: Slot[] = [
  { id: 'screenshot', label: 'Failure-state screenshot', mandatory: true, present: (p) => dirHasFiles(join(p, 'screenshots')) },
  { id: 'network', label: 'Network capture (requests.json + failing request)', mandatory: true, present: (p) => dirHasFiles(join(p, 'network')) },
  { id: 'console', label: 'Console messages', mandatory: true, present: (p) => dirHasFiles(join(p, 'console')) },
  { id: 'traceid', label: 'Trace / operation ID filled in manifest (server-side bugs)', mandatory: true, present: (p) => manifestSlotFilled(p, 'TRACE_ID') },
  { id: 'appinsights', label: 'App Insights trace (server-side bugs)', mandatory: false, present: (p) => dirHasFiles(join(p, 'network')) && readdirSync(join(p, 'network')).some((f) => /appinsights/i.test(f)) },
  { id: 'versions', label: 'Platform + module versions filled in manifest', mandatory: true, present: (p) => manifestSlotFilled(p, 'BUILD_VERSIONS') },
  { id: 'worksheet', label: 'Root-cause worksheet: alternatives ruled out', mandatory: true, present: (p) => worksheetAlternativesFilled(p) },
];

const MANIFEST = 'evidence-index.md';
const WORKSHEET = 'root-cause.md';

function manifestSlotFilled(pkg: string, token: string): boolean {
  const f = join(pkg, MANIFEST);
  if (!existsSync(f)) return false;
  const body = readFileSync(f, 'utf8');
  // a slot line looks like:  | TRACE_ID | <fill: ...> |   — "filled" means the placeholder is gone.
  const re = new RegExp(`${token}\\s*\\|\\s*([^|]*)\\|`);
  const m = body.match(re);
  if (!m) return false;
  const val = m[1].trim();
  return val.length > 0 && !val.startsWith('<fill') && val !== '—';
}
function worksheetAlternativesFilled(pkg: string): boolean {
  const f = join(pkg, WORKSHEET);
  if (!existsSync(f)) return false;
  const body = readFileSync(f, 'utf8');
  // at least one alternative row must have a non-placeholder "how it was ruled out" cell
  const rows = body.split('\n').filter((l) => /By-design|data drift|Flaky|Version skew/i.test(l));
  return rows.some((r) => {
    const cells = r.split('|').map((c) => c.trim());
    const last = cells[cells.length - 2] || '';
    return last.length > 0 && !last.startsWith('<') && last !== 'How it was ruled out';
  });
}

// ---------- templates ----------
function manifestTemplate(pkg: string, raw: RawArtifact[]): string {
  const rawLines = raw.length
    ? raw.map((a) => `| ${a.kind} | \`${a.path.replace(/\\/g, '/')}\` | referenced (gitignored raw artifact) |`).join('\n')
    : '| — | (none found in `test-results/' + browser + '/`) | capture during repro |';
  return `# Evidence Index — ${ticket}

**Env:** \`${testEnv}\` — ${FRONT_URL} / ${BACK_URL} (ENV_RISK=${ENV_RISK})
**Symptom:** ${symptom || '<fill: one-line observable symptom>'}
**Browser:** ${browser}
**Package:** \`${pkg.replace(/\\/g, '/')}\`

> Companion: \`.claude/skills/qa-investigate/evidence-and-root-cause.md\` (Part A).
> Fill each \`<fill: …>\` slot as you capture. Run \`--check\` before writing the bug report.

## Header slots (fill these)
| slot | value |
|------|-------|
| TRACE_ID | <fill: Request-Id / traceparent of the failing request — capture DURING repro, unrecoverable later> |
| BUILD_VERSIONS | <fill: Platform <ver>, Theme <ver>, module <name> <ver> — AUTHORITATIVE: vc-deploy-dev backend/packages.json (PlatformVersion + module ids) + theme/artifact.json, branch=${testEnv === 'vcst' ? 'vcst-qa' : testEnv} via GitHub MCP; {BACK_URL}/#!/workspace/systeminfo = live cross-check> |
| REPRO_RATE | <fill: X/10 (only if intermittent)> |

## Captured artifacts (Part A ordered pass)
| # | artifact | path / value | status |
|---|----------|--------------|--------|
| 1 | Failure-state screenshot | \`screenshots/\` | <fill> |
| 2 | DOM snapshot | \`screenshots/dom-*.txt\` | <fill> |
| 3 | Network request list | \`network/requests.json\` | <fill> |
| 4 | Failing request (URL/payload/status/body) | \`network/failing-<op>.json\` | <fill> |
| 6 | Console messages | \`console/console.json\` | <fill> |
| 9 | REST cross-check (if GraphQL wrong) | \`network/rest-crosscheck-*.json\` | <fill> |
| 10 | App Insights trace for TRACE_ID | \`network/appinsights-<opId>.json\` | <fill> |
| 13 | Source findings (file:line + quote) | \`source/findings.md\` | <fill> |

## Raw browser artifacts (auto-discovered, referenced)
| kind | path | note |
|------|------|------|
${rawLines}

## Worksheet
Root-cause synthesis → \`${WORKSHEET}\`
`;
}

function worksheetTemplate(): string {
  return `## Root-Cause Worksheet — ${ticket}

### 1. Symptom (one line, observable)
${symptom || '<what a user sees — not the cause>'}

### 2. Lowest failing layer (lowest wins)
[ ] storefront-only  [ ] xAPI/GraphQL  [ ] REST  [ ] module/data  [ ] infra
Decided by: <which captured artifact proved it — cite Part A row #>
→ repoKind: <frontend | module | platform>  → repo: <vc-frontend | vc-module-x-… | vc-module-… | vc-platform>

### 3. Evidence → claim chain (every claim cites evidence)
| # | claim | evidence (artifact in package + the exact value) |
|---|-------|--------------------------------------------------|
| 1 | <claim> | <network/...json → field == value> |
| 2 | <claim> | <network/appinsights-...json → ExceptionType in Method> |
| 3 | <claim> | <source/findings.md → repo path:line> |

### 4. The "why" in one sentence
<the causal link, not a restatement of the symptom>

### 5. Alternatives ruled out (MANDATORY — at least 2)
| alternative hypothesis | how it was ruled out |
|------------------------|----------------------|
| By-design / config-gated | <cite source / setting / VirtoOZ doc> |
| Env data drift (stale index / missing fixture / orphaned org) | <cite Admin / @td fixture / org check> |
| Flaky / timing (race / ES lag / cache) | <repro rate X/10; passes-on-retry?> |
| Version skew (P1) | <compared systeminfo across good/bad env> |

### 6. Regression archaeology (only if "used to work" / post-deploy / version skew)
- Introduced in: <repo> commit <sha> (PR #NNN, "<title>", merged <date>)
- Last good: <ver / env / green REG-ID>   First bad: <ver>
- Why it broke: <intended change vs. the side effect>
- Diff explains symptom AND in window? [ ] yes  (correlation ≠ causation)

### 7. Confidence
[ ] HIGH  [ ] MEDIUM  [ ] LOW (→ do NOT name a repo; hand off symptom+layer+what's-left)

### 8. Fix Routing handoff (for /qa-fix Gate 1)
owning layer · repoKind · exact repo · file:line · revert-safe vs fix-forward
`;
}

// ---------- run ----------
function scaffold(): void {
  const pkg = join(baseDir, `evidence-${utcStamp()}`);
  for (const d of SUBDIRS) mkdirSync(join(pkg, d), { recursive: true });
  const raw = discoverRawArtifacts();
  const manifestPath = join(pkg, MANIFEST);
  const worksheetPath = join(pkg, WORKSHEET);
  if (!existsSync(manifestPath)) writeFileSync(manifestPath, manifestTemplate(pkg, raw));
  if (!existsSync(worksheetPath)) writeFileSync(worksheetPath, worksheetTemplate());

  console.log(`\n  Evidence package scaffolded`);
  console.log(`  ${relative('.', pkg)}/`);
  for (const d of SUBDIRS) console.log(`    ${d}/`);
  console.log(`    ${MANIFEST}   ← fill TRACE_ID + BUILD_VERSIONS as you capture`);
  console.log(`    ${WORKSHEET}  ← root-cause synthesis`);
  console.log(
    `\n  Raw artifacts found in test-results/${browser}/: ${raw.length ? raw.map((r) => r.kind).join(', ') : 'none yet'}`,
  );
  console.log(`\n  Capture Part A into the subfolders, then run:`);
  console.log(
    `    npx tsx scripts/bundle-evidence.ts ${ticket}${sprint ? ` --sprint=${sprint}` : ''} --check\n`,
  );
}

function check(): void {
  const pkg = findExistingPackage();
  if (!pkg) {
    console.error(`  No evidence package found under ${baseDir}/. Scaffold one first (drop --check).`);
    process.exit(1);
  }
  console.log(`\n  Completeness report — ${relative('.', pkg)}\n`);
  let missingMandatory = 0;
  for (const s of SLOTS) {
    const ok = s.present(pkg);
    if (!ok && s.mandatory) missingMandatory++;
    const mark = ok ? '✓' : s.mandatory ? '✗' : '·';
    const tag = s.mandatory ? '(mandatory)' : '(conditional)';
    console.log(`    ${mark} ${s.label} ${ok ? '' : tag}`);
  }
  console.log('');
  if (missingMandatory === 0) {
    console.log(`  PASS — all mandatory evidence present. Cleared to write the bug report.\n`);
    console.log(`  Reminder: server-side bug ⇒ TRACE_ID + App Insights trace are mandatory too.\n`);
  } else {
    console.log(
      `  INCOMPLETE — ${missingMandatory} mandatory slot(s) empty. Capture them before filing (see Part A).\n`,
    );
    process.exit(1);
  }
}

if (isCheck) check();
else scaffold();
