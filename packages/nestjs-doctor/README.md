<p align="center">
  <img src="https://nestjs.doctor/logo.png" width="120" alt="nestjs-doctor logo" />
</p>

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
  <a href="https://nestjs.doctor/docs"><img src="https://img.shields.io/badge/docs-website-18181b?style=flat&colorA=18181b&colorB=18181b" alt="docs"></a>
</p>

<p align="center">
  40 built-in rules across <b>security</b>, <b>performance</b>, <b>correctness</b>, and <b>architecture</b>. Outputs a <b>0-100 score</b> with actionable diagnostics. Zero config. Monorepo support. Catches the anti-patterns that AI-generated code introduce (slop code).
</p>

---

## Quick Start

```bash
npx nestjs-doctor@latest .
```

With file paths and line numbers:

```bash
npx nestjs-doctor@latest . --verbose
```

![CLI Output](https://nestjs.doctor/cli-output.png)

---

## Report

```bash
npx nestjs-doctor@latest . --report
```

Self-contained HTML file with four sections: score summary, source-level diagnostics with code viewer, interactive module graph, and a custom rule playground. Opens in your browser.

![Module Graph](https://nestjs.doctor/module-graph.png)

---

## CI

Pin it as a devDependency:

```bash
npm install -D nestjs-doctor
```

Use `--min-score` to gate on a minimum health score:

```bash
npx nestjs-doctor . --min-score 75
```

Or wire it into `package.json`:

```json
{
  "scripts": {
    "health": "nestjs-doctor . --min-score 75"
  }
}
```

Exit codes: `1` if the score is below threshold, `2` for bad input.

```
Usage: nestjs-doctor [directory] [options]

  --verbose       Show file paths and line numbers per diagnostic
  --score         Output only the numeric score (for CI)
  --json          JSON output (for tooling)
  --report        Generate an interactive HTML report (--graph also works)
  --min-score <n> Minimum passing score (0-100). Exits with code 1 if below threshold
  --config <p>    Path to config file
  --init          Set up the /nestjs-doctor skill for AI coding agents
  -h, --help      Show help
```

---

## AI Coding Agents

Ships with skills for popular AI coding agents. Run `--init` to auto-detect installed agents and install the nestjs-doctor skill for each one:

```bash
npm install -D nestjs-doctor
npx nestjs-doctor --init
```

| Agent | Detection | Skill location |
|-------|-----------|----------------|
| Claude Code | `~/.claude` exists | `~/.claude/skills/nestjs-doctor/` |
| Amp Code | `~/.amp` exists | `~/.config/amp/skills/nestjs-doctor/` |
| Cursor | `~/.cursor` exists | `~/.cursor/skills/nestjs-doctor/` |
| OpenCode | `opencode` CLI or `~/.config/opencode` | `~/.config/opencode/skills/nestjs-doctor/` |
| Windsurf | `~/.codeium` exists | Appends to `~/.codeium/windsurf/memories/global_rules.md` |
| Antigravity | `agy` CLI or `~/.gemini/antigravity` | `~/.gemini/antigravity/skills/nestjs-doctor/` |
| Gemini CLI | `gemini` CLI or `~/.gemini` | `~/.gemini/skills/nestjs-doctor/` |
| Codex | `codex` CLI or `~/.codex` | `~/.codex/skills/nestjs-doctor/` |

A project-level fallback is always written to `.agents/nestjs-doctor/`. Commit it so every contributor gets the skill automatically.

### Skills

`--init` installs two skills per agent:

| Skill | Command | Description |
|-------|---------|-------------|
| nestjs-doctor | `/nestjs-doctor` | Runs the scan, shows the report, and fixes what it can |
| nestjs-doctor-create-rule | `/nestjs-doctor-create-rule` | Scaffolds a custom rule: checks feasibility, writes the `.ts` file, updates config, verifies it loads |

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
    "architecture/no-barrel-export-internals": false
  },
  "categories": {
    "performance": false
  }
}
```

Also works as a `"nestjs-doctor"` key in `package.json`.

| Key | Type | Description |
|-----|------|-------------|
| `include` | `string[]` | Glob patterns to scan (default: `["**/*.ts"]`) |
| `exclude` | `string[]` | Glob patterns to skip (default includes `node_modules`, `dist`, `build`, `coverage`, `*.spec.ts`, `*.test.ts`, `*.e2e-spec.ts`, `*.e2e-test.ts`, `*.d.ts`, `test/`, `tests/`, `__tests__/`, `__mocks__/`, `__fixtures__/`, `mock/`, `mocks/`, `*.mock.ts`, `seeder/`, `seeders/`, `*.seed.ts`, `*.seeder.ts`) |
| `minScore` | `number` | Minimum passing score (0-100). Exits with code 1 if below threshold |
| `ignore.rules` | `string[]` | Rule IDs to suppress |
| `ignore.files` | `string[]` | Glob patterns for files whose diagnostics are hidden |
| `rules` | `Record<string, boolean>` | Enable/disable individual rules |
| `categories` | `Record<string, boolean>` | Enable/disable entire categories |
| `customRulesDir` | `string` | Path to a directory containing custom rule files |

---

## Custom Rules

Extend the built-in rule set with project-specific checks. Only `.ts` files are supported.

### Rule shape

Each `.ts` file in the custom rules directory must export an object with a `meta` descriptor and a `check` function:

```typescript
import type { RuleContext } from "nestjs-doctor";

