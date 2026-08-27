"use client";

import { useMemo } from "react";
import type { SchemaLayoutNode } from "@/lib/graph/schema-layout";
import { computeOverviewLayout } from "@/lib/graph/schema-layout";
import type { ReportArtifact } from "@/lib/model/artifact";

const BOX_W = 180;
const BOX_HEADER = 24;
const ROW_H = 16;

function keyOf(entityName: string, col: string): string {
	return `${entityName}.${col}`;
}

interface SchemaTabProps {
	artifact: ReportArtifact;
}

/** Entity-relationship overview laid out by connected component. */
export function SchemaTab({ artifact }: SchemaTabProps) {
	const [relations, nodes] = useMemo(() => {
		const relations = artifact.schema.relations.filter(
			(r) =>
				artifact.schema.entities.some((e) => e.name === r.fromEntity) &&
				artifact.schema.entities.some((e) => e.name === r.toEntity)
		);
		const nodes: SchemaLayoutNode[] = artifact.schema.entities.map((e) => ({
			name: e.name,
			x: 0,
			y: 0,
			w: BOX_W,
			h: BOX_HEADER + e.columns.length * ROW_H + 8,
		}));
		computeOverviewLayout(relations, nodes);
		return [relations, nodes] as const;
	}, [artifact.schema]);

	const byName = useMemo(() => new Map(nodes.map((n) => [n.name, n])), [nodes]);
	const entities = useMemo(
		() => new Map(artifact.schema.entities.map((e) => [e.name, e])),
		[artifact.schema.entities]
	);

	let width = 0;
	let height = 0;
	for (const n of nodes) {
		width = Math.max(width, n.x + n.w / 2);
		height = Math.max(height, n.y + n.h / 2);
	}

	const visibleRels = relations.flatMap((rel) => {
		const a = byName.get(rel.fromEntity);
		const b = byName.get(rel.toEntity);
		if (!(a && b)) {
			return [];
		}
		return [
			{
				key: `${rel.fromEntity}->${rel.toEntity}`,
				x1: a.x + a.w / 2,
				y1: a.y,
				x2: b.x + b.w / 2,
				y2: b.y,
			},
		];
	});

	return (
		<section className="tab-panel">
			<p className="panel-note">
				{nodes.length} table{nodes.length === 1 ? "" : "s"} ·{" "}
				{artifact.schema.orm}
			</p>
			<div className="graph-wrap graph-scroll">
				<svg
					aria-label="Schema graph"
					className="graph-svg"
					height={height}
					role="img"
					viewBox={`0 0 ${Math.ceil(width)} ${Math.ceil(height)}`}
					width={width}
				>
					{visibleRels.map((r) => (
						<line
							className="graph-edge"
							key={r.key}
							x1={r.x1}
							x2={r.x2}
							y1={r.y1}
							y2={r.y2}
						/>
					))}
					{nodes.map((n) => {
						const entity = entities.get(n.name);
						if (!entity) {
							return null;
						}
						return (
							<g
								className="schema-node"
								key={n.name}
								transform={`translate(${n.x - n.w / 2},${n.y - n.h / 2})`}
							>
								<rect height={n.h} rx="8" width={n.w} />
								<text className="schema-title" x="10" y="16">
									{entity.tableName}
								</text>
								{entity.columns.map((col, i) => (
									<text
										className={`schema-col${col.isPrimary ? "pk" : ""}`}
										key={keyOf(entity.name, col.name)}
										x="10"
										y={BOX_HEADER + i * ROW_H + 11}
									>
										{col.isPrimary ? "◆ " : ""}
										{col.name} · {col.type}
										{col.isNullable ? " (null)" : ""}
									</text>
								))}
							</g>
						);
					})}
				</svg>
			</div>
		</section>
	);
}
