<p align="center">
  <h1 align="center">nestjs-doctor</h1>
</p>

<p align="center">
  <b>Diagnose and fix your NestJS code in one command.</b>
</p>

<p align="center">
  <a href="https://npmjs.com/package/nestjs-doctor"><img src="https://img.shields.io/npm/v/nestjs-doctor?style=flat&colorA=18181b&colorB=18181b" alt="version"></a>
  <a href="https://npmjs.com/package/nestjs-doctor"><img src="https://img.shields.io/npm/dt/nestjs-doctor?style=flat&colorA=18181b&colorB=18181b" alt="downloads"></a>
  <a href="https://github.com/RoloBits/nestjs-doctor/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/nestjs-doctor?style=flat&colorA=18181b&colorB=18181b" alt="license"></a>
</p>

<p align="center">
  47 built-in rules across <b>security</b>, <b>performance</b>, <b>correctness</b>, and <b>architecture</b>. Outputs a <b>0-100 score</b> with actionable diagnostics. Zero config. Monorepo support. Built to catch the anti-patterns that AI-generated code loves to introduce.
</p>

---

## Quick Start

```bash
npx nestjs-doctor@latest .
```

No config, no plugins, no setup.

```
  ┌──────────────────────────────────────────────────────────┐
  │ ┌───────┐                                                │
  │ │ ◠ ◠ ◠ │  NestJS Doctor                                 │
  │ │ ╰───╯ │                                                 │
  │ └───────┘                                                 │
  │                                                           │
  │ 82 / 100  ★★★★☆  Good                                    │
  │                                                           │
  │ █████████████████████████████████████████░░░░░░░░░░░░░   │
  │                                                           │
  │ ✗ 2 errors  ⚠ 5 warnings  across 12/127 files  in 1.2s  │
  └──────────────────────────────────────────────────────────┘

  Project: my-api | NestJS 10.0.0 | prisma | 14 modules

  ✗ Controller injects ORM type 'PrismaService' directly (2)
    Inject a service that wraps the ORM instead.

  ✗ Possible hardcoded Secret key detected
    Move secrets to environment variables and access them via ConfigService.

  ⚠ Constructor parameter should be readonly (5)
    Add the 'readonly' modifier to the constructor parameter.

  Run with --verbose for file paths and line numbers
```

---

## CI

Exit code `1` when errors are found. Use `--score` for threshold checks:

```bash
SCORE=$(npx nestjs-doctor@latest . --score)
if [ "$SCORE" -lt 75 ]; then
  echo "Health score $SCORE is below threshold (75)"
  exit 1
fi
```

```
Usage: nestjs-doctor [directory] [options]

  --verbose       Show file paths and line numbers per diagnostic
  --score         Output only the numeric score (for CI)
  --json          JSON output (for tooling)
  --config <p>    Path to config file
  -h, --help      Show help
```

---

## Configuration

Optional. Create `nestjs-doctor.config.json` in your project root:

```json
{
  "ignore": {
    "rules": ["architecture/no-orm-in-services"],
    "files": ["src/generated/**"]
  },
  "rules": {
    "architecture/prefer-interface-injection": false
  },
  "categories": {
    "performance": false
  },
  "thresholds": {
    "godModuleProviders": 15,
    "godModuleImports": 20,
    "godServiceMethods": 12,
    "godServiceDeps": 10
  }
}
```

Or use a `"nestjs-doctor"` key in `package.json`.

| Key | Type | Description |
|-----|------|-------------|
| `include` | `string[]` | Glob patterns to scan (default: `["**/*.ts"]`) |
| `exclude` | `string[]` | Glob patterns to skip (default includes `node_modules`, `dist`, test files) |
| `ignore.rules` | `string[]` | Rule IDs to suppress |
| `ignore.files` | `string[]` | Glob patterns for files whose diagnostics are hidden |
| `rules` | `Record<string, boolean>` | Enable/disable individual rules |
| `categories` | `Record<string, boolean>` | Enable/disable entire categories |
| `thresholds` | `object` | Customize limits for god-module / god-service rules |

---

## Monorepo Support

Auto-detected from `nest-cli.json`. When `"monorepo": true` is set, each sub-project is scanned independently and results are merged.

```json
{
  "monorepo": true,
  "projects": {
    "api": { "root": "apps/api" },
    "admin": { "root": "apps/admin" },
    "shared": { "root": "libs/shared" }
  }
}
```

The report shows a combined score plus a per-project breakdown.

---

## Scoring

Weighted by severity and category, normalized by file count:

| Severity | Weight | | Category | Multiplier |
|----------|--------|-|----------|------------|
| error | 3.0 | | security | 1.5x |
| warning | 1.5 | | correctness | 1.3x |
| info | 0.5 | | architecture | 1.0x |
| | | | performance | 0.8x |

