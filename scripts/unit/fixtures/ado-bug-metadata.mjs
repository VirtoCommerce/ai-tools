// RECORDED Azure Boards work-item metadata for TWO DIFFERENT processes (VCST-5582 E).
//
// Portability is the whole point of the field contract: the same /qa-bug flow must populate a
// Bug correctly on a process it has never seen, with no code change (AC 7). One fixture cannot
// show that — these two differ in exactly the ways that broke the hardcoded field set:
//
//   LEO_OPUS  — the custom process the plugin was (wrongly) hardcoded for: Custom.Environment /
//               Custom.Reportedby / Custom.Typeofbug picklists, some REQUIRED, plus an HTML
//               System.Description and a plainText Custom.Reportedby.
//   AGILE     — a STOCK Agile Bug: none of those Custom.* refs exist at all; instead it has
//               Microsoft.VSTS.TCM.ReproSteps + Microsoft.VSTS.Build.FoundIn, and its
//               Microsoft.VSTS.TCM.SystemInfo is HTML while its "Description" is plainText —
//               so a hardcoded "Description is HTML" assumption is wrong here.
//
// Shapes match the real endpoints:
//   typeFields  ← GET {project}/_apis/wit/workitemtypes/{type}/fields?$expand=Properties → value[]
//   fieldTypes  ← GET {org}/_apis/wit/fields                                              → value[]

/** The org-level field list: referenceName → data type. Shared by both fixtures. */
export const FIELD_TYPES = [
  { referenceName: "System.Title", type: "string" },
  { referenceName: "System.Description", type: "html" },
  { referenceName: "System.Tags", type: "plainText" },
  { referenceName: "System.AssignedTo", type: "identity" },
  { referenceName: "System.IterationPath", type: "treePath" },
  { referenceName: "System.AreaPath", type: "treePath" },
  { referenceName: "System.State", type: "string" },
  { referenceName: "Microsoft.VSTS.Common.Severity", type: "string" },
  { referenceName: "Microsoft.VSTS.Common.Priority", type: "integer" },
  { referenceName: "Microsoft.VSTS.TCM.ReproSteps", type: "html" },
  { referenceName: "Microsoft.VSTS.TCM.SystemInfo", type: "html" },
  { referenceName: "Microsoft.VSTS.Build.FoundIn", type: "string" },
  { referenceName: "Custom.Environment", type: "string" },
  { referenceName: "Custom.Reportedby", type: "plainText" },
  { referenceName: "Custom.Typeofbug", type: "string" },
  { referenceName: "Custom.ExpectedResult", type: "html" },
  // A deliberate trap: a treePath field literally NAMED "Environment". A name-only matcher
  // would bind the `environment` slot to it; the type gate must reject it.
  { referenceName: "Custom.EnvironmentTree", type: "treePath" },
];

/** Process A — the LEO/OPUS-shaped custom process the old code hardcoded. */
export const LEO_OPUS_BUG_FIELDS = [
  { referenceName: "System.Title", name: "Title", alwaysRequired: true },
  { referenceName: "System.Description", name: "Description", alwaysRequired: false },
  { referenceName: "System.Tags", name: "Tags", alwaysRequired: false },
  { referenceName: "System.AssignedTo", name: "Assigned To", alwaysRequired: false },
  { referenceName: "System.IterationPath", name: "Iteration Path", alwaysRequired: true },
  { referenceName: "System.State", name: "State", alwaysRequired: true, allowedValues: ["New", "Active", "On Review", "Ready for QA", "Closed"], defaultValue: "New" },
  { referenceName: "Microsoft.VSTS.Common.Severity", name: "Severity", alwaysRequired: false, allowedValues: ["1 - Critical", "2 - High", "3 - Medium", "4 - Low"], defaultValue: "3 - Medium" },
  { referenceName: "Microsoft.VSTS.Common.Priority", name: "Priority", alwaysRequired: false, allowedValues: ["1", "2", "3", "4"], defaultValue: "2" },
  { referenceName: "Microsoft.VSTS.TCM.SystemInfo", name: "System Info", alwaysRequired: false },
  { referenceName: "Custom.Environment", name: "Environment", alwaysRequired: true, allowedValues: ["QA", "UAT", "PROD", "Dev", "Local"] },
  { referenceName: "Custom.Reportedby", name: "Reported by", alwaysRequired: true },
  { referenceName: "Custom.Typeofbug", name: "Type of bug", alwaysRequired: false, allowedValues: ["Functional", "Regression", "Performance", "Data", "Integration"] },
  { referenceName: "Custom.EnvironmentTree", name: "Environment", alwaysRequired: false },
];

