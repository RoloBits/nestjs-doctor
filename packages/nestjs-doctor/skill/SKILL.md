---
description: Scan a NestJS project with nestjs-doctor, present a health report, and fix issues interactively
disable-model-invocation: true
allowed-tools: Bash, Read, Edit, Glob, Grep, Write
---

# /nestjs-doctor — NestJS Health Scanner & Fixer

> v0.4.11

Scan the NestJS codebase, present a prioritized health report, and offer to fix every issue found.

## Step 1: Scan

Run nestjs-doctor and capture the full JSON output:

```!
npx nestjs-doctor $ARGUMENTS --json 2>/dev/null
```

## Step 2: Summarize

Parse the JSON output above. Present a summary:

- **Score**: value / 100 (label)
- **Severity counts**: errors, warnings, info
- **Project info**: name, NestJS version, ORM, file count, module count

## Step 3: Report

Group diagnostics by severity (errors first, then warnings, then info). Within each severity, group by category (security > correctness > architecture > performance).

For each group show:
- Rule name and severity
- Message and help text
- Number of occurrences
- Affected file paths (with line numbers)

If there are more than 30 diagnostics, show the top 30 (prioritizing errors and warnings) and ask if the user wants to see the rest.

## Step 4: Offer to Fix

Ask the developer what they want to fix:
1. **Fix all** — apply fixes for every diagnostic
2. **Fix by category** — fix all issues in a specific category (security, correctness, architecture, performance)
3. **Fix specific rules** — fix only specific rule violations
4. **Review only** — no changes, just the report

## Step 5: Fix

For each diagnostic to fix:
1. Read the affected file
2. Apply the appropriate fix based on the rule (see Fix Guide below)
3. Explain what was changed and why

### Fix Guide by Rule

#### Security

- **no-hardcoded-secrets**: Extract the secret value to an environment variable. Import `ConfigService`, inject it, and use `this.configService.get('ENV_VAR_NAME')`. Add the env var name to `.env.example` if it exists.
- **no-eval**: Remove `eval()` or `new Function()`. Replace with safe alternatives: `JSON.parse()` for JSON, a proper expression parser for dynamic evaluation, or refactor to avoid dynamic code execution entirely.
- **no-csrf-disabled**: Remove the code that explicitly disables CSRF protection, or add a comment explaining why it's intentionally disabled with a `// nestjs-doctor-ignore` comment.
- **no-dangerous-redirects**: Validate redirect URLs against an allowlist of trusted domains. Never pass user input directly to `res.redirect()`.
- **no-weak-crypto**: Replace `createHash('md5')` or `createHash('sha1')` with `createHash('sha256')` or stronger.
- **no-exposed-env-vars**: Replace direct `process.env.X` access with `ConfigService`. Inject `ConfigService` and use `this.configService.get('X')` or `this.configService.getOrThrow('X')`.
- **no-exposed-stack-trace**: Remove `error.stack` from response objects. Log the stack trace server-side with `this.logger.error(error.stack)` and return a generic error message to the client.
- **no-synchronize-in-production**: Set `synchronize: false` in TypeORM config. Use migrations (`typeorm migration:generate` and `typeorm migration:run`) for production schema changes. If needed only for development, guard with `synchronize: process.env.NODE_ENV !== 'production'`.
- **no-raw-entity-in-response**: Create a DTO class for the response and map entity fields to it. Alternatively, use `class-transformer`'s `@Exclude()` decorator on sensitive entity fields and `@SerializeOptions()` on the controller. Never return raw ORM entities from controller methods.

#### Correctness

