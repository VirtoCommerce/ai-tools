/**
 * Parses the Steps column of a runner-native GraphQL test case into an
 * ordered list of StepBlocks:
 *   [AUTH role=X]  ·  [AUTH role=X org=@td(ALIAS.platform_id)]
 *   [GQL-OP label] <multi-line query body>
 *   [GQL-VARS label] <JSON body>
 *   [GQL-EXEC label]
 *   [GQL-CAPTURE label.path → VAR]
 *
 * Also parses the Test_Data column into an initial variables bag.
 */

export type StepBlock =
  | AuthStep
  | EndpointStep
  | OpStep
  | VarsStep
  | ExecStep
  | CaptureStep
  | RestStep
  | RestOpStep
  | RestExecStep
  | RestCaptureStep
  | McpOpStep
  | McpExecStep
  | McpCaptureStep
  | WaitStep
  | UnknownStep;

export interface AuthStep {
  kind: "AUTH";
  role: string;
  /**
   * Optional per-case ORGANIZATION override for the password grant, sent as
   * `organization_id` on POST /connect/token (graphql-auth.ts).
   *
   * Without it a role signs in under whatever org its ALIAS declares — one org
   * per role, fixed for the life of the alias — so the same user could never be
   * authenticated under a DIFFERENT org in a later step. That left the whole
   * org-switch class (does balance / permission / visibility follow the ACTIVE
   * org?) unauthorable on the backend: there was no way to say "same person,
   * other org" at all.
   *
   * Author it as an `@td()` token resolving to the PLATFORM GUID — never a
   * literal (`.claude/rules/test-data.md` GOLDEN RULE; a literal GUID also fails
   * `td:validate` DV-013), and never a CSV business key such as "ORG-002", which
   * the token endpoint ignores.
   */
  org?: string;
  raw: string;
}

/**
 * Selects the GraphQL endpoint path for every op in this case. Optional —
 * absent means the default "/graphql" (default xAPI schema). Scoped schemas:
 *   [GQL-ENDPOINT /graphql/sales-rep]
 * Applies to all [GQL-OP]/[GQL-EXEC] in the same case (introspection + execute).
 */
export interface EndpointStep {
  kind: "GQL-ENDPOINT";
  path: string;
  raw: string;
}

export interface OpStep {
  kind: "GQL-OP";
  label: string;
  query: string;
  raw: string;
}

export interface VarsStep {
  kind: "GQL-VARS";
  label: string;
  variablesJson: string;
  raw: string;
}

export interface ExecStep {
  kind: "GQL-EXEC";
  label: string;
  raw: string;
}

export interface CaptureStep {
  kind: "GQL-CAPTURE";
  label: string;
  path: string;
  variable: string;
  raw: string;
}

export interface RestStep {
  kind: "REST";
  method: string;
  path: string;
  body?: string;
  raw: string;
}

/** Multi-line REST request block: [REST-OP <label>] followed by free-form body */
export interface RestOpStep {
  kind: "REST-OP";
  label: string;
  body: string;
  raw: string;
}

/** Trigger to fire the named REST-OP and store the response under <label> */
export interface RestExecStep {
  kind: "REST-EXEC";
  label: string;
  raw: string;
}

/** Capture from a stored REST response into the variable bag */
export interface RestCaptureStep {
  kind: "REST-CAPTURE";
  label: string;
  path: string;
  variable: string;
  raw: string;
}

/**
 * UCP / MCP op family — JSON-RPC `tools/call` against the UCP MCP endpoint.
 *
 * WHY A THIRD FAMILY. The machine lane speaks GraphQL (`GQL-*`) and plain REST (`REST-*`).
 * UCP is neither: it is JSON-RPC 2.0 over HTTP at `/ucp/mcp`, whose replies may arrive as an SSE
 * `data:` line and whose payload is a JSON string nested at `result.content[0].text`. Suite 101 was
 * therefore 29/29 browser lane — `EX-010` (parser cannot type the line) + `EX-011` (no runner op) —
 * so every one of its cases needed an AGENT to execute what is really a deterministic HTTP call.
 *
 *   [MCP-OP <label>]            followed by a body:  first line = tool name, rest = JSON arguments
 *   [MCP-EXEC <label>]          fire it; store the UNWRAPPED tool payload under <label>
 *   [MCP-CAPTURE <label>.<path> → VAR]
 *
 * Deliberately mirrors REST-OP/EXEC/CAPTURE so an author who knows one knows this.
 */
