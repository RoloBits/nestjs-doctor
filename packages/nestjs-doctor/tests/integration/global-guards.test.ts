import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildAnalysisContext,
	diagnose,
	resolveScanConfig,
} from "../../src/engine/scanner.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const GUARD_RULE = "security/require-guards-on-endpoints";

async function scan(fixture: string) {
	const targetPath = resolve(FIXTURES, fixture);
	const scanConfig = await resolveScanConfig(targetPath);
	const context = await buildAnalysisContext(targetPath, scanConfig);
	return { context, output: diagnose(context) };
}

describe("global guard detection", () => {
	// Exercises the whole wiring, not the rule alone: the facts are optional all
	// the way down, so a missed hand-off degrades silently to over-reporting.
	it("reports no unguarded endpoint when a module registers APP_GUARD", async () => {
		const { output } = await scan("global-guard-app/src");
		const guardFindings = output.diagnostics.filter(
			(diagnostic) => diagnostic.rule === GUARD_RULE
		);
		expect(guardFindings).toEqual([]);
	});

	it("records the APP_GUARD provider structurally on the module graph", async () => {
		const { context } = await scan("global-guard-app/src");
		const registrations = [...context.moduleGraph.modules.values()].flatMap(
			(module) => module.providerRegistrations
		);
		expect(registrations).toContainEqual({
			token: "APP_GUARD",
			useClass: "JwtAuthGuard",
			useExisting: undefined,
		});
	});

	it("still reports an unguarded endpoint in a project with no global guard", async () => {
		const { output } = await scan("bad-security/src");
		const guardFindings = output.diagnostics.filter(
			(diagnostic) => diagnostic.rule === GUARD_RULE
		);
		expect(guardFindings.length).toBeGreaterThan(0);
	});
});
