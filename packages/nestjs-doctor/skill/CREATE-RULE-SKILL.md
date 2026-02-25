---
description: Create a custom nestjs-doctor rule that detects a specific pattern or anti-pattern in a NestJS codebase
disable-model-invocation: true
allowed-tools: Bash, Read, Edit, Glob, Grep, Write
---

# /nestjs-doctor-create-rule — Generate a Custom nestjs-doctor Rule

> v0.4.10

Create a custom rule for nestjs-doctor that detects a specific pattern or anti-pattern in the user's NestJS codebase.

## Capabilities and Limitations

Before generating any rule, use this reference to determine what is possible.

### What file rules can do

File rules receive a single ts-morph `SourceFile` at a time. Available APIs:

- **Classes**: `getClasses()`, `getName()`, `getDecorator("Name")`, `getDecorators()`, `getImplements()`, `getConstructors()`, `getProperties()`, `getMethods()`
- **Constructor params**: `ctor.getParameters()` → `param.getName()`, `param.getType().getText()`, `param.isReadonly()`, `param.getTypeNode()?.getText()`
- **Methods**: `getMethods()` → `method.getName()`, `method.getDecorators()`, `method.getReturnType()`, `method.getStartLineNumber()`
- **Imports**: `getImportDeclarations()` → `imp.getModuleSpecifierValue()`, `imp.getNamedImports()`
- **AST traversal**: `getDescendantsOfKind(SyntaxKind.X)` — find any AST node type
- **Position**: `node.getStartLineNumber()`, `node.getStart()`, `node.getStartLinePos()`, `getText()`
- **External**: Can `require()` npm packages and Node.js builtins (e.g., `fs`)
- **Source lines**: The runner automatically attaches ±5 lines of context to each diagnostic

**Type info caveat**: `param.getType().getText()` often returns `import("/path").ClassName` because the project uses `skipFileDependencyResolution`. Use `param.getTypeNode()?.getText()` for the literal annotation text, or regex-extract the class name from the type string.

### What project rules can do (everything above, plus)

Project rules receive the entire `Project` and cross-file analysis data:

- `context.project.getSourceFile(path)` — access any file's AST
- `context.files` — array of all file paths being analyzed
- `context.moduleGraph.modules` — `Map<string, ModuleNode>` where each `ModuleNode` has: `{ name, filePath, classDeclaration, imports[], exports[], providers[], controllers[] }`
- `context.moduleGraph.edges` — `Map<string, Set<string>>` (module name → set of imported module names)
- `context.moduleGraph.providerToModule` — `Map<string, ModuleNode>` (provider class name → owning module)
- `context.providers` — `Map<string, ProviderInfo>` where each `ProviderInfo` has: `{ name, filePath, classDeclaration, dependencies: string[], publicMethodCount }`
- `context.config` — full `NestjsDoctorConfig` object

**Caveats**:
- `providers` only includes `@Injectable()` classes — value/factory/alias providers are not indexed
- Project rule diagnostics do NOT get automatic `sourceLines` — include them yourself if needed

### Hard limits (CRITICAL)

- **`check()` MUST be synchronous** — the runner calls `rule.check(context)` without `await`. An `async check()` silently returns a Promise that is discarded. Zero diagnostics, zero errors. This is the #1 silent failure mode.
- **Cannot modify source files** — mutations corrupt the shared AST used by all rules
- **File rules cannot access other files**, the module graph, or providers
- **Only `.ts` rule files are loaded** — `.js`, `.mjs`, `.cjs` are ignored by the custom rule loader
- **Cross-file type resolution is often incomplete** — prefer `param.getTypeNode()?.getText()` over `param.getType().getText()` for reliable results

## Step 1: Assess Feasibility

Before asking for details, evaluate the user's request against the capabilities above.

1. **Determine detection scope**: Single-file pattern → file rule. Cross-file analysis → project rule.
2. **Map the core operation to available APIs**. Ask yourself: can ts-morph or the module graph answer this question?

   | Request | Feasible? | Why |
   |---------|-----------|-----|
   | "Check that every @Controller has @ApiTags()" | YES | `cls.getDecorator("Controller")` + `cls.getDecorator("ApiTags")` |
   | "Check service X is only used in module Y" | YES | `moduleGraph.providerToModule.get("X")` |
   | "Detect providers with too many dependencies" | YES | `provider.dependencies.length` threshold check |
   | "Ban a specific npm import" | YES | `imp.getModuleSpecifierValue() === "banned-pkg"` |
   | "Check runtime types match" | NO | Static analysis only — no runtime access |
   | "Check database query results" | NO | No runtime or I/O during analysis |
   | "Check code is formatted" | NO | Use a linter/formatter instead |
   | "Check that an async handler awaits a call" | PARTIAL | Can detect `async` keyword and check for `AwaitExpression` nodes, but cannot trace all control-flow paths |