export interface McpOpStep {
  kind: "MCP-OP";
  label: string;
  body: string;
  raw: string;
}

/** Trigger to fire the named MCP-OP and store the response under <label> */
export interface McpExecStep {
  kind: "MCP-EXEC";
  label: string;
  raw: string;
}

/**
 * Capture from a stored MCP tool payload into the variable bag.
 *
 * Optional `matching /re/` extracts a SUBSTRING from the captured value using capture group 1.
 * Without it the whole value is taken.
 *
 *   [MCP-CAPTURE cah.continue_url matching /ucp_session=([A-Za-z0-9_-]+)/ -> UCP_SESSION]
 *
 * WHY. UCP never returns the raw `ucp_session` as a field — verified live 2026-09-22: it exists
 * ONLY inside the `continue_url` query string, and `handoff` carries just `{ucp, checkout, messages}`.
 * Every restore-based case therefore needs a query param out of a URL, and a path-only capture
 * grammar cannot express that. Without this the whole restore class is unauthorable on the machine
 * lane regardless of how good the transport is.
 */
export interface McpCaptureStep {
  kind: "MCP-CAPTURE";
  label: string;
  path: string;
  /** Optional extractor; capture group 1 becomes the stored value. */
  matching?: string;
  variable: string;
  raw: string;
}

/**
 * Synchronization step for async backend settlement (e.g. Hangfire jobs that
 * post loyalty earn/redeem ops ~seconds after createOrderFromCart).
 *
 *   [WAIT until=<op-label> timeout=30 interval=3] <DATA-style predicate>
 *      → poll mode: re-execute [GQL-OP <op-label>] every `interval`s until the
 *        predicate holds (same grammar as a [DATA] assertion, evaluated against
 *        the fresh response) or `timeout`s elapses. The latest response replaces
 *        the stored one for <op-label>, so downstream [GQL-CAPTURE]/[DATA] see
 *        the settled value. timeout default 30 (cap 300), interval default 3.
 *   [WAIT seconds=10]  → sleep mode: fixed delay.
 *   [WAIT] <freetext>  → legacy bare form: fixed delay (default 12s) — was a
 *        silent no-op before; now sleeps so async settles.
 */
export interface WaitStep {
  kind: "WAIT";
  mode: "poll" | "sleep";
  label?: string; // poll: op-label to re-execute
  predicate?: string; // poll: DATA-style condition to satisfy
  timeoutSec: number; // poll only
  intervalSec: number; // poll only
  seconds: number; // sleep only
  raw: string;
}

export interface UnknownStep {
  kind: "UNKNOWN";
  tag: string;
  raw: string;
}

/**
 * Parse a Test_Data cell like:
 *   "valid_org_name=AT&T Corp. #1; invalid_org_name=@td(ORG_XSS.payload)"
 * into a variable bag. Supports both ';' and ',' as separators.
 */
export function parseTestData(cell: string): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!cell) return vars;

  // Split on ';' first (file convention), fallback to ',' if no semicolons.
  const pairs = cell.includes(";") ? cell.split(";") : cell.split(",");
  for (const p of pairs) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) vars[key] = value;
  }
  return vars;
}

/**
 * Parse a Steps cell into an ordered list of StepBlocks.
 * Multi-line content between a [GQL-OP] or [GQL-VARS] tag and the next
 * recognized tag is absorbed as that block's body.
 */
