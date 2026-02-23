const STAGES = [
	{ label: "CLI Entry", source: "src/cli/index.ts" },
	{ label: "Load Config", source: "src/core/config-loader.ts" },
	{ label: "Detect Project", source: "src/core/project-detector.ts" },
	{ label: "Collect Files", source: "src/core/file-collector.ts" },
	{ label: "Parse AST", source: "src/engine/ast-parser.ts" },
	{ label: "Build Module Graph", source: "src/engine/module-graph.ts" },
	{ label: "Resolve Providers", source: "src/engine/type-resolver.ts" },
	{ label: "Run Rules", source: "src/engine/rule-runner.ts" },
	{ label: "Filter Diagnostics", source: "src/core/filter-diagnostics.ts" },
	{ label: "Calculate Score", source: "src/scorer/index.ts" },
	{ label: "Output", source: "src/cli/output/" },
];

export const PipelineFlow = () => (
	<div className="mb-6 flex flex-col items-center gap-0">
		{STAGES.map((stage, i) => (
			<div className="flex flex-col items-center" key={stage.label}>
				{i > 0 && <div className="h-5 w-px bg-white/20" />}
				<div className="rounded border border-white/10 bg-[#111] px-4 py-2 text-center text-sm">
					<div className="font-medium text-white">{stage.label}</div>
					<div className="text-neutral-500 text-xs">
						<code>{stage.source}</code>
					</div>
				</div>
			</div>
		))}
	</div>
);
