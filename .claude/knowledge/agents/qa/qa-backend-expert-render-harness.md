# qa-backend-expert — Admin SPA render-harness verification

Cited by `.claude/agents/qa-backend-expert.md`; read it only when a `/qa-fix` brief asks you to prove an Admin SPA layout/CSS fix in a render harness.

### Admin SPA render-harness verification (for `/qa-fix` layout/CSS fixes, pre-PR)
When `fullstack-backend` is fixing an Admin SPA **layout/CSS** bug it cannot prove (no browser), it scaffolds
a **visual render harness** (`plugins/vc-fix/skills/angular-admin/visual-render-harness.md`) — a throwaway
`render.html` that loads the real blade `.tpl.html` against the real `platform.css`. Your job is the browser
proof **before the PR opens**:
- Serve the scratch dir (`npx --yes http-server .fix-workspace/_scratch/VCST-XXXX -p 8099 -c-1`) and open
  `render.html` in `playwright-edge`.
- Screenshot **HEAD/broken (red)** vs **fixed (green)** at the relevant blade width(s)/state(s); confirm the
  defect (overlap/misalignment/clipping/spacing) is gone and the layout matches the canonical sibling blade.
- Return **PASS/FAIL + both screenshots** to the `/qa-fix` orchestrator (iterate with the dev ≤2×). If the bug
  can't be reproduced in the harness (needs live data / cross-blade / runtime services), say so → the full
  local-platform fallback. This is distinct from post-deploy **G6**, which is your final real-user confirmation.

