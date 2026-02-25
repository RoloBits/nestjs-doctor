# nestjs-doctor

## 0.4.17

### Patch Changes

- fe8ec20: Add VS Code Marketplace publish workflow

## 0.4.16

### Patch Changes

- 5de88e2: Fix tsdown build for LSP and VS Code extension, add VS Code Marketplace badge to README, and fix publish workflow pnpm compatibility

## 0.4.15

### Patch Changes

- 80925f8: Fix LSP build failure by suppressing tsdown inlineOnly error for intentionally bundled dependencies

## 0.4.14

### Patch Changes

- 9aa514a: Fix VS Code extension auto-publish by adding publish job to release workflow and workflow_dispatch fallback

## 0.4.13

### Patch Changes

- 69ba416: Add logo to HTML report brand bar, README, docs header, and leaderboard page

## 0.4.12

### Patch Changes

- f1a347d: Export granular scanning API (`prepareScan`, `scanFile`, `scanAllFiles`, `scanProject`, `updateFile`) for incremental LSP scanning support.

## 0.4.11

### Patch Changes

- ba201ef: Add create-rule skill, enhance Lab with code viewer layout swap and improved scripting, and update docs.

## 0.4.10

### Patch Changes

- ebca9bd: Rename `--graph` flag to `--report` and update output filename to `nestjs-doctor-report.html`. The `--graph` flag is kept as a backward-compatible alias.

## 0.4.9

### Patch Changes

- 2d50123: Add custom rules support with configurable rules directory, rule loader, and resolver

## 0.4.8

### Patch Changes

- 6b03f87: Add interactive HTML graph dashboard with findings viewer, code examples, and physics-based module graph. Include source code context lines in diagnostics. Remove prefer-interface-injection rule. Refactor graph-reporter into modular files. Update documentation.

## 0.4.7

### Patch Changes

- b24c960: Update docs and add tests for multi-agent skill installation

## 0.4.6

### Patch Changes

- c5330b3: Fix `ignore.files` config option not working when diagnostic paths are absolute

## 0.4.5

### Patch Changes

- 7147ae6: Add concrete provider-level suggestions to `no-circular-module-deps` and interactive module graph via `--graph` flag

## 0.4.4

### Patch Changes

- 18924e9: Remove `prefer-await-in-handlers` rule (async without await is valid in NestJS handlers), add framework handler exemptions (ts-rest, gRPC) to `no-async-without-await`, and reduce false positives in `no-hardcoded-secrets` for Base64 pagination cursors

## 0.4.3

### Patch Changes

- 36a3eb6: Use shared `isHttpHandler()` helper in new rules and tighten entity suffix matching to avoid false positives on types like `EntityManager`

## 0.4.2

### Patch Changes

- d53ed80: Rule audit and expansion: removed 5 noisy rules, added 5 new high-value rules

  **Removed** (high false-positive rate or too opinionated):

  - `no-god-service` — arbitrary thresholds for method/dependency counts
  - `require-feature-modules` — too opinionated for small apps
  - `no-unnecessary-async` — overlapped with `no-async-without-await`
  - `require-auth-guard` — flagged public endpoints, health checks, webhooks
  - `require-validation-pipe` — couldn't detect global ValidationPipe setup

  **Added:**

  - `no-synchronize-in-production` (security/error) — flags `synchronize: true` in TypeORM config
  - `no-service-locator` (architecture/warning) — flags `ModuleRef.get()`/`resolve()` usage
  - `no-request-scope-abuse` (performance/warning) — flags `Scope.REQUEST` usage
  - `no-raw-entity-in-response` (security/warning) — flags ORM entities returned from controllers
  - `no-fire-and-forget-async` (correctness/warning) — flags unawaited async calls in service methods

  Also removed the `thresholds` config option (`godServiceMethods`/`godServiceDeps`) and updated README examples to use `npm` instead of `pnpm`.

## 0.4.1

### Patch Changes

- cf87afb: Remove noisy rules that produced too many false positives

  - **no-god-module**: Removed — flagging modules with many providers/imports was too opinionated for most projects
  - **no-logging-in-loops**: Removed — logging inside loops is often intentional for debugging
  - **prefer-pagination**: Removed — `findMany()`/`find()` without pagination is valid in many contexts
  - **no-query-in-loop**: Removed — `await` inside loops is sometimes intentional and unavoidable

## 0.4.0

### Minor Changes

- bc5c864: Add `prefer-await-in-handlers` rule and expand default exclude patterns

  - **prefer-await-in-handlers**: New correctness rule that flags async HTTP handlers in `@Controller()` classes missing `await`. Unawaited service calls risk broken stack traces, missed exception filters, and inconsistent error handling. The existing `no-async-without-await` rule now skips controller handler methods to avoid overlap.
  - **Default excludes**: Added `mock/`, `mocks/`, `*.mock.ts`, `seeder/`, `seeders/`, `*.seed.ts`, and `*.seeder.ts` to the default exclude patterns so mock and seeder files are not scanned.

## 0.3.2

### Patch Changes

- 29e81ba: fix: reduce false positives in `no-manual-instantiation` rule for Pipes, Guards, Interceptors, and Filters

  The rule now uses two-tier suffix classification:

  - **DI-only** suffixes (`Service`, `Repository`, `Gateway`, `Resolver`) are always flagged
  - **Context-aware** suffixes (`Guard`, `Interceptor`, `Pipe`, `Filter`) are only flagged inside method/constructor bodies, and skipped when used in decorator arguments or at top-level scope

## 0.3.1

### Patch Changes

- 388c2fc: Fix false positives in correctness and security rules

  - **no-missing-guard-method, no-missing-pipe-method, no-missing-filter-catch, no-missing-interceptor-method**: Skip classes with an `extends` clause to avoid flagging classes that inherit the required method from a base class (e.g., `AuthGuard extends AuthGuard(['jwt'])`)
  - **no-hardcoded-secrets**: Tighten Base64 pattern to require at least one digit, eliminating false matches on long camelCase identifiers. Skip human-readable text (contains spaces) and dot-separated constants (e.g., `AUTH.WEAK_PASSWORD`) from name-based secret detection.

## 0.3.0

### Minor Changes

- 3a21971: Add `/nestjs-doctor` Claude Code skill. Run `npx nestjs-doctor --init` to set it up, then use `/nestjs-doctor` in Claude Code to scan and fix NestJS health issues interactively.

## 0.2.0

### Minor Changes

- ce6c95e: Add `--min-score` CLI flag for CI-friendly score threshold enforcement. Exits with code 1 if the health score is below the specified value (0-100). Also configurable via `minScore` in config file. Exit code 2 for invalid input.

## 0.1.5

### Patch Changes

- Fix apex domain by updating CNAME to nestjs.doctor for proper GitHub Pages SSL certificate provisioning

## 0.1.4

### Patch Changes

- Fix custom domain by using www.nestjs.doctor in CNAME for proper GitHub Pages redirect

## 0.1.3

### Patch Changes

- Fix nestjs.doctor website blank page by removing basePath, fixing favicon path, and adding CNAME file for custom domain

## 0.1.2

### Patch Changes

- a150d79: Improve performance with optimized scanner, better rule runner error handling, API validation, and typed error results

## 0.1.1

### Patch Changes

- 109f534: Fix CLI bin shebang missing — upgrade tsdown to v0.20 which properly supports the banner config, and update package.json entry points to match new .mjs output extensions
