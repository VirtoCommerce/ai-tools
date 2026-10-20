// scripts/deploy/pr/storybook.ts — the Storybook leg of `vc-deploy.ts pr`.
//
// A vc-frontend PR publishes a theme zip on every push, but its Storybook IMAGE only on a manual
// `workflow_dispatch` of storybook-ci.yml on the PR branch (push builds are dev/master only). So the
// image is built here, and only when the PR changes what Storybook renders — a PR that touches no
// story, kit component, style or Storybook config would rebuild an identical Storybook and, since
// every dispatch also re-tags `:latest`, move that tag for nothing.
//
// The tag is read from the run's own log (`docker buildx … --tag <image>:<tag>`), never composed:
// its middle part (`alpha.<build>`) comes from the get-image-version action and cannot be predicted.
// A successful earlier dispatch at the PR's current head SHA is reused instead of building again.

import { ghHeaders, ghJson } from '../lib/github.ts';
import { sleep } from '../lib/exit.ts';
import type { PrRef } from './pr.ts';

export const STORYBOOK_WORKFLOW = 'storybook-ci.yml';

/**
 * What Storybook renders, as path rules over the PR's changed files. The stories glob itself is
 * `client-app/**\/*.stories.ts` (.storybook/main.ts); the kit components, the style tokens they read,
 * and Storybook's own config/static styles change the rendered stories without touching a story file.
 */
const RELEVANT: { re: RegExp; why: string }[] = [
  { re: /\.stories\.[cm]?[jt]sx?$/, why: 'stories' },
  { re: /^client-app\/ui-kit\//, why: 'ui-kit' },
  { re: /^client-app\/assets\/styles\//, why: 'styles' },
  { re: /^\.storybook\//, why: 'storybook config' },
  { re: /^storybook-styles\//, why: 'storybook styles' },
];

export interface StorybookNeed { needed: boolean; files: string[]; reasons: string[]; headRef: string; headSha: string; }

export function classifyStorybookFiles(files: string[]): { files: string[]; reasons: string[] } {
  const hit = files.filter((f) => RELEVANT.some((r) => r.re.test(f)));
  const reasons = [...new Set(hit.map((f) => RELEVANT.find((r) => r.re.test(f))!.why))];
  return { files: hit, reasons };
}

export async function storybookNeed(ref: PrRef): Promise<StorybookNeed | null> {
  const base = `https://api.github.com/repos/${ref.owner}/${ref.repo}`;
  const pr = await ghJson(`${base}/pulls/${ref.number}`);
  if (!pr) return null;
  const files: string[] = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await ghJson(`${base}/pulls/${ref.number}/files?per_page=100&page=${page}`);
    if (!batch?.length) break;
    files.push(...batch.map((f: any) => f.filename));
    if (batch.length < 100) break;
  }
  const c = classifyStorybookFiles(files);
  return { needed: c.files.length > 0, ...c, headRef: pr.head?.ref, headSha: pr.head?.sha };
}

/** The image tag a finished storybook-ci run pushed, read from its `ci` job log; null when none. */
async function tagFromRun(owner: string, repo: string, runId: number): Promise<string | null> {
  const jobs = await ghJson(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
  for (const job of jobs?.jobs ?? []) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/jobs/${job.id}/logs`, { headers: ghHeaders() });
    if (!res.ok) continue;
    const log = await res.text();
    const tags = [...log.matchAll(/--tag\s+\S+-storybook:([^\s,@]+)/g)].map((m) => m[1]).filter((t) => t !== 'latest');
    if (tags.length) return tags[tags.length - 1];
  }
  return null;
}

async function dispatchRuns(owner: string, repo: string, branch: string): Promise<any[]> {
  const j = await ghJson(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${STORYBOOK_WORKFLOW}/runs?event=workflow_dispatch&branch=${encodeURIComponent(branch)}&per_page=20`);
  return j?.workflow_runs ?? [];
}

/** A successful earlier dispatch at this exact head SHA, so a re-run does not rebuild (and re-tag :latest). */
export async function existingStorybookTag(ref: PrRef, need: StorybookNeed): Promise<{ tag: string; runUrl: string } | null> {
  for (const run of await dispatchRuns(ref.owner, ref.repo, need.headRef)) {
    if (run.head_sha !== need.headSha || run.conclusion !== 'success') continue;
    const tag = await tagFromRun(ref.owner, ref.repo, run.id);
    if (tag) return { tag, runUrl: run.html_url };
  }
  return null;
}

/** Dispatch storybook-ci on the PR branch, wait for it, return the pushed tag. Throws on failure/timeout. */
export async function buildStorybook(ref: PrRef, need: StorybookNeed, log: (l: string) => void = () => {}, timeoutMs = 20 * 60_000): Promise<{ tag: string; runUrl: string }> {
  const since = Date.now() - 5_000;
  const res = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}/actions/workflows/${STORYBOOK_WORKFLOW}/dispatches`, {
    method: 'POST', headers: ghHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ ref: need.headRef }),
  });
  if (res.status !== 204) throw new Error(`could not dispatch ${STORYBOOK_WORKFLOW} on ${need.headRef} (HTTP ${res.status}) — the token needs actions:write on ${ref.owner}/${ref.repo}`);
  const deadline = Date.now() + timeoutMs;
  let run: any = null;
  while (Date.now() < deadline) {
    await sleep(15_000);
    run = (await dispatchRuns(ref.owner, ref.repo, need.headRef)).find((r) => Date.parse(r.created_at) >= since);
    if (!run) continue;
    if (run.status === 'completed') break;
    log(`  … Storybook CI ${run.status}: ${run.html_url}`);
  }
  if (!run || run.status !== 'completed') throw new Error(`Storybook CI did not finish in ${Math.round(timeoutMs / 60_000)} min${run ? `: ${run.html_url}` : ''}`);
  if (run.conclusion !== 'success') throw new Error(`Storybook CI ${run.conclusion}: ${run.html_url}`);
  const tag = await tagFromRun(ref.owner, ref.repo, run.id);
  if (!tag) throw new Error(`Storybook CI succeeded but no image tag was found in its log: ${run.html_url}`);
  return { tag, runUrl: run.html_url };
}

/** Swap the `"Tag"` value in storybook/image.json as text, so the PR is a one-line diff. */
export function editStorybookText(text: string, tag: string): { text: string; from: string | null } {
  const m = /("Tag"\s*:\s*")([^"]*)(")/.exec(text);
  if (!m) return { text, from: null };
  return { text: text.slice(0, m.index) + m[1] + tag + m[3] + text.slice(m.index + m[0].length), from: m[2] };
}
