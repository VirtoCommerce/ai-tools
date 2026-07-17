// Type declarations for ado-html.mjs (so `tsc` type-checks the .ts consumers; tsx needs none).
export function mdToHtml(md: string): string;
export function ensureAzureHtml(text: string): string;
export const HTML_FIELD_REFS: ReadonlySet<string>;
export function isHtmlField(ref: string): boolean;

export interface BugFieldInput {
  title: string;
  description?: string;
  reproSteps?: string;
  severity?: string;
  priority?: number | string;
  /** Tag string ("a; b") or array; normalized to a "; "-joined string. */
  tags?: string | string[];
  systemInfo?: string;
  /** Custom field refs → value, e.g. { "Custom.Environment": "QA" }. */
  fields?: Record<string, string | number>;
  /** Attachment URLs — comma-separated string or array. */
  attachments?: string | string[];
  assignedTo?: string;
  iterationPath?: string;
  parentId?: string | number;
  /** Org-level base (`https://dev.azure.com/<org>`) for the parent relation URL. */
  orgUrl?: string;
  /** Skip Markdown→HTML normalization (send bodies verbatim). */
  raw?: boolean;
}

export function buildBugFields(input: BugFieldInput): Array<{ op: string; path: string; value: unknown }>;
