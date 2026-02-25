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
		title: "Introduction",
		items: [
			{ title: "Overview", href: "/docs" },
			{ title: "Setup", href: "/docs/setup" },
			{ title: "Configuration", href: "/docs/configuration" },
			{ title: "Custom Rules", href: "/docs/custom-rules" },
			{ title: "VS Code Extension", href: "/docs/vscode-extension" },
		],
	},
	{
		title: "Pipeline",
		items: [
			{ title: "Overview", href: "/docs/pipeline" },
			{ title: "Config Loading", href: "/docs/pipeline/config-loading" },
			{
				title: "Project Detection",
				href: "/docs/pipeline/project-detection",
			},
			{ title: "File Collection", href: "/docs/pipeline/file-collection" },
			{ title: "AST Parsing", href: "/docs/pipeline/ast-parsing" },
			{ title: "Module Graph", href: "/docs/pipeline/module-graph" },
			{
				title: "Provider Resolution",
				href: "/docs/pipeline/provider-resolution",
			},
			{ title: "Rule Execution", href: "/docs/pipeline/rule-execution" },
			{
				title: "Diagnostic Filtering",
				href: "/docs/pipeline/diagnostic-filtering",
			},
			{ title: "Scoring", href: "/docs/pipeline/scoring" },
			{ title: "Output", href: "/docs/pipeline/output" },
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
		],
	},
];
