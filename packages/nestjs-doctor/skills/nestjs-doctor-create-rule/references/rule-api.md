# Rule API

The shape a rule object has to take, and what the engine rejects.

## Type Reference

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

## Validation Requirements

The custom rule loader enforces these constraints. A rule that fails validation is silently skipped with a warning:

1. Must be a named export (e.g., `export const myRule = { ... }`)
2. `meta` must be an object with all required fields: `id`, `description`, `help`, `category`, `severity`
3. `category` must be one of: `"security"`, `"performance"`, `"correctness"`, `"architecture"`
4. `severity` must be one of: `"error"`, `"warning"`, `"info"`
5. `scope` (if provided) must be `"file"` or `"project"`
6. `check` must be a function
7. The rule ID will be automatically prefixed with `custom/` — do NOT include the prefix yourself

## Multiple Rules per File

You can export multiple rules from a single file:

```typescript
export const ruleOne = { meta: { id: "rule-one", ... }, check(ctx) { ... } };
export const ruleTwo = { meta: { id: "rule-two", ... }, check(ctx) { ... } };
```

Now write the actual rule file based on what the user wants to detect. Use the examples and patterns above as building blocks.
