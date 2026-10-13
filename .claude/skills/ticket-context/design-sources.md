# Design sources — how a design item is resolved (block 2b)

Copied from `qa-design`'s source rule so this skill cites nothing outside itself (M1). Keep in step by
hand. **The source is named by the ticket, never discovered:** no Prototype, Figma or mockup on the
ticket ⇒ `design: {source: "none"}` and the visual lane is `SKIPPED`. Never infer a design from the live
site.

## Step 1 — what the skill runner attaches

| Inventory item | What you (the runner) do | What you attach |
|---|---|---|
| `claude-design`, `url` `claude.ai/design/p/<uuid>?file=…` | look for the local copy `.design-source/<uuid>/` (gitignored; files a person put on disk, e.g. "Send to Claude Code") | that directory, or `--gap connector-unavailable --detail "no local copy of design project <uuid> — export it to .design-source/<uuid>/"` |
| `claude-design`, `url` `claude.ai/code/artifact/…` (a "Changes" artifact) | Artifact tool `read` with `path: "index.html"` and `out_dir` set to a directory of its own, `<run_dir>/artifact-<n>/` (`n` counts the artifacts of this run; never the run dir itself, where two reads would overwrite one `index.html`). If the read returns a summary instead of raw HTML (an artifact owned by someone else), do not attach it | `<run_dir>/artifact-<n>/index.html`, or `--gap connector-unavailable --detail "artifact not readable as raw HTML — ask for a local export"` |
| `figma` (open its `url`) | Figma MCP: `get_screenshot` of the linked node (`get_metadata` for frame names) into the run dir | the PNG; no Figma MCP ⇒ `--gap connector-unavailable --detail "ask for a PNG export of the frame"` |
| a mockup attachment | nothing — it is already a downloaded image | — |

## Step 2 — what the MATERIALS agent extracts

- **Conditions, not pictures:** states (empty, loading, error, disabled, long text, zero/one/many),
  breakpoints shown, exact copy and labels (quoted), role-dependent visibility, and what differs from
  the current screen when the source shows both.
- **A local Claude Design copy:** start with the artboard the `file=` parameter of the item's `url` in
  `prepare.json` names (the ref has that value redacted).
- **A "Changes" artifact is a document about a design, not a design.** Its `:root` variables are page
  chrome, not storefront tokens — never report them as conditions. Its content is a change table
  (Property | Prod | Design): each row is one condition; a row with prose or several values stays prose.
- **A prototype can contradict itself.** Two sources, or two artboards, disagreeing is a `conflict`.
- **Report, never rank.** Precedence (`BL-UI invariant > design spec > UX heuristic`) is the consumer's
  to apply; a design condition that disagrees with an AC is a `conflict`.
