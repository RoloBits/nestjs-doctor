# Contributing to nestjs-doctor

## Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io/)

## Setup

```bash
git clone https://github.com/RoloBits/nestjs-doctor.git
cd nestjs-doctor
pnpm install
```

## Development

```bash
pnpm build        # Build the main package
pnpm dev          # Watch mode
pnpm test         # Run tests (Vitest)
pnpm check        # Lint with Biome (via Ultracite)
pnpm fix          # Auto-fix lint + formatting
pnpm typecheck    # TypeScript type checking
pnpm knip         # Find unused files, exports, and dependencies
```

A pre-commit hook runs `pnpm check` and `pnpm test` automatically. If either fails, the commit is blocked.

## Project structure

This is a pnpm monorepo with two packages:

```
packages/
  nestjs-doctor/            # CLI tool + library (the main package)
    src/
      api/                  # Public Node API surface
      cli/                  # CLI entry point (citty), flags, console output
      common/               # Shared types (Diagnostic, Config, Result, Scope)
      engine/               # Scanner pipeline
        config/             # Config resolution and custom rule loading
        graph/              # AST parsing, module graph, providers, endpoints
        rules/definitions/  # All 50 built-in rules, grouped by category
        schema/             # ORM schema extractors (Prisma, TypeORM, ...)
        scorer/             # Scoring algorithm
      formatters/           # Markdown, SARIF, and GitLab report builders
      report/               # Interactive HTML report
    tests/
      unit/                 # Unit tests, including unit/rules/
      integration/          # End-to-end scans over tests/fixtures/
  nestjs-doctor-lsp/        # Language server, used by the VS Code extension
  nestjs-doctor-vscode/     # VS Code extension
  website/                  # Documentation site (Next.js + MDX)
action.yml                  # The official GitHub Action (composite)
scripts/action/             # Helper scripts the action invokes
```

Full pipeline docs: [nestjs.doctor/docs](https://nestjs.doctor/docs)

## Making changes

1. Create a branch off `main`.
2. Make your changes.
3. Run `pnpm check && pnpm test && pnpm build` to verify everything passes.
4. Add a changeset if your change affects the published package:

```bash
pnpm changeset add
```

This prompts you to pick a semver bump and write a short summary. The changeset file gets committed with your PR, and the release workflow handles versioning and npm publishing on merge.

5. Open a PR against `main`.

## Creating a new rule

Rules live in `packages/nestjs-doctor/src/engine/rules/definitions/`, grouped by category: `security`, `performance`, `correctness`, `architecture`, `schema`.

There are three kinds of rules:

- **File-scoped** (`Rule`) — runs once per source file. Has access to a single `SourceFile` AST.
- **Project-scoped** (`ProjectRule`) — runs once for the entire project. Has access to the full `ts-morph` Project, the module graph, and the provider map.
- **Schema-scoped** (`SchemaRule`) — runs once against the extracted ORM schema graph. Reports against an entity rather than a line.

Most rules are file-scoped. Use project-scoped only when the rule needs cross-file information (circular dependencies, unused providers, etc.).

### 1. Create the rule file

```bash
# Example: a new security rule
touch packages/nestjs-doctor/src/engine/rules/definitions/security/no-my-thing.ts
```

### 2. Implement the rule

Every rule exports an object that satisfies `Rule` (or `ProjectRule`). Here's a stripped down file scoped rule:

```typescript
import { SyntaxKind } from "ts-morph";
import type { Rule } from "../../types.js";

export const noMyThing: Rule = {
  meta: {
    id: "security/no-my-thing",
    category: "security",
    severity: "error",
    description: "Short sentence explaining what this catches",
    help: "Actionable fix suggestion for the developer.",
  },

  check(context) {
    const calls = context.sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression
    );

    for (const call of calls) {
      if (call.getExpression().getText() === "dangerousThing") {
        context.report({
          filePath: context.filePath,
          message: "dangerousThing() is unsafe because X.",
          help: this.meta.help,
          line: call.getStartLineNumber(),
          column: 1,
        });
      }
    }
  },
};
```

The `meta` fields:

| Field | What it is |
|---|---|
| `id` | `"<category>/<kebab-case-name>"` — must be unique across all rules |
| `category` | One of `"security"`, `"performance"`, `"correctness"`, `"architecture"`, `"schema"` |
| `severity` | `"error"`, `"warning"`, or `"info"` |
| `description` | One-liner shown in reports and docs |
| `help` | Fix suggestion shown alongside the diagnostic |

For the `check` function, you use [ts-morph](https://ts-morph.com/) to traverse the AST. Look at existing rules in the same category for patterns — most file-scoped rules iterate over classes, decorators, or call expressions.

For project-scoped rules, set `scope: "project"` in `meta` and implement `ProjectRule` instead. The context gives you `project`, `files`, `moduleGraph`, `providers`, and `config`.

### 3. Register the rule

Open `packages/nestjs-doctor/src/engine/rules/index.ts` and:

1. Add an import for your rule.
2. Add it to the `allRules` array under the right category comment.

```typescript
import { noMyThing } from "./definitions/security/no-my-thing.js";

export const allRules: AnyRule[] = [
  // ...
  // Security
  noMyThing,
  // ...
];
```

### 4. Write tests

Tests go in `packages/nestjs-doctor/tests/unit/rules/<category>-rules.test.ts`. Each test file has a `runRule` helper that creates an in memory TypeScript project and runs your rule against a code snippet:

```typescript
describe("no-my-thing", () => {
  it("flags dangerousThing() calls", () => {
    const diags = runRule(
      noMyThing,
      `
      const x = dangerousThing("payload");
      `
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("dangerousThing");
  });

  it("ignores safe code", () => {
    const diags = runRule(
      noMyThing,
      `
      const x = safeThing("payload");
      `
    );
    expect(diags).toHaveLength(0);
  });
});
```

Always test both directions: code that should trigger the rule and code that should not. Check for edge cases decorators that look similar, nested scopes, different import styles.

### 5. Verify

```bash
pnpm test         # All tests pass
pnpm check        # Linting passes
pnpm typecheck    # No type errors
pnpm build        # Build succeeds
```

If all of those pass, the pre-commit hook will too.

## Working on the GitHub Action

`action.yml` at the repository root is the published composite action, and its
helper scripts live in `scripts/action/`. Nothing else exercises it, so the
`Action Self-Test` workflow runs it against a fixture on every change to
`action.yml`, `scripts/action/**`, or the main package.

Two things to keep in mind when editing it:

- **Pin every nested action by commit SHA**, with the version as a trailing
  comment. Dependabot keeps those pins current.
- **The comment renderer is imported from the installed package**
  (`buildMarkdownReport`), never reimplemented in the action. That is what keeps
  the pull request comment, the job summary, and `--format markdown` identical.

Consumers pin `RoloBits/nestjs-doctor@v1`, so a change to the action's inputs or
outputs is a breaking change for them even when the npm package's version does
not move.

## Docs

For detailed documentation on the scanning pipeline, rule reference, configuration, and scoring:

[nestjs.doctor/docs](https://nestjs.doctor/docs)