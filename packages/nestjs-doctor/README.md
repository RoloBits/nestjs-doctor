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
  42 built-in rules across <b>security</b>, <b>performance</b>, <b>correctness</b>, and <b>architecture</b>. Outputs a <b>0-100 score</b> with actionable diagnostics. Zero config. Monorepo support. Built to catch the anti-patterns that AI-generated code loves to introduce.
</p>

---

## Quick Start

```bash
npx nestjs-doctor@latest .
```

For file paths and line numbers:

```bash
npx nestjs-doctor@latest . --verbose
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

Install as a devDependency for deterministic, cacheable CI runs:

```bash
pnpm add -D nestjs-doctor
```

Then use `--min-score` to enforce a minimum health score:

```bash
npx nestjs-doctor . --min-score 75
```

Or add it as a script in `package.json`:

```json
{
  "scripts": {
    "health": "nestjs-doctor . --min-score 75"
  }
}
```

Exit codes: `1` when the score is below threshold or errors are found, `2` for invalid input. Works with all output modes (`--score`, `--json`, default).

```
Usage: nestjs-doctor [directory] [options]

  --verbose       Show file paths and line numbers per diagnostic
  --score         Output only the numeric score (for CI)
  --json          JSON output (for tooling)
  --min-score <n> Minimum passing score (0-100). Exits with code 1 if below threshold
  --config <p>    Path to config file
  --init          Set up the /nestjs-doctor Claude Code skill
  -h, --help      Show help
```

---

## Claude Code

nestjs-doctor ships with a [Claude Code skill](https://docs.anthropic.com/en/docs/claude-code/skills) that scans your codebase and fixes issues interactively.

### Setup

If you haven't already, install as a devDependency:

```bash
pnpm add -D nestjs-doctor
```

Then scaffold the skill:

```bash
npx nestjs-doctor --init
```

This creates `.claude/skills/nestjs-doctor/SKILL.md` in your project. Commit it so every contributor gets the skill automatically.

### Usage

In Claude Code, type:

```
/nestjs-doctor
/nestjs-doctor src/
```

Claude will scan your codebase, present a prioritized health report, and offer to fix every issue found.

---

## Configuration

Optional. Create `nestjs-doctor.config.json` in your project root:

```json
{
  "minScore": 75,
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
    "godServiceMethods": 12,
    "godServiceDeps": 10
  }
}
```

Or use a `"nestjs-doctor"` key in `package.json`.

| Key | Type | Description |
|-----|------|-------------|
| `include` | `string[]` | Glob patterns to scan (default: `["**/*.ts"]`) |
| `exclude` | `string[]` | Glob patterns to skip (default includes `node_modules`, `dist`, `build`, `coverage`, `*.spec.ts`, `*.test.ts`, `*.e2e-spec.ts`, `*.e2e-test.ts`, `*.d.ts`, `test/`, `tests/`, `__tests__/`, `__mocks__/`, `__fixtures__/`, `mock/`, `mocks/`, `*.mock.ts`, `seeder/`, `seeders/`, `*.seed.ts`, `*.seeder.ts`) |
| `minScore` | `number` | Minimum passing score (0-100). Exits with code 1 if below threshold |
| `ignore.rules` | `string[]` | Rule IDs to suppress |
| `ignore.files` | `string[]` | Glob patterns for files whose diagnostics are hidden |
| `rules` | `Record<string, boolean>` | Enable/disable individual rules |
| `categories` | `Record<string, boolean>` | Enable/disable entire categories |
| `thresholds` | `object` | Customize limits for god-service rules |

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

## Rules (42)

### Security (9)

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `no-hardcoded-secrets` | error | API keys, tokens, passwords in source code |
| `no-eval` | error | `eval()` or `new Function()` usage |
| `no-csrf-disabled` | error | Explicitly disabling CSRF protection |
| `no-dangerous-redirects` | error | Redirects with user-controlled input |
| `no-weak-crypto` | warning | `createHash('md5')` or `createHash('sha1')` |
| `no-exposed-env-vars` | warning | Direct `process.env` in Injectable/Controller |
| `require-validation-pipe` | warning | `@Body()` param without validation pipe |
| `no-exposed-stack-trace` | warning | `error.stack` exposed in responses |
| `require-auth-guard` | info | Controller without `@UseGuards()` |

### Correctness (14)

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `no-missing-injectable` | error | Provider in module missing `@Injectable()` |
| `no-duplicate-routes` | error | Same method + path + version twice in a controller |
| `no-missing-guard-method` | error | Guard class missing `canActivate()` |
| `no-missing-pipe-method` | error | Pipe class missing `transform()` |
| `no-missing-filter-catch` | error | `@Catch()` class missing `catch()` |
| `no-missing-interceptor-method` | error | Interceptor class missing `intercept()` |
| `require-inject-decorator` | error | Untyped constructor param without `@Inject()` |
| `prefer-readonly-injection` | warning | Constructor DI params missing `readonly` |
| `require-lifecycle-interface` | warning | Lifecycle method without corresponding interface |
| `no-empty-handlers` | warning | HTTP handler with empty body |
| `no-async-without-await` | warning | Async function/method with no `await` or redundant `async` on `new Promise()` return |
| `prefer-await-in-handlers` | warning | Async HTTP handler missing await — risks broken exception filters and lost stack traces |
| `no-duplicate-module-metadata` | warning | Duplicate entries in `@Module()` arrays |
| `no-missing-module-decorator` | warning | Class named `*Module` without `@Module()` |

### Architecture (12)

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `no-business-logic-in-controllers` | error | Loops, branches, data transforms in HTTP handlers |
| `no-repository-in-controllers` | error | Repository injection in controllers |
| `no-orm-in-controllers` | error | PrismaService / EntityManager / DataSource in controllers |
| `no-circular-module-deps` | error | Cycles in `@Module()` import graph |
| `no-manual-instantiation` | error | `new SomeService()` for injectable classes |
| `no-orm-in-services` | warning | Services using ORM directly (should use repositories) |
| `no-god-service` | warning | >10 public methods or >8 dependencies |
| `require-feature-modules` | warning | AppModule declaring too many providers directly |
| `prefer-constructor-injection` | warning | `@Inject()` property injection |
| `require-module-boundaries` | info | Deep imports into other modules' internals |
| `prefer-interface-injection` | info | Concrete service-to-service injection |
| `no-barrel-export-internals` | info | Re-exporting repositories from barrel files |

### Performance (7)

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `no-sync-io` | warning | `readFileSync`, `writeFileSync`, etc. |
| `no-blocking-constructor` | warning | Loops/await in Injectable/Controller constructors |
| `no-dynamic-require` | warning | `require()` with non-literal argument |
| `no-unused-providers` | warning | Provider never injected anywhere |
| `no-unnecessary-async` | info | Async method with no `await` |
| `no-unused-module-exports` | info | Module exports unused by importers |
| `no-orphan-modules` | info | Module never imported by any other module |

---

## Contributing

```bash
git clone https://github.com/RoloBits/nestjs-doctor.git
cd nestjs-doctor
pnpm install
pnpm run build
pnpm test
```

### Adding a rule

1. Create `src/rules/<category>/my-rule.ts`
2. Export a `Rule` (file-scoped) or `ProjectRule` (project-scoped) object
3. Register it in `src/rules/index.ts`
4. Add tests in `tests/unit/rules/`

---

## License

[MIT]
