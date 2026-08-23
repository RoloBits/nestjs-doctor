import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildAnalysisContext,
	diagnose,
	resolveScanConfig,
} from "../../src/engine/scanner.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const BOUNDARY_RULE = "architecture/require-module-boundaries";

async function boundaryFindings(fixture: string) {
	const targetPath = resolve(FIXTURES, fixture);
	const scanConfig = await resolveScanConfig(targetPath);
	const context = await buildAnalysisContext(targetPath, scanConfig);
	return (await diagnose(context)).diagnostics.filter(
		(diagnostic) => diagnostic.rule === BOUNDARY_RULE
	);
}

describe("module boundary detection", () => {
	it("reports the cross-module import and not the same-module one", async () => {
		const findings = await boundaryFindings("module-boundaries-app/src");
		expect(findings).toHaveLength(1);
		expect(findings[0].filePath).toContain("billing.service.ts");
		expect(findings[0].message).toContain("../orders/entities/order.entity");
	});
});