/** Process B — a STOCK Agile Bug. NONE of the Custom.* refs above exist here. */
export const AGILE_BUG_FIELDS = [
  { referenceName: "System.Title", name: "Title", alwaysRequired: true },
  { referenceName: "System.AreaPath", name: "Area Path", alwaysRequired: true },
  { referenceName: "System.IterationPath", name: "Iteration Path", alwaysRequired: true },
  { referenceName: "System.State", name: "State", alwaysRequired: true, allowedValues: ["New", "Active", "Resolved", "Closed"], defaultValue: "New" },
  { referenceName: "System.AssignedTo", name: "Assigned To", alwaysRequired: false },
  { referenceName: "System.Tags", name: "Tags", alwaysRequired: false },
  { referenceName: "Microsoft.VSTS.TCM.ReproSteps", name: "Repro Steps", alwaysRequired: false },
  { referenceName: "Microsoft.VSTS.TCM.SystemInfo", name: "System Info", alwaysRequired: false },
  { referenceName: "Microsoft.VSTS.Common.Severity", name: "Severity", alwaysRequired: false, allowedValues: ["1 - Critical", "2 - High", "3 - Medium", "4 - Low"], defaultValue: "3 - Medium" },
  { referenceName: "Microsoft.VSTS.Common.Priority", name: "Priority", alwaysRequired: false, allowedValues: ["1", "2", "3", "4"], defaultValue: "2" },
  { referenceName: "Microsoft.VSTS.Build.FoundIn", name: "Found In", alwaysRequired: false },
];

// The stock Agile process stores its long text in ReproSteps and has NO System.Description at
// all — a hardcoded "the body goes to System.Description, which is HTML" is simply wrong here.

// ── VCST-5702 ITEM 0 — FORM LAYOUTS ──────────────────────────────────────────────────
// The OPUS Bug form surfaces ReproSteps + SystemInfo as its html areas; System.Description exists
// in the field CONTRACT but is NOT on the form, so a body written there is INVISIBLE while a
// presence-based check still passes. This is the exact silent failure ITEM 0 closes.
export const OPUS_FORM_HTML_CONTROLS = ["Microsoft.VSTS.TCM.ReproSteps", "Microsoft.VSTS.TCM.SystemInfo"];
// A process whose Bug form DOES surface System.Description (the no-regression case).
export const DESCRIPTION_ON_FORM_CONTROLS = ["System.Description", "Microsoft.VSTS.TCM.ReproSteps", "Microsoft.VSTS.TCM.SystemInfo"];

// A raw `GET workitemtypes/Bug?$expand=layout` fragment for parseFormLayout — structured `layout`
// with the OPUS ordering (Description is deliberately NOT a control on the form).
export const OPUS_LAYOUT_WIT = {
  layout: { pages: [{ visible: true, sections: [{ groups: [{ controls: [
    { controlType: "FieldControl", id: "System.Title" },
    { controlType: "HtmlFieldControl", id: "Microsoft.VSTS.TCM.ReproSteps" },
    { controlType: "HtmlFieldControl", id: "Microsoft.VSTS.TCM.SystemInfo" },
  ] }] }] }] },
};
// The legacy `xmlForm` fallback shape (same layout, no structured `layout` key).
export const OPUS_XMLFORM_WIT = {
  xmlForm:
    '<Form><Layout><Group><Control Type="FieldControl" FieldName="System.Title" />' +
    '<Control Type="HtmlFieldControl" FieldName="Microsoft.VSTS.TCM.ReproSteps" />' +
    '<Control Type="HtmlFieldControl" FieldName="Microsoft.VSTS.TCM.SystemInfo" /></Group></Layout></Form>',
};

