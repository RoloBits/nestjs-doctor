---
"nestjs-doctor": patch
---

Setting `NESTJS_DOCTOR_PHASE_TIMINGS=1` prints how long each stage of the analysis context took to stderr. A single project marks collect, parse, modules, providers, endpoints, schema and guards; a monorepo sub-project marks detect instead of collect, since its files were gathered for every project at once beforehand. Nothing changes without the variable, and the scan output is untouched either way.
