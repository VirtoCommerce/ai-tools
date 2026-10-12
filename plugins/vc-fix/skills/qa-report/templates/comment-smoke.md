---
kind: smoke
budget: 900
lede_max: 200
trim: [FAILURES, BUGS]
---
## {{ICON}} Smoke {{VERDICT_LABEL}} — {{RUN_ID}}
{{LEDE}}

**Env** {{ENV}} · {{DATE}} · **Gates** {{GATES}}
**Cases** {{PASSED}}/{{TOTAL}} passed · {{FAILED}} failed · {{BLOCKED}} blocked

{{?FAILURES}}
**Failed / blocked**
{{/FAILURES}}
{{#FAILURES}}
- `{{id}}` {{result}} — {{title}}
{{/FAILURES}}
{{#FAILURES_MORE}}
- {{.}}
{{/FAILURES_MORE}}
**Bugs** {{#BUGS}}{{key}} {{/BUGS}}{{#BUGS_MORE}}{{.}}{{/BUGS_MORE}}{{^BUGS}}None{{/BUGS}}
{{#PAGE_URL}}
**Report** [open the report page]({{.}})
{{/PAGE_URL}}
