/**
 * Node preload for the detection trial: `node --import ./scripts/detection/mutant-preload.mjs …`.
 *
 * Wraps `globalThis.fetch` so that responses from a GraphQL endpoint (`…/graphql…`) are edited by
 * the mutant named in `DETECTION_MUTANT` before the runner sees them. The runner itself is not
 * changed — the trial measures the suite exactly as regression runs it.
 *
 * Environment:
 *   DETECTION_MUTANT   a mutant id from mutants.mjs — the response is mutated
 *   DETECTION_PROBE=1  do not mutate; record which mutants WOULD apply
 *   DETECTION_LOG      JSONL file to append one line per GraphQL response
 *
 * Without DETECTION_MUTANT or DETECTION_PROBE the preload is inert.
 */
import { appendFileSync } from "node:fs";
import { applyMutant, applicableMutants } from "./mutants.mjs";

const mutant = process.env.DETECTION_MUTANT || "";
const probe = process.env.DETECTION_PROBE === "1";
const log = process.env.DETECTION_LOG || "";

function isGraphQL(input) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
  try {
    return /\/graphql(\/|$|\?)/.test(new URL(url).pathname + "/");
  } catch {
    return false;
  }
}

function record(line) {
  if (log) appendFileSync(log, JSON.stringify(line) + "\n");
}

if (mutant || probe) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async function detectionFetch(input, init) {
    const res = await realFetch(input, init);
    if (!isGraphQL(input)) return res;
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
    }
    if (probe) {
      record({ probe: true, applicable: applicableMutants(body) });
      return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
    }
    const { body: mutated, applied } = applyMutant(mutant, body);
    record({ mutant, applied });
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response(JSON.stringify(mutated), { status: res.status, statusText: res.statusText, headers });
  };
}
