# A-1 — root-cause worksheet

**Verdict:** REPRODUCED on NEW and BASELINE → **PRE-EXISTING / OUT-OF-SCOPE** for PR #2536 (theme-wide preset colour).

1. **Symptom:** text on / in primary buttons fails WCAG 1.4.3 — 2.11:1, below 4.5:1 and below the 3:1 large-text threshold (16px bold is not "large").
2. **Lowest failing layer:** the coffee colour preset's primary (#f99e24) as consumed by VcButton solid and outline primary variants. Same ratio on an unrelated page (/account/lists) and on the pre-change Calendar page.
3. **Alternatives ruled out:** PR-introduced — no, baseline `/company/calendar` "New task" is identical; component-specific — no, both variants fail on other pages; viewport — colour only.
4. **Owning layer:** theme preset / white-labeling (coffee preset tokens — vc-frontend presets or the store's selected preset). A design-token decision, not a sales-rep module defect. **Confidence:** HIGH on provenance; MEDIUM on which artefact owns the fix.