3. **Check for the async pitfall** — if the detection logic needs to read files from disk asynchronously, make HTTP calls, or do any I/O that requires `await`, the rule CANNOT work because `check()` must be synchronous. Synchronous `fs.readFileSync()` or `fs.existsSync()` is fine.

4. **Report assessment** to the user:
   - **FEASIBLE** — proceed to Step 2
   - **PARTIALLY FEASIBLE** — explain what can be detected and what gap remains, let user decide
   - **NOT FEASIBLE** — explain why, suggest an alternative tool or approach

## Step 2: Understand the Request

Ask the user what they want to detect. Determine:

- **Pattern to detect**: What code pattern is bad (or required)?
- **Scope**: Does the rule check individual files (`file`) or need cross-file analysis (`project`)?
- **Category**: `security`, `correctness`, `architecture`, or `performance`
- **Severity**: `error`, `warning`, or `info`
- **Rule ID**: A short kebab-case name (e.g., `require-logger-in-services`)

If the user is unsure, see the **Suggestions** section at the bottom for common rule ideas.

## Step 3: Check Config

Find the existing nestjs-doctor configuration. Check these locations in order:

```!
cat nestjs-doctor.config.json 2>/dev/null || cat .nestjs-doctor.json 2>/dev/null || node -e "const p=require('./package.json'); if(p['nestjs-doctor']) console.log(JSON.stringify(p['nestjs-doctor'],null,2)); else console.log('NO_CONFIG')"
```

Note whether `customRulesDir` is already set. If it is, use that directory. If not, default to `./nestjs-doctor-rules`.

## Step 4: Create Rules Directory

Create the custom rules directory if it doesn't exist:

```!
mkdir -p <customRulesDir>
```

## Step 5: Generate the Rule

Write a `.ts` file to the custom rules directory. The filename should match the rule ID (e.g., `require-logger-in-services.ts`).

### Type Reference

The rule file must export one or more objects matching these interfaces. You do NOT need to import anything — the types are for your reference only. The rule is loaded via `jiti` so plain TypeScript works out of the box.

```typescript
// --- Severity and Category (use string literals) ---
type Severity = "error" | "warning" | "info";
type Category = "security" | "performance" | "correctness" | "architecture";

// --- Rule metadata (all fields required) ---
interface RuleMeta {
  id: string;           // kebab-case, e.g. "require-logger-in-services"
  description: string;  // short one-liner
  help: string;         // actionable fix suggestion
  severity: Severity;
  category: Category;
  scope?: "file" | "project";  // defaults to "file" if omitted
}

// --- Diagnostic report fields ---
// Call context.report() with these fields:
interface ReportPayload {
  filePath: string;   // absolute or relative path to the offending file
  message: string;    // what's wrong
  help: string;       // how to fix it
  line: number;       // 1-based line number
  column: number;     // 1-based column number
}

// --- File-scoped rule ---
// Receives one source file at a time via ts-morph.
interface Rule {
  meta: RuleMeta;
  check(context: {
    sourceFile: import("ts-morph").SourceFile;
    filePath: string;
    report(diagnostic: ReportPayload): void;
  }): void;
}

// --- Project-scoped rule ---
// Receives the entire ts-morph Project and module graph.
interface ProjectRule {
  meta: RuleMeta & { scope: "project" };
  check(context: {
    project: import("ts-morph").Project;
    files: string[];
    config: Record<string, unknown>;
    moduleGraph: {
      modules: Map<string, { name: string; filePath: string; classDeclaration: any; imports: string[]; providers: string[]; controllers: string[]; exports: string[] }>;
      edges: Map<string, Set<string>>;
      providerToModule: Map<string, { name: string; filePath: string; classDeclaration: any }>;
    };
    providers: Map<string, { name: string; filePath: string; classDeclaration: any; dependencies: string[]; publicMethodCount: number }>;
    report(diagnostic: ReportPayload): void;
  }): void;
}
```

