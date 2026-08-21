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
			{ title: "Custom rules", href: "/docs/custom-rules" },
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
			{ title: "Module graph", href: "/docs/pipeline/module-graph" },
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
