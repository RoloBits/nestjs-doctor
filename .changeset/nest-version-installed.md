---
"nestjs-doctor": patch
---

Report the installed NestJS version, not the declared range.

Project detection read `@nestjs/core` from `package.json` and stripped the range
operators, so `^11.1.9` was displayed as `11.1.9`. That is the lowest version the
range admits, and rarely the one installed. On a project declaring `^11.1.9` with
11.1.16 installed, the report header said 11.1.9 while an advisory finding on the
same page said 11.1.16.

Detection now reads `node_modules/@nestjs/core` first, the same resolution the
advisory rules use, and falls back to the declared version when nothing is
installed.
