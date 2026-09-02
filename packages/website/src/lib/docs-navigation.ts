export interface NavItem {
	href: string;
	title: string;
}

export interface NavSection {
	items: NavItem[];
	title: string;
}

export const DOCS_NAV: NavSection[] = [
	{
		title: "Overview",
		items: [
			{ title: "What is nestjs-doctor?", href: "/docs" },
			{ title: "Quickstart", href: "/docs/setup" },
			{ title: "The report", href: "/docs/report" },
			{ title: "Module graph", href: "/docs/report/module-graph" },
			{ title: "Boot trace", href: "/docs/report/boot-trace" },
			{ title: "Sharing a report", href: "/docs/report/share" },
		],
	},
	{
		title: "Getting started",
		items: [
			{ title: "Coding agents", href: "/docs/coding-agents" },
			{ title: "VS Code extension", href: "/docs/vscode-extension" },
			{ title: "Language server", href: "/docs/language-server" },
		],
	},
	{
		title: "Comparisons",
		items: [
			{
				title: "NestJS Doctor vs Nest Devtools",
				href: "/docs/nest-devtools-alternative",
			},
			{
				title: "NestJS Doctor vs ESLint plugins",
				href: "/docs/nestjs-eslint-plugins",
			},
		],
	},
	{
		title: "CI & pull requests",
		items: [
			{ title: "GitHub Actions setup", href: "/docs/ci" },
			{ title: "Failing the build", href: "/docs/ci/gates" },
			{ title: "Other CI providers", href: "/docs/ci/other-providers" },
		],
	},
	{
		title: "Configuration",
		items: [
			{ title: "Config files", href: "/docs/configuration" },
			{ title: "Custom rule configuration", href: "/docs/custom-rules" },
			{ title: "Telemetry", href: "/docs/telemetry" },
		],
	},
	{
		title: "Rules",
		items: [
			{ title: "Overview", href: "/docs/rules" },
			{ title: "Security", href: "/docs/rules/security" },
			{ title: "Correctness", href: "/docs/rules/correctness" },
			{ title: "Architecture", href: "/docs/rules/architecture" },
			{ title: "Performance", href: "/docs/rules/performance" },
			{ title: "Schema", href: "/docs/rules/schema" },
			{ title: "Custom rules", href: "/docs/rules/custom" },
		],
	},
	{
		title: "Reference",
		items: [
			{ title: "CLI", href: "/docs/reference/cli" },
			{ title: "Node API", href: "/docs/reference/node-api" },
			{ title: "Scoring", href: "/docs/pipeline/scoring" },
		],
	},
	{
		title: "Internals",
		items: [
			{ title: "Pipeline overview", href: "/docs/pipeline" },
			{ title: "Config loading", href: "/docs/pipeline/config-loading" },
			{ title: "Project detection", href: "/docs/pipeline/project-detection" },
			{ title: "File collection", href: "/docs/pipeline/file-collection" },
			{ title: "AST parsing", href: "/docs/pipeline/ast-parsing" },
			{ title: "Module graph building", href: "/docs/pipeline/module-graph" },
			{
				title: "Provider resolution",
				href: "/docs/pipeline/provider-resolution",
			},
			{ title: "Rule execution", href: "/docs/pipeline/rule-execution" },
			{
				title: "Diagnostic filtering",
				href: "/docs/pipeline/diagnostic-filtering",
			},
			{ title: "Output", href: "/docs/pipeline/output" },
		],
	},
];