- **no-missing-injectable**: Add `@Injectable()` decorator to the class. Import it from `@nestjs/common`.
- **no-duplicate-routes**: Remove or rename the duplicate route. Change the HTTP method or path to make each route unique.
- **no-missing-guard-method**: Add the `canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean>` method to the guard class. Implement `CanActivate` interface.
- **no-missing-pipe-method**: Add the `transform(value: any, metadata: ArgumentMetadata)` method to the pipe class. Implement `PipeTransform` interface.
- **no-missing-filter-catch**: Add the `catch(exception: T, host: ArgumentHost)` method to the exception filter class. Implement `ExceptionFilter` interface.
- **no-missing-interceptor-method**: Add the `intercept(context: ExecutionContext, next: CallHandler): Observable<any>` method. Implement `NestInterceptor` interface.
- **require-inject-decorator**: Add `@Inject('TOKEN_NAME')` decorator to untyped constructor parameters, or add a proper type annotation.
- **prefer-readonly-injection**: Add the `readonly` modifier to constructor-injected parameters: `constructor(private readonly myService: MyService)`.
- **require-lifecycle-interface**: Add the corresponding interface to the class implements clause. E.g., if using `onModuleInit()`, add `implements OnModuleInit`.
- **no-empty-handlers**: Add implementation to the empty HTTP handler. If it's a placeholder, add a `throw new NotImplementedException()`.
- **no-async-without-await**: If the message says "returns a Promise directly", remove the `async` keyword since a `new Promise()` is already being constructed manually. Otherwise, either add an `await` expression or remove the `async` keyword.
- **no-duplicate-module-metadata**: Remove duplicate entries from `@Module()` arrays (providers, controllers, imports, exports).
- **no-missing-module-decorator**: Add `@Module({})` decorator to the class. Import it from `@nestjs/common`.
- **no-fire-and-forget-async**: Add `await` before the async call to properly handle rejections. If fire-and-forget is intentional, prefix with `void` and add a `.catch()` handler: `void this.service.sendEmail().catch(err => this.logger.error(err))`.

#### Architecture

- **no-business-logic-in-controllers**: Extract the business logic (loops, complex conditionals, data transforms) into a service method. The controller should only call the service and return the result.
- **no-repository-in-controllers**: Remove the repository injection from the controller. Create or use an existing service that wraps the repository, and inject that service instead.
- **no-orm-in-controllers**: Remove PrismaService/EntityManager/DataSource injection from the controller. Create or use an existing service that wraps the ORM operations.
- **no-circular-module-deps**: Break the circular dependency. Extract shared functionality into a separate module, use `forwardRef(() => Module)`, or restructure the module boundaries.
- **no-manual-instantiation**: Replace `new SomeService()` with constructor injection. Add the service to the module's providers and inject it via the constructor.
- **no-service-locator**: Replace `this.moduleRef.get(SomeService)` with constructor injection: add `private readonly someService: SomeService` to the constructor. If the service is truly dynamic or lazily resolved, document the reason with a comment.
- **no-orm-in-services**: Consider introducing a repository layer. Create a repository class that wraps ORM operations, and inject the repository into the service instead of the ORM directly.
- **prefer-constructor-injection**: Replace `@Inject()` property injection with constructor injection. Move the dependency to a constructor parameter.
- **require-module-boundaries**: Replace deep imports (`import { X } from '../other-module/services/x.service'`) with imports through the module's public API (barrel file / index.ts).
- **no-barrel-export-internals**: Remove repository re-exports from barrel files. Repositories should only be accessible within their own module.

#### Performance

- **no-sync-io**: Replace synchronous I/O (`readFileSync`, `writeFileSync`, etc.) with async equivalents (`readFile`, `writeFile` from `fs/promises`).
- **no-blocking-constructor**: Move async operations and loops out of the constructor into `onModuleInit()` lifecycle hook. Implement `OnModuleInit` interface.
- **no-dynamic-require**: Replace `require(variable)` with a static import or a switch/map pattern that uses static `require()` calls.
- **no-unused-providers**: Remove the unused provider from the module's providers array, or start using it. If it's intended for external consumers, add it to the module's exports.
- **no-request-scope-abuse**: Remove `Scope.REQUEST` unless the provider genuinely needs per-request state (e.g., request-scoped context like `REQUEST` object). Use `Scope.DEFAULT` (singleton) or `Scope.TRANSIENT` instead. Remember that request scope propagates to all dependents.
- **no-unused-module-exports**: Remove the unused export from the module's exports array, or start importing the module where the exported provider is needed.
- **no-orphan-modules**: Import this module in another module that needs it, or remove it if it's truly unused. If it's the root module, this can be ignored.

## Step 6: Verify

After applying fixes, suggest re-running the scan:

> Fixes applied. Run `/nestjs-doctor` again to verify the score improved.
