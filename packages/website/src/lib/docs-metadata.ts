import type { Metadata } from "next";

export const docsMetadata: Record<string, Metadata> = {
	"/docs": {
		title: "What is nestjs-doctor?",
		description:
			"Diagnostic CLI tool that scans NestJS codebases and produces a health score across security, correctness, architecture, performance, and schema.",
	},
	"/docs/setup": {
		title: "Setup Guide",
		description:
			"Install and run nestjs-doctor. CLI usage, CI integration, HTML report generation, and Node.js API.",
	},
	"/docs/configuration": {
		title: "Configuration",
		description:
			"Configure nestjs-doctor with nestjs-doctor.config.json. Customize file patterns, enable or disable rules, and ignore specific diagnostics.",
	},
	"/docs/custom-rules": {
		title: "Custom Rules",
		description:
			"Extend nestjs-doctor with project-specific checks. Encode domain conventions, enforce team standards, or flag patterns unique to your codebase.",
	},
	"/docs/vscode-extension": {
		title: "VS Code Extension",
		description:
			"Get inline diagnostics from nestjs-doctor directly in your editor. Same 43 rules, zero friction.",
	},
	"/docs/pipeline": {
		title: "Pipeline Overview",
		description:
			"How nestjs-doctor works from CLI invocation to final output. Ten-stage pipeline covering config loading, AST parsing, rule execution, and scoring.",
	},
	"/docs/pipeline/config-loading": {
		title: "Config Loading",
		description:
			"How nestjs-doctor resolves and merges user configuration with built-in defaults at the start of each scan.",
	},
	"/docs/pipeline/project-detection": {
		title: "Project Detection",
		description:
			"How nestjs-doctor detects monorepos vs single projects and extracts metadata like NestJS version, ORM, and HTTP framework.",
	},
	"/docs/pipeline/file-collection": {
		title: "File Collection",
		description:
			"How nestjs-doctor globs the project directory for TypeScript files matching include and exclude patterns from the config.",
	},
	"/docs/pipeline/ast-parsing": {
		title: "AST Parsing",
		description:
			"How nestjs-doctor creates a ts-morph Project instance and loads collected files for TypeScript AST analysis.",
	},
	"/docs/pipeline/module-graph": {
		title: "Module Graph",
		description:
			"How nestjs-doctor builds a directed dependency graph of NestJS @Module() classes and their relationships.",
	},
	"/docs/pipeline/provider-resolution": {
		title: "Provider Resolution",
		description:
			"How nestjs-doctor extracts dependency information from @Injectable() classes including constructor dependencies and method counts.",
	},
	"/docs/pipeline/rule-execution": {
		title: "Rule Execution",
		description:
			"How nestjs-doctor runs all enabled rules against the project AST and collects diagnostics. The core analysis step.",
	},
	"/docs/pipeline/diagnostic-filtering": {
		title: "Diagnostic Filtering",
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
		title: "Rules Overview",
		description:
			"43 built-in rules across five categories: security, correctness, architecture, performance, and schema.",
	},
	"/docs/rules/security": {
		title: "Security Rules",
		description:
			"9 rules that detect security vulnerabilities and unsafe patterns in NestJS applications.",
	},
	"/docs/rules/correctness": {
		title: "Correctness Rules",
		description:
			"14 rules that detect bugs, missing decorators, and runtime errors in NestJS applications.",
	},
	"/docs/rules/architecture": {
		title: "Architecture Rules",
		description:
			"10 rules that enforce clean layering, dependency injection patterns, and module boundaries.",
	},
	"/docs/rules/performance": {
		title: "Performance Rules",
		description:
			"7 rules that detect performance anti-patterns and dead code in NestJS applications.",
	},
	"/docs/rules/schema": {
		title: "Schema Rules",
		description:
			"3 rules that validate database schema design — primary keys, timestamps, and relation configuration.",
	},
};