export function parseSteps(cell: string): StepBlock[] {
  const blocks: StepBlock[] = [];
  const lines = cell.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      i++;
      continue;
    }

    // Order-independent `key=value` arg bag, so `[AUTH role=X org=Y]` and
    // `[AUTH org=Y role=X]` parse identically and a bare `[AUTH]` still works.
    // A value may contain neither whitespace nor `]`, which covers both an
    // `@td(...)` token and an already-substituted GUID.
    const authMatch = line.match(/^\[AUTH((?:\s+[\w-]+=[^\s\]]+)*)\s*\]\s*(.*)$/i);
    const authArgs = new Map<string, string>();
    if (authMatch) {
      for (const m of (authMatch[1] || "").matchAll(/([\w-]+)=([^\s\]]+)/g)) {
        authArgs.set(m[1].toLowerCase(), m[2]);
      }
      blocks.push({
        kind: "AUTH",
        role: authArgs.get("role") || "",
        org: authArgs.get("org"),
        raw,
      });
      i++;
      continue;
    }

    const endpointMatch = line.match(/^\[GQL-ENDPOINT\s+(\S+)\s*\]\s*$/i);
    if (endpointMatch) {
      blocks.push({ kind: "GQL-ENDPOINT", path: endpointMatch[1], raw });
      i++;
      continue;
    }

    const opMatch = line.match(/^\[GQL-OP\s+([\w-]+)\s*\]\s*$/i);
    if (opMatch) {
      const label = opMatch[1];
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        if (isStepTag(nextLine.trim())) break;
        body.push(nextLine);
        i++;
      }
      blocks.push({
        kind: "GQL-OP",
        label,
        query: body.join("\n").trim(),
        raw,
      });
      continue;
    }

    const varsMatch = line.match(/^\[GQL-VARS\s+([\w-]+)\s*\]\s*(.*)$/i);
    if (varsMatch) {
      const label = varsMatch[1];
      const inline = varsMatch[2].trim();
      let body = inline;
      if (!body) {
        // fenced multi-line JSON body until next tag
        const chunk: string[] = [];
        i++;
        while (i < lines.length) {
          const nextLine = lines[i];
          if (isStepTag(nextLine.trim())) break;
          chunk.push(nextLine);
          i++;
        }
        body = chunk.join("\n").trim();
        blocks.push({ kind: "GQL-VARS", label, variablesJson: body, raw });
        i = backfillEmptyOpFromContinuation(blocks, lines, label, i);
        continue;
      }
      blocks.push({ kind: "GQL-VARS", label, variablesJson: body, raw });
      i++;
      i = backfillEmptyOpFromContinuation(blocks, lines, label, i);
      continue;
    }

    const execMatch = line.match(/^\[GQL-EXEC\s+([\w-]+)\s*\]\s*$/i);
    if (execMatch) {
      blocks.push({ kind: "GQL-EXEC", label: execMatch[1], raw });
      i++;
      continue;
    }

    // Path supports object props (foo), numeric indices (0), JSONPath-style
    // filters (foo[?key=value]). The filter "value" chunk can include hyphens,
    // GUIDs, spaces — anything except `]`. Use a non-greedy capture stopping
    // at the arrow.
    const capMatch = line.match(
      /^\[GQL-CAPTURE\s+([\w-]+)\.(.+?)\s*(?:→|->)\s*(\w+)\s*\]\s*$/i
    );
    if (capMatch) {
      blocks.push({
        kind: "GQL-CAPTURE",
        label: capMatch[1],
        path: capMatch[2],
        variable: capMatch[3],
        raw,
      });
      i++;
      continue;
    }

    const restOpMatch = line.match(/^\[REST-OP\s+([\w-]+)\s*\]\s*$/i);
    if (restOpMatch) {
      const label = restOpMatch[1];
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        if (isStepTag(nextLine.trim())) break;
        body.push(nextLine);
        i++;
      }
      blocks.push({
        kind: "REST-OP",
        label,
        body: body.join("\n").trim(),
        raw,
      });
      continue;
    }

    const restExecMatch = line.match(/^\[REST-EXEC\s+([\w-]+)\s*\]\s*$/i);
    if (restExecMatch) {
      blocks.push({ kind: "REST-EXEC", label: restExecMatch[1], raw });
      i++;
      continue;
    }

    const restCapMatch = line.match(
      /^\[REST-CAPTURE\s+([\w-]+)\.(.+?)\s*(?:→|->)\s*(\w+)\s*\]\s*$/i
    );
    if (restCapMatch) {
      blocks.push({
        kind: "REST-CAPTURE",
        label: restCapMatch[1],
        path: restCapMatch[2],
        variable: restCapMatch[3],
        raw,
      });
      i++;
      continue;
    }

    const mcpOpMatch = line.match(/^\[MCP-OP\s+([\w-]+)\s*\]\s*$/i);
    if (mcpOpMatch) {
      const label = mcpOpMatch[1];
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        if (isStepTag(lines[i].trim())) break;
        body.push(lines[i]);
        i++;
      }
      blocks.push({ kind: "MCP-OP", label, body: body.join("\n").trim(), raw });
      continue;
    }

    const mcpExecMatch = line.match(/^\[MCP-EXEC\s+([\w-]+)\s*\]\s*$/i);
    if (mcpExecMatch) {
      blocks.push({ kind: "MCP-EXEC", label: mcpExecMatch[1], raw });
      i++;
      continue;
    }

    const mcpCapMatch = line.match(
      /^\[MCP-CAPTURE\s+([\w-]+)\.(.+?)(?:\s+matching\s+\/(.+?)\/)?\s*(?:→|->)\s*(\w+)\s*\]\s*$/i
    );
    if (mcpCapMatch) {
      blocks.push({
        kind: "MCP-CAPTURE",
        label: mcpCapMatch[1],
        path: mcpCapMatch[2].trim(),
        matching: mcpCapMatch[3],
        variable: mcpCapMatch[4],
        raw,
      });
      i++;
      continue;
    }

    const restMatch = line.match(/^\[REST\s+(GET|POST|PUT|PATCH|DELETE)\s+(\S+)\s*\]\s*$/i);
    if (restMatch) {
      const method = restMatch[1].toUpperCase();
      const path = restMatch[2];
      const bodyLines: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        if (isStepTag(nextLine.trim())) break;
        bodyLines.push(nextLine);
        i++;
      }
      const body = bodyLines.join("\n").trim();
      blocks.push({
        kind: "REST",
        method,
        path,
        body: body || undefined,
        raw,
      });
      continue;
    }

    // [WAIT …] — params live inside the brackets (like [DATA label=…]); the
    // poll predicate follows AFTER the `]` so it may contain `]` (JSONPath
    // filters such as items[?sku=X]).
    const waitMatch = line.match(/^\[WAIT\b([^\]]*)\]\s*(.*)$/i);
    if (waitMatch) {
      const params = waitMatch[1] || "";
      const predicateText = waitMatch[2].trim();
      const until = params.match(/\buntil=([\w-]+)/i);
      const timeout = params.match(/\btimeout=(\d+)/i);
      const interval = params.match(/\binterval=(\d+)/i);
      const seconds = params.match(/\bseconds=(\d+)/i);
      if (until) {
        blocks.push({
          kind: "WAIT",
          mode: "poll",
          label: until[1],
          predicate: predicateText,
          timeoutSec: timeout ? Math.min(parseInt(timeout[1], 10), 300) : 30,
          intervalSec: interval ? Math.max(parseInt(interval[1], 10), 1) : 3,
          seconds: 0,
          raw,
        });
      } else {
        // sleep mode: [WAIT seconds=N] or bare [WAIT] (legacy free-text)
        //
        // The parser stays TOTAL: it records the seconds the author asked for and never clamps or
        // throws. The ceiling is enforced by the RUNNER, at the moment it would sleep
        // (GQL_MAX_WAIT_SECONDS, default 300). Enforcing it here instead took down the whole suite:
        // case-classifier calls parseSteps to work out a case's LANE, so a throw on one case made
        // `suites:lanes -- 101` fail outright and no case in the suite could be planned — the
        // "one unparsable case blocks everyone" failure this repo has paid for before.
        const requestedSec = seconds ? parseInt(seconds[1], 10) : 12;
        blocks.push({
          kind: "WAIT",
          mode: "sleep",
          timeoutSec: 0,
          intervalSec: 0,
          seconds: requestedSec,
          raw,
        });
      }
      i++;
      continue;
    }

    const tagMatch = line.match(/^\[(\w[\w-]*)\]/);
    if (tagMatch) {
      blocks.push({ kind: "UNKNOWN", tag: tagMatch[1], raw });
    }
    i++;
  }

  return blocks;
}

