# nestjs-doctor

## 0.7.0

### Minor Changes

- 7157408: Remove the base64 shape detector from `security/no-hardcoded-secrets`.

  Every other pattern in that rule recognises a format someone issues: a GitHub
  token, an AWS access key, a Slack token, a JWT. This one recognised a shape —
  any forty characters of the base64 alphabet containing a digit — so everything
  base64-ish matched, and three guards had to be bolted on to make it usable:
  decode-to-JSON, a pagination-property allowlist, and an identifier heuristic.

  Those guards were the rule's two worst failures. The identifier heuristic
  cleared about a third of genuinely random keys, measured over 20,000 samples,
  and its entropy check was dead code that could not change the outcome. In the
  other direction, nine of the twelve tests covering the pattern existed only to
  suppress something it wrongly reported: migration class names, camelCase
  identifiers, pagination cursors, encoded JSON.

  Across three public repositories it found nothing at all. Every secret those
  codebases do contain is reported either by a real format pattern or by the
  property-name path, both untouched.

  What you lose: a base64 secret stored under a name that does not look like a
  secret. Under `secret`, `password` or `apiKey` the name path still catches it.

### Patch Changes

- faa9f28: Stop three rules reporting working NestJS code, all found by scanning public
  repositories.

  `correctness/no-missing-injectable` flagged CQRS handlers and queue processors.
  The rule modelled a list of decorators that "imply @Injectable", which is not
  how NestJS works: the injector reads `design:paramtypes`, and TypeScript emits
  that for a class carrying any class-level decorator. The rule now asks that
  question instead of consulting a list, so `@CommandHandler`, `@Processor` and
  every third-party or project decorator work without being enumerated. A
  provider with constructor parameters and no class decorator — the shape that
  actually fails at boot — still reports, and so does one whose only decorator is
  on a method.

  `architecture/no-manual-instantiation` flagged `new HeaderResolver(['x-lang'])`
  inside `I18nModule.forRootAsync(...)`. A `new` inside a decorator argument is
  configuration; `useValue: new X()` is documented NestJS. The skip that already
  covered guards and interceptors now covers every suffix.

  `security/no-hardcoded-secrets` flagged message keys and permission constants:
  `throw new UnprocessableEntityException({ errors: { password: 'incorrectPassword' } })`,
  `PASSWORD_UPDATE: 'password:update'`, and `SYS_USER_INITPASSWORD = 'sys_user_initPassword'`.
  Three narrow skips on the name-based path: a string handed to `throw`, a
  lowercase colon-separated scope, and a value that only restates its own name. A
  credential never matches any of the three; `correct-horse-battery-staple` and
  `super-secret-key` under a `password` property still report, and the
  pattern-based detection is untouched.

  Twelve false errors removed across the three repositories.

- 38ec6dd: Resolve base entities imported through tsconfig path aliases.

  The analysis project was built without `compilerOptions.paths`, so a base class
  imported through an alias like `~/common/entity/common.entity` resolved to
  nothing and the inheritance walk stopped before reaching it. An abstract base
  carrying `@PrimaryGeneratedColumn()` and the timestamp columns was invisible to
  every entity extending it: on `buqiyuan/nest-admin` that meant 13 false
  `schema/require-primary-key` errors and 13 false `schema/require-timestamps`
  warnings. The same gap affected MikroORM inheritance; Drizzle and Prisma never
  resolve TypeScript imports and were unaffected.

  The parser now receives the aliases the engine already loads per project. The
  TypeORM inheritance walk also stops at `node_modules`, since with aliases
  resolving the compiler can now reach `typeorm`'s own `BaseEntity` declaration.

  Better resolution cuts both ways: types the checker could not see before can
  now surface findings that were wrongly hidden. On the same repository this
  revealed four unawaited async calls and two raw-entity responses, all real.

  Projects without a tsconfig or without `paths` are untouched.

