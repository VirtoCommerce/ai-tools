// scripts/deploy/lib/deliver.ts — open ONE deploy PR into an env branch of vc-deploy-dev.
// Direct same-repo branch when the account has write, else a branch on its fork. Never merges.
import type { EnvCoords } from './env.ts';
import { canWrite, realGhCli } from './github.ts';
import type { Author, GhCli } from './github.ts';

export interface DeliverFile { path: string; text: string; snapshot?: string }
export interface DeliverRequest {
  coords: EnvCoords; headBranch: string; uniqueBranch?: boolean; title: string; message?: string; body: string;
  files: DeliverFile[]; author?: Author; forkOwner?: string; draft?: boolean; log?: (line: string) => void;
}
export type DeliverResult =
  | { kind: 'pr'; url: string; note: string; headBranch: string; compareUrl: string; direct: boolean; account: string; perm: string }
  | { kind: 'pushed-no-pr'; note: string; headBranch: string; compareUrl: string; direct: boolean; account: string; perm: string }
  | { kind: 'partial'; headBranch: string; compareUrl: string; writeOwner: string; committed: string[]; failed: string[] }
  | { kind: 'handoff'; reason: string }
  | { kind: 'stale'; path: string }
  | { kind: 'unreadable'; path: string };
export class DeliverError extends Error {}

export async function deliverPr(req: DeliverRequest, cli: GhCli = realGhCli): Promise<DeliverResult> {
  const c = req.coords, log = req.log ?? (() => {});
  const me = req.forkOwner || cli.user();
  if (!me) throw new DeliverError('Could not resolve the GitHub account — is `gh` authenticated? (run `gh auth status`).');
  const baseSha = cli.refSha(c.deployOwner, c.deployRepo, c.branch);
  if (!baseSha) throw new DeliverError(`Could not read ${c.deployOwner}/${c.deployRepo}@${c.branch} head — check the branch name for env "${c.env}".`);
  // The plan was computed from a snapshot; if the env branch moved since, the approved diff is stale.
  // Compared at baseSha — the commit the head branch is created from below — not at the moving branch,
  // so a push landing after this check can never be silently reverted by the PR.
  const pinned = req.files.some((f) => f.snapshot !== undefined);
  for (const f of req.files) {
    if (f.snapshot === undefined) continue;
    const now = await cli.fileText(c.deployOwner, c.deployRepo, f.path, baseSha);
    if (now === null) return { kind: 'unreadable', path: f.path };
    if (now !== f.snapshot) return { kind: 'stale', path: f.path };
  }
  const perm = cli.permission(c.deployOwner, c.deployRepo, me);
  const direct = canWrite(perm);
  let writeOwner: string;
  if (direct) {
    writeOwner = c.deployOwner;
    log(`[apply] direct (perm=${perm}) on ${c.deployOwner}/${c.deployRepo} → ${c.branch}`);
  } else {
    log(`[apply] account "${me}" has no write (perm=${perm}) on ${c.deployOwner}/${c.deployRepo} — forking`);
    if (!(await cli.ensureFork(c.deployOwner, c.deployRepo, me))) return { kind: 'handoff', reason: 'Could not create/find your fork.' };
    cli.mergeUpstream(me, c.deployRepo, c.branch);
    writeOwner = me;
  }
  let headBranch = req.headBranch;
  if (req.uniqueBranch) for (let n = 2; cli.refSha(writeOwner, c.deployRepo, headBranch) !== null; n++) headBranch = `${req.headBranch}-${n}`;
  const headSpec = direct ? headBranch : `${me}:${headBranch}`;
  // Snapshot-checked delivery builds on exactly the commit it checked (forks share the upstream's objects);
  // unchecked delivery (`pr`) keeps building on the fork's synced branch, as it always has.
  const branchSha = direct || pinned ? baseSha : (cli.refSha(me, c.deployRepo, c.branch) || baseSha);
  // Surface (not silently resolve) a concurrent run on a deterministic branch name: the commits below overwrite it.
  const headExistedBefore = !req.uniqueBranch && cli.refSha(writeOwner, c.deployRepo, headBranch) !== null;
  const compareUrl = `https://github.com/${c.deployOwner}/${c.deployRepo}/compare/${c.branch}...${headSpec.replace(':', '%3A')}?expand=1`;
  if (!cli.createRef(writeOwner, c.deployRepo, headBranch, branchSha)) return { kind: 'handoff', reason: 'Could not create the deployment branch.' };
  if (headExistedBefore) {
    log(`\n⚠ Branch ${writeOwner}/${c.deployRepo}@${headBranch} already existed before this run.`);
    log(`  Possible concurrent run for the same ticket+env — the commits below will`);
    log(`  overwrite whatever is currently on that branch (no merge). If unsure, stop and compare first:`);
    log(`  ${compareUrl}`);
  }
  const committed: string[] = [], failed: string[] = [];
  for (const f of req.files) (cli.commit(writeOwner, c.deployRepo, f.path, f.text, headBranch, req.message ?? req.title, req.author) ? committed : failed).push(f.path);
  if (failed.length) return committed.length
    ? { kind: 'partial', headBranch, compareUrl, writeOwner, committed, failed }
    : { kind: 'handoff', reason: 'A commit failed (push rights?).' };
  const pr = cli.createPr(c.deployOwner, c.deployRepo, c.branch, headSpec, req.title, req.body, req.draft);
  return pr.ok
    ? { kind: 'pr', url: pr.url!, note: pr.note, headBranch, compareUrl, direct, account: me, perm }
    : { kind: 'pushed-no-pr', note: pr.note, headBranch, compareUrl, direct, account: me, perm };
}
