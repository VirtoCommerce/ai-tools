// Type declarations for ado-html.mjs (so `tsc` type-checks the .ts consumers; tsx needs none).
export function mdToHtml(md: string): string;
export function ensureAzureHtml(text: string): string;
export const HTML_FIELD_REFS: ReadonlySet<string>;
export function isHtmlField(ref: string): boolean;
export function countImages(html: string): number;
export function countAttachmentImages(html: string): number;

export interface BugFieldInput {
  title: string;
  description?: string;
  reproSteps?: string;
  severity?: string;
  priority?: number | string;
  /** Tag string ("a; b") or array; normalized to a "; "-joined string. */
  tags?: string | string[];
  systemInfo?: string;
  /** Form-visible field ref the `body` slot resolves to (VCST-5702 ITEM 0). Default System.Description. */
  bodyRef?: string;
  /** Form-visible field ref the `repro` slot resolves to. Default Microsoft.VSTS.TCM.ReproSteps. */
  reproRef?: string;
  /** Form-visible field ref the `systemInfo` slot resolves to. Default Microsoft.VSTS.TCM.SystemInfo. */
  systemInfoRef?: string;
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
  /**
   * Contract-derived HTML resolver (VCST-5582 E-a): ref → true (html) / false (plain text) /
   * null (unknown → fall back to the hardcoded HTML_FIELD_REFS). Supplied by ado.mjs from the
   * organization's own discovered field types, so the HTML decision is derived, not asserted.
   */
  isHtmlRef?: ((ref: string) => boolean | null) | null;
}

export function buildBugFields(input: BugFieldInput): Array<{ op: string; path: string; value: unknown }>;
