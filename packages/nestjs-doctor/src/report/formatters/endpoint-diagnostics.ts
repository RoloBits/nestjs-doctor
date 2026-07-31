import { type Diagnostic, isCodeDiagnostic } from "../../common/diagnostic.js";
import type { EndpointNode } from "../../common/endpoint.js";

export interface EndpointDiagnosticCounts {
	/** Keyed by endpoint index in endpoints.endpoints, as a string. */
	perEndpoint: Record<string, { error: number; warning: number; info: number }>;
	/** Diagnostics in a scanned file that fall outside every handler range. Keyed by filePath. */
	perFile: Record<string, { error: number; warning: number; info: number }>;
}

function emptyBucket() {
	return { error: 0, warning: 0, info: 0 };
}

/** Joins code diagnostics to endpoints by filePath and line range, bucketing counts by severity. */
export function computeEndpointDiagnostics(
	endpoints: EndpointNode[],
	diagnostics: Diagnostic[]
): EndpointDiagnosticCounts {
	const perEndpoint: EndpointDiagnosticCounts["perEndpoint"] = {};
	const perFile: EndpointDiagnosticCounts["perFile"] = {};

	const endpointsByFile = new Map<string, number[]>();
	for (const [index, endpoint] of endpoints.entries()) {
		const indices = endpointsByFile.get(endpoint.filePath);
		if (indices) {
			indices.push(index);
		} else {
			endpointsByFile.set(endpoint.filePath, [index]);
		}
	}

	for (const diagnostic of diagnostics) {
		if (!isCodeDiagnostic(diagnostic)) {
			continue;
		}
		const indices = endpointsByFile.get(diagnostic.filePath);
		if (!indices) {
			continue;
		}

		let matched = false;
		for (const index of indices) {
			const endpoint = endpoints[index];
			if (
				diagnostic.line >= endpoint.line &&
				diagnostic.line <= endpoint.endLine
			) {
				matched = true;
				const key = String(index);
				const bucket = perEndpoint[key] ?? emptyBucket();
				bucket[diagnostic.severity]++;
				perEndpoint[key] = bucket;
			}
		}

		if (!matched) {
			const bucket = perFile[diagnostic.filePath] ?? emptyBucket();
			bucket[diagnostic.severity]++;
			perFile[diagnostic.filePath] = bucket;
		}
	}

	return { perEndpoint, perFile };
}
