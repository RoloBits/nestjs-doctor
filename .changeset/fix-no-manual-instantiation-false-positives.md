---
"nestjs-doctor": patch
---

fix: reduce false positives in `no-manual-instantiation` rule for Pipes, Guards, Interceptors, and Filters

The rule now uses two-tier suffix classification:
- **DI-only** suffixes (`Service`, `Repository`, `Gateway`, `Resolver`) are always flagged
- **Context-aware** suffixes (`Guard`, `Interceptor`, `Pipe`, `Filter`) are only flagged inside method/constructor bodies, and skipped when used in decorator arguments or at top-level scope
