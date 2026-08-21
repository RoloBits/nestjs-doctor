---
name: nestjs-boot-trace
description: Use when a NestJS application is slow to start, when the user asks why boot takes so long or which provider or onModuleInit is expensive, or when they mention --timings, boot timings, or the boot trace. Instruments main.ts, captures one real boot, and overlays per-class construction times on the module graph.
allowed-tools: Bash, Read, Edit, Glob, Grep, Write
---

# NestJS boot trace

> v0.8.0

A scan reads source files and never runs the application, so construction time
does not exist for it to measure. NestJS records it during a boot. This skill
captures that boot and feeds it back into the report.

It edits the user's `src/main.ts`. Say so before you start, and revert it at
the end unless they ask to keep it.

## 1. Check the version

```bash
npm ls @nestjs/core
```

`@nestjs/core` 9.3.9 or newer records `initTime` for every provider and
controller. Nest 11.1.4 or newer also accepts the `instrument` option, which
times `onModuleInit` and `onApplicationBootstrap` per class. Below 11.1.4, skip
`hookTimings` and `instrument`; class construction times still work.

## 2. Instrument the bootstrap

Add to `src/main.ts`, for development only:

```ts
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { NestFactory, SerializedGraph } from "@nestjs/core";

const hookTimings: { className: string; hook: string; ms: number }[] = [];

const t0 = performance.now();
const app = await NestFactory.create(AppModule, {
  snapshot: true,
  instrument: {
    instanceDecorator(instance: any) {
      if (!instance || typeof instance !== "object") return instance;
      for (const hook of ["onModuleInit", "onApplicationBootstrap"]) {
        const original = instance[hook];
        if (typeof original !== "function") continue;
        try {
          instance[hook] = async function (...args: unknown[]) {
            const start = performance.now();
            try { return await original.apply(this, args); }
            finally { hookTimings.push({ className: this.constructor.name, hook, ms: performance.now() - start }); }
          };
        } catch {} // frozen instances stay untimed
      }
      return instance;
    },
  },
});
const createMs = performance.now() - t0;
await app.init();
const initMs = performance.now() - t0;
await app.listen(3000);
const startupMs = performance.now() - t0;

const graph = JSON.parse(app.get(SerializedGraph).toString());
Object.assign(graph, { createMs, initMs, startupMs, hookTimings });
writeFileSync("nestjs-doctor-timings.json", JSON.stringify(graph));
```

`snapshot: true` is what makes NestJS record `initTime`. The three
`performance.now()` markers become the lifecycle strip. `instanceDecorator`
replaces a method on every instance in the application, so keep it behind an
environment check or a separate entry point rather than shipping it.

## 3. Boot once, then scan

```bash
npx nestjs-doctor@latest . --report --timings nestjs-doctor-timings.json
```

Relative paths resolve against the scanned directory. Without `--report` the
flag is ignored, with a warning. A missing file, invalid JSON, or a dump
without `initTime` each warn on stderr and still render the report, so check
stderr before trusting an empty trace.

## 4. Read the result

Each class's time includes waiting on its own dependencies. A shared slow
dependency therefore counts again in every class that awaits it.

Read down a cascade until the number drops. The class where it drops owns the
time. If `UsersService` reads 120ms and the `SlowService` it injects reads 119ms,
`SlowService` owns it.

A module node shows its slowest single class, never a sum.

## 5. Put main.ts back

Revert the instrumentation unless the user asked to keep it behind a flag.