- 2bdc2c9: Detect API keys that carry an environment segment.

  `security/no-hardcoded-secrets` matched `sk` or `pk`, one separator, then
  alphanumerics. Every key Stripe issues is `sk_live_…` or `sk_test_…`, with a
  second underscore, so none of them matched — nor did OpenAI's `sk-proj-…` or
  Anthropic's `sk-ant-api03-…`. A committed Stripe key was blocked by GitHub's
  push protection and missed here.

  An added pattern allows up to two lowercase prefix segments and requires a digit
  in the tail, so `sk_some_long_variable_name_here` and
  `sk_module_config_provider_token` are still ignored. The existing patterns are
  unchanged, so no current finding changes its message.

## 0.6.1

### Patch Changes

- 144c2f1: Stop `security/require-guards-on-endpoints` reporting guarded endpoints.

  The rule looked for a literal `@UseGuards()` on the controller class or the
  route method, so two mainstream NestJS auth patterns read as no guard at all:

  - **Global guards.** `{ provide: APP_GUARD, useClass: JwtAuthGuard }` in a
    module's `providers` binds a guard application-wide. Every endpoint in the
    application was still reported.
  - **Composed decorators.** A custom `@Auth()` built from
    `applyDecorators(UseGuards(...))` was invisible, so a codebase that wraps its
    guards — and therefore never writes `@UseGuards` directly — was reported in
    full.

  Measured against three public repositories: `buqiyuan/nest-admin` drops from 72
  findings to 0, `NarHakobyan/awesome-nest-boilerplate` from 12 to the 5 endpoints
  that genuinely carry no guard, and `brocoders/nestjs-boilerplate` stays at 11,
  which are real.

  The rule only stays quiet on a positive sighting. If no module is visible — a
  scan pointed at a subdirectory, or a config that excludes the root module — it
  reports exactly as before rather than assuming a guard it cannot see.

  Two things it still cannot tell apart. An `APP_GUARD` reached through an aliased
  import is not recognised, because detection matches the token as written. And a
  module declaring `APP_GUARD` counts even when nothing imports it, so a dead
  module left in the tree suppresses the rule project-wide; separating that from a
  real root module needs the application's entry point, which a static scan of an
  arbitrary directory cannot identify.

  Module nodes now carry `providerTokens`, the `provide` tokens of object-literal
  providers. `providers` is unchanged.

- 5b3d9cd: Stop `architecture/require-module-boundaries` flagging imports that never leave
  their module.

  The rule matched any relative import containing `../` plus an internal directory
  name, without checking whether the import leaves the current module. Two kinds
  of false positive followed:

  - A module reading its **own** internals through a sibling directory —
    `mappers/file.mapper.ts` importing `../entities/file.schema`, with the module
    file right beside both. 13 of 49 findings on `brocoders/nestjs-boilerplate`.
  - Shared utilities under an application's **root** module — `common/pipes`
    importing `../dto`, `decorators` importing `../guards`. 15 of 16 findings on
    `buqiyuan/nest-admin` and 5 of 21 on `NarHakobyan/awesome-nest-boilerplate`.

  The rule now resolves the import and compares the nearest module directory of
  source and target — module directories being those holding a `*.module.ts` file
  or a `@Module()` class. Only an import whose two sides positively resolve to the
  same module is skipped; a cross-module import, an unknown side, or a project
  with no visible modules reports exactly as before.

  One consequence to know about: a project that registers everything in a single
  root module has no internal module boundaries, so folder-to-folder deep imports
  there are no longer reported. The rule reads NestJS's module structure, not the
  directory layout.

## 0.6.0

### Minor Changes

- 7fc03e8: Add diff-scoped scanning so a scan can report only what a change introduced.

  `--scope full|files|lines|changed` narrows what gets **reported**; the whole
  project is still analysed, so cross-file rules (module cycles, unused providers,
  unused exports) stay correct. `--base <ref>` picks the revision to compare
  against, `--staged` scopes to the git index for pre-commit hooks, and
  `--changed-files-from <path>` accepts a pre-computed file list for CI.

  `changed` scans the base revision in a temporary git worktree and subtracts the
  findings that were already there, also reporting how many the change resolved.
  Findings are matched on rule, file, message, and source text rather than line
  number, so an unrelated edit above a finding does not make it look new. When the
  base cannot be reached — a shallow CI clone, typically — the scan degrades to
  `files` and warns instead of claiming a delta it never measured.

  The score always reflects the whole project, whatever the scope: narrowing a
  report cannot make a codebase look healthier than it is. Results gain an
  optional `scope` field describing what was reported.

  Git invocations run with `GIT_DIR`, `GIT_INDEX_FILE`, and the other
  repository-scoping variables cleared. Git exports those to every hook it runs
  and a hook's children inherit them, so `--staged` from a husky `pre-commit`
  would otherwise resolve refs against the hook's repository rather than the
  scanned one.

