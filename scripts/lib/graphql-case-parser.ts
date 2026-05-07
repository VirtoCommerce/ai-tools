/**
 * Parses the Steps column of a runner-native GraphQL test case into an
 * ordered list of StepBlocks:
 *   [AUTH role=X]
 *   [GQL-OP label] <multi-line query body>
 *   [GQL-VARS label] <JSON body>
 *   [GQL-EXEC label]
 *   [GQL-CAPTURE label.path → VAR]
 *
 * Also parses the Test_Data column into an initial variables bag.
 */

export type StepBlock =
  | AuthStep
  | OpStep
  | VarsStep
  | ExecStep
  | CaptureStep
  | RestStep
  | RestOpStep
  | RestExecStep
  | RestCaptureStep
  | UnknownStep;

export interface AuthStep {
  kind: "AUTH";
  role: string;
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

    const authMatch = line.match(/^\[AUTH(?:\s+role=([\w-]+))?\s*\]\s*(.*)$/i);
    if (authMatch) {
      blocks.push({
        kind: "AUTH",
        role: authMatch[1] || "",
        raw,
      });
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

    const tagMatch = line.match(/^\[(\w[\w-]*)\]/);
    if (tagMatch) {
      blocks.push({ kind: "UNKNOWN", tag: tagMatch[1], raw });
    }
    i++;
  }

  return blocks;
}

function isStepTag(line: string): boolean {
  return /^\[(AUTH|GQL-OP|GQL-VARS|GQL-EXEC|GQL-CAPTURE|REST-OP|REST-EXEC|REST-CAPTURE|REST|WAIT|SETUP|TEARDOWN)\b/i.test(line);
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

  return errors;
}
