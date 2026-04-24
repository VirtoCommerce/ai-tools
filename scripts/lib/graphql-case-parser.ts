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
        continue;
      }
      blocks.push({ kind: "GQL-VARS", label, variablesJson: body, raw });
      i++;
      continue;
    }

    const execMatch = line.match(/^\[GQL-EXEC\s+([\w-]+)\s*\]\s*$/i);
    if (execMatch) {
      blocks.push({ kind: "GQL-EXEC", label: execMatch[1], raw });
      i++;
      continue;
    }

    const capMatch = line.match(
      /^\[GQL-CAPTURE\s+([\w-]+)\.([\w.\d]+)\s*(?:→|->)\s*(\w+)\s*\]\s*$/i
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

    const tagMatch = line.match(/^\[(\w[\w-]*)\]/);
    if (tagMatch) {
      blocks.push({ kind: "UNKNOWN", tag: tagMatch[1], raw });
    }
    i++;
  }

  return blocks;
}

function isStepTag(line: string): boolean {
  return /^\[(AUTH|GQL-OP|GQL-VARS|GQL-EXEC|GQL-CAPTURE|WAIT|SETUP|TEARDOWN)\b/i.test(line);
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
