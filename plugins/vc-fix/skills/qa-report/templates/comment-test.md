---
kind: test
budget: 1500
lede_max: 320
trim: "[BUGS, NOT_FILED]"
---
## {{ICON}} QA {{VERDICT_LABEL}} — {{TICKET}}
{{LEDE}}

**Build** {{BUILD}} · **Env** {{ENV}} · {{DATE}} · {{RUN_ID}}

**Cases** {{PASSED}}/{{TOTAL}} passed · {{FAILED}} failed · {{BLOCKED}} blocked · **AC coverage** {{AC_COVERAGE}} · **DoD** {{DOD}}
**Regression** {{REGRESSION}}
**Business rules** {{BL}}

**Bugs filed**
{{#BUGS}}
- {{key}} [{{severity}}] {{relation}}
{{/BUGS}}
{{#BUGS_MORE}}
- {{.}}
{{/BUGS_MORE}}
{{^BUGS}}
- None
{{/BUGS}}

**Not filed (below severity floor)**
{{#NOT_FILED}}
- [{{severity}}] {{title}} — `{{path}}`
{{/NOT_FILED}}
{{#NOT_FILED_MORE}}
- {{.}}
{{/NOT_FILED_MORE}}
{{^NOT_FILED}}
- None
{{/NOT_FILED}}

**Release gate** {{RELEASE_GATE}} · **Release note** {{RELEASE_NOTE}}
{{#PAGE_URL}}
**Report** [open the report page]({{.}})
{{/PAGE_URL}}
