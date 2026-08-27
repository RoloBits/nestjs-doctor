"use client";

import { useMemo, useState } from "react";
import type { ReportArtifact } from "@/lib/model/artifact";

interface EndpointsTabProps {
	artifact: ReportArtifact;
}

/** Endpoints grouped by controller with per-handler dependency counts. */
export function EndpointsTab({ artifact }: EndpointsTabProps) {
	const [openClass, setOpenClass] = useState<string | null>(null);

	const byController = useMemo(() => {
		const groups = new Map<string, typeof artifact.endpoints.endpoints>();
		for (const endpoint of artifact.endpoints.endpoints) {
			let group = groups.get(endpoint.controllerClass);
			if (!group) {
				group = [];
				groups.set(endpoint.controllerClass, group);
			}
			group.push(endpoint);
		}
		return groups;
	}, [artifact.endpoints.endpoints]);

	if (byController.size === 0) {
		return (
			<section className="tab-panel">
				<p className="empty">No HTTP endpoints detected.</p>
			</section>
		);
	}

	return (
		<section className="tab-panel">
			<ul className="endpoint-list">
				{[...byController.entries()].map(([cls, endpoints]) => (
					<li key={cls}>
						<button
							className="endpoint-controller"
							onClick={() => setOpenClass(openClass === cls ? null : cls)}
							type="button"
						>
							<span className="finding-msg">{cls}</span>
							<code className="finding-loc">{endpoints.length}</code>
						</button>
						{openClass === cls && (
							<table className="endpoint-table">
								<tbody>
									{endpoints.map((endpoint) => (
										<tr
											key={`${endpoint.controllerClass}.${endpoint.handlerMethod}`}
										>
											<td
												className={`http http-${endpoint.httpMethod.toLowerCase()}`}
											>
												{endpoint.httpMethod}
											</td>
											<td>
												<code>{endpoint.routePath}</code>
											</td>
											<td>
												{countDeps(endpoint.dependencies)} dep step
												{countDeps(endpoint.dependencies) === 1 ? "" : "s"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}

function countDeps(deps: unknown[]): number {
	let total = 0;
	for (const dep of deps as Array<{ dependencies?: unknown[] }>) {
		total += 1 + countDeps(dep.dependencies ?? []);
	}
	return total;
}
