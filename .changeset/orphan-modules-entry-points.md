---
"nestjs-doctor": patch
---

Treat a bootstrapped module as an entry point in `performance/no-orphan-modules`.

The rule reports a module no other module imports. An application root is never
imported, so the rule skipped one name:

```ts
// Skip AppModule — it's the root and is never imported
if (mod.name === "AppModule") {
  continue;
}
```

Anything else called dead code. `immich` bootstraps three roots and every one was
reported:

```ts
const app = await NestFactory.create<NestExpressApplication>(ApiModule, { bufferLogs: true });
await NestFactory.create(MicroservicesModule, { bufferLogs: true });
await NestFactory.create<NestExpressApplication>(MaintenanceModule, { bufferLogs: true });
```

The root is whichever module is handed to `NestFactory.create`,
`createMicroservice` or `createApplicationContext`, and a project may have
several. Those are now entry points. `AppModule` stays as a fallback for a
project whose bootstrap file sits outside the scanned root.

Across 76 public projects this clears 11 findings — `ApiModule`,
`MicroservicesModule` and `MaintenanceModule` in immich, `WorkerModule` in
vendure, plus seed, migration and CLI roots elsewhere. No other rule moves.
