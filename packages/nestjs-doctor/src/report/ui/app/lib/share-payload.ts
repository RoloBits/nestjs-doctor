interface SharedFinding {
	category: string;
	severity: string;
	surfaces?: string[];
}

interface CategorySlice {
	findings: (SharedFinding & { sourceLines?: unknown })[];
	schemaIssues: SharedFinding[];
}

interface ShareData {
	endpoints?: unknown;
	findingsByCategory: Record<string, CategorySlice>;
	modules?: unknown;
	project?: unknown;
	schema?: unknown;
	scope?: unknown;
	score?: unknown;
	version: unknown;
}

// A finding reported for information only never enters a shared export's counts.
export function isNotScored(d: SharedFinding): boolean {
	return !!(d.surfaces && d.surfaces.indexOf("score") === -1);
}

// What a section would actually export once not-scored findings are dropped.
export function scoredCount(share: ShareData, id: string): number | null {
	if (id.indexOf("findings:") !== 0) {
		return null;
	}
	const slice = share.findingsByCategory[id.slice(9)];
	if (!slice) {
		return 0;
	}
	let n = 0;
	for (const f of slice.findings) {
		if (!isNotScored(f)) {
			n++;
		}
	}
	for (const s of slice.schemaIssues) {
		if (!isNotScored(s)) {
			n++;
		}
	}
	return n;
}

// Assembles the downloadable JSON from the picked sections, dropping
// not-scored findings and, unless asked, the code snippets.
export function buildSharedJson(
	share: ShareData,
	generator: unknown,
	includeCode: boolean,
	picked: string[]
): object {
	const findings: object[] = [];
	const schemaIssues: object[] = [];
	const counts = {
		total: 0,
		errors: 0,
		warnings: 0,
		info: 0,
		byCategory: {
			security: 0,
			performance: 0,
			correctness: 0,
			architecture: 0,
			schema: 0,
		} as Record<string, number>,
	};
	const count = (d: SharedFinding) => {
		counts.total++;
		if (d.severity === "error") {
			counts.errors++;
		} else if (d.severity === "warning") {
			counts.warnings++;
		} else {
			counts.info++;
		}
		counts.byCategory[d.category]++;
	};
	for (const id of picked) {
		if (id.indexOf("findings:") !== 0) {
			continue;
		}
		const slice = share.findingsByCategory[id.slice(9)];
		if (!slice) {
			continue;
		}
		for (const d of slice.findings) {
			if (isNotScored(d)) {
				continue;
			}
			if (includeCode) {
				findings.push(d);
			} else {
				const copy: Record<string, unknown> = {};
				const source = d as unknown as Record<string, unknown>;
				for (const key of Object.keys(source)) {
					if (key !== "sourceLines") {
						copy[key] = source[key];
					}
				}
				findings.push(copy);
			}
			count(d);
		}
		for (const issue of slice.schemaIssues) {
			if (isNotScored(issue)) {
				continue;
			}
			schemaIssues.push(issue);
			count(issue);
		}
	}
	const has = (id: string) => picked.indexOf(id) >= 0;
	return {
		version: share.version,
		generator,
		generatedAt: new Date().toISOString(),
		...(has("score") ? { project: share.project, score: share.score } : {}),
		...(share.scope ? { scope: share.scope } : {}),
		summary: counts,
		sections: picked,
		includeCode: includeCode && findings.length > 0,
		findings,
		schemaIssues,
		...(share.endpoints && has("endpoints")
			? { endpoints: share.endpoints }
			: {}),
		...(share.schema && has("schema") ? { schema: share.schema } : {}),
		...(share.modules && has("modules") ? { modules: share.modules } : {}),
	};
}