- 7fc03e8: Add SARIF, GitLab Code Quality, markdown, and GitHub Actions output, plus a
  configurable failure gate.

  `--format console|json|sarif|gitlab|markdown|github` selects the output shape,
  `--output <path>` writes it to a file, and `--json-compact` drops the
  indentation from the JSON-based formats. SARIF results carry explicit
  `partialFingerprints`, so a GitHub code-scanning alert survives an edit near the
  finding instead of being closed and reopened. `github` is additive: it prints
  workflow annotations and appends the report to the job summary while keeping the
  readable console output.

  `--blocking none|warning|error` sets the severity that fails the run,
  independently of `--min-score`. The defaults reproduce existing behaviour
  exactly — `error` for the console report, `none` for `--json` and `--score`,
  which previously failed only on `--min-score`. Passing `--blocking` explicitly
  makes every output mode behave the same.

  `--list-rules` prints the built-in rule catalogue (add `--json` for a
  machine-readable list).

  The markdown, SARIF, and GitLab builders are exported from the public API as
  `buildMarkdownReport`, `buildSarifLog`, and `buildCodeQualityReport`, alongside
  the diff-scoping and fingerprint helpers.

  Warnings and errors about the run itself now go to stderr, so stdout stays a
  clean machine-readable stream.

### Patch Changes

- 41eaa2a: Make the markdown report's scope caption self-explanatory.

  When the scan was handed fewer files than the change touched, the caption now
  reads "5 of 9 changed files scanned" instead of "5 files in scope" — the old
  wording invited a reader to compare it against the pull request's own file count
  and read the gap as a miscount. It falls back to the previous wording when the
  caller does not know the pre-filter total, and says nothing extra when nothing
  was filtered out.

  A base given as a full commit SHA is abbreviated to seven characters. Branch
  names are printed as they were given.

- 76e5f09: Fix a monorepo's root config being silently ignored by every sub-project.

  `loadConfigWithFallback` only fell back to the root config when `loadConfig`
  threw, but `loadConfig` swallows a missing file and returns the defaults — so a
  root `nestjs-doctor.config.json` (or one passed via `--config`) was loaded and
  then dropped for each sub-project. A sub-project that ships its own config still
  takes precedence; one that ships none now inherits the root's.

  Closes #109.

## 0.5.1

### Patch Changes

- 8aa2802: Update runtime dependencies to their latest versions: ts-morph 27 → 28, citty 0.1 → 0.2, jiti → 2.7, ora → 9.4, plus patch bumps for picocolors, picomatch, and tinyglobby. No API or behaviour changes — verified against the full test suite and the CLI (`--help`, `--score`, `--json`, and a default run).

## 0.5.0

### Minor Changes

- 11bb016: Add inline rule suppression via source comments. Silence a rule for a single line or an entire file without editing the config, using `// nestjs-doctor-ignore` directives (with `disable` accepted as an alias):

  ```typescript
  const config = eval(raw); // nestjs-doctor-ignore security/no-eval

  // nestjs-doctor-ignore-next-line security/no-eval
  const config = eval(raw);

  // nestjs-doctor-ignore-file security/no-eval
  ```

  Supported directives: `nestjs-doctor-ignore` / `-line` (same line), `-next-line` (line below), and `-file` (whole file). The rule list is space- or comma-separated; omit it to suppress every rule for that scope. An optional `-- reason` trailer is ignored so the exception can be documented inline. Line-scoped directives apply to code diagnostics; schema diagnostics (which have no line) are suppressed with `-file`, in the entity source for TypeORM/MikroORM/Drizzle and directly in the `schema.prisma` file for Prisma. This implements the previously-documented-but-inert `// nestjs-doctor-ignore` convention referenced by the bundled skill.

## 0.4.33

### Patch Changes

