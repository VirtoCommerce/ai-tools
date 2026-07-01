#!/usr/bin/env node
// resolve-theme.mjs — pick a vc-frontend storefront theme ZIP by channel keyword.
//
// WHAT IT DOES
//   Lists the vc3prerelease blob (the same anonymous-readable `packages` container the CI publishes
//   every theme build to — modules, themes, storybook) and resolves a channel keyword to the NEWEST
//   matching `vc-theme-b2b-vue-<version>.zip`, printing a ready-to-use provision `-FrontendUrl`.
//
//   This is the "install latest release / grab the alpha" front-end of /qa-local-env: the bare words
//   `latest` and `alpha` map straight onto it. The backend twin is gen-manifest.mjs (--prerelease);
//   per-task PR builds (frontend + backend) come from resolve-task.mjs.
//
// CHANNELS
//   latest   newest GA release  — clean `x.y.z` (no -alpha/-pr/-beta/-rc, no bare sha suffix)
//   alpha    newest alpha build — `x.y.z-alpha.<N>` (the rolling main-branch build vcst-dev runs);
//            highest base version, then highest alpha build number
//   pr <N>   newest build of PR #N — `x.y.z-pr-<N>-<sha>` (handy when you know the PR but not the task)
//
// USAGE
//   node resolve-theme.mjs latest                 # → -FrontendUrl line + summary
//   node resolve-theme.mjs alpha                  # newest alpha
//   node resolve-theme.mjs pr 2350                 # newest build of PR #2350
//   node resolve-theme.mjs alpha --url            # print ONLY the bare ZIP URL (for capture)
//   node resolve-theme.mjs latest --json          # {channel, version, file, url}
//
//   --url             print only the resolved ZIP URL (nothing else) — for `$(…)` capture
//   --json            print the resolution as JSON
//   --prefix <p>      theme blob-name prefix (default vc-theme-b2b-vue-)
//   --container <c>   blob container (default packages)
//
// Zero dependencies, Node 18+ (global fetch). The vc3prerelease blob is anonymous-readable AND
// anonymous-listable on the `packages` container (verified) — no Azure token needed.

const BLOB_BASE = "https://vc3prerelease.blob.core.windows.net";
const DEFAULT_CONTAINER = "packages";
const DEFAULT_PREFIX = "vc-theme-b2b-vue-";

function parseArgs(argv) {
  const o = { channel: null, pr: null, url: false, json: false, prefix: DEFAULT_PREFIX, container: DEFAULT_CONTAINER };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--url") o.url = true;
    else if (a === "--json") o.json = true;
    else if (a === "--prefix") o.prefix = next();
    else if (a === "--container") o.container = next();
    else if (a === "-h" || a === "--help") { printHelp(); process.exit(0); }
    else if (!o.channel && /^(latest|alpha|pr)$/i.test(a)) o.channel = a.toLowerCase();
    else if (o.channel === "pr" && o.pr === null && /^\d+$/.test(a)) o.pr = a;
    else { console.error(`Unknown arg: ${a}  (channels: latest | alpha | pr <N>)`); process.exit(2); }
  }
  if (!o.channel) { console.error("Provide a channel: latest | alpha | pr <N>"); process.exit(2); }
  if (o.channel === "pr" && !o.pr) { console.error("pr channel needs a PR number, e.g. `pr 2350`"); process.exit(2); }
  return o;
}
function printHelp() {
  console.log(new URL(import.meta.url).pathname);
  console.log("resolve-theme.mjs — vc-frontend theme by channel: latest | alpha | pr <N>. See file header.");
}

// Compare `x.y.z[-channel.N|-pr-N-sha]` versions. Numeric base first, then trailing build number.
function cmpVersion(a, b) {
  const split = (v) => { const [base, ...pre] = String(v).split("-"); return { nums: base.split(".").map((n) => parseInt(n, 10) || 0), pre: pre.join("-") }; };
  const A = split(a), B = split(b), len = Math.max(A.nums.length, B.nums.length);
  for (let i = 0; i < len; i++) { const d = (A.nums[i] || 0) - (B.nums[i] || 0); if (d) return d < 0 ? -1 : 1; }
  const na = (A.pre.match(/(\d+)$/) || [])[1], nb = (B.pre.match(/(\d+)$/) || [])[1];
  if (na && nb) { const d = (+na) - (+nb); if (d) return d < 0 ? -1 : 1; }
  if (A.pre === B.pre) return 0;
  return A.pre < B.pre ? -1 : 1;
}

async function listThemes(container, prefix) {
  let marker = "", names = [];
  do {
    const url = `${BLOB_BASE}/${container}?restype=container&comp=list&prefix=${encodeURIComponent(prefix)}&maxresults=5000${marker ? `&marker=${encodeURIComponent(marker)}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) { console.error(`Blob list failed: ${res.status} ${res.statusText}\n  ${url}`); process.exit(1); }
    const body = await res.text();
    names.push(...[...body.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]));
    marker = (body.match(/<NextMarker>([^<]*)<\/NextMarker>/) || [])[1] || "";
  } while (marker);
  return names;
}

function pick(channel, pr, names, prefix) {
  const ver = (n) => n.replace(new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "").replace(/\.zip$/i, "");
  // Exclude the storybook sub-family (vc-theme-b2b-vue-storybook-*) — not a deployable storefront theme.
  const versions = names.map(ver).filter((v) => !/^storybook-/.test(v));
  let pool;
  if (channel === "latest") pool = versions.filter((v) => /^\d+\.\d+\.\d+$/.test(v));            // clean GA x.y.z
  else if (channel === "alpha") pool = versions.filter((v) => /-alpha\.\d+$/.test(v));            // x.y.z-alpha.N
  else pool = versions.filter((v) => new RegExp(`-pr-${pr}-`).test(v));                            // x.y.z-pr-<N>-sha
  if (!pool.length) return null;
  return pool.sort(cmpVersion).pop();
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const names = await listThemes(o.container, o.prefix);
  const version = pick(o.channel, o.pr, names, o.prefix);
  if (!version) {
    console.error(`No ${o.channel}${o.pr ? ` #${o.pr}` : ""} theme found under ${o.prefix}* in ${o.container} (${names.length} blobs scanned).`);
    process.exit(1);
  }
  const file = `${o.prefix}${version}.zip`;
  const url = `${BLOB_BASE}/${o.container}/${file}`;

  if (o.url) { console.log(url); return; }
  if (o.json) { console.log(JSON.stringify({ channel: o.channel, pr: o.pr, version, file, url }, null, 2)); return; }

  console.log(`resolve-theme :: ${o.channel}${o.pr ? ` #${o.pr}` : ""} → ${version}`);
  console.log(`  file  : ${file}`);
  console.log(`  url   : ${url}`);
  console.log(`\n  provision frontend : -FrontendUrl "${url}"`);
  console.log(`  e.g.  pwsh -File .claude/skills/testing/qa-local-env/provision.ps1 -Action up \\`);
  console.log(`          -Manifest .local-env/packages.custom.json -FrontendUrl "${url}"`);
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
