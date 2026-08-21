export const SKILL_TEMPLATE = `---
name: nestjs-doctor
description: Use after writing or changing NestJS code, before committing, when a nestjs-doctor check fails in CI, or when the user asks to scan, audit, review, or clean up a Nest project, or mentions circular modules, unused providers, a missing guard, an ORM leaking into a controller, or a slow boot. Runs a deterministic 50-rule scan over security, correctness, architecture, performance, and database schema, then fixes what it finds.
allowed-tools: Bash, Read, Edit, Glob, Grep, Write
---

# nestjs-doctor

> v0.0.0

50 rules over security, correctness, architecture, performance, and database
schema, scored 0-100. No network calls and no model at scan time, so the same
commit scores the same on a laptop and in CI.

## After changing NestJS code

Report only what the change introduced:

\`\`\`bash
npx nestjs-doctor@latest . --scope changed --base origin/main --verbose
\`\`\`

Fix anything new before committing.

The whole project is analysed either way. Narrowing the scope narrows the
report, never the analysis, so a change that breaks a cross-file rule is caught
even when the file it is reported against was never touched.

\`--scope changed\` needs a git repository and the base commit present in the
checkout. Without either it widens the report and says so on stderr, rather
than going quiet and looking clean.

## Auditing a whole project

\`\`\`bash
npx nestjs-doctor@latest . --verbose
\`\`\`

Work down by severity: errors, then warnings, then info. Security and
correctness weigh most in the score, performance least.

## Fixing a finding

Every diagnostic carries a rule id and a \`help\` line naming the fix. Apply it in
the smallest place that resolves it, then re-run the same command and confirm
the finding is gone and nothing new appeared.

A \`schema/*\` finding names an entity rather than a line, because those three
rules report against the model instead of a file position.

Never suppress a finding to move the number. The score is only worth something
while it reflects the code.

## When a rule is wrong for this project

Reach for the narrowest control that works, in this order:

1. One line: \`// nestjs-doctor-ignore-next-line <rule-id>\` above it.
2. One file: \`// nestjs-doctor-ignore-file <rule-id>\` at the top.
3. One rule everywhere: \`"rules": { "<rule-id>": false }\` in
   \`nestjs-doctor.config.json\`.
4. A whole category: \`"categories": { "performance": false }\`.

Config lives in \`nestjs-doctor.config.json\`, \`.nestjs-doctor.json\`, or a
\`"nestjs-doctor"\` key in \`package.json\`. The loader reads JSON only and uses
whichever it finds first, whole.

There is no severity override. \`severity\` is declared in the config type and no
engine code reads it, so setting it changes nothing.

## Machine-readable output

\`\`\`bash
npx nestjs-doctor@latest . --json
\`\`\`

\`--json\`, \`--score\`, and \`--format sarif|gitlab|markdown\` default \`--blocking\` to
\`none\`, so they report without failing. The console report and \`--format github\`
default to \`error\`. Pass \`--blocking\` explicitly whenever the exit code matters.

Two warnings are suppressed entirely in those modes rather than sent to stderr:
a custom rule that failed to load, and a run below \`--min-score\`. Under \`--json\`
a min-score failure exits 1 with no message on either stream.

## Continuous integration

\`\`\`bash
npx nestjs-doctor@latest ci install
\`\`\`

Writes \`.github/workflows/nestjs-doctor.yml\`, which reviews each pull request
against its base branch. It comments and sets a status but never fails until
\`blocking\` or \`min-score\` is set. Only \`pull_request\` events are gated; every
other event scans the whole project and exits 0.

## A slow boot

Construction times need a real boot, which a scan never performs. Use the
\`nestjs-boot-trace\` skill.

## Flags

| Flag | Purpose |
| ---- | ------- |
| \`--scope changed\` | Report only what the change introduced |
| \`--base <ref>\` | The branch or commit to compare against |
| \`--staged\` | Report on the files in the git index |
| \`--verbose\` | Show the file and line behind every finding |
| \`--json\` | The full result, for tooling |
| \`--score\` | The number alone |
| \`--report\` | Write an interactive HTML report |
| \`--timings <path>\` | Overlay real boot times on the report |
| \`--min-score <n>\` | Fail below a score |
| \`--blocking <level>\` | Fail on \`error\`, \`warning\`, or never with \`none\` |
| \`--config <path>\` | Use a specific config file |
| \`--list-rules\` | Print every built-in rule and exit |
`;

