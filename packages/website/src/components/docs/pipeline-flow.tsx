"use client";

import {
	type Edge,
	Handle,
	type Node,
	type NodeProps,
	Position,
	ReactFlow,
} from "@xyflow/react";
import Link from "next/link";
import { type CSSProperties, memo } from "react";

interface PipelineNodeData {
	href?: string;
	label: string;
	source?: string;
	[key: string]: unknown;
}

const nodeStyle: CSSProperties = {
	background: "#161616",
	border: "1px solid rgba(255,255,255,0.15)",
	borderRadius: 8,
	padding: "10px 18px",
	textAlign: "center" as const,
	width: 200,
	transition: "border-color 0.15s ease",
};

const PipelineNode = memo(({ data }: NodeProps<Node<PipelineNodeData>>) => {
	const content = (
		<div className="pipeline-node" style={nodeStyle}>
			<Handle
				position={Position.Top}
				style={{ visibility: "hidden" }}
				type="target"
			/>
			<div
				style={{
					color: "#fff",
					fontSize: 14,
					fontFamily: "var(--font-mono), ui-monospace, monospace",
					fontWeight: 500,
				}}
			>
				{data.label}
			</div>
			<div
				style={{
					color: "#999",
					fontSize: 11,
					fontFamily: "var(--font-mono), ui-monospace, monospace",
					marginTop: 2,
				}}
			>
				{data.source}
			</div>
			<Handle
				position={Position.Bottom}
				style={{ visibility: "hidden" }}
				type="source"
			/>
		</div>
	);

	if (data.href) {
		return (
			<Link href={data.href} style={{ textDecoration: "none" }}>
				{content}
			</Link>
		);
	}

	return content;
});

PipelineNode.displayName = "PipelineNode";

const nodeTypes = { pipeline: PipelineNode };

const NODE_WIDTH = 200;
const CENTER_X = 300;
const PARALLEL_OFFSET = 175;

const nodes: Node<PipelineNodeData>[] = [
	{
		id: "cli-entry",
		type: "pipeline",
		position: { x: CENTER_X - NODE_WIDTH / 2, y: 0 },
		data: { label: "CLI Entry", source: "src/cli/index.ts" },
	},
	{
		id: "load-config",
		type: "pipeline",
		position: { x: CENTER_X - NODE_WIDTH / 2, y: 100 },
		data: {
			label: "Load Config",
			source: "src/engine/config/loader.ts",
			href: "/docs/pipeline/config-loading",
		},
	},
	{
		id: "parallel-group",
		type: "group",
		position: { x: CENTER_X - PARALLEL_OFFSET - NODE_WIDTH / 2 - 20, y: 185 },
		data: { label: "Promise.all" },
		className: "parallel-group",
		style: {
			width: PARALLEL_OFFSET * 2 + NODE_WIDTH + 40,
			height: 90,
			background: "transparent",
			border: "1px dashed rgba(255,255,255,0.2)",
			borderRadius: 12,
		},
	},
	{
		id: "detect-project",
		type: "pipeline",
		position: { x: 20, y: 20 },
		parentId: "parallel-group",
		extent: "parent" as const,
		data: {
			label: "Detect Project",
			source: "src/engine/project-detector.ts",
			href: "/docs/pipeline/project-detection",
		},
	},
	{
		id: "collect-files",
		type: "pipeline",
		position: { x: PARALLEL_OFFSET * 2 + 20, y: 20 },
		parentId: "parallel-group",
		extent: "parent" as const,
		data: {
			label: "Collect Files",
			source: "src/engine/file-collector.ts",
			href: "/docs/pipeline/file-collection",
		},
	},
	{
		id: "parse-ast",
		type: "pipeline",
		position: { x: CENTER_X - NODE_WIDTH / 2, y: 320 },
		data: {
			label: "Parse AST",
			source: "src/engine/graph/ast-parser.ts",
			href: "/docs/pipeline/ast-parsing",
		},
	},
	{
		id: "module-graph",
		type: "pipeline",
		position: { x: CENTER_X - NODE_WIDTH / 2, y: 420 },
		data: {
			label: "Build Module Graph",
			source: "src/engine/graph/module-graph.ts",
			href: "/docs/pipeline/module-graph",
		},
	},
	{
		id: "resolve-providers",
		type: "pipeline",
		position: { x: CENTER_X - NODE_WIDTH / 2, y: 520 },
		data: {
			label: "Resolve Providers",
			source: "src/engine/graph/type-resolver.ts",
			href: "/docs/pipeline/provider-resolution",
		},
	},
	{
		id: "run-rules",
		type: "pipeline",
		position: { x: CENTER_X - NODE_WIDTH / 2, y: 620 },
		data: {
			label: "Run Rules",
			source: "src/engine/rule-runner.ts",
			href: "/docs/pipeline/rule-execution",
		},
	},
	{
		id: "filter-diag",
		type: "pipeline",
		position: { x: CENTER_X - NODE_WIDTH / 2, y: 720 },
		data: {
			label: "Filter Diagnostics",
			source: "src/engine/filter-diagnostics.ts",
			href: "/docs/pipeline/diagnostic-filtering",
		},
	},
	{
		id: "calc-score",
		type: "pipeline",
		position: { x: CENTER_X - NODE_WIDTH / 2, y: 820 },
		data: {
			label: "Calculate Score",
			source: "src/engine/scorer/index.ts",
			href: "/docs/pipeline/scoring",
		},
	},
	{
		id: "output",
		type: "pipeline",
		position: { x: CENTER_X - NODE_WIDTH / 2, y: 920 },
		data: {
			label: "Output",
			source: "src/cli/formatters/",
			href: "/docs/pipeline/output",
		},
	},
];

