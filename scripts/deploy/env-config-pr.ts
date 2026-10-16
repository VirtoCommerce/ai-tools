#!/usr/bin/env -S npx tsx
/**
 * env-config-pr — put what the cases need into an env's vc-deploy-dev `infra/environments.yml`, as ONE pull request.
 *
 *   npm run deploy:env-config -- --env vcptcore_regression                       # dry: the change set and the diff
 *   npm run deploy:env-config -- --env vcptcore_regression --suites 088,050i     # only what these suites need
 *   npm run deploy:env-config -- --env vcptcore_regression --apply               # branch + commit + PR (never merged)
 *
 * WHY. The regression pre-flight (`scripts/regression/requirements.ts`) reports `req:deployConfig:*` and
 * `req:uploadScope:*` rows: an upload scope, a header, KnownAssetHosts that `config/suite-requirements.json` says the
 * cases need and the env's block of `infra/environments.yml` does not have. Nobody can set those from the Admin SPA —
 * they are deployment config. This turns each row into the exact lines, with values copied from the reference envs
 * (`vcst-qa`, `vcptcore-qa`) where the cases pass, and opens the PR. A human merges it; merging deploys.
 *
 * HOW THE VALUES ARE CHOSEN.
 *   - uploadScope <name>: the whole `FileUpload__Scopes__k__*` group of that scope in the first reference env that has
 *     it, renumbered to the target's next free index.
 *   - a `…KnownAssetHosts__` prefix: the target's OWN asset host (the reference envs list their own host), read from
 *     the target's `Assets__FileSystem__PublicUrl`.
 *   - any other key (`storefront.headers.X`, `platform.config.KEY`): the reference env's value for the same key.
 * A requirement no reference env can answer is reported and left out — never guessed.
 *
 * TEXT, NOT A YAML REWRITE. The file is edited line by line inside the env's block so the PR diff is exactly the
 * added or changed lines (a YAML serializer would reflow the whole file). The result is re-parsed and every
 * requirement re-checked before anything is sent.
 *
 * Exit codes: 0 nothing to do, or done · 1 bad usage · 2 a file or the API could not be read · 3 a requirement has no
 * reference value (reported; the rest still goes into the PR).
 */
import "../lib/sync-stdio.mjs";
import { parse as parseYaml } from "yaml";
import { loadEnvFiles, resolveEnvCoords, REPO_ROOT } from "./lib/env.ts";
import { ghJson, setToken, getToken } from "./lib/github.ts";
import { loadRequirements, type Requirement } from "../regression/requirements.ts";

const REFERENCE = ["vcst-qa", "vcptcore-qa"];
const FILE = "infra/environments.yml";