### Validation Requirements

The custom rule loader enforces these constraints. A rule that fails validation is silently skipped with a warning:

1. Must be a named export (e.g., `export const myRule = { ... }`)
2. `meta` must be an object with all required fields: `id`, `description`, `help`, `category`, `severity`
3. `category` must be one of: `"security"`, `"performance"`, `"correctness"`, `"architecture"`
4. `severity` must be one of: `"error"`, `"warning"`, `"info"`
5. `scope` (if provided) must be `"file"` or `"project"`
6. `check` must be a function
7. The rule ID will be automatically prefixed with `custom/` — do NOT include the prefix yourself

### Complete Example: File Rule

**`require-api-tags-on-controllers`** — checks that every `@Controller()` class has an `@ApiTags()` decorator for Swagger documentation.

Demonstrates: decorator presence check, filtering by `@Controller()`, class-level reporting.

```typescript
// nestjs-doctor-rules/require-api-tags-on-controllers.ts

export const requireApiTagsOnControllers = {
  meta: {
    id: "require-api-tags-on-controllers",
    description:
      "Every @Controller() class must have an @ApiTags() decorator for Swagger documentation",
    help: "Add @ApiTags('resource-name') from @nestjs/swagger above the @Controller() decorator.",
    severity: "warning" as const,
    category: "architecture" as const,
  },
  check(context: { sourceFile: any; filePath: string; report: Function }) {
    for (const cls of context.sourceFile.getClasses()) {
      // Only check classes that are controllers
      if (!cls.getDecorator("Controller")) continue;

      // Skip if @ApiTags is already present
      if (cls.getDecorator("ApiTags")) continue;

      const className = cls.getName() ?? "<anonymous>";
      context.report({
        filePath: context.filePath,
        message: `Controller '${className}' is missing @ApiTags(). All controllers must be documented in Swagger.`,
        help: "Add @ApiTags('your-resource') from @nestjs/swagger above the class declaration.",
        line: cls.getStartLineNumber(),
        column: 1,
      });
    }
  },
};
```

**Pattern**: iterate classes → filter by decorator → check for second decorator → report absence.

### Complete Example: Project Rule

**`no-god-services`** — flags services with too many constructor dependencies or public methods.

Demonstrates: iterating `context.providers`, reading `dependencies.length` and `publicMethodCount`, using `classDeclaration.getStartLineNumber()`, configurable thresholds.

```typescript
// nestjs-doctor-rules/no-god-services.ts

const MAX_DEPENDENCIES = 8;
const MAX_PUBLIC_METHODS = 15;

export const noGodServices = {
  meta: {
    id: "no-god-services",
    description:
      "Services with too many dependencies or public methods are doing too much",
    help: "Split the service into smaller, focused services following the Single Responsibility Principle.",
    severity: "warning" as const,
    category: "architecture" as const,
    scope: "project" as const,
  },
  check(context: {
    providers: Map<string, any>;
    report: Function;
  }) {
    for (const [name, provider] of context.providers) {
      const depCount = provider.dependencies.length;
      const methodCount = provider.publicMethodCount;

      if (depCount > MAX_DEPENDENCIES) {
        context.report({
          filePath: provider.filePath,
          message: `Service '${name}' has ${depCount} dependencies (max ${MAX_DEPENDENCIES}). Consider splitting.`,
          help: "Extract related dependencies and methods into separate, focused services.",
          line: provider.classDeclaration.getStartLineNumber(),
          column: 1,
        });
      }

      if (methodCount > MAX_PUBLIC_METHODS) {
        context.report({
          filePath: provider.filePath,
          message: `Service '${name}' exposes ${methodCount} public methods (max ${MAX_PUBLIC_METHODS}).`,
          help: "Group related methods into a dedicated service to reduce surface area.",
          line: provider.classDeclaration.getStartLineNumber(),
          column: 1,
        });
      }
    }
  },
};
```

**Pattern**: iterate providers map → check numeric thresholds → report per-violation (not combined).

### Common ts-morph Patterns

Use these patterns inside the `check` function:

