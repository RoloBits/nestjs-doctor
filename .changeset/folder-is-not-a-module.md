---
"nestjs-doctor": patch
---

Two architecture rules stop treating any directory as a NestJS module.

**`architecture/require-module-boundaries`** flags a relative import that reaches
into `/entities/`, `/dto/`, `/guards/`, `/pipes/` and friends, skipping it only
when source and target sit in the same module. It never asked whether the target
was in a module at all, and a project's `src/` usually holds `app.module.ts`, so
shared code counted as "another module's internals":

```ts
// src/modules/sessions/sessions.controller.ts
import { WherePipe } from '../../pipes/where.pipe';       // reported
// src/auth/auth.service.ts
import { ApiResponse } from '../common/dto/api-response.dto';  // reported
```

Neither `pipes/` nor `common/` is a module. An import is now skipped when the
target lies outside every module, and when the target's module *contains* the
source's module, which is what shared and root code looks like. A sibling module
is still a boundary, so `db.module.ts` reaching into `auth/entities/` is
reported as before.

**`architecture/no-barrel-export-internals`** flags any `index.ts` re-exporting a
`.entity`, `.guard`, `.repository` and so on. Its own help text says "only export
the module's public API", but it ran on every folder barrel, and a
`guards/index.ts` exporting guards is doing its job. Of 67 barrels flagged
across the corpus, **50 sat in a directory with no module file at all** —
`guards/`, `filters/`, `entities/`, `interceptors/`. The rule now runs only on a
barrel beside a module file.

Suppression needs a positive sighting, which is the invariant #150 recorded:
"only two sides positively resolving to the same module skip the report;
anything unknown reports as before". So an empty `moduleDirectories` means no
module was found rather than nothing being one, and a target outside every
module is skipped only when the scan actually holds that file. An import whose
specifier resolves nowhere is unknown and still reported, which costs 6 findings
against the looser version.

Across 189 public projects: module boundaries 867 to 602, barrel exports 186 to
26, nothing added by either.

Of the 265 boundary findings removed, most target a shared folder holding no
module and no provider, and about 67 are a nested module importing its parent's
`dto/` or `entities/`. Around 16 target a folder that holds a service or
controller but no module file. That shape is arguably a feature folder missing
its module, which is how the `config-disable-rules` fixture below is read, and
the rule now says nothing about it either way.

One fixture changed. `config-disable-rules` had a `src/users/` holding a
service, a repository and a barrel but no module, so it was a feature folder
missing its module file; it now has one. A boundaries test used
`/elsewhere/tool.ts` importing `../users/...`, which resolves outside the
`/src/users` module it declared, so it was passing for the wrong reason.
