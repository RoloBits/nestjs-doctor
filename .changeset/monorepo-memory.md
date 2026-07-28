---
"nestjs-doctor": patch
---

Scan a monorepo one sub-project at a time, and read written type names instead
of asking the checker.

Scanning a large Nx workspace died with `JavaScript heap out of memory`, on both
`--report` and a plain scan, and raising `--max-old-space-size` to 8 GB did not
save it.

Two causes, and both were needed.

**Every sub-project stayed alive.** `buildMonorepoContext` built all of them with
`Promise.all` and returned them in a Map, so 43 ts-morph projects were live at
once. Worse, `buildResult` returns the module graph and the provider map, and
both hold `ClassDeclaration` nodes — one node anchors its source file, and
through it the whole project and every type the checker ever resolved on it. So
even releasing the contexts kept the memory. Sub-projects are now built,
diagnosed and reduced one at a time, and what is kept is detached from ts-morph
first.

**Three rules forced full type resolution.** `no-orm-in-services`,
`no-orm-in-controllers` and `no-repository-in-controllers` called
`param.getType().getText()`, which makes the checker type the whole dependency
closure — exactly the work `createAstParser` sets `skipFileDependencyResolution`
to avoid. One 20-file sub-project cost 2.7 s and 679 MB. They now read the
declared type node, as `no-unused-providers` already did.

Reading the written name is also more accurate: across 194 scan targets this
recovers 19 findings the checker's expanded form had hidden, among them
`private readonly optionsModel: MongooseModel<Option>` and a
`Repository<Account>` injected straight into a controller.

The baseline scan behind `--scope changed` streams the same way, so the path
that runs two full monorepo scans no longer holds either of them.

A 9,800-file Nx workspace that could not be scanned at 8 GB now completes at
1.9 GB, and its report at 1.6 GB.
