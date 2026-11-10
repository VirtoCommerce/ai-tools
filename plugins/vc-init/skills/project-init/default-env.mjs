#!/usr/bin/env node
/**
 * skills/project-init/default-env.mjs — the project's default environment, `.env.test-env` (§3a, `--add-env`,
 * `--check` Step C).
 *
 * /project-init runs it once every `.env.<env>` of the run exists (scaffold-env with --no-default), so a
 * project set up with several envs at once is ASKED, never defaulted to whichever was scaffolded first. It
 * prints one JSON object the skill acts on:
 *
 *   { status: "written" | "kept" | "ask" | "skipped", env, problem?, reason?, options?, recommended?, lines }
 *
 *   written — the project's only env became the default (or `--choose` named one);
 *   kept    — `.env.test-env` exists: never rewritten; `problem` says when it names nothing usable;
 *   ask     — several envs, none the default: ask ONE AskUserQuestion "Which environment is the default?"
 *             with `options` (the project's envs), `recommended` first (lib/test-env-selector.mjs
 *             recommendDefault — never a production-looking env; on a host-governed project one the host
 *             keeps test-user slots for), then re-run with `--choose <answer>`;
 *   skipped — git tracks the file or does not ignore it, or the write failed: relay `lines`.
 *
 * `lines` are the operator-facing lines to relay. Writes only `.env.test-env` and, first, its `.gitignore`
 * entry (lib/gitignore.mjs ensureSelectorIgnore). Never asks anything itself — the skill does.
 *
 * Usage: node default-env.mjs [--env <the env just scaffolded or added>] [--choose <env>]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { outputRoot } from "./lib/paths.mjs";
import { ensureSelectorIgnore } from "./lib/gitignore.mjs";
import { hostInstallPath, isHostGoverned } from "./lib/governance.mjs";
import { hostState } from "./lib/host-adapter.mjs";
import { hostEnvFor } from "./lib/test-users.mjs";
import { ENV_NAME_RE } from "./lib/passwords.mjs";
import { describeSelector, ensureTestEnvSelector, ourEnvs, recommendDefault } from "./lib/test-env-selector.mjs";

function arg(name) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf(name);
  return at >= 0 && argv[at + 1] && !argv[at + 1].startsWith("--") ? argv[at + 1] : null;
}

function out(result) {
  console.log(JSON.stringify(result, null, 2));
}

function main() {
  const root = outputRoot();
  let profile = null;
  try { profile = JSON.parse(readFileSync(process.env.PROJECT_PROFILE_PATH || join(root, "project-profile.json"), "utf-8")); } catch { /* not written yet */ }
  const hostGoverned = isHostGoverned(profile);
  const choose = arg("--choose");
  const envs = ourEnvs(root);

  if (choose !== null && (!ENV_NAME_RE.test(choose) || !envs.includes(choose))) {
    console.error(`[default-env] --choose ${choose}: not an environment of this project (${envs.join(", ") || "none"})`);
    process.exit(1);
  }
  const env = choose || arg("--env") || envs[0];
  if (!env) {
    out({ status: "skipped", env: null, reason: "no-envs", lines: ["no .env.<env> with BACK_URL here yet — scaffold one first"] });
    return;
  }

  const ignored = ensureSelectorIgnore(root);
  const result = ensureTestEnvSelector(root, env, { primary: choose !== null });
  const lines = [...(ignored.length ? [`.gitignore += ${ignored.join(", ")}`] : []), ...describeSelector(result, env, { hostGoverned })];

  if (result.status === "skipped" && result.reason === "several-envs") {
    // The host's test-user slots, mapped through the profile's env map — read-only; no host, no preference.
    let withSlots = () => false;
    const g = profile?.governance;
    if (g?.host) {
      try {
        const installPath = hostInstallPath(g.host, { projectRoot: root });
        const hostEnvs = installPath ? hostState(g.host, installPath, root).hostEnvs : [];
        withSlots = (e) => hostEnvFor(e, g, hostEnvs) !== null;
      } catch { /* the host could not be read: recommend by name only */ }
    }
    // The skill asks instead of relaying the stand-alone "create the file by hand" line.
    const recommended = recommendDefault(result.envs, { withSlots });
    const options = recommended ? [recommended, ...result.envs.filter((e) => e !== recommended)] : result.envs;
    out({ status: "ask", env: null, options, recommended, lines: lines.filter((l) => l.startsWith(".gitignore")) });
    return;
  }
  out({ ...result, lines });
}

main();
