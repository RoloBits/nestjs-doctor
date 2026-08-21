# Matching the AST with ts-morph

Patterns for the checks a rule usually needs.

## Common ts-morph Patterns

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
