---
"nestjs-doctor": patch
---

Setting `NESTJS_DOCTOR_PHASE_TIMINGS=1` prints how long each stage of the analysis context took to stderr: collect, parse, modules, providers, endpoints, schema, guards. Nothing changes without the variable, and the scan output is untouched either way.
