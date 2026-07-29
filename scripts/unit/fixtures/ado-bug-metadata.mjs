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
