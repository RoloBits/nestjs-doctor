import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildAnalysisContext,
	diagnose,
	resolveScanConfig,
} from "../../src/engine/scanner.js";

const FIXTURE = resolve(import.meta.dirname, "../fixtures/typeorm-baseurl-app");

async function scan() {
	const scanConfig = await resolveScanConfig(FIXTURE);
	const context = await buildAnalysisContext(FIXTURE, scanConfig);
	return diagnose(context);
}

function flaggedBy(
	output: Awaited<ReturnType<typeof scan>>,
	rule: string
): Set<string> {
	return new Set(
		output.diagnostics
			.filter((d) => d.rule === rule)
			.map((d) => ("entity" in d ? d.entity : ""))
	);
}

describe("base entities imported through tsconfig baseUrl", () => {
	it("inherits the primary key", async () => {
		const flagged = flaggedBy(await scan(), "schema/require-primary-key");
		expect(flagged.has("Order")).toBe(false);
		expect(flagged.has("Tag")).toBe(true);
	});

	it("inherits the timestamps", async () => {
		const flagged = flaggedBy(await scan(), "schema/require-timestamps");
		expect(flagged.has("Order")).toBe(false);
		expect(flagged.has("Tag")).toBe(true);
	});
});
