---
"nestjs-doctor": patch
---

Say when no dependency could be checked, instead of reporting nothing.

The advisory rules returned early when the scan root had no `package.json`,
which an nx workspace without per-project manifests routinely does. A project
with vulnerable dependencies then looked exactly like a clean one. Both that
case and an unparseable manifest now report through the warning rule, so they
appear in the console and on the pull request without moving the score.

A `package.json` that is not valid JSON also crashed the scan. Two of the
monorepo detectors parsed outside the `try` that guarded the read, so a
trailing comma took down the whole run with a stack trace.

The reported NestJS version no longer mangles a range it cannot reduce.
Stripping the operators turned `>=11.1.18 <12` into the string `11.1.18 12`
and left `workspace:*` as-is; the lowest version the spec names is used, or
nothing when it names none.
