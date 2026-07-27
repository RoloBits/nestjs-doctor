# CLAUDE.md

Guidance for Claude Code working in this repository. Team-shared — personal preferences belong in `CLAUDE.local.md` (gitignored).

## Repository overview

`nestjs-doctor` is a static analysis CLI for NestJS. It scans a project, runs 50 rules across five categories, and produces a 0–100 health score plus diagnostics, an interactive HTML report, and machine-readable output for CI.

pnpm monorepo, four packages:

| Package | What it is |
|---|---|
| `nestjs-doctor` | The CLI and the Node API. Everything below lives here unless stated. |
| `nestjs-doctor-lsp` | Language server, spawned over stdio by the VS Code extension. Ships **CommonJS** deliberately. |
| `nestjs-doctor-vscode` | VS Code extension. |
| `website` | Next.js + MDX docs site, deployed to nestjs.doctor. |

## Common commands

```bash
pnpm build       # build nestjs-doctor + lsp
pnpm test        # vitest, all packages
pnpm check       # lint + format (Biome via Ultracite)
pnpm fix         # auto-fix lint + format
pnpm typecheck   # tsc --noEmit
pnpm knip        # unused files, exports, dependencies
pnpm changeset   # add a changeset for a published package
```

Run `pnpm check && pnpm typecheck && pnpm test && pnpm build` before claiming anything works. The husky `pre-commit` hook runs `check`, `knip`, and `test`; never bypass it with `--no-verify`.

CI additionally runs the test suite on Node 20/22/24 and on macOS and Windows. Platform bugs are real here — see "Paths" below.

## Architecture

### The pipeline

`resolveScanConfig` → `buildAnalysisContext` → `diagnose` → `buildResult` → output.

`buildAnalysisContext` is where the expensive work happens: collect files, parse with ts-morph, then build the module graph, provider map, endpoint graph, and schema graph. Rules read those; they don't rebuild them.

### Rule scopes

Three kinds, in `src/engine/rules/definitions/<category>/`:

- **`Rule`** (file) — runs once per source file, sees one `SourceFile`.
- **`ProjectRule`** (`scope: "project"`) — runs once, sees the whole ts-morph `Project`, the module graph, and the provider map. For anything cross-file: cycles, unused providers, unused exports.
- **`SchemaRule`** (`scope: "schema"`) — runs against the extracted ORM schema graph. Reports against an **entity**, so its diagnostics carry no line number.

Most rules are file-scoped. Reach for project scope only when the rule genuinely needs cross-file facts.

Register new rules in `src/engine/rules/index.ts`. Rule ids are `<category>/<kebab-name>`; custom rules get a `custom/` prefix automatically.

### Diagnostics

`CodeDiagnostic` has `line`/`column`; `SchemaDiagnostic` has `entity` and no line. Anything consuming diagnostics must handle both — use `isCodeDiagnostic` / `isSchemaDiagnostic`, never assume a line exists.

### Scoring

Weighted by severity (error 3.0, warning 1.5, info 0.5) and category (security 1.5×, correctness 1.3×, schema 1.1×, architecture 1.0×, performance 0.8×), normalised by file count.

**The score always reflects the whole project**, regardless of `--scope`. Narrowing a report must never make a codebase look healthier than it is.

## Things that bite in this repo

**Paths.** ts-morph reports every path with forward slashes on every platform. `path.resolve`/`join` return native separators and, on Windows, prepend a drive. Mixing the two silently resolves nothing — the module graph came back empty on Windows for exactly this reason, which turns every module into an orphan and every provider into unused. Normalise to posix at any boundary where a path becomes a lookup key. Don't reach for `path.posix.resolve` either; it treats `D:/proj` as relative.

**macOS symlinks.** `/var` and `/tmp` are symlinks into `/private`, and git reports canonical paths while a caller's path keeps its symlinks. Decide containment with `git rev-parse --show-prefix`, not by comparing absolute paths.

**Git env in hooks.** Git exports `GIT_DIR`, `GIT_INDEX_FILE`, and friends to every hook, and children inherit them. Anything shelling out to git must clear them (`src/engine/git.ts` does) or it resolves refs against the wrong repository.

**Degrade wider, never narrower.** When scoping can't be determined, report more and say why. A scan that silently reports nothing looks identical to a clean one.

**Control characters in source.** A literal NUL makes git classify a file as binary, so it stops rendering in every diff view. Write escapes (`\u0000`), never the raw byte.

## Conventions

### Code comments

Comments explain **what** the code does, not why. No decisions, no tradeoffs, no ticket refs, no names. Two lines max, and only when it isn't obvious from the code.

The reasoning belongs in the commit message and the PR description, where it is attached to the change rather than left to rot in the file.

### Commits

Conventional Commits (`feat(scope):`, `fix(scope):`, `chore:`). Branches: `^(feat|fix|chore|docs|refactor|test)/.+`.

**No `Co-Authored-By: Claude` trailer. No `Claude-Session` trailer.** Bot attribution in a PR description is fine; commit trailers are not.

Add a changeset (`pnpm changeset`) for any change to a published package.

### Pull requests

PR descriptions follow the six-section shape. See `/nd:build` for the full template and the rules for writing it.

1. **Context** — what the reader must know before the problem makes sense.
2. **Problem** — what is broken, and the evidence. Lead with the sharpest fact.
3. **Possible flows** — every path into the thing you changed, and which were affected. Usually a table.
4. **Solution** — what you did, and what you deliberately did not do.
5. **Before vs after** — a table, including an unchanged row so the blast radius is visible.
6. **Example** — one real invocation, real old output, real new output.

Short sections. Evidence, not adjectives. Plain words — no "leverage", "robust", "comprehensive", "ensure", "seamless". Drop a section only when it is genuinely empty; never pad one.

## Claude Code project tooling

`.claude/` is committed, so anyone running Claude Code in this checkout gets it.

### Commands (`.claude/commands/nd/`)

| Command | What it does |
|---|---|
| `/nd:build` | Feature end-to-end: plan → spec gate → implement → code gate → PR → simplify + review loop. Two human gates. |
| `/nd:review` | Multi-agent PR review, confidence-scored, drafted in your voice. Nothing posts without approval. |
| `/nd:ticket` | Draft a GitHub issue against the repo's issue templates. Nothing is created without approval. |
| `/worklog` | Save or recall the conversation worklog. |

All three of the first ones set `disable-model-invocation: true` — they push, post, or create, so only a human starts them.

### Agents (`.claude/agents/`)

Domain agents that hold a subsystem's invariants and footguns. Consult the owning agent **before** the generic explorers when touching its area; it already knows what the explorers would have to rediscover.

| Agent | Owns |
|---|---|
| `nd-rules` | The rule system: definitions, scopes, registration, severity, custom rules. |
| `nd-engine` | Scanner pipeline, graphs, scoping and baseline, git integration. |
| `nd-schema` | ORM schema extraction (Prisma, TypeORM, Drizzle, MikroORM). |
| `nd-cli` | Flags, formatters, output shapes, exit codes. |

### Format hook (`.claude/settings.json`)

A `PostToolUse` hook runs `pnpm exec biome check --write` on any `.ts`/`.tsx`/`.json` file Claude writes under `packages/`, matching what `pnpm check` and the pre-commit hook enforce. Non-blocking.
