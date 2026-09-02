import type { Metadata } from "next";
import { type PageCopy, pageMetadata } from "@/lib/site";

export const DOCS_PAGES: Record<string, PageCopy> = {
	"/docs": {
		title: "What is nestjs-doctor?",
		description:
			"The deterministic NestJS devtool that catches AI mistakes. Static analysis that scans a NestJS codebase and produces a health score across security, correctness, architecture, performance, and schema.",
	},
	"/docs/nest-devtools-alternative": {
		title: "NestJS Doctor vs Nest Devtools",
		description:
			"Both draw a NestJS module graph. Nest Devtools boots your app; nestjs-doctor reads your source, adds 52 rules, an ER diagram and a CI gate, and is MIT licensed.",
	},
	"/docs/setup": {
		title: "Quickstart",
		description:
			"Scan a NestJS project in one command, then read the score, the diagnostics, and the exit code.",
	},
	"/docs/report": {
		title: "The report",
		description:
			"Generate the interactive HTML report: score summary, diagnostics with a code viewer, module graph, endpoint traces, schema ER diagram, and the boot trace.",
	},
	"/docs/report/module-graph": {
		title: "Module graph",
		description:
			"Visualize your NestJS module dependency graph: cycles in red, blast radius per module, @Global() reach, and cross-package imports in a monorepo.",
	},
	"/docs/report/boot-trace": {
		title: "Boot trace",
		description:
			"Overlay real per-class construction times on the report's module graph: the main.ts change that captures a NestJS boot, and how to read the result.",
	},
	"/docs/report/share": {
		title: "Sharing a report",
		description:
			"Write part of a scan as JSON: pick the score, a findings category, the endpoints, the schema or the module graph, from the CLI, the post-scan menu, or the HTML report.",
	},
	"/docs/coding-agents": {
		title: "Coding agents",
		description:
			"Install the nestjs-doctor skill for Claude Code, Cursor, Codex, OpenCode, Windsurf, Gemini CLI, and other agents so they scan and fix as they work.",
	},
	"/docs/ci/gates": {
		title: "Failing the build",
		description:
			"Gate a pull request on nestjs-doctor: blocking by severity, min-score on the whole project, exit codes, and which findings count.",
	},
	"/docs/ci/other-providers": {
		title: "Other CI providers",
		description:
			"Run nestjs-doctor outside GitHub Actions: GitLab Code Quality, SARIF for any code-scanning backend, markdown output, and pre-commit hooks.",
	},
	"/docs/reference/cli": {
		title: "CLI reference",
		description:
			"Every nestjs-doctor command and flag: scanning, scope, output formats, gates, the report, and exit codes.",
	},
	"/docs/reference/node-api": {
		title: "Node API",
		description:
			"Call nestjs-doctor from Node: diagnose, the incremental scanning API for editors, and the AnalysisContext it exposes to rules.",
	},
	"/docs/configuration": {
		title: "Configuration",
		description:
			"Configure nestjs-doctor with nestjs-doctor.config.json. Customize file patterns, enable or disable rules, ignore specific diagnostics, and suppress rules inline with comments.",
	},
	"/docs/custom-rules": {
		title: "Custom rule configuration",
		description:
			"Wire custom rules into a nestjs-doctor scan: customRulesDir, how rule files load, custom/ id prefixing, and the surfaces a rule's findings appear on.",
	},
	"/docs/ci": {
		title: "GitHub Actions setup",
		description:
			"Run nestjs-doctor in CI. Official GitHub Action with sticky pull request comments, inline review comments, and commit statuses; diff-scoped scanning that reports only what a change introduced; SARIF and GitLab Code Quality output.",
	},
	"/docs/vscode-extension": {
		title: "VS Code extension",
		description:
			"Run the same 52 rules as the CLI inline in your editor, with diagnostics in the Problems panel.",
	},
	"/docs/language-server": {
		title: "Language server",
		description:
			"Run the same rules as the CLI in any editor that speaks LSP: Neovim, Helix, Emacs, or any other client. Start nestjs-doctor-lsp over stdio and get diagnostics on save.",
	},
	"/docs/pipeline": {
		title: "Pipeline overview",
		description:
			"How nestjs-doctor works from CLI invocation to final output. Ten-stage pipeline covering config loading, AST parsing, rule execution, and scoring.",
	},
	"/docs/pipeline/config-loading": {
		title: "Config loading",
		description:
			"How nestjs-doctor resolves and merges user configuration with built-in defaults at the start of each scan.",
	},
	"/docs/pipeline/project-detection": {
		title: "Project detection",
		description:
			"How nestjs-doctor detects monorepos vs single projects and extracts metadata like NestJS version, ORM, and HTTP framework.",
	},
	"/docs/pipeline/file-collection": {
		title: "File collection",
		description:
			"How nestjs-doctor globs the project directory for TypeScript files matching include and exclude patterns from the config.",
	},
	"/docs/pipeline/ast-parsing": {
		title: "AST parsing",
		description:
			"How nestjs-doctor creates a ts-morph Project instance and loads collected files for TypeScript AST analysis.",
	},
	"/docs/pipeline/module-graph": {
		title: "Module graph building",
		description:
			"How nestjs-doctor builds a directed dependency graph of NestJS @Module() classes and their relationships.",
	},
	"/docs/pipeline/provider-resolution": {
		title: "Provider resolution",
		description:
			"How nestjs-doctor extracts dependency information from @Injectable() classes including constructor dependencies and method counts.",
	},
	"/docs/pipeline/rule-execution": {
		title: "Rule execution",
		description:
			"How nestjs-doctor runs all enabled rules against the project AST and collects diagnostics. The stage that produces every diagnostic.",
	},
	"/docs/pipeline/diagnostic-filtering": {
		title: "Diagnostic filtering",
		description:
			"How nestjs-doctor removes diagnostics matching the user's ignore configuration after all rules have run.",
	},
	"/docs/pipeline/scoring": {
		title: "Scoring",
		description:
			"How nestjs-doctor converts filtered diagnostics into a 0-100 health score with quality labels.",
	},
	"/docs/pipeline/output": {
		title: "Output",
		description:
			"How nestjs-doctor renders final scan results in console, JSON, or HTML format depending on the use case.",
	},
	"/docs/rules": {
		title: "Rules",
		description:
			"52 built-in rules across five categories: security, correctness, architecture, performance, and schema.",
	},
	"/docs/rules/security": {
		title: "Security rules",
		description:
			"12 rules that detect security vulnerabilities, unsafe patterns, and dependencies with a published advisory.",
	},
	"/docs/rules/correctness": {
		title: "Correctness rules",
		description:
			"20 rules that detect bugs, missing decorators, and runtime errors in NestJS applications.",
	},
	"/docs/rules/architecture": {
		title: "Architecture rules",
		description:
			"10 rules that enforce clean layering, dependency injection patterns, and module boundaries.",
	},
	"/docs/rules/performance": {
		title: "Performance rules",
		description:
			"7 rules that detect performance anti-patterns and dead code in NestJS applications.",
	},
	"/docs/rules/schema": {
		title: "Schema rules",
		description:
			"3 rules that validate database schema design: primary keys, timestamps, and relation configuration.",
	},
	"/docs/rules/custom": {
		title: "Custom rules",
		description:
			"Write project-specific nestjs-doctor rules: the rule shape, file and project scopes, the check function's context, and the report's Rule Lab.",
	},
};

export const docsMetadata: Record<string, Metadata> = Object.fromEntries(
	Object.entries(DOCS_PAGES).map(([path, page]) => [
		path,
		pageMetadata(path, page),
	])
);
