// plugins/vc-test/lib/keep-prepare.mjs — the copy of /ticket-context's prepare a run's agents read after its `finish`
// removes the original: prepare.json and its prs[].diff_path files go to <WORK>/prepare/, the paths rewritten to the
// copies (the scenario generator reads the PR diffs, B21). Copies only; nothing here deletes data.
//
//   node plugins/vc-test/lib/keep-prepare.mjs --prepare <prepare.json> --key <KEY>   → { path } of the copy
// Exit: 0 done; 1 usage.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { KEY_RE, argOf, workDir } from "./paths.mjs";

export function keepPrepare({ prepare, dir }) {
  const p = JSON.parse(readFileSync(prepare, "utf8"));
  mkdirSync(dir, { recursive: true });
  for (const pr of p.prs ?? []) {
    if (!pr.diff_path) continue;
    const to = join(dir, basename(pr.diff_path));
    copyFileSync(resolve(pr.diff_path), to);
    pr.diff_path = to;
  }
  const out = join(dir, "prepare.json");
  writeFileSync(out, JSON.stringify(p, null, 1));
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argv = process.argv.slice(2);
  const key = argOf(argv, "key");
  const prepare = argOf(argv, "prepare");
  if (!prepare || !key || !KEY_RE.test(key)) {
    console.error("usage: keep-prepare.mjs --prepare <prepare.json> --key <KEY>");
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify({ path: keepPrepare({ prepare, dir: join(workDir(key), "prepare") }) })); }
    catch (e) { console.error(`keep-prepare: ${e.message}`); process.exitCode = 1; }
  }
}
