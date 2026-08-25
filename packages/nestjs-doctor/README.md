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
codebase and reports findings across security, correctness, architecture,
performance, and schema, then scores it 0-100.

No AI at scan time, and nothing about your code leaves the machine. The same
commit scores the same on your laptop and in CI. Reads schemas from Prisma,
TypeORM, Drizzle and MikroORM, and handles monorepos.

[Website →](https://nestjs.doctor/docs)

## Install

### 1. Quick start

Run this at your project root:

```bash
npx nestjs-doctor@latest .
```

![nestjs-doctor scoring a project 35 out of 100, an agent fixing the findings, and a rescan scoring 100](https://nestjs.doctor/demo.gif)

Add `--verbose` for file paths and line numbers.

### 2. Open the report

Build `nestjs-doctor-report.html`:

```bash
npx nestjs-doctor@latest . --report
```

Writes to the project root, or wherever `--output` names. One file: score
summary, findings with a code viewer, and an interactive module
graph. Traced HTTP endpoints, the schema ER diagram, and a
rule playground get their own tabs.
[Module graph docs →](https://nestjs.doctor/docs/report/module-graph)

![Module Graph](https://nestjs.doctor/module-graph.png)

Add a few lines to `main.ts`, boot once, and `--timings` overlays the real
construction times on the module graph. The 800ms hiding in an `onModuleInit`
becomes a bar. [Boot trace docs →](https://nestjs.doctor/docs/report/boot-trace)

`--report-ui` renders the report with the React shell instead of the legacy
template (`report.ui: true` in the config file selects it too). The React
variant is one self-contained file with no external scripts; tabs are porting
in stages and the default stays legacy for now.

### 3. Run in CI

Write `.github/workflows/nestjs-doctor.yml`:

```bash
npx nestjs-doctor@latest ci install
```

The action reviews every pull request and reports only what the change
introduced, not the existing backlog. It posts a sticky summary comment, inline
review comments on the changed lines, and a commit status with the score.

It never fails a check until you ask it to. Set `blocking` or `min-score` when
ready. [CI docs →](https://nestjs.doctor/docs/ci)

### 4. Install for agents

Install the agent skill:

```bash
npx nestjs-doctor@latest --init
```

Installs three skills: `nestjs-doctor` for scanning after a change,
`nestjs-boot-trace` for a slow start, and `nestjs-doctor-create-rule` for
conventions of your own. The first runs without being asked, after the agent
writes Nest code. Works with Claude Code, Cursor, Codex, OpenCode, Windsurf,
Gemini CLI, and more.
[Agent docs →](https://nestjs.doctor/docs/coding-agents)

### 5. Configure rules

Optional. Drop a `nestjs-doctor.config.json` at your project root to turn rules
or categories off, set a score floor, or point at a custom rules directory:

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

The same shape works as `.nestjs-doctor.json`, or as a `"nestjs-doctor"` key in
`package.json`.

[Configuration →](https://nestjs.doctor/docs/configuration) ·
[Custom rule configuration →](https://nestjs.doctor/docs/custom-rules)

## Rules

52 built-in rules. Every finding carries a file and a rule id you can suppress
or configure, plus a line unless it reports against a schema entity.

| Category | Rules | Catches |
|---|---|---|
| [Security](https://nestjs.doctor/docs/rules/security) | 12 | Hardcoded secrets, `eval`, weak crypto, TypeORM `synchronize: true`, endpoints with no guard, dependencies with a published advisory |
| [Correctness](https://nestjs.doctor/docs/rules/correctness) | 20 | Fire-and-forget promises, missing `@Injectable()`, lifecycle hooks without their interface, param decorators that do not match the route |
| [Architecture](https://nestjs.doctor/docs/rules/architecture) | 10 | ORM in controllers, business logic in controllers, circular module dependencies, manual instantiation instead of DI |
| [Performance](https://nestjs.doctor/docs/rules/performance) | 7 | Sync I/O, blocking constructors, request-scope abuse, orphan modules, unused providers |
| [Schema](https://nestjs.doctor/docs/rules/schema) | 3 | Missing primary keys, missing timestamps, relations with no `onDelete` |

Suppress a single finding inline:

```ts
// nestjs-doctor-ignore-next-line architecture/no-orm-in-controllers
constructor(private readonly prisma: PrismaService) {}
```

## Editors and tooling

- **VS Code:** [NestJS Doctor](https://marketplace.visualstudio.com/items?itemName=rolobits.nestjs-doctor-vscode) surfaces the same rules as you type. [Docs →](https://nestjs.doctor/docs/vscode-extension)
- **Any other editor:** `npx nestjs-doctor-lsp --stdio` speaks LSP, so Neovim, Helix, and Emacs get the same rules. [Docs →](https://nestjs.doctor/docs/language-server)
- **Other CI:** GitLab Code Quality, SARIF for any code-scanning backend, or a markdown body to post yourself. [Docs →](https://nestjs.doctor/docs/ci)
- **Node API:** `diagnose()` plus an incremental API for editors and long-running processes. [Docs →](https://nestjs.doctor/docs/reference/node-api)
- **Monorepos:** detected from `nest-cli.json`, pnpm workspaces, `package.json` workspaces, Nx, or Lerna. [Docs →](https://nestjs.doctor/docs/pipeline/project-detection)

## Contributing

Issues and pull requests welcome. `pnpm check && pnpm typecheck && pnpm test`
before opening one.

MIT © [RoloBits](https://github.com/RoloBits)
