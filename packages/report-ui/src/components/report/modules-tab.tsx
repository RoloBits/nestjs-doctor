"use client";

import dagre from "@dagrejs/dagre";
import { useMemo, useState } from "react";
import type { LayoutNode } from "@/lib/graph/module-layout";
import {
	blastRadius,
	computeLayout,
	reverseIndex,
} from "@/lib/graph/module-layout";
import type { ReportArtifact } from "@/lib/model/artifact";

function nodeLabel(name: string): string {
	const parts = name.split("/");
	return parts.at(-1) ?? name;
}

const NODE_W = 140;
const NODE_H = 40;

interface ModulesTabProps {
	artifact: ReportArtifact;
}

/** Project-clustered module graph with blast-radius selection. */
export function ModulesTab({ artifact }: ModulesTabProps) {
	const { graph } = artifact;
	const projectOf = useMemo(() => {
		const byName = new Map(graph.modules.map((m) => [m.name, m.project ?? ""]));
		return (name: string) => byName.get(name) ?? "";
	}, [graph.modules]);

	const clusters = useMemo(() => {
		const nodes: LayoutNode[] = graph.modules.map((m) => ({
			name: m.name,
			project: m.project,
			x: 0,
			y: 0,
			w: NODE_W,
			h: NODE_H,
		}));
		return computeLayout(nodes, graph.edges, dagre);
	}, [graph]);

	const index = useMemo(() => reverseIndex(graph.edges), [graph.edges]);
	const [selected, setSelected] = useState<string | null>(null);
	const blast = selected ? blastRadius(selected, index, projectOf) : null;

	const byName = useMemo(() => {
		const map = new Map<string, LayoutNode>();
		for (const c of clusters) {
			for (const n of c.nodes) {
				map.set(n.name, n);
			}
		}
		return map;
	}, [clusters]);

	const visibleEdges = useMemo(
		() =>
			graph.edges
				.map((e) => ({ ...e, from: byName.get(e.from), to: byName.get(e.to) }))
				.filter(
					(e): e is { from: LayoutNode; to: LayoutNode } =>
						Boolean(e.from) && Boolean(e.to)
				),
		[graph.edges, byName]
	);

	let width = 0;
	let height = 0;
	for (const c of clusters) {
		width = Math.max(width, c.x + c.w);
		height = Math.max(height, c.y + c.h);
	}

	return (
		<section className="tab-panel">
			<div className="graph-wrap">
				<svg
					aria-label="Module graph"
					className="graph-svg"
					height={height}
					role="img"
					viewBox={`0 0 ${Math.ceil(width)} ${Math.ceil(height)}`}
					width={width}
				>
					{clusters.map((c) => (
						<g className="cluster" key={c.key}>
							<rect
								className="cluster-box"
								height={c.h}
								rx="10"
								width={c.w}
								x={c.x}
								y={c.y}
							/>
							{c.key && (
								<text className="cluster-title" x={c.x + c.innerX} y={c.y + 17}>
									{c.key}
								</text>
							)}
						</g>
					))}
					{visibleEdges.map((e) => (
						<line
							className="graph-edge"
							key={`${e.from.name}->${e.to.name}`}
							x1={e.from.x}
							x2={e.to.x}
							y1={e.from.y}
							y2={e.to.y}
						/>
					))}
					{clusters.flatMap((c) =>
						c.nodes.map((n) => (
							<foreignObject
								height={n.h}
								key={n.name}
								width={n.w}
								x={n.x - n.w / 2}
								y={n.y - n.h / 2}
							>
								<button
									className={`module-node-btn${selected === n.name ? "selected" : ""}`}
									onClick={() => setSelected(n.name)}
									title={n.name}
									type="button"
								>
									<span>{nodeLabel(n.name)}</span>
								</button>
							</foreignObject>
						))
					)}
				</svg>
				<aside className="detail-side">
					{blast && selected ? (
						<>
							<h3>{nodeLabel(selected)}</h3>
							<p>
								{blast.names.length} dependent
								{blast.names.length === 1 ? "" : "s"} across{" "}
								{blast.projectCount} project
								{blast.projectCount === 1 ? "" : "s"}
							</p>
							<ul>
								{blast.names.map((name) => (
									<li key={name}>{name}</li>
								))}
							</ul>
						</>
					) : (
						<p className="panel-note">Click a module for its blast radius.</p>
					)}
				</aside>
			</div>
			{graph.circularDeps.length > 0 && (
				<p className="warn-note">
					{graph.circularDeps.length} circular dep chain
					{graph.circularDeps.length === 1 ? "" : "s"} detected.
				</p>
			)}
		</section>
	);
}
