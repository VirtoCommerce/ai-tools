#!/usr/bin/env node
/**
 * skills/project-init/default-env.mjs — the project's default environment, `.env.test-env` (§3a, `--add-env`,
 * `--check` Step C).
 *
 * /project-init runs it once every `.env.<env>` of the run exists (scaffold-env with --no-default), so a
 * project set up with several envs at once is ASKED, never defaulted to whichever was scaffolded first. It
 * prints one JSON object the skill acts on:
 *
 *   { status: "written" | "kept" | "ask" | "skipped", env, problem?, reason?, options?, recommended?, decline?, error?, declined?, lines }
 *
 *   written — the project's only env became the default (or `--choose` named one; a production-looking
 *             one gets a warning line). A lone production-looking env is not written unasked: `ask`;
 *   kept    — `.env.test-env` exists: never rewritten; `problem` says when it names nothing usable;
 *             `declined` when the operator chose no default (the file holds only DECLINED_LINE, so it is
 *             never asked again); a `--choose` / `--decline` it overrides is not applied, and a line says so;
 *   ask     — several envs (or a lone production-looking one), none the default: ask ONE AskUserQuestion
 *             "Which environment is the default?"
 *             with `options` (the project's envs — exactly what `--choose` accepts), `recommended` first and
 *             marked Recommended (lib/test-env-selector.mjs recommendDefault — never a production-looking env;
 *             on a host-governed project one the host keeps test-user slots for); `recommended: null` (every
 *             env looks like production) ⇒ mark none. Then re-run with `--choose <answer>`. An answer that
 *             names no env of the project comes back as `ask` again with `error` — show `error` and ask again.
 *             `decline: true` (a lone production-looking env) ⇒ add the answer "No default environment",
 *             which runs `--decline`: `.env.test-env` then holds only DECLINED_LINE (`written`, `declined`);
 *   skipped — git tracks the file or does not ignore it, or the write failed: relay `lines`.
 *
 * `lines` are the operator-facing lines to relay. Writes only `.env.test-env` and, first, its `.gitignore`
 * entry (lib/gitignore.mjs ensureSelectorIgnore). Never asks anything itself — the skill does.
 *
 * Usage: node default-env.mjs [--env <the env just scaffolded or added>] [--choose <env> | --decline]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { outputRoot } from "./lib/paths.mjs";
import { ensureSelectorIgnore } from "./lib/gitignore.mjs";
import { emitObservations } from "./lib/diag-obs.mjs";
import { hostInstallPath, isHostGoverned } from "./lib/governance.mjs";
import { hostState } from "./lib/host-adapter.mjs";
import { hostEnvFor } from "./lib/test-users.mjs";
import { SELECTOR_FILE, describeSelector, ensureTestEnvSelector, looksProduction, ourEnvs, recommendDefault } from "./lib/test-env-selector.mjs";

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
  const named = arg("--env");
  const choose = arg("--choose");
  const declined = process.argv.includes("--decline");
  const envs = ourEnvs(root);
  if (!envs.length) {
    out({ status: "skipped", env: null, reason: "no-envs", lines: ["no .env.<env> with BACK_URL here yet — scaffold one first"] });
    return;
  }

  const ignored = ensureSelectorIgnore(root);
  const gitLines = ignored.length ? [`.gitignore += ${ignored.join(", ")}`] : [];
  // The question: the project's envs (the same list --choose accepts), the recommended one first. The skill
  // asks instead of relaying the stand-alone "create the file by hand" line.
  const ask = (error, extra = {}) => {
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
    const recommended = recommendDefault(envs, { withSlots });
    const options = recommended ? [recommended, ...envs.filter((e) => e !== recommended)] : envs;
    out({ status: "ask", env: null, options, recommended, ...extra, ...(error ? { error } : {}), lines: gitLines });
  };

  // A file written meanwhile (another run) wins over the answer: it is never rewritten, so the answer is
  // neither validated nor applied — the operator is told so below.
  const exists = existsSync(join(root, SELECTOR_FILE));
  // A free-text answer that names no env of the project is asked again, never written.
  if (!exists && choose !== null && !envs.includes(choose)) return ask(`"${choose}" is not an environment of this project — ask again`);
  // A lone production-looking env is not made the default unasked: the operator confirms it, or declines a
  // default altogether (`decline: true` — the second answer, `--decline`).
  if (!exists && choose === null && !declined && envs.length === 1 && looksProduction(envs[0])) return ask(undefined, { decline: true });
  // The env a write is for: the choice, else the env just scaffolded when it is one of the project's, else the first.
  const target = choose || (envs.includes(named) ? named : envs[0]);
  const result = ensureTestEnvSelector(root, target, { primary: choose !== null, declined: declined && choose === null });
  if (result.status === "skipped" && result.reason === "several-envs") return ask();

  // "<env> is not the default" only for an env this run scaffolded or added (--env): without one there is
  // nothing to compare, and a deliberate default must not be second-guessed on every --check.
  const lines = [...gitLines, ...describeSelector(result, named, { hostGoverned })];
  const answer = choose ?? (declined ? "no default environment" : null);
  if (result.status === "kept" && answer !== null && (declined ? !result.declined : result.env !== choose)) {
    lines.push(`  the answer "${answer}" was not applied: ${SELECTOR_FILE} already exists and is never rewritten — edit it to switch`);
  }
  if (result.status === "written" && looksProduction(result.env)) {
    lines.push(`  ⚠ ${result.env} looks like production: every command run without an env now targets it — edit ${SELECTOR_FILE} if that was not meant`);
    // A visible warn is never telemetry-blind (VCST-5582 H). No env name in the evidence: it can be a client's.
    emitObservations([{ class: "self_reported_warn", subject: "default_env_production", code: "NONE", evidence: { snippet: "a production-looking env became the default" } }], { skill: "project-init" });
  }
  out({ ...result, lines });
}

main();