function isStepTag(line: string): boolean {
  return /^\[(AUTH|GQL-ENDPOINT|GQL-OP|GQL-VARS|GQL-EXEC|GQL-CAPTURE|REST-OP|REST-EXEC|REST-CAPTURE|REST|MCP-OP|MCP-EXEC|MCP-CAPTURE|WAIT|SETUP|TEARDOWN)\b/i.test(line);
}

/**
 * Supports CSVs that author the operation body AFTER [GQL-VARS]:
 *   [GQL-OP foo]
 *   [GQL-VARS foo] {inline JSON}
 *     mutation Foo { ... }
 *   [GQL-EXEC foo]
 *
 * The OP block's body absorber (line 127) stops at the immediate [GQL-VARS]
 * step tag with body="". Without this back-fill, the trailing mutation lines
 * fall through unrecognized and OP.query stays empty — which breaks GQL-EXEC.
 *
 * After a [GQL-VARS <label>] is pushed, if continuation lines follow that
 * aren't step tags, AND the most-recent same-label GQL-OP has empty query,
 * absorb those lines as that OP's query body. Returns the advanced cursor.
 */
function backfillEmptyOpFromContinuation(
  blocks: StepBlock[],
  lines: string[],
  label: string,
  i: number
): number {
  const target = findEmptyOpForLabel(blocks, label);
  if (!target) return i;
  const tail: string[] = [];
  while (i < lines.length) {
    const nextLine = lines[i];
    if (isStepTag(nextLine.trim())) break;
    tail.push(nextLine);
    i++;
  }
  const joined = tail.join("\n").trim();
  if (joined) target.query = joined;
  return i;
}

function findEmptyOpForLabel(blocks: StepBlock[], label: string): OpStep | null {
  for (let j = blocks.length - 1; j >= 0; j--) {
    const b = blocks[j];
    if (b.kind === "GQL-OP" && b.label === label) {
      return b.query === "" ? b : null;
    }
  }
  return null;
}

/**
 * Sanity check on parsed blocks per label-rules from test-case-template.md:
 *   - every GQL-OP <L> paired with exactly one GQL-EXEC <L>
 *   - every GQL-VARS <L> / GQL-CAPTURE <L>.* refers to a declared <L>
 */
export function validateStepBlocks(blocks: StepBlock[]): string[] {
  const errors: string[] = [];
  const opLabels = new Set<string>();
  const execCounts = new Map<string, number>();

  for (const b of blocks) {
    if (b.kind === "GQL-OP") opLabels.add(b.label);
    if (b.kind === "GQL-EXEC") {
      execCounts.set(b.label, (execCounts.get(b.label) ?? 0) + 1);
    }
  }

  for (const label of opLabels) {
    const c = execCounts.get(label) ?? 0;
    if (c === 0) errors.push(`[GQL-OP ${label}] has no matching [GQL-EXEC ${label}]`);
    if (c > 1) errors.push(`[GQL-OP ${label}] has ${c} [GQL-EXEC ${label}] — expected exactly 1`);
  }

  for (const [label] of execCounts) {
    if (!opLabels.has(label)) {
      errors.push(`[GQL-EXEC ${label}] has no matching [GQL-OP ${label}]`);
    }
  }

  for (const b of blocks) {
    if (b.kind === "GQL-VARS" && !opLabels.has(b.label)) {
      errors.push(`[GQL-VARS ${b.label}] references undeclared op label "${b.label}"`);
    }
    if (b.kind === "GQL-CAPTURE" && !opLabels.has(b.label)) {
      errors.push(`[GQL-CAPTURE ${b.label}.…] references undeclared op label "${b.label}"`);
    }
  }

  // --- the MCP family, added 2026-09-23 --------------------------------------------------------
  //
  // Until now only the GQL family was pair-checked here, so an MCP case got NO structural check at
  // all — a dangling [MCP-EXEC label] or an [MCP-CAPTURE label.path] naming an op that does not
  // exist reached the runner, which then failed at a step far from the mistake. Worse, suite 102's
  // MCP-only cases were not even routed to this validator (lint-test-cases.ts isRunnerGraphql
  // matched [GQL-OP]/[REST-OP] only), so they fell through to the UI rule D-001 and every body line
  // of an [MCP-OP] block — the tool name, the JSON arguments — was flagged "step line lacks a type
  // tag". That held 8 green cases at Draft with a Critical finding about grammar they use correctly.
  const mcpOpLabels = new Set<string>();
  const mcpExecCounts = new Map<string, number>();
  for (const b of blocks) {
    if (b.kind === "MCP-OP") mcpOpLabels.add(b.label);
    if (b.kind === "MCP-EXEC") mcpExecCounts.set(b.label, (mcpExecCounts.get(b.label) ?? 0) + 1);
  }
  for (const label of mcpOpLabels) {
    const c = mcpExecCounts.get(label) ?? 0;
    if (c === 0) errors.push(`[MCP-OP ${label}] has no matching [MCP-EXEC ${label}]`);
    if (c > 1) errors.push(`[MCP-OP ${label}] has ${c} [MCP-EXEC ${label}] — expected exactly 1`);
  }
  for (const [label] of mcpExecCounts) {
    if (!mcpOpLabels.has(label)) {
      errors.push(`[MCP-EXEC ${label}] has no matching [MCP-OP ${label}]`);
    }
  }
  for (const b of blocks) {
    if (b.kind === "MCP-CAPTURE" && !mcpOpLabels.has(b.label)) {
      errors.push(`[MCP-CAPTURE ${b.label}.…] references undeclared op label "${b.label}"`);
    }
  }

  return errors;
}
