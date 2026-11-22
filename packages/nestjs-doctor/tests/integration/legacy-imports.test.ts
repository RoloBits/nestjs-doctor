import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildAnalysisContext,
	diagnose,
	resolveScanConfig,
} from "../../src/engine/scanner.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const RULE = "correctness/no-legacy-nestjs-imports";

async function scan() {
	const targetPath = resolve(FIXTURES, "legacy-imports");
	const scanConfig = await resolveScanConfig(targetPath);
	const context = await buildAnalysisContext(targetPath, scanConfig);
	const output = await diagnose(context);
	return output.diagnostics.filter((diagnostic) => diagnostic.rule === RULE);
}

describe("no-legacy-nestjs-imports", () => {
	it("flags an import that moved to another package", async () => {
		const findings = await scan();
		const flagged = findings.filter((finding) =>
			finding.filePath.endsWith("app.module.ts")
		);

		expect(flagged).toHaveLength(1);
		expect(flagged[0]?.message).toContain("HttpModule");
		expect(flagged[0]?.message).toContain("@nestjs/axios");
	});

	it("flags a decorator that was renamed", async () => {
		const findings = await scan();
		const flagged = findings.filter((finding) =>
			finding.filePath.endsWith("media.controller.ts")
		);

		expect(flagged).toHaveLength(1);
		expect(flagged[0]?.message).toContain("ApiUseTags");
		expect(flagged[0]?.message).toContain("ApiTags");
	});

	it("does not flag imports and names that are current", async () => {
		const findings = await scan();
		const clean = findings.filter((finding) =>
			finding.filePath.endsWith("clean.controller.ts")
		);

		expect(clean).toEqual([]);
	});
});
