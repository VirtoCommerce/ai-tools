# [Sales Rep Hub] Task type names stay English in other storefront languages (incl. the new "Call")
Severity: Low · Provenance: PRE-EXISTING pattern (every type: Content Management, Other, …); "Call" joins it via PR #26 · Not filed (below severity floor)
Env: vcptcore-qa, storefront language de · Account: @td(SR_REP_PRIMARY)
Actual: popup "Anruf planen", Title "Anruf", labels translated — but the task row reads "Fällig 28. Okt. 2026, 01:30 · … · Call" and the Type list is English.
Expected: BL-SR-013 — rep-facing vocabulary localizes by cultureName; raw/English values never surface. TaskTypes are a free-form platform dictionary, so localisation may need a display-name map.
Evidence: screenshots/3x-de-anruf-planen-popup.png