| Score | Label |
|-------|-------|
| 90-100 | Excellent |
| 75-89 | Good |
| 50-74 | Fair |
| 25-49 | Poor |
| 0-24 | Critical |

---

## Node.js API

```typescript
import { diagnose, diagnoseMonorepo } from "nestjs-doctor";

const result = await diagnose("./my-nestjs-app");
result.score;       // { value: 82, label: "Good" }
result.diagnostics; // Diagnostic[]
result.summary;     // { total, errors, warnings, info, byCategory }

const mono = await diagnoseMonorepo("./my-monorepo");
mono.isMonorepo;    // true
mono.subProjects;   // [{ name: "api", result }, ...]
mono.combined;      // Merged DiagnoseResult
```

---

## Rules (47)

### Security (11)

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `no-hardcoded-secrets` | error | API keys, tokens, passwords in source code |
| `no-wildcard-cors` | error | CORS with `origin: '*'` or `origin: true` |
| `no-unsafe-raw-query` | error | Template literal interpolation in raw SQL |
| `no-eval` | error | `eval()` or `new Function()` usage |
| `no-csrf-disabled` | error | Explicitly disabling CSRF protection |
| `no-dangerous-redirects` | error | Redirects with user-controlled input |
| `no-weak-crypto` | warning | `createHash('md5')` or `createHash('sha1')` |
| `no-exposed-env-vars` | warning | Direct `process.env` in Injectable/Controller |
| `require-validation-pipe` | warning | `@Body()` param without validation pipe |
| `no-exposed-stack-trace` | warning | `error.stack` exposed in responses |
| `require-auth-guard` | info | Controller without `@UseGuards()` |

### Correctness (13)

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `no-missing-injectable` | error | Provider in module missing `@Injectable()` |
| `no-duplicate-routes` | error | Same method + path twice in a controller |
| `no-missing-guard-method` | error | Guard class missing `canActivate()` |
| `no-missing-pipe-method` | error | Pipe class missing `transform()` |
| `no-missing-filter-catch` | error | `@Catch()` class missing `catch()` |
| `no-missing-interceptor-method` | error | Interceptor class missing `intercept()` |
| `require-inject-decorator` | error | Untyped constructor param without `@Inject()` |
| `prefer-readonly-injection` | warning | Constructor DI params missing `readonly` |
| `require-lifecycle-interface` | warning | Lifecycle method without corresponding interface |
| `no-empty-handlers` | warning | HTTP handler with empty body |
| `no-async-without-await` | warning | Async function/method with no `await` |
| `no-duplicate-module-metadata` | warning | Duplicate entries in `@Module()` arrays |
| `no-missing-module-decorator` | warning | Class named `*Module` without `@Module()` |

### Architecture (13)

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `no-business-logic-in-controllers` | error | Loops, branches, data transforms in HTTP handlers |
| `no-repository-in-controllers` | error | Repository injection in controllers |
| `no-orm-in-controllers` | error | PrismaService / EntityManager / DataSource in controllers |
| `no-circular-module-deps` | error | Cycles in `@Module()` import graph |
| `no-manual-instantiation` | error | `new SomeService()` for injectable classes |
| `no-orm-in-services` | warning | Services using ORM directly (should use repositories) |
| `no-god-module` | warning | >10 providers or >15 imports |
| `no-god-service` | warning | >10 public methods or >8 dependencies |
| `require-feature-modules` | warning | AppModule declaring too many providers directly |
| `prefer-constructor-injection` | warning | `@Inject()` property injection |
| `require-module-boundaries` | info | Deep imports into other modules' internals |
| `prefer-interface-injection` | info | Concrete service-to-service injection |
| `no-barrel-export-internals` | info | Re-exporting repositories from barrel files |

### Performance (10)

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `no-sync-io` | warning | `readFileSync`, `writeFileSync`, etc. |
| `no-query-in-loop` | warning | `await` inside loops (N+1 pattern) |
| `no-blocking-constructor` | warning | Loops/await in Injectable/Controller constructors |
| `no-dynamic-require` | warning | `require()` with non-literal argument |
| `no-unused-providers` | warning | Provider never injected anywhere |
| `no-logging-in-loops` | info | `console.*` / `this.logger.*` in loops |
| `no-unnecessary-async` | info | Async method with no `await` |
| `prefer-pagination` | info | `findMany()` / `find()` without pagination args |
| `no-unused-module-exports` | info | Module exports unused by importers |
| `no-orphan-modules` | info | Module never imported by any other module |

---

## Contributing

```bash
git clone https://github.com/RoloBits/nestjs-doctor.git
cd nestjs-doctor
npm install
npm run build
npm test
```

### Adding a rule

1. Create `src/rules/<category>/my-rule.ts`
2. Export a `Rule` (file-scoped) or `ProjectRule` (project-scoped) object
3. Register it in `src/rules/index.ts`
4. Add tests in `tests/unit/rules/`

---

## License

[MIT]
