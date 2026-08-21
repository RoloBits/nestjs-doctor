<p align="center">
  <img src="https://nestjs.doctor/logo.png" width="120" alt="nestjs-doctor logo" />
</p>

<p align="center">
  <h1 align="center">nestjs-doctor</h1>
</p>

<p align="center">
  <b>The deterministic NestJS devtool that catches AI mistakes.</b>
</p>

<p align="center">
  <a href="https://npmjs.com/package/nestjs-doctor"><img src="https://img.shields.io/npm/v/nestjs-doctor?style=flat&colorA=18181b&colorB=18181b" alt="version"></a>
  <a href="https://npmjs.com/package/nestjs-doctor"><img src="https://img.shields.io/npm/dt/nestjs-doctor?style=flat&colorA=18181b&colorB=18181b" alt="downloads"></a>
  <a href="https://github.com/RoloBits/nestjs-doctor/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/nestjs-doctor?style=flat&colorA=18181b&colorB=18181b" alt="license"></a>
  <a href="https://nestjs.doctor/docs"><img src="https://img.shields.io/badge/docs-website-18181b?style=flat&colorA=18181b&colorB=18181b" alt="docs"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=rolobits.nestjs-doctor-vscode"><img src="https://img.shields.io/visual-studio-marketplace/v/rolobits.nestjs-doctor-vscode?style=flat&colorA=18181b&colorB=18181b&label=vscode" alt="vscode"></a>
</p>

An opinionated rule set for an opinionated framework. nestjs-doctor scans your
codebase and reports issues across **security**, **correctness**,
**architecture**, **performance**, and **schema**, then scores it 0-100.

No AI at scan time, no network calls — the same commit scores the same on your
laptop and in CI. Reads schemas from Prisma, TypeORM, Drizzle and MikroORM, and
handles monorepos.

[Website →](https://nestjs.doctor/docs)

---

## Install

### 1. Quick start

Run this at your project root to get an audit.

```bash
npx nestjs-doctor@latest .
```

![nestjs-doctor scoring a project 35 out of 100, an agent fixing the findings, and a rescan scoring 100](https://nestjs.doctor/demo.gif)

Add `--verbose` for file paths and line numbers.

### 2. Open the report

```bash
npx nestjs-doctor@latest . --report
```

A self-contained HTML file: score summary, diagnostics with a code viewer, an
interactive module graph, traced HTTP endpoints, the schema ER diagram, and a
playground for writing your own rules.

![Module Graph](https://nestjs.doctor/module-graph.png)

Add `--timings` with a graph dump from a real `nest start` and the graph gains a
boot trace, so the 800ms hiding in an `onModuleInit` shows up as a bar.
[Report docs →](https://nestjs.doctor/docs/pipeline/output)

### 3. Run in CI

```bash
npx nestjs-doctor@latest ci install
```

Writes `.github/workflows/nestjs-doctor.yml`. The action reviews every pull
request and reports **only what the change introduced**, not your existing
backlog: a sticky summary comment, inline review comments on the changed lines,
and a commit status with the score.

It never fails a check until you ask it to — set `blocking` or `min-score` when
your team is ready. [CI docs →](https://nestjs.doctor/docs/ci)

### 4. Install for agents

```bash
npx nestjs-doctor@latest --init
```

Installs a skill so your coding agent runs the scan and fixes what it finds.
Works with Claude Code, Cursor, Codex, OpenCode, Windsurf, Gemini CLI, and more.
[Agent docs →](https://nestjs.doctor/docs/coding-agents)

### 5. Configure rules

Optional. Drop a `nestjs-doctor.config.json` in your project root to turn rules
or whole categories off, override a severity, set a score floor, or point at
your own rules directory. It also works as a `"nestjs-doctor"` key in
`package.json`.

```json
{
  "minScore": 80,
  "rules": {
    "performance/no-sync-io": false,
    "architecture/no-manual-instantiation": {
      "excludeClasses": ["Logger", "PinoLogger"]
    }
  },
  "categories": { "performance": false }
}
```

[Configuration →](https://nestjs.doctor/docs/configuration) ·
[Custom rules →](https://nestjs.doctor/docs/custom-rules)

---

## Rules

50 built-in rules. Every finding carries a file, a line, and a rule id you can
suppress or configure.

| Category | Rules | Catches |
|---|---|---|
| [Security](https://nestjs.doctor/docs/rules/security) | 10 | Hardcoded secrets, `eval`, weak crypto, TypeORM `synchronize: true`, endpoints with no guard |
| [Correctness](https://nestjs.doctor/docs/rules/correctness) | 20 | Fire-and-forget promises, missing `@Injectable()`, lifecycle hooks without their interface, param decorators that do not match the route |
| [Architecture](https://nestjs.doctor/docs/rules/architecture) | 10 | ORM in controllers, business logic in controllers, circular module dependencies, manual instantiation instead of DI |
| [Performance](https://nestjs.doctor/docs/rules/performance) | 7 | Sync I/O, blocking constructors, request-scope abuse, orphan modules, unused providers |
| [Schema](https://nestjs.doctor/docs/rules/schema) | 3 | Missing primary keys, missing timestamps, relations with no `onDelete` |

Suppress a single finding inline:

```ts
// nestjs-doctor-ignore-next-line architecture/no-orm-in-controllers
constructor(private readonly prisma: PrismaService) {}
```

---

## Editors and tooling

- **VS Code** — [NestJS Doctor](https://marketplace.visualstudio.com/items?itemName=rolobits.nestjs-doctor-vscode) surfaces the same rules as you type. [Docs →](https://nestjs.doctor/docs/vscode-extension)
- **Other CI** — GitLab Code Quality, SARIF for any code-scanning backend, or a markdown body to post yourself. [Docs →](https://nestjs.doctor/docs/ci)
- **Node API** — `scanProject()` and an incremental API for editors and long-running processes. [Docs →](https://nestjs.doctor/docs/reference/node-api)
- **Monorepos** — detected from `nest-cli.json`, pnpm workspaces, `package.json` workspaces, Nx, or Lerna. [Docs →](https://nestjs.doctor/docs/pipeline/project-detection)

---

## Contributing

Issues and pull requests welcome. `pnpm check && pnpm typecheck && pnpm test`
before opening one.

MIT © [RoloBits](https://github.com/RoloBits)
