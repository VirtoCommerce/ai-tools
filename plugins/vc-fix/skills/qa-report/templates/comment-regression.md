---
kind: regression
budget: 1500
lede_max: 280
trim: [FAILURES, BUGS]
---
## {{ICON}} Regression {{VERDICT_LABEL}} — {{RUN_ID}}
{{LEDE}}

**Env** {{ENV}} · {{DATE}} · **Suites** {{SUITES}}
**Cases** {{PASSED}}/{{TOTAL}} passed · {{FAILED}} failed · {{BLOCKED}} blocked · {{NOT_RUN}} not run · **Pass rate** {{PASS_RATE}}

**Failed / blocked**
{{#FAILURES}}
- `{{id}}` {{result}} — {{title}}
{{/FAILURES}}
{{#FAILURES_MORE}}
- {{.}}
{{/FAILURES_MORE}}
{{^FAILURES}}
- None
{{/FAILURES}}

**Bugs** {{#BUGS}}{{key}} {{/BUGS}}{{#BUGS_MORE}}{{.}}{{/BUGS_MORE}}{{^BUGS}}None{{/BUGS}}
{{#PAGE_URL}}
**Report** [open the report page]({{.}})
{{/PAGE_URL}}
