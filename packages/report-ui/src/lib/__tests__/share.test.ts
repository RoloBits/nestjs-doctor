import { describe, expect, it } from "vitest";
import demo from "../demo-artifact.json";
import type { ReportArtifact } from "../model/artifact";
import { buildSharedDoc } from "../share";

const artifact = demo as unknown as ReportArtifact;

describe("buildSharedDoc", () => {
	it("keeps only the score section when that alone is picked", () => {
		const doc = buildSharedDoc(artifact, new Set(["score"]), true);
		expect(doc.score).toEqual(artifact.share.score);
		expect(doc.project).toEqual(artifact.share.project);
		expect(doc.findings).toBeUndefined();
		expect(doc.modules).toBeUndefined();
	});

	it("joins every category slice into one flat findings list", () => {
		const doc = buildSharedDoc(artifact, new Set(["score", "findings"]), true);
		const findings = doc.findings as Array<{ line?: number }>;
		const issues = doc.schemaIssues as Array<{ entity?: string }>;
		expect(findings.some((f) => f.line !== undefined)).toBe(true);
		expect(issues.some((i) => i.entity !== undefined)).toBe(true);
	});

	it("drops source snippets when code is excluded", () => {
		const doc = buildSharedDoc(artifact, new Set(["findings"]), false);
		const findings = doc.findings as Array<{ sourceLines?: unknown }>;
		expect(findings.every((f) => f.sourceLines === undefined)).toBe(true);
	});

	it("lists section ids so a thin share reads as such", () => {
		const doc = buildSharedDoc(artifact, new Set(["modules"]), true);
		expect(doc.sections).toEqual(["modules"]);
		expect(doc.modules).toEqual(artifact.share.modules);
	});
});
