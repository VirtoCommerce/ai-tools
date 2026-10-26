// .claude/skills/ticket-context/lib/gap.mjs — the closed GAP vocabulary, read from bundle.schema.json so it
// is declared exactly once ($defs.gapReason).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { skillRoot } from "./paths.mjs";

export const SCHEMA = JSON.parse(readFileSync(join(skillRoot(), "bundle.schema.json"), "utf8"));
export const GAP_REASONS = Object.freeze([...SCHEMA.$defs.gapReason.enum]);

const known = (reason) => { if (!GAP_REASONS.includes(reason)) throw new Error(`unknown GAP reason "${reason}"`); };

export class GapError extends Error {
  constructor(reason, detail) {
    known(reason);
    super(detail);
    this.reason = reason;
    this.detail = detail;
  }
}

export function gap(where, reason, detail) {
  known(reason);
  return detail ? { where, reason, detail } : { where, reason };
}

export function asGap(where, err) {
  return err instanceof GapError ? gap(where, err.reason, err.detail) : gap(where, "unreadable", String(err?.message ?? err).slice(0, 200));
}