export const CREATE_RULE_SKILL_TEMPLATE = `---
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

File rules receive a single ts-morph \`SourceFile\` at a time. Available APIs:

- **Classes**: \`getClasses()\`, \`getName()\`, \`getDecorator("Name")\`, \`getDecorators()\`, \`getImplements()\`, \`getConstructors()\`, \`getProperties()\`, \`getMethods()\`
- **Constructor params**: \`ctor.getParameters()\` -> \`param.getName()\`, \`param.getType().getText()\`, \`param.isReadonly()\`, \`param.getTypeNode()?.getText()\`
- **Methods**: \`getMethods()\` -> \`method.getName()\`, \`method.getDecorators()\`, \`method.getReturnType()\`, \`method.getStartLineNumber()\`
- **Imports**: \`getImportDeclarations()\` -> \`imp.getModuleSpecifierValue()\`, \`imp.getNamedImports()\`
- **AST traversal**: \`getDescendantsOfKind(SyntaxKind.X)\` — find any AST node type
- **Position**: \`node.getStartLineNumber()\`, \`node.getStart()\`, \`node.getStartLinePos()\`, \`getText()\`
- **External**: Can \`require()\` npm packages and Node.js builtins (e.g., \`fs\`)
- **Source lines**: The runner automatically attaches +-5 lines of context to each diagnostic

**Type info caveat**: \`param.getType().getText()\` often returns \`import("/path").ClassName\` because the project uses \`skipFileDependencyResolution\`. Use \`param.getTypeNode()?.getText()\` for the literal annotation text, or regex-extract the class name from the type string.

### What project rules can do (everything above, plus)

Project rules receive the entire \`Project\` and cross-file analysis data:

- \`context.project.getSourceFile(path)\` — access any file's AST
- \`context.files\` — array of all file paths being analyzed
- \`context.moduleGraph.modules\` — \`Map<string, ModuleNode>\` where each \`ModuleNode\` has: \`{ name, filePath, classDeclaration, imports[], exports[], providers[], controllers[] }\`
- \`context.moduleGraph.edges\` — \`Map<string, Set<string>>\` (module name -> set of imported module names)
- \`context.moduleGraph.providerToModule\` — \`Map<string, ModuleNode>\` (provider class name -> owning module)
- \`context.providers\` — \`Map<string, ProviderInfo>\` where each \`ProviderInfo\` has: \`{ name, filePath, classDeclaration, dependencies: string[], publicMethodCount }\`
- \`context.config\` — full \`NestjsDoctorConfig\` object

**Caveats**:
- \`providers\` only includes \`@Injectable()\` classes — value/factory/alias providers are not indexed
- Project rule diagnostics do NOT get automatic \`sourceLines\` — include them yourself if needed

### Hard limits (CRITICAL)

- **\`check()\` MUST be synchronous** — the runner calls \`rule.check(context)\` without \`await\`. An \`async check()\` silently returns a Promise that is discarded. Zero diagnostics, zero errors. This is the #1 silent failure mode.
- **Cannot modify source files** — mutations corrupt the shared AST used by all rules
- **File rules cannot access other files**, the module graph, or providers
- **Only \`.ts\` rule files are loaded** — \`.js\`, \`.mjs\`, \`.cjs\` are ignored by the custom rule loader
- **Cross-file type resolution is often incomplete** — prefer \`param.getTypeNode()?.getText()\` over \`param.getType().getText()\` for reliable results

## Step 1: Assess Feasibility

Before asking for details, evaluate the user's request against the capabilities above.

1. **Determine detection scope**: Single-file pattern -> file rule. Cross-file analysis -> project rule.
2. **Map the core operation to available APIs**. Ask yourself: can ts-morph or the module graph answer this question?

   | Request | Feasible? | Why |
   |---------|-----------|-----|
   | "Check that every @Controller has @ApiTags()" | YES | \`cls.getDecorator("Controller")\` + \`cls.getDecorator("ApiTags")\` |
   | "Check service X is only used in module Y" | YES | \`moduleGraph.providerToModule.get("X")\` |
   | "Detect providers with too many dependencies" | YES | \`provider.dependencies.length\` threshold check |
   | "Ban a specific npm import" | YES | \`imp.getModuleSpecifierValue() === "banned-pkg"\` |
   | "Check runtime types match" | NO | Static analysis only — no runtime access |
   | "Check database query results" | NO | No runtime or I/O during analysis |
   | "Check code is formatted" | NO | Use a linter/formatter instead |
   | "Check that an async handler awaits a call" | PARTIAL | Can detect \`async\` keyword and check for \`AwaitExpression\` nodes, but cannot trace all control-flow paths |

3. **Check for the async pitfall** — if the detection logic needs to read files from disk asynchronously, make HTTP calls, or do any I/O that requires \`await\`, the rule CANNOT work because \`check()\` must be synchronous. Synchronous \`fs.readFileSync()\` or \`fs.existsSync()\` is fine.

4. **Report assessment** to the user:
   - **FEASIBLE** — proceed to Step 2
   - **PARTIALLY FEASIBLE** — explain what can be detected and what gap remains, let user decide
   - **NOT FEASIBLE** — explain why, suggest an alternative tool or approach

## Step 2: Understand the Request

Ask the user what they want to detect. Determine:

- **Pattern to detect**: What code pattern is bad (or required)?
- **Scope**: Does the rule check individual files (\`file\`) or need cross-file analysis (\`project\`)?
- **Category**: \`security\`, \`correctness\`, \`architecture\`, or \`performance\`
- **Severity**: \`error\`, \`warning\`, or \`info\`
- **Rule ID**: A short kebab-case name (e.g., \`require-logger-in-services\`)

If the user is unsure, see the **Suggestions** section at the bottom for common rule ideas.

## Step 3: Check Config

Find the existing nestjs-doctor configuration. Check these locations in order:

\`\`\`!
cat nestjs-doctor.config.json 2>/dev/null || cat .nestjs-doctor.json 2>/dev/null || node -e "const p=require('./package.json'); if(p['nestjs-doctor']) console.log(JSON.stringify(p['nestjs-doctor'],null,2)); else console.log('NO_CONFIG')"
\`\`\`

Note whether \`customRulesDir\` is already set. If it is, use that directory. If not, default to \`./nestjs-doctor-rules\`.

## Step 4: Create Rules Directory

Create the custom rules directory if it doesn't exist:

\`\`\`!
mkdir -p <customRulesDir>
\`\`\`

## Step 5: Generate the Rule

Write a \`.ts\` file to the custom rules directory. The filename should match the rule ID (e.g., \`require-logger-in-services.ts\`).

### Type Reference

The rule file must export one or more objects matching these interfaces. You do NOT need to import anything — the types are for your reference only. The rule is loaded via \`jiti\` so plain TypeScript works out of the box.

\`\`\`typescript
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
\`\`\`

### Validation Requirements

The custom rule loader enforces these constraints. A rule that fails validation is silently skipped with a warning:

1. Must be a named export (e.g., \`export const myRule = { ... }\`)
2. \`meta\` must be an object with all required fields: \`id\`, \`description\`, \`help\`, \`category\`, \`severity\`
3. \`category\` must be one of: \`"security"\`, \`"performance"\`, \`"correctness"\`, \`"architecture"\`
4. \`severity\` must be one of: \`"error"\`, \`"warning"\`, \`"info"\`
5. \`scope\` (if provided) must be \`"file"\` or \`"project"\`
6. \`check\` must be a function
7. The rule ID will be automatically prefixed with \`custom/\` — do NOT include the prefix yourself

### Complete Example: File Rule

**\`require-api-tags-on-controllers\`** — checks that every \`@Controller()\` class has an \`@ApiTags()\` decorator for Swagger documentation.

Demonstrates: decorator presence check, filtering by \`@Controller()\`, class-level reporting.

\`\`\`typescript
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
        message: \`Controller '\${className}' is missing @ApiTags(). All controllers must be documented in Swagger.\`,
        help: "Add @ApiTags('your-resource') from @nestjs/swagger above the class declaration.",
        line: cls.getStartLineNumber(),
        column: 1,
      });
    }
  },
};
\`\`\`

**Pattern**: iterate classes -> filter by decorator -> check for second decorator -> report absence.

### Complete Example: Project Rule

**\`no-god-services\`** — flags services with too many constructor dependencies or public methods.

Demonstrates: iterating \`context.providers\`, reading \`dependencies.length\` and \`publicMethodCount\`, using \`classDeclaration.getStartLineNumber()\`, configurable thresholds.

\`\`\`typescript
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
          message: \`Service '\${name}' has \${depCount} dependencies (max \${MAX_DEPENDENCIES}). Consider splitting.\`,
          help: "Extract related dependencies and methods into separate, focused services.",
          line: provider.classDeclaration.getStartLineNumber(),
          column: 1,
        });
      }

      if (methodCount > MAX_PUBLIC_METHODS) {
        context.report({
          filePath: provider.filePath,
          message: \`Service '\${name}' exposes \${methodCount} public methods (max \${MAX_PUBLIC_METHODS}).\`,
          help: "Group related methods into a dedicated service to reduce surface area.",
          line: provider.classDeclaration.getStartLineNumber(),
          column: 1,
        });
      }
    }
  },
};
\`\`\`

**Pattern**: iterate providers map -> check numeric thresholds -> report per-violation (not combined).

### Common ts-morph Patterns

Use these patterns inside the \`check\` function:

\`\`\`typescript
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
\`\`\`

### Multiple Rules per File

You can export multiple rules from a single file:

\`\`\`typescript
export const ruleOne = { meta: { id: "rule-one", ... }, check(ctx) { ... } };
export const ruleTwo = { meta: { id: "rule-two", ... }, check(ctx) { ... } };
\`\`\`

Now write the actual rule file based on what the user wants to detect. Use the examples and patterns above as building blocks.

## Step 6: Update Config

If \`customRulesDir\` is not already set in the project config, add it.

**If \`nestjs-doctor.config.json\` or \`.nestjs-doctor.json\` exists**, read it and add the \`customRulesDir\` field:

\`\`\`!
# Read existing config, add customRulesDir, write back
node -e "
const fs = require('fs');
const f = fs.existsSync('nestjs-doctor.config.json') ? 'nestjs-doctor.config.json' : '.nestjs-doctor.json';
const cfg = JSON.parse(fs.readFileSync(f, 'utf-8'));
cfg.customRulesDir = '<customRulesDir>';
fs.writeFileSync(f, JSON.stringify(cfg, null, 2) + '\\n');
console.log('Updated ' + f);
"
\`\`\`

**If config is in \`package.json\`**, update the \`nestjs-doctor\` key.

**If no config exists**, create \`nestjs-doctor.config.json\`:

\`\`\`json
{
  "customRulesDir": "<customRulesDir>"
}
\`\`\`

## Step 7: Verify

Run nestjs-doctor and check that the custom rule loads without warnings:

\`\`\`!
npx nestjs-doctor $ARGUMENTS --json 2>&1
\`\`\`

Check the output for:
- The custom rule appearing in diagnostics with \`custom/\` prefix
- No validation warnings about the rule file
- The scan completing successfully

If there are warnings, fix the rule file and re-run.

## Suggestions

If the user isn't sure what to check, suggest these common custom rules:

| Rule idea | Scope | Category | Detection logic |
|-----------|-------|----------|-----------------|
| Require a \`Logger\` in every service | file | correctness | \`cls.getDecorator("Injectable") && !ctor.getParameters().some(p => p.getTypeNode()?.getText()?.includes("Logger"))\` |
| Ban specific npm imports (e.g., \`moment\`) | file | performance | \`imp.getModuleSpecifierValue() === "moment"\` |
| Require \`@ApiTags()\` on all controllers | file | architecture | \`cls.getDecorator("Controller") && !cls.getDecorator("ApiTags")\` |
| Require \`@ApiOperation()\` on HTTP handlers | file | architecture | \`method.getDecorators().some(d => httpDecorators.has(d.getName())) && !method.getDecorator("ApiOperation")\` |
| Enforce max constructor dependencies | file | architecture | \`ctor.getParameters().length > MAX\` on \`@Injectable()\` classes |
| Ban direct DB queries outside repositories | file | architecture | Check \`getDescendantsOfKind(SyntaxKind.CallExpression)\` for ORM calls in non-\`*Repository\` classes |
| Enforce naming conventions | file | architecture | \`cls.getDecorator("Injectable") && !name.endsWith("Service") && !name.endsWith("Repository")\` |
| Require services have test files | project | correctness | \`require("fs").existsSync(provider.filePath.replace(".ts", ".spec.ts"))\` |
| Detect providers in multiple modules | project | architecture | Count each provider name across \`moduleGraph.modules.values()\` entries' \`providers[]\` — flag if > 1 |
| Require DTO validation pipes on POST/PUT | file | correctness | Check \`@Post()\`/\`@Put()\` handler params for \`@Body()\` + \`@UsePipes(ValidationPipe)\` or global pipe |
`;