// ── VCST-5702 ITEM 0b — the omnia-opus/OPUS Bug at full width (73 fields) ─────────────
// Already-parsed contract entries. The rule-filter keeps 18 (8 required + 10 slot-mapped) and drops
// the other 55 as system/read-only or unused custom fields. Modelled to the verified OPUS numbers
// (the real per-field metadata was not available in-session — see the PR body). NOTE: the 10th
// slot-mapped field is Microsoft.VSTS.Common.ValueArea — a standard field that D1 gave a `valueArea`
// slot, so it now maps instead of being dropped as a filler (was 17/9/56 before D1).
const OPUS_KEPT = [
  // 8 required
  { ref: "System.Title", name: "Title", required: true, type: "string" },
  { ref: "System.State", name: "State", required: true, type: "string", allowedValues: ["New", "Active", "Resolved", "Closed"], defaultValue: "New" },
  { ref: "System.AreaId", name: "Area", required: true, type: "integer" },
  { ref: "System.IterationId", name: "Iteration", required: true, type: "integer" },
  { ref: "Microsoft.VSTS.Common.Severity", name: "Severity", required: true, type: "string", allowedValues: ["1 - Critical", "2 - High", "3 - Medium", "4 - Low"], defaultValue: "3 - Medium" },
  { ref: "Custom.Environment", name: "Environment", required: true, type: "string", allowedValues: ["QA", "UAT", "PROD", "Dev", "Local"] },
  { ref: "Custom.Reportedby", name: "Reported by", required: true, type: "plaintext" },
  { ref: "Custom.Typeofbug", name: "Type of bug", required: true, type: "string", allowedValues: ["Functional", "Regression", "Performance", "Data", "Integration"] },
  // 10 slot-mapped, none required (the 10th, Microsoft.VSTS.Common.ValueArea, is in OPUS_FILLERS —
  // D1 gives it a `valueArea` slot, so it maps rather than being dropped as a filler)
  { ref: "System.Description", name: "Description", required: false, type: "html" },
  { ref: "Microsoft.VSTS.TCM.ReproSteps", name: "Repro Steps", required: false, type: "html" },
  { ref: "Microsoft.VSTS.TCM.SystemInfo", name: "System Info", required: false, type: "html" },
  { ref: "Microsoft.VSTS.Common.Priority", name: "Priority", required: false, type: "integer", allowedValues: ["1", "2", "3", "4"], defaultValue: "2" },
  { ref: "Microsoft.VSTS.Build.FoundIn", name: "Found In", required: false, type: "string" },
  { ref: "System.IterationPath", name: "Iteration Path", required: false, type: "treepath" },
  { ref: "System.AssignedTo", name: "Assigned To", required: false, type: "identity" },
  { ref: "System.Tags", name: "Tags", required: false, type: "plaintext" },
  { ref: "Custom.ExpectedResult", name: "Expected Result", required: false, type: "html" },
];
// 56 droppable fields: real system/read-only names + unused custom. Custom.ResolutionReason is the
// one a `Resolved` transition can make required (rule b) — it survives the filter ONLY when passed
// in transitionRequiredRefs, proving rule (b) independently of the 17-count.
const OPUS_FILLERS = [
  { ref: "System.Rev", name: "Rev", type: "integer" },
  { ref: "System.AuthorizedAs", name: "Authorized As", type: "identity" },
  { ref: "System.AuthorizedDate", name: "Authorized Date", type: "datetime" },
  { ref: "System.ChangedBy", name: "Changed By", type: "identity" },
  { ref: "System.ChangedDate", name: "Changed Date", type: "datetime" },
  { ref: "System.CreatedBy", name: "Created By", type: "identity" },
  { ref: "System.CreatedDate", name: "Created Date", type: "datetime" },
  { ref: "System.Watermark", name: "Watermark", type: "integer" },
  { ref: "System.CommentCount", name: "Comment Count", type: "integer" },
  { ref: "System.BoardColumn", name: "Board Column", type: "string" },
  { ref: "Microsoft.VSTS.Common.StateChangeDate", name: "State Change Date", type: "datetime" },
  { ref: "Microsoft.VSTS.Common.ActivatedBy", name: "Activated By", type: "identity" },
  { ref: "Microsoft.VSTS.Common.ActivatedDate", name: "Activated Date", type: "datetime" },
  { ref: "Microsoft.VSTS.Common.ClosedBy", name: "Closed By", type: "identity" },
  { ref: "Microsoft.VSTS.Common.ClosedDate", name: "Closed Date", type: "datetime" },
  { ref: "Microsoft.VSTS.Common.ValueArea", name: "Value Area", type: "string" },
  { ref: "Microsoft.VSTS.Common.StackRank", name: "Stack Rank", type: "double" },
  { ref: "Microsoft.VSTS.Build.IntegrationBuild", name: "Integration Build", type: "string" },
  { ref: "Custom.ResolutionReason", name: "Resolution Reason", type: "string" },
];
while (OPUS_FILLERS.length < 56) {
  const n = OPUS_FILLERS.length;
  OPUS_FILLERS.push({ ref: `Custom.Unused${n}`, name: `Unused Field ${n}`, type: "string" });
}
export const OPUS_BUG_73 = [...OPUS_KEPT, ...OPUS_FILLERS].map((f) => ({ required: false, ...f }));
