// The deterministic lane: run a manifest-declared `runner` instead of an LLM agent.
//
// `config/test-suites.json` already carries `runner` / `runnerCommand` (suite 048c ->
// `layout-runner`, `npm run layout:run`), but `ci/run-regression.ts` never looked at them —
// it went straight to `ci/agents/${agent}.md` and failed. So the one suite in the corpus
// that is already 100% deterministic was, in headless mode, both broken and (had it worked)
// paying for an LLM it does not need.
//
// This lane consumes no browser slot from the agent pool, no token budget, and no turns. It
// is also the compose point for the machine layer planned in stage B/C: a new runner only
// needs a manifest entry, not a change here.
//
// Exit-code contract, matching what `.claude/agents/test-runner-agent.md` already documents
// for `graphql-runner` and what `layout-runner.ts` implements:
//   0 -> success   1 -> fail (real assertion failure)   2 -> structural/parse   3 -> runtime
// 2 and 3 are BLOCKED, never `fail`: a suite the runner could not parse or reach has not
// tested anything, and reporting it as a failure would put a phantom bug in the record.

import { spawn } from "child_process";

/** Binaries a `runnerCommand` may invoke. The manifest is committed, but an allowlist keeps
 *  this from becoming an arbitrary-execution surface if that ever stops being true. */
export const ALLOWED_RUNNER_BINS = ["npm", "npx", "node", "tsx"] as const;

export interface ParsedRunnerCommand {
  bin: string;
  args: string[];
}

/**
 * Split a `runnerCommand` into bin + args. Whitespace-split (no shell), so the command must
 * not rely on quoting or shell operators — `npm run layout:run` is the shape in use.
 * Returns null when the command is empty or its binary is not allowlisted.
 */
export function parseRunnerCommand(command: string | undefined): ParsedRunnerCommand | null {
  const parts = (command ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const [bin, ...args] = parts;
  if (!(ALLOWED_RUNNER_BINS as readonly string[]).includes(bin)) return null;
  return { bin, args };
}

/** Map a deterministic runner's exit code onto the shared status vocabulary. */
export function statusFromExitCode(code: number | null): "success" | "fail" | "blocked" | "error" {
  switch (code) {
    case 0:
      return "success";
    case 1:
      return "fail";
    case 2:
    case 3:
      return "blocked";
    default:
      return "error";
  }
}

export interface DeterministicRunOutcome {
  status: "success" | "fail" | "blocked" | "error" | "timeout";
  exitCode: number | null;
  durationMs: number;
  /** Tail of combined stdout+stderr, for the report. Bounded so a chatty runner cannot
   *  balloon the run summary. */
  outputTail: string;
  errors?: string[];
}

const OUTPUT_TAIL_CHARS = 4000;

/**
 * Execute a deterministic runner. Never throws: a spawn failure becomes `status: "error"`
 * so one misconfigured runner cannot abort the whole run.
 */
export function runDeterministicSuite(opts: {
  suiteId: string;
  runnerCommand: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  onLine?: (line: string) => void;
}): Promise<DeterministicRunOutcome> {
  const started = Date.now();
  const parsed = parseRunnerCommand(opts.runnerCommand);

  if (!parsed) {
    return Promise.resolve({
      status: "error",
      exitCode: null,
      durationMs: 0,
      outputTail: "",
      errors: [
        `runnerCommand not runnable: ${JSON.stringify(opts.runnerCommand)} ` +
          `(allowed binaries: ${ALLOWED_RUNNER_BINS.join(", ")})`,
      ],
    });
  }

  return new Promise<DeterministicRunOutcome>((resolve) => {
    let output = "";
    let settled = false;

    const child = spawn(parsed.bin, parsed.args, {
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const collect = (chunk: Buffer): void => {
      const text = chunk.toString("utf-8");
      output = (output + text).slice(-OUTPUT_TAIL_CHARS);
      if (opts.onLine) for (const line of text.split("\n")) if (line.trim()) opts.onLine(line);
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);

    const finish = (outcome: DeterministicRunOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      // SIGKILL if it ignores SIGTERM — a wedged browser must not hold the lane.
      setTimeout(() => child.kill("SIGKILL"), 5_000);
      finish({
        status: "timeout",
        exitCode: null,
        durationMs: Date.now() - started,
        outputTail: output,
        errors: [`deterministic runner timed out after ${Math.round(opts.timeoutMs / 1000)}s`],
      });
    }, opts.timeoutMs);

    child.on("error", (error) => {
      finish({
        status: "error",
        exitCode: null,
        durationMs: Date.now() - started,
        outputTail: output,
        errors: [error.message],
      });
    });

    child.on("close", (code) => {
      finish({
        status: statusFromExitCode(code),
        exitCode: code,
        durationMs: Date.now() - started,
        outputTail: output,
      });
    });
  });
}
