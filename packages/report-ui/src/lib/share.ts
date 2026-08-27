import type { ReportArtifact } from "./model/artifact";
import type { Diagnostic } from "./model/diagnostic";
import type { EndpointNode } from "./model/endpoint";
import type { SharedModules, SharedSchema } from "./model/share";

/**
 * Assembles the downloadable document from the artifact's precomputed share
 * slices plus whatever else the user picks. Mirrors nestjs-doctor's own
 * buildSharedReport output shape so both surfaces agree.
 */
export function buildSharedDoc(
	artifact: ReportArtifact,
	pickedSections: Set<string>,
	includeCode: boolean
): Record<string, unknown> {
	const doc: Record<string, unknown> = {
		version: artifact.share.version,
		generatedAt: artifact.generatedAt,
		generator: artifact.generator,
		sections: [...pickedSections],
	};

	if (pickedSections.has("score")) {
		doc.score = artifact.share.score;
		doc.project = artifact.share.project;
	}

	if (pickedSections.has("findings")) {
		let diagnostics: Diagnostic[] = [];
		for (const slice of Object.values(artifact.share.findingsByCategory)) {
			diagnostics = diagnostics.concat(slice.findings, slice.schemaIssues);
		}
		if (!includeCode) {
			diagnostics = diagnostics.map((d) => {
				const { sourceLines: _dropped, ...rest } = d as Diagnostic & {
					sourceLines?: unknown;
				};
				return rest;
			});
		}
		doc.findings = diagnostics.filter((d) => "line" in d);
		doc.schemaIssues = diagnostics.filter((d) => !("line" in d));
		doc.summary = artifact.summary;
		doc.scope = artifact.scope;
	}

	if (pickedSections.has("modules") && artifact.share.modules) {
		doc.modules = artifact.share.modules satisfies SharedModules;
	}
	if (pickedSections.has("schema") && artifact.share.schema) {
		doc.schema = artifact.share.schema satisfies SharedSchema;
	}
	if (pickedSections.has("endpoints")) {
		const endpoints: EndpointNode[] = artifact.endpoints.endpoints.map((e) => ({
			...e,
			dependencies: includeCode ? e.dependencies : [],
		}));
		doc.endpoints = endpoints.map((e) => ({
			controllerClass: e.controllerClass,
			handlerMethod: e.handlerMethod,
			httpMethod: e.httpMethod,
			routePath: e.routePath,
		}));
	}

	return doc;
}

export function downloadSharedDoc(doc: Record<string, unknown>): void {
	const blob = new Blob([JSON.stringify(doc, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "nestjs-doctor-shared.json";
	a.click();
	URL.revokeObjectURL(url);
}
