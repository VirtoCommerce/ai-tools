// scripts/deploy/lib/github.ts — GitHub access for the deploy tools: token-authenticated reads (fetch) and
// keyring-authenticated writes (`gh`). Shared by `vc-deploy.ts pr` and `vc-deploy.ts upgrade`.

import { execFileSync } from 'node:child_process';
import type { EnvCoords } from './env.ts';
import { sleep } from './exit.ts';

export interface ManifestFile { text: string; sha: string; json: any; }

let TOKEN: string | undefined;
export const setToken = (t: string | undefined): void => { TOKEN = t; };
export const getToken = (): string | undefined => TOKEN;
export function ghHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'vc-deploy-pr', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...extra };
}

// ── GitHub API ───────────────────────────────────────────────────────────────
export async function ghJson(url: string): Promise<any | null> {
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) throw new Error(`GitHub rate-limited (HTTP ${res.status}). ${TOKEN ? 'Wait for reset.' : 'Set GIT_TOKEN in .env.local.'}`);
  if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${url}`);
  return res.json();
}

export async function fetchFile(c: EnvCoords, path: string): Promise<ManifestFile> {
  const j = await ghJson(`https://api.github.com/repos/${c.deployOwner}/${c.deployRepo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(c.branch)}`);
  if (!j?.content) throw new Error(`Could not read ${c.deployOwner}/${c.deployRepo}/${path}@${c.branch}`);
  const text = Buffer.from(j.content, 'base64').toString('utf8');
  return { text, sha: j.sha, json: JSON.parse(text) };
}
export const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');

// ── writes via `gh` (keyring classic token — the credential with write on vc-deploy-dev) ─────────
// The ambient fine-grained PAT (TOKEN, used for reads) lacks fork/PR rights on the deploy repo;
// `gh` falls back to the keyring gho_ classic token when GITHUB_TOKEN/GH_TOKEN are unset (the same
// routing the rest of this repo uses for VirtoCommerce writes — see reference_github_token_routing).
export const GH_ENV: NodeJS.ProcessEnv = (() => { const e = { ...process.env }; delete e.GITHUB_TOKEN; delete e.GH_TOKEN; return e; })();
export function gh(args: string[]): string { return execFileSync('gh', args, { env: GH_ENV, encoding: 'utf8', maxBuffer: 1 << 26 }); }
export function ghApi(path: string, extra: string[] = []): any { return JSON.parse(gh(['api', path, ...extra])); }
export function ghUser(): string | null { try { return ghApi('user').login ?? null; } catch { return null; } }
/** Actual account permission on a repo: admin|maintain|write|triage|read|none. */
export function accountPermission(owner: string, repo: string, me: string): string {
  try { return ghApi(`repos/${owner}/${repo}/collaborators/${encodeURIComponent(me)}/permission`).permission ?? 'none'; } catch { return 'none'; }
}
export const canWrite = (p: string) => p === 'admin' || p === 'maintain' || p === 'write';
export function refSha(owner: string, repo: string, branch: string): string | null {
  try { return ghApi(`repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`).object?.sha ?? null; } catch { return null; }
}
export async function ensureFork(owner: string, repo: string, me: string): Promise<boolean> {
  try { ghApi(`repos/${me}/${repo}`); return true; } catch { /* no fork yet */ }
  try { gh(['repo', 'fork', `${owner}/${repo}`, '--clone=false']); } catch { return false; }
  for (let i = 0; i < 20; i++) { await sleep(3000); try { ghApi(`repos/${me}/${repo}`); return true; } catch { /* keep polling */ } }
  return false;
}
export function createRef(owner: string, repo: string, branch: string, sha: string): boolean {
  try { gh(['api', '--method', 'POST', `repos/${owner}/${repo}/git/refs`, '-f', `ref=refs/heads/${branch}`, '-f', `sha=${sha}`]); return true; }
  catch (e: any) { return /already exists|Reference already exists/i.test(String(e.stderr || e.message || e)); }
}
export interface Author { name: string; email: string }
export function commitViaGh(owner: string, repo: string, path: string, text: string, branch: string, message: string, author?: Author): boolean {
  let sha: string | null = null;
  try { sha = ghApi(`repos/${owner}/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`).sha ?? null; } catch { /* new file */ }
  const args = ['api', '--method', 'PUT', `repos/${owner}/${repo}/contents/${enc(path)}`, '-f', `message=${message}`, '-f', `content=${Buffer.from(text, 'utf8').toString('base64')}`, '-f', `branch=${branch}`];
  if (sha) args.push('-f', `sha=${sha}`);
  if (author) for (const who of ['author', 'committer']) args.push('-f', `${who}[name]=${author.name}`, '-f', `${who}[email]=${author.email}`);
  try { gh(args); return true; } catch (e: any) { console.error('[vc-deploy] commit failed:', String(e.stderr || e.message || e).slice(0, 240)); return false; }
}
export function createPr(owner: string, repo: string, base: string, head: string, title: string, body: string): { ok: boolean; url?: string; note: string } {
  try { const url = gh(['pr', 'create', '--repo', `${owner}/${repo}`, '--base', base, '--head', head, '--title', title, '--body', body]).trim(); return { ok: true, url, note: 'opened' }; }
  catch (e: any) {
    const msg = String(e.stderr || e.message || e);
    if (/already exists/i.test(msg)) { try { const url = gh(['pr', 'list', '--repo', `${owner}/${repo}`, '--head', head.includes(':') ? head.split(':')[1] : head, '--json', 'url', '--jq', '.[0].url']).trim(); if (url) return { ok: true, url, note: 'already open' }; } catch { /* ignore */ } }
    return { ok: false, note: msg.slice(0, 240) };
  }
}
export interface GhCli {
  user(): string | null;
  permission(owner: string, repo: string, me: string): string;
  refSha(owner: string, repo: string, branch: string): string | null;
  ensureFork(owner: string, repo: string, me: string): Promise<boolean>;
  mergeUpstream(me: string, repo: string, branch: string): void;
  createRef(owner: string, repo: string, branch: string, sha: string): boolean;
  fileText(owner: string, repo: string, path: string, ref: string): Promise<string | null>;
  commit(owner: string, repo: string, path: string, text: string, branch: string, message: string, author?: Author): boolean;
  createPr(owner: string, repo: string, base: string, head: string, title: string, body: string): { ok: boolean; url?: string; note: string };
}
export const realGhCli: GhCli = {
  user: ghUser,
  permission: accountPermission,
  refSha,
  ensureFork,
  mergeUpstream: (me, repo, branch) => { try { gh(['api', '--method', 'POST', `repos/${me}/${repo}/merge-upstream`, '-f', `branch=${branch}`]); } catch { /* fork may already be current */ } },
  createRef,
  fileText: async (owner, repo, path, ref) => {
    const j = await ghJson(`https://api.github.com/repos/${owner}/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`);
    return j?.content ? Buffer.from(j.content, 'base64').toString('utf8') : null;
  },
  commit: commitViaGh,
  createPr,
};
