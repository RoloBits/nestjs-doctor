# Worked examples

Two rules end to end, one of each scope.

## Complete Example: File Rule

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

**Pattern**: iterate classes -> filter by decorator -> check for second decorator -> report absence.

## Complete Example: Project Rule

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

**Pattern**: iterate providers map -> check numeric thresholds -> report per-violation (not combined).
