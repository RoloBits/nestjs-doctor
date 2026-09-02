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
	return { context, output: await diagnose(context) };
}

describe("global guard detection", () => {
	it("reports no unguarded endpoint when a module registers APP_GUARD", async () => {
		const { output } = await scan("global-guard-app/src");
		const guardFindings = output.diagnostics.filter(
			(diagnostic) => diagnostic.rule === GUARD_RULE
		);
		expect(guardFindings).toEqual([]);
	});

	it("records the APP_GUARD token on the module graph", async () => {
		const { context } = await scan("global-guard-app/src");
		const tokens = [...context.moduleGraph.modules.values()].flatMap(
			(module) => module.providerTokens
		);
		expect(tokens).toContain("APP_GUARD");
	});

	it("reports no unguarded endpoint when main.ts calls useGlobalGuards", async () => {
		const { output } = await scan("use-global-guards-app/src");
		const guardFindings = output.diagnostics.filter(
			(diagnostic) => diagnostic.rule === GUARD_RULE
		);
		expect(guardFindings).toEqual([]);
	});

	it("reports no unguarded endpoint when the base class carries the guard", async () => {
		const { output } = await scan("inherited-guard-app/src");
		const guardFindings = output.diagnostics.filter(
			(diagnostic) => diagnostic.rule === GUARD_RULE
		);
		expect(guardFindings).toEqual([]);
	});

	it("reports no unguarded endpoint when a typed helper binds the guard", async () => {
		const { output } = await scan("typed-app-helper-app/src");
		const guardFindings = output.diagnostics.filter(
			(diagnostic) => diagnostic.rule === GUARD_RULE
		);
		expect(guardFindings).toEqual([]);
	});

	it("still reports when only a microservice handle or an empty call binds guards", async () => {
		const { output } = await scan("hybrid-guards-app/src");
		const guardFindings = output.diagnostics.filter(
			(diagnostic) => diagnostic.rule === GUARD_RULE
		);
		expect(guardFindings).toHaveLength(1);
	});

	it("still reports an unguarded endpoint in a project with no global guard", async () => {
		const { output } = await scan("bad-security/src");
		const guardFindings = output.diagnostics.filter(
			(diagnostic) => diagnostic.rule === GUARD_RULE
		);
		expect(guardFindings.length).toBeGreaterThan(0);
	});
});