```typescript
// Iterate over all classes in a file
for (const cls of context.sourceFile.getClasses()) {
  const className = cls.getName() ?? "<anonymous>";

  // Check for a decorator
  const hasInjectable = cls.getDecorator("Injectable") !== undefined;

  // Check if class implements an interface
  const implementsOnModuleInit = cls.getImplements()
    .some(i => i.getText() === "OnModuleInit");

  // Get constructor parameters (injected dependencies)
  const ctor = cls.getConstructors()[0];
  if (ctor) {
    for (const param of ctor.getParameters()) {
      const paramType = param.getType().getText();          // may include import() path
      const annotationType = param.getTypeNode()?.getText(); // literal annotation text
    }
  }

  // Iterate methods and check for HTTP handler decorators
  const httpDecorators = new Set(["Get", "Post", "Put", "Patch", "Delete", "Head", "Options", "All"]);
  for (const method of cls.getMethods()) {
    const isHandler = method.getDecorators().some(d => httpDecorators.has(d.getName()));
    const line = method.getStartLineNumber();
  }
}

// Search for specific imports
for (const imp of context.sourceFile.getImportDeclarations()) {
  const moduleSpecifier = imp.getModuleSpecifierValue();
}

// Get all call expressions in the file
const { SyntaxKind } = require("ts-morph");
const calls = context.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
```

### Multiple Rules per File

You can export multiple rules from a single file:

```typescript
export const ruleOne = { meta: { id: "rule-one", ... }, check(ctx) { ... } };
export const ruleTwo = { meta: { id: "rule-two", ... }, check(ctx) { ... } };
```

Now write the actual rule file based on what the user wants to detect. Use the examples and patterns above as building blocks.

## Step 6: Update Config

If `customRulesDir` is not already set in the project config, add it.

**If `nestjs-doctor.config.json` or `.nestjs-doctor.json` exists**, read it and add the `customRulesDir` field:

```!
# Read existing config, add customRulesDir, write back
node -e "
const fs = require('fs');
const f = fs.existsSync('nestjs-doctor.config.json') ? 'nestjs-doctor.config.json' : '.nestjs-doctor.json';
const cfg = JSON.parse(fs.readFileSync(f, 'utf-8'));
cfg.customRulesDir = '<customRulesDir>';
fs.writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
console.log('Updated ' + f);
"
```

**If config is in `package.json`**, update the `nestjs-doctor` key.

**If no config exists**, create `nestjs-doctor.config.json`:

```json
{
  "customRulesDir": "<customRulesDir>"
}
```

## Step 7: Verify

Run nestjs-doctor and check that the custom rule loads without warnings:

```!
npx nestjs-doctor $ARGUMENTS --json 2>&1
```

Check the output for:
- The custom rule appearing in diagnostics with `custom/` prefix
- No validation warnings about the rule file
- The scan completing successfully

If there are warnings, fix the rule file and re-run.

## Suggestions

If the user isn't sure what to check, suggest these common custom rules:

| Rule idea | Scope | Category | Detection logic |
|-----------|-------|----------|-----------------|
| Require a `Logger` in every service | file | correctness | `cls.getDecorator("Injectable") && !ctor.getParameters().some(p => p.getTypeNode()?.getText()?.includes("Logger"))` |
| Ban specific npm imports (e.g., `moment`) | file | performance | `imp.getModuleSpecifierValue() === "moment"` |
| Require `@ApiTags()` on all controllers | file | architecture | `cls.getDecorator("Controller") && !cls.getDecorator("ApiTags")` |
| Require `@ApiOperation()` on HTTP handlers | file | architecture | `method.getDecorators().some(d => httpDecorators.has(d.getName())) && !method.getDecorator("ApiOperation")` |
| Enforce max constructor dependencies | file | architecture | `ctor.getParameters().length > MAX` on `@Injectable()` classes |
| Ban direct DB queries outside repositories | file | architecture | Check `getDescendantsOfKind(SyntaxKind.CallExpression)` for ORM calls in non-`*Repository` classes |
| Enforce naming conventions | file | architecture | `cls.getDecorator("Injectable") && !name.endsWith("Service") && !name.endsWith("Repository")` |
| Require services have test files | project | correctness | `require("fs").existsSync(provider.filePath.replace(".ts", ".spec.ts"))` |
| Detect providers in multiple modules | project | architecture | Count each provider name across `moduleGraph.modules.values()` entries' `providers[]` — flag if > 1 |
| Require DTO validation pipes on POST/PUT | file | correctness | Check `@Post()`/`@Put()` handler params for `@Body()` + `@UsePipes(ValidationPipe)` or global pipe |
