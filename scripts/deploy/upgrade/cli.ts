/**
 * vc-deploy.ts upgrade — bring a vc-deploy-dev env up to the latest RELEASED modules + platform and
 * the newest GREEN dev alpha of the storefront theme (/qa-env-upgrade). Three phases:
 *
 *   --env=<env> --plan-out=<file> [--json]            PLAN  (read-only network; writes the plan JSON)
 *   --plan=<file> [--decisions=<file>] [--json]       TABLE (pure: end state + checks + the table)
 *   --plan=<file> [--decisions=<file>] --apply        APPLY (edit, check by value, ONE deploy PR; never merges)
 *       [--trailer=<line>]... [--pr-footer=<text>] [--fork-owner=<login>]
 *
 * --decisions: { "<group key>": "keep" | "replace" | { "<component>": "keep" | "replace" } }; a group
 * not listed is KEEP.
 * Exit: 0 ok (APPLY: PR opened and its files verified) · 1 APPLY did not finish cleanly — nothing to
 * change, stale snapshot or no write path (nothing written), or partial commit / branch pushed without
 * a PR / PR files unverified or wrong (WRITTEN — the message carries the URL) · 2 tool error, STOP or
 * bad input — nothing was written (every exit-2 path precedes the first write).
 * Never adds or removes a module, never downgrades without an explicit, flagged approval, never calls
 * an alpha a release.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT, envFilePath, loadEnvFiles, resolveEnvCoords } from '../lib/env.ts';
import { getToken, makeHttp, realGhCli, setToken } from '../lib/github.ts';
import type { GhCli, Http } from '../lib/github.ts';
import { THEME_URL_RE, editThemeText, editUpgradeText, verifyUpgradeEdit } from '../lib/manifest.ts';
import type { ManifestChange } from '../lib/manifest.ts';
import { DeliverError, deliverPr } from '../lib/deliver.ts';
import { Exit, fail } from '../lib/exit.ts';
import { DEFAULT_FEED_URL } from './feed.ts';
import { buildPlan, finalize, renderCommitMessage, renderPrBody, renderTable } from './plan.ts';
import type { Finalized, RepoMap } from './plan.ts';
import type { Decisions, UpgradePlan } from './types.ts';

const TAG = 'env-upgrade';

function gitAuthor(): { name: string; email: string } | undefined {
  try {
    const name = execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim();
    const email = execFileSync('git', ['config', 'user.email'], { encoding: 'utf8' }).trim();
    return name && email ? { name, email } : undefined;
  } catch { return undefined; }
}

/** `deps` exists for tests only: a fake `gh` CLI and HTTP for the APPLY phase. */
export async function runUpgrade(args: string[], deps: { cli?: GhCli; http?: Http } = {}): Promise<void> {
  const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
  const flags = (n: string) => args.filter((a) => a.startsWith(`--${n}=`)).map((a) => a.split('=').slice(1).join('='));
  const has = (n: string) => args.includes(`--${n}`);
  const asJson = has('json');
  const planPath = flag('plan');

  if (!planPath) {
    const env = flag('env');
    if (!env) fail('--env=<env> is required (TEST_ENV form, e.g. vcst, vcptcore_qa1). It is never defaulted.', TAG);
    if (!existsSync(envFilePath(env))) fail(`no env file for "${env}" (${envFilePath(env)})`, TAG);
    loadEnvFiles(env);
    setToken(process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN);
    if (!getToken()) fail('No GIT_TOKEN — a PAT with read on VirtoCommerce repos (read .env.local).', TAG);
    const repoMap = JSON.parse(readFileSync(resolve(REPO_ROOT, 'config/module-repo-map.json'), 'utf8')) as RepoMap;
    const plan = await buildPlan(resolveEnvCoords(env), makeHttp(), {
      repoMap, feedUrl: process.env.VC_MODULES_FEED_URL || DEFAULT_FEED_URL, themeWorkflow: flag('theme-workflow') || 'theme-ci.yml', now: new Date(),
    }).catch((e) => fail(e.message, TAG));
    const out = flag('plan-out');
    if (out) writeFileSync(out, JSON.stringify(plan, null, 2));
    if (asJson) { console.log(JSON.stringify({ planOut: out ?? null, openUpgradePrs: plan.openUpgradePrs, questions: plan.questions, notes: plan.notes }, null, 2)); throw new Exit(0); }
    console.log(`Plan for ${plan.env} (${plan.deployOwner}/${plan.deployRepo}@${plan.branch})${out ? ` → ${out}` : ''}`);
    for (const p of plan.openUpgradePrs) console.log(`⚠ open upgrade PR #${p.number} into ${plan.branch}: ${p.url}`);
    for (const q of plan.questions) { console.log(`\nQuestion ${q.key} (recommended: ${q.recommended})`); for (const l of q.lines) console.log(`  · ${l}`); }
    if (!plan.questions.length) console.log('No questions — every prerelease pin has a release, or there are none.');
    throw new Exit(0);
  }

  let plan: UpgradePlan, decisions: Decisions;
  try {
    plan = JSON.parse(readFileSync(planPath, 'utf8'));
    decisions = flag('decisions') ? JSON.parse(readFileSync(flag('decisions')!, 'utf8')) : {};
  } catch (e: any) { fail(`cannot read plan/decisions: ${e.message}`, TAG); }
  if (plan.schema !== 1) fail(`plan schema ${plan.schema} is not supported — re-run the PLAN phase`, TAG);
  let f: Finalized;
  try { f = finalize(plan, decisions); } catch (e: any) { fail(e.message, TAG); }

  if (!has('apply')) {
    console.log(asJson ? JSON.stringify({ accepted: f.accepted, dropped: f.dropped, kept: f.kept.map((r) => r.component), passes: f.passes }, null, 2) : renderTable(plan, f));
    throw new Exit(0);
  }
  if (f.accepted.length === 0) { console.log(`${plan.env} is up to date — nothing to change.`); throw new Exit(1); }

  // ── APPLY ──
  loadEnvFiles(plan.env);
  setToken(process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN);
  const coords = resolveEnvCoords(plan.env);
  if (`${coords.deployOwner}/${coords.deployRepo}@${coords.branch}` !== `${plan.deployOwner}/${plan.deployRepo}@${plan.branch}`) {
    fail(`env "${plan.env}" now resolves to ${coords.deployOwner}/${coords.deployRepo}@${coords.branch}, the plan was for ${plan.deployOwner}/${plan.deployRepo}@${plan.branch} — re-plan`, TAG);
  }
  const pkgChanges: ManifestChange[] = f.accepted.filter((c) => c.kind !== 'theme').map((c) => ({ id: c.component, to: c.to, mode: c.mode as ManifestChange['mode'] }));
  const files: { path: string; text: string; snapshot: string }[] = [];
  if (pkgChanges.length) {
    const r = editUpgradeText(plan.snapshot.packages, pkgChanges);
    if ('error' in r) fail(`STOP — ${r.error}`, TAG);
    const problems = verifyUpgradeEdit(plan.snapshot.packages, r.text, pkgChanges);
    if (problems.length) fail(`STOP — the edit is not exactly what was approved:\n  ${problems.join('\n  ')}`, TAG);
    files.push({ path: plan.packagesPath, text: r.text, snapshot: plan.snapshot.packages });
  }
  const themeChange = f.accepted.find((c) => c.kind === 'theme');
  if (themeChange) {
    if (plan.snapshot.theme == null) fail('STOP — theme change approved but the plan has no theme snapshot', TAG);
    const te = editThemeText(plan.snapshot.theme, themeChange.to);
    if (!te.from || !THEME_URL_RE.test(te.text)) fail('STOP — theme file has no recognisable URL to replace', TAG);
    files.push({ path: plan.themePath, text: te.text, snapshot: plan.snapshot.theme });
  }
  const { title, message } = renderCommitMessage(plan, f, flags('trailer'));
  const body = renderPrBody(plan, f, flag('pr-footer') ?? '');
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let r;
  try {
    r = await deliverPr({ coords, headBranch: `env-upgrade-${plan.branch}-${stamp}`, uniqueBranch: true, title, message, body, files, author: gitAuthor(), forkOwner: flag('fork-owner'), log: (l) => console.log(l) }, deps.cli ?? realGhCli);
  } catch (e) { if (e instanceof DeliverError) fail(e.message, TAG); throw e; }
  if (r.kind === 'stale') { console.error(`[${TAG}] STOP — ${r.path} changed on ${plan.branch} since the plan. Someone changed the env; re-run from the PLAN phase.`); throw new Exit(1); }
  if (r.kind === 'handoff') {
    console.error(`[${TAG}] ${r.reason} — nothing was written. Web edit:`);
    for (const p of files) console.error(`  https://github.com/${plan.deployOwner}/${plan.deployRepo}/edit/${plan.branch}/${p.path}`);
    throw new Exit(1);
  }
  if (r.kind === 'partial') { console.error(`[${TAG}] ⚠ PARTIAL commit on ${r.writeOwner}/${plan.deployRepo}@${r.headBranch}: committed ${r.committed.join(', ')}; FAILED ${r.failed.join(', ')}. Fix or delete the branch: ${r.compareUrl}`); throw new Exit(1); }
  if (r.kind === 'pushed-no-pr') { console.log(`Branch pushed, PR not opened (${r.note}). Open it: ${r.compareUrl}`); throw new Exit(1); }
  // The PR exists from here on: print it FIRST, so no later failure can hide a PR that was opened.
  console.log(`✅ PR ${r.note}: ${r.url}`);
  console.log('A human merges it; the merge deploys. Check /api/platform/modules only after the deploy Action is green AND the versions changed.');
  // The PR must carry exactly the files we wrote — no more, no fewer.
  const prUrl = r.url;
  function unverified(why: string): never { console.error(`⚠ the PR's files could not be verified (${why}) — review ${prUrl} before anyone merges`); throw new Exit(1); }
  const prNumber = Number(/\/pull\/(\d+)/.exec(prUrl)?.[1]);
  if (!prNumber) unverified('no PR number in the URL');
  let prFiles: string[];
  try {
    prFiles = (await (deps.http ?? makeHttp()).ghAll(`/repos/${plan.deployOwner}/${plan.deployRepo}/pulls/${prNumber}/files`)).map((x: any) => String(x.filename));
  } catch (e: any) { unverified(e.message); }
  const extra = prFiles.filter((p) => !files.some((x) => x.path === p));
  const missing = files.map((x) => x.path).filter((p) => !prFiles.includes(p));
  if (missing.length) console.error(`⚠ the PR does not carry ${missing.join(', ')} — review before anyone merges`);
  if (extra.length) console.error(`⚠ the PR also touches ${extra.join(', ')} — review before anyone merges`);
  if (missing.length || extra.length) throw new Exit(1);
  throw new Exit(0);
}