- 7600d1c: Fix false positives in `require-primary-key` and `require-timestamps` for TypeORM entities that extend an abstract base class.

  Previously, the TypeORM extractor only inspected properties declared directly on the entity class. If a project used a shared abstract base class (e.g. `BaseEntity`) to centralise common columns like `@PrimaryGeneratedColumn`, `@CreateDateColumn`, and `@UpdateDateColumn`, every concrete entity extending that base would be flagged — even though those columns exist in the database table.

  The extractor now walks the full class hierarchy and collects inherited columns and relations from all ancestor classes. A child-class property always takes precedence over a same-named property on a parent, so overrides are handled correctly.

## 0.4.32

### Patch Changes

- 541497a: Add MikroORM schema extractor. Projects depending on `@mikro-orm/core` now
  benefit from the three `schema/*` rules and the ER diagram in the HTML
  report. Previously, MikroORM projects were detected but produced an empty
  schema graph; the extractor closes that gap with parity to the TypeORM
  extractor — entity, columns, relations including `Collection<T>` / `Ref<T>`
  type-arg resolution, `@Enum`, `@Unique`, composite `@Index`, abstract base
  class skipping, and `deleteRule` (v6) / `onDelete` (legacy) cascade
  detection.

  Closes #118.

## 0.4.31

### Patch Changes

- b046574: Add `ignoreForwardRefCycles` option to `architecture/no-circular-module-deps`. When enabled, cycles whose every consecutive edge uses `forwardRef()` are suppressed. One-sided `forwardRef` still flags. Default behavior unchanged. Closes #110.

## 0.4.30

### Patch Changes

- 5553c99: Enrich endpoint dependency graph with branch conditions, iteration context, guard-throw patterns, swagger metadata, and inline step/throw nodes

## 0.4.29

### Patch Changes

- beb2062: Add missing bad/good code examples for 10 rules in the HTML report (7 new correctness/security rules, 3 schema rules) and fix formatting in require-lifecycle-interface rule

## 0.4.28

### Patch Changes

- af2fef3: Add endpoint dependency graph to the report. Each HTTP endpoint now shows which services, repositories, and other providers it calls, including nested dependencies and call order. The new Endpoints tab is hidden until endpoint data is available and is marked as beta.

## 0.4.27

### Patch Changes

- fc0faad: Update docs to cover all five monorepo detection strategies (nest-cli.json, pnpm workspaces, npm/Yarn workspaces, Nx, standalone Lerna) and the fallback warning.

## 0.4.26

### Patch Changes

- 109b95f: Fix combined monorepo schema ORM field being overwritten by sub-projects without an ORM

## 0.4.25

### Patch Changes

- 2f121fa: Add Drizzle ORM schema extraction support and require-timestamps rule coverage for Drizzle schemas

## 0.4.24

### Patch Changes

- 4a55ef9: Add integration tests for config file exclusion, nested node_modules exclusion, and forRootAsync module resolution

## 0.4.23

### Patch Changes

- 0232a8b: Pass path aliases as function parameters instead of module-level state

## 0.4.22

### Patch Changes

- 16db4ff: Update module graph docs for cross-file import resolution

## 0.4.21

### Patch Changes

- 29c2c77: Update docs for dynamic module import resolution

## 0.4.20

### Patch Changes

- 398033a: Treat `@Resolver` and `@WebSocketGateway` as implicit `@Injectable` to prevent false positives in GraphQL and WebSocket apps.

## 0.4.19

### Patch Changes

- dd08253: Minimize published package size (904 KB → 390 KB unpacked, 200 KB → 101 KB compressed)

  - Remove source maps from published package
  - Enable minification for API and CLI bundles
  - Drop CJS build (ESM-only)
  - Embed skill templates as string constants, remove `skill/` from package
  - Lazy-load report and init code via dynamic imports (code splitting)

## 0.4.18

### Patch Changes

- 08d267d: Add schema analysis: extract entity-relationship data from Prisma schemas and TypeORM decorators, run 3 new schema rules (require-primary-key, require-timestamps, require-cascade-rule), render an interactive ER diagram in the HTML report, and surface schema diagnostics in the CLI and LSP. Includes @@id composite primary key support, self-relation classification fix, and backward-compatible RuleContext type alias.

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