export const BOOT_TRACE_SKILL_TEMPLATE = `---
name: nestjs-boot-trace
description: Use when a NestJS application is slow to start, when the user asks why boot takes so long or which provider or onModuleInit is expensive, or when they mention --timings, boot timings, or the boot trace. Instruments main.ts, captures one real boot, and overlays per-class construction times on the module graph.
allowed-tools: Bash, Read, Edit, Glob, Grep, Write
---

# NestJS boot trace

> v0.0.0

A scan reads source files and never runs the application, so construction time
does not exist for it to measure. NestJS records it during a boot. This skill
captures that boot and feeds it back into the report.

It edits the user's \`src/main.ts\`. Say so before you start, and offer to revert
it at the end.

## 1. Check the version

\`\`\`bash
npm ls @nestjs/core
\`\`\`

\`@nestjs/core\` 9.3.9 or newer records \`initTime\` for every provider and
controller. Nest 11.1.4 or newer also accepts the \`instrument\` option, which
times \`onModuleInit\` and \`onApplicationBootstrap\` per class. Below 11.1.4, skip
\`hookTimings\` and \`instrument\`; class construction times still work.

## 2. Instrument the bootstrap

Add to \`src/main.ts\`, for development only:

\`\`\`ts
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { NestFactory, SerializedGraph } from "@nestjs/core";

const hookTimings: { className: string; hook: string; ms: number }[] = [];

const t0 = performance.now();
const app = await NestFactory.create(AppModule, {
  snapshot: true,
  instrument: {
    instanceDecorator(instance: any) {
      if (!instance || typeof instance !== "object") return instance;
      for (const hook of ["onModuleInit", "onApplicationBootstrap"]) {
        const original = instance[hook];
        if (typeof original !== "function") continue;
        try {
          instance[hook] = async function (...args: unknown[]) {
            const start = performance.now();
            try { return await original.apply(this, args); }
            finally { hookTimings.push({ className: this.constructor.name, hook, ms: performance.now() - start }); }
          };
        } catch {} // frozen instances stay untimed
      }
      return instance;
    },
  },
});
const createMs = performance.now() - t0;
await app.init();
const initMs = performance.now() - t0;
await app.listen(3000);
const startupMs = performance.now() - t0;

const graph = JSON.parse(app.get(SerializedGraph).toString());
Object.assign(graph, { createMs, initMs, startupMs, hookTimings });
writeFileSync("nestjs-doctor-timings.json", JSON.stringify(graph));
\`\`\`

\`snapshot: true\` is what makes NestJS record \`initTime\`. The three
\`performance.now()\` markers become the lifecycle strip. \`instanceDecorator\`
replaces a method on every instance in the application, so keep it behind an
environment check or a separate entry point rather than shipping it.

## 3. Boot once, then scan

\`\`\`bash
npx nestjs-doctor@latest . --report --timings nestjs-doctor-timings.json
\`\`\`

Relative paths resolve against the scanned directory. Without \`--report\` the
flag is ignored, with a warning. A missing file, invalid JSON, or a dump
without \`initTime\` each warn on stderr and still render the report, so check
stderr before trusting an empty trace.

## 4. Read the result

Each class's time includes waiting on its own dependencies. A shared slow
dependency therefore counts again in every class that awaits it.

Read down a cascade until the number drops. The class where it drops owns the
time. If \`UsersService\` reads 120ms and the \`SlowService\` it injects reads 119ms,
\`SlowService\` owns it.

A module node shows its slowest single class, never a sum.

## 5. Put main.ts back

Revert the instrumentation unless the user asked to keep it behind a flag.
`;