export const noTodoComments = {
  meta: {
    id: "no-todo-comments",
    category: "correctness",        // "security" | "performance" | "correctness" | "architecture"
    severity: "warning",            // "error" | "warning" | "info"
    description: "TODO comments should be resolved before merging",
    help: "Replace the TODO with an implementation or open an issue.",
    // scope: "file",              // optional — "file" (default) or "project"
  },
  check(context: RuleContext) {
    const text = context.sourceFile.getFullText();
    const regex = /\/\/\s*TODO/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const pos = context.sourceFile.getLineAndColumnAtPos(match.index);
      context.report({
        message: "Unresolved TODO comment",
        file: context.filePath,
        line: pos.line,
      });
    }
  },
};
```

Rule IDs are automatically prefixed with `custom/` (e.g. `no-todo-comments` becomes `custom/no-todo-comments`).

### Usage

Set `customRulesDir` in your config file:

```json
{
  "customRulesDir": "./rules"
}
```

### Error handling

Invalid rules produce warnings but never crash the scan. Common issues — missing `check` function, invalid category/severity, syntax errors — are surfaced in CLI output so you can fix them without blocking the rest of the analysis.

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

Output includes a combined score and a per-project breakdown.

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

## Rules (40)

### Security (9)

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `no-hardcoded-secrets` | error | API keys, tokens, passwords in source code |
| `no-eval` | error | `eval()` or `new Function()` usage |
| `no-csrf-disabled` | error | Explicitly disabling CSRF protection |
| `no-dangerous-redirects` | error | Redirects with user-controlled input |
| `no-synchronize-in-production` | error | `synchronize: true` in TypeORM config -- can drop columns/tables |
| `no-weak-crypto` | warning | `createHash('md5')` or `createHash('sha1')` |
| `no-exposed-env-vars` | warning | Direct `process.env` in Injectable/Controller |
| `no-exposed-stack-trace` | warning | `error.stack` exposed in responses |
| `no-raw-entity-in-response` | warning | Returning ORM entities directly from controllers -- leaks internal fields |

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
| `no-async-without-await` | warning | Async function/method with no `await` |
| `no-duplicate-module-metadata` | warning | Duplicate entries in `@Module()` arrays |
| `no-missing-module-decorator` | warning | Class named `*Module` without `@Module()` |
| `no-fire-and-forget-async` | warning | Async call without `await` in non-handler methods |

### Architecture (10)

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `no-business-logic-in-controllers` | error | Loops, branches, data transforms in HTTP handlers |
| `no-repository-in-controllers` | error | Repository injection in controllers |
| `no-orm-in-controllers` | error | PrismaService / EntityManager / DataSource in controllers |
| `no-circular-module-deps` | error | Cycles in `@Module()` import graph |
| `no-manual-instantiation` | error | `new SomeService()` for injectable classes |
| `no-orm-in-services` | warning | Services using ORM directly (should use repositories) |
| `no-service-locator` | warning | `ModuleRef.get()`/`resolve()` hides dependencies |
| `prefer-constructor-injection` | warning | `@Inject()` property injection |
| `require-module-boundaries` | info | Deep imports into other modules' internals |
| `no-barrel-export-internals` | info | Re-exporting repositories from barrel files |

### Performance (7)

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `no-sync-io` | warning | `readFileSync`, `writeFileSync`, etc. |
| `no-blocking-constructor` | warning | Loops/await in Injectable/Controller constructors |
| `no-dynamic-require` | warning | `require()` with non-literal argument |
| `no-unused-providers` | warning | Provider never injected anywhere |
| `no-request-scope-abuse` | warning | `Scope.REQUEST` creates new instance per request |
| `no-unused-module-exports` | info | Module exports unused by importers |
| `no-orphan-modules` | info | Module never imported by any other module |