const edgeDefaults = {
	type: "smoothstep" as const,
	style: { stroke: "rgba(255,255,255,0.35)", strokeWidth: 1.5 },
	markerEnd: {
		type: "arrowclosed" as const,
		color: "rgba(255,255,255,0.35)",
		width: 16,
		height: 16,
	},
};

const edges: Edge[] = [
	{ id: "e1", source: "cli-entry", target: "load-config", ...edgeDefaults },
	{
		id: "e2a",
		source: "load-config",
		target: "detect-project",
		...edgeDefaults,
	},
	{
		id: "e2b",
		source: "load-config",
		target: "collect-files",
		...edgeDefaults,
	},
	{
		id: "e3a",
		source: "detect-project",
		target: "parse-ast",
		...edgeDefaults,
	},
	{
		id: "e3b",
		source: "collect-files",
		target: "parse-ast",
		...edgeDefaults,
	},
	{ id: "e4", source: "parse-ast", target: "module-graph", ...edgeDefaults },
	{
		id: "e5",
		source: "module-graph",
		target: "resolve-providers",
		...edgeDefaults,
	},
	{
		id: "e6",
		source: "resolve-providers",
		target: "run-rules",
		...edgeDefaults,
	},
	{ id: "e7", source: "run-rules", target: "filter-diag", ...edgeDefaults },
	{ id: "e8", source: "filter-diag", target: "calc-score", ...edgeDefaults },
	{ id: "e9", source: "calc-score", target: "output", ...edgeDefaults },
];

const proOptions = { hideAttribution: true };

export const PipelineFlow = () => (
	<div className="mb-6" style={{ width: "100%", height: 1060 }}>
		<ReactFlow
			edges={edges}
			elementsSelectable={false}
			fitView
			nodes={nodes}
			nodesConnectable={false}
			nodesDraggable={false}
			nodeTypes={nodeTypes}
			panOnDrag={false}
			preventScrolling={false}
			proOptions={proOptions}
			style={{ background: "transparent" }}
			zoomOnDoubleClick={false}
			zoomOnPinch={false}
			zoomOnScroll={false}
		/>
	</div>
);