interface Args { env: string; suites: string[] | null; apply: boolean; reference: string[] }
function args(): Args {
  const a: Args = { env: "", suites: null, apply: false, reference: REFERENCE };
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    if (v[i] === "--env") a.env = v[++i] ?? "";
    else if (v[i] === "--suites") a.suites = (v[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (v[i] === "--reference") a.reference = (v[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (v[i] === "--apply") a.apply = true;
    else { console.error(`env-config-pr: unknown argument ${v[i]}`); process.exit(1); }
  }
  if (!a.env) { console.error("usage: deploy:env-config -- --env <TEST_ENV> [--suites a,b] [--reference vcst-qa,vcptcore-qa] [--apply]"); process.exit(1); }
  return a;
}

interface Block { start: number; end: number }
/** The line range of `- name: <env>` in a multi-env file (or the whole file for a single block). */
function envBlock(lines: string[], name: string): Block | null {
  const starts = lines.map((l, i) => (/^- name:\s*/.test(l) ? i : -1)).filter((i) => i >= 0);
  const s = starts.find((i) => lines[i].replace(/^- name:\s*/, "").trim() === name);
  if (s === undefined) return starts.length <= 1 ? { start: 0, end: lines.length } : null;
  const next = starts.find((i) => i > s);
  return { start: s, end: next ?? lines.length };
}
const indentOf = (l: string) => l.length - l.trimStart().length;
/** The line range of a dotted map path (`platform.config`) inside a block, by indentation. */
function section(lines: string[], b: Block, path: string[]): { header: number; start: number; end: number; childIndent: number } | null {
  let from = b.start, to = b.end, parentIndent = -1, header = -1;
  for (const key of path) {
    let found = -1;
    for (let i = from; i < to; i++) {
      const l = lines[i];
      if (!l.trim() || l.trim().startsWith("#")) continue;
      const ind = indentOf(l);
      if (ind <= parentIndent) break;
      if (new RegExp(`^\\s*(- )?${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(#.*)?$`).test(l)) { found = i; break; }
    }
    if (found < 0) return null;
    header = found; parentIndent = indentOf(lines[found].replace(/^(\s*)- /, "$1  "));
    from = found + 1;
    let end = from;
    while (end < to && (!lines[end].trim() || lines[end].trim().startsWith("#") || indentOf(lines[end]) > parentIndent)) end++;
    to = end;
  }
  const child = lines.slice(from, to).find((l) => l.trim() && !l.trim().startsWith("#"));
  return { header, start: from, end: to, childIndent: child ? indentOf(child) : parentIndent + 2 };
}

async function readYml(branch: string): Promise<{ text: string; sha: string } | null> {
  const j = await ghJson(`https://api.github.com/repos/VirtoCommerce/vc-deploy-dev/contents/${FILE}?ref=${encodeURIComponent(branch)}`).catch(() => null);
  return j?.content ? { text: Buffer.from(j.content, "base64").toString("utf8"), sha: j.sha } : null;
}
/** Flattened `key → value` of one env block (dotted paths, as the pre-flight reads them). */
function flat(text: string, name: string): Map<string, string> {
  const doc = parseYaml(text, { uniqueKeys: false });
  const list = Array.isArray(doc) ? doc : [doc];
  const block = list.find((e: any) => e?.name === name) ?? (list.length === 1 ? list[0] : null);
  const out = new Map<string, string>();
  const walk = (o: unknown, pre: string) => {
    if (o !== null && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, pre ? `${pre}.${k}` : k);
    else out.set(pre, String(o));
  };
  if (block) walk(block, "");
  return out;
}

interface Change { req: Requirement; suites: string[]; cases: string[]; kind: "add" | "set"; lines: string[]; from?: string; note: string }

async function main(): Promise<number> {
  const a = args();
  loadEnvFiles(a.env);
  setToken(process.env.GIT_TOKEN || process.env.GITHUB_TOKEN);
  const c = resolveEnvCoords(a.env);
  const target = await readYml(c.branch);
  if (!target) { console.error(`env-config-pr: ${FILE} not readable at vc-deploy-dev@${c.branch}`); return 2; }
  const refs: { name: string; text: string; flat: Map<string, string> }[] = [];
  for (const r of a.reference) { const y = await readYml(r); if (y) refs.push({ name: r, text: y.text, flat: flat(y.text, r) }); }

  // Unmet deploy requirements of the selected suites, grouped so one change serves every suite that needs it.
  const file = loadRequirements(REPO_ROOT);
  const want = new Map<string, { req: Requirement; suites: string[]; cases: string[] }>();
  for (const [suite, reqs] of Object.entries(file.suites)) {
    if (a.suites && !a.suites.includes(suite)) continue;
    for (const r of reqs) if (r.kind === "deployConfig" || r.kind === "uploadScope") {
      const k = `${r.kind}:${r.name}`;
      const g = want.get(k) ?? { req: r, suites: [], cases: [] };
      g.suites.push(suite); g.cases.push(...(r.cases ?? []).map((x) => `${suite}/${x}`));
      want.set(k, g);
    }
  }
  const tFlat = flat(target.text, c.branch);
  const meets = (r: Requirement, m: Map<string, string>) => {
    if (r.kind === "uploadScope") return [...m].some(([k, v]) => /^platform\.config\.FileUpload__Scopes__\d+__Scope$/.test(k) && v === r.name);
    if (r.prefix) return [...m.keys()].some((k) => k.startsWith(r.name));
    const v = m.get(r.name);
    if (r.equals !== undefined) return v !== undefined && v.toLowerCase() === String(r.equals).toLowerCase();
    if (r.notEquals !== undefined) return v === undefined || v.toLowerCase() !== String(r.notEquals).toLowerCase();
    return v !== undefined && v !== "";
  };

  const lines = target.text.split("\n");
  const block = envBlock(lines, c.branch);
  if (!block) { console.error(`env-config-pr: no '- name: ${c.branch}' block in ${FILE}`); return 2; }
  const changes: Change[] = [];
  const missing: string[] = [];
  const nextScope = () => {
    const ix = [...tFlat.keys()].map((k) => k.match(/^platform\.config\.FileUpload__Scopes__(\d+)__/)?.[1]).filter(Boolean).map(Number);
    const added = changes.filter((x) => x.req.kind === "uploadScope").length;
    return (ix.length ? Math.max(...ix) + 1 : 0) + added;
  };

  for (const [, g] of want) {
    const r = g.req;
    if (meets(r, tFlat)) continue;
    const base = { req: r, suites: g.suites, cases: g.cases };
    if (r.kind === "uploadScope") {
      const ref = refs.find((x) => [...x.flat].some(([k, v]) => /^platform\.config\.FileUpload__Scopes__\d+__Scope$/.test(k) && v === r.name));
      if (!ref) { missing.push(`upload scope ${r.name}: no reference env has it`); continue; }
      const k = [...ref.flat].find(([kk, v]) => /^platform\.config\.FileUpload__Scopes__\d+__Scope$/.test(kk) && v === r.name)![0].match(/__Scopes__(\d+)__/)![1];
      const src = ref.text.split("\n").filter((l) => new RegExp(`^\\s*FileUpload__Scopes__${k}__`).test(l));
      const n = nextScope();
      changes.push({ ...base, kind: "add", from: ref.name, note: `scope ${r.name} (copied from ${ref.name}, index ${k} → ${n})`,
        lines: src.map((l) => l.trim().replace(`FileUpload__Scopes__${k}__`, `FileUpload__Scopes__${n}__`)) });
      continue;
    }
    const [root, ...rest] = r.name.split(".");
    if (r.prefix) {
      const own = tFlat.get("platform.config.Assets__FileSystem__PublicUrl");
      const host = own ? new URL(own).host : null;
      if (!host) { missing.push(`${r.name}…: the target has no Assets__FileSystem__PublicUrl to take its own host from`); continue; }
      const key = `${rest.slice(1).join(".")}0`;
      changes.push({ ...base, kind: "add", note: `${key} = the env's own asset host (${host}), as the reference envs list theirs`, lines: [`${key}: ${host}`] });
      continue;
    }
    const ref = refs.find((x) => x.flat.has(r.name) && meets(r, x.flat));
    if (!ref) { missing.push(`${r.name}: no reference env has a value that meets the requirement`); continue; }
    const leaf = rest[rest.length - 1];
    const value = ref.flat.get(r.name)!;
    changes.push({ ...base, kind: tFlat.has(r.name) ? "set" : "add", from: ref.name, note: `${r.name} = ${value} (as on ${ref.name})`, lines: [`${leaf}: ${value}`] });
    void root;
  }

  if (!changes.length) {
    console.log(`env-config-pr: ${c.branch} already has every deploy-config requirement${a.suites ? ` of ${a.suites.join(",")}` : ""}.`);
    for (const m of missing) console.log(`  ⚠ ${m}`);
    return missing.length ? 3 : 0;
  }

  // Apply, bottom-up so earlier line numbers stay valid.
  const edits: { at: number; remove: number; add: string[] }[] = [];
  for (const ch of changes) {
    const path = ch.req.kind === "uploadScope" || ch.req.prefix ? ["platform", "config"] : ch.req.name.split(".").slice(0, -1);
    const sec = section(lines, block, path);
    if (!sec) { missing.push(`${path.join(".")} section not found in the ${c.branch} block`); continue; }
    const pad = " ".repeat(sec.childIndent);
    if (ch.kind === "set") {
      const leaf = ch.req.name.split(".").pop()!;
      const i = lines.slice(sec.start, sec.end).findIndex((l) => l.trim().startsWith(`${leaf}:`));
      if (i >= 0) { edits.push({ at: sec.start + i, remove: 1, add: [`${" ".repeat(indentOf(lines[sec.start + i]))}${ch.lines[0]}`] }); continue; }
    }
    // Next to its siblings where they exist (scopes after the last scope), else at the end of the section.
    let at = sec.end;
    while (at > sec.start && !lines[at - 1].trim()) at--;
    if (ch.req.kind === "uploadScope") {
      const last = lines.slice(sec.start, sec.end).map((l, i) => (/FileUpload__Scopes__/.test(l) ? sec.start + i : -1)).filter((i) => i >= 0).pop();
      if (last !== undefined) at = last + 1;
    }
    edits.push({ at, remove: 0, add: ch.lines.map((l) => pad + l) });
  }
  const out = [...lines];
  // Bottom-up; at the same line, the later edit goes in first so the file keeps the order the changes were planned in.
  const order = edits.map((e, i) => ({ ...e, i }));
  for (const e of order.sort((x, y) => y.at - x.at || y.i - x.i)) out.splice(e.at, e.remove, ...e.add);
  const text = out.join("\n");

  // Re-parse and re-check before anything leaves this machine.
  let after: Map<string, string>;
  try { after = flat(text, c.branch); } catch (e) { console.error(`env-config-pr: the edited file does not parse — nothing sent: ${(e as Error).message.split("\n")[0]}`); return 2; }
  const still = changes.filter((ch) => !meets(ch.req, after));
  if (still.length) { console.error(`env-config-pr: after editing, still unmet: ${still.map((x) => x.req.name).join(", ")} — nothing sent`); return 2; }

  console.log(`vc-deploy-dev ${FILE} @ ${c.branch} — ${changes.length} change(s):`);
  for (const ch of changes) console.log(`  ${ch.kind === "set" ? "~" : "+"} ${ch.note} — needed by ${ch.suites.join(", ")}${ch.cases.length ? ` (${ch.cases.length} cases)` : ""}`);
  for (const e of edits.sort((x, y) => x.at - y.at)) {
    if (e.remove) console.log(`  line ${e.at + 1}:  - ${lines[e.at].trim()}`);
    for (const l of e.add) console.log(`  line ${e.at + 1}:  + ${l.trim()}`);
  }
  for (const m of missing) console.log(`  ⚠ not included: ${m}`);
  if (!a.apply) { console.log("\nDry run. Re-run with --apply to open the PR (it is never merged here; merging deploys the env)."); return missing.length ? 3 : 0; }

  // Branch from the env branch, commit the file, open the PR.
  if (!getToken()) { console.error("env-config-pr: GIT_TOKEN is not set — cannot open the PR"); return 2; }
  const api = (p: string, init: RequestInit = {}) => fetch(`https://api.github.com/repos/VirtoCommerce/vc-deploy-dev${p}`, {
    ...init, headers: { Authorization: `Bearer ${getToken()}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const baseRef = await (await api(`/git/ref/heads/${encodeURIComponent(c.branch)}`)).json();
  const head = `claude/env-config/${c.branch}-${new Date().toISOString().slice(0, 10)}`;
  const mk = await api(`/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${head}`, sha: baseRef.object.sha }) });
  if (mk.status !== 201 && mk.status !== 422) { console.error(`env-config-pr: could not create ${head} (HTTP ${mk.status})`); return 2; }
  const cur = await readYml(head);
  const author = { name: process.env.GIT_AUTHOR_NAME || "Elena Kutasina", email: process.env.GIT_AUTHOR_EMAIL || "kutasina.elena@gmail.com" };
  const msg = `${c.branch}: config the regression cases need (${changes.map((x) => x.req.kind === "uploadScope" ? `scope ${x.req.name}` : x.req.name.split(".").pop()).join(", ")})`;
  const put = await api(`/contents/${FILE}`, { method: "PUT", body: JSON.stringify({ message: msg, content: Buffer.from(text).toString("base64"), sha: cur?.sha ?? target.sha, branch: head, author, committer: author }) });
  if (put.status !== 200 && put.status !== 201) { console.error(`env-config-pr: commit failed (HTTP ${put.status}): ${(await put.text()).slice(0, 200)}`); return 2; }
  const body = [
    `The regression pre-flight (\`requirements.ts\` in VirtoCommerce/ai-tools) found deployment config the ${c.branch} cases need and this env does not have. Values are copied from the reference envs (${refs.map((r) => r.name).join(", ")}) where those cases pass.`,
    "", "| Change | Needed by | Cases |", "|---|---|---|",
    ...changes.map((ch) => `| ${ch.note} | ${ch.suites.join(", ")} | ${ch.cases.length ? ch.cases.map((x) => x.split("/")[1]).join(", ") : "—"} |`),
    ...(missing.length ? ["", "Not included (no reference value):", ...missing.map((m) => `- ${m}`)] : []),
    "", "Merging this deploys the environment. Re-run the pre-flight afterwards: the rows above should read OK.",
    "", "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
  ].join("\n");
  const pr = await api(`/pulls`, { method: "POST", body: JSON.stringify({ title: msg, head, base: c.branch, body }) });
  const pj = await pr.json().catch(() => ({}));
  if (pr.status !== 201) { console.error(`env-config-pr: PR not opened (HTTP ${pr.status}): ${JSON.stringify(pj).slice(0, 200)}`); return 2; }
  console.log(`\nPR opened: ${pj.html_url} — review and merge it yourself; merging deploys ${c.branch}.`);
  return missing.length ? 3 : 0;
}

main().then((code) => { process.exitCode = code; });
