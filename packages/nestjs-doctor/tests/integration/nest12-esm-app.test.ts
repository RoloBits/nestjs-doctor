import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildAnalysisContext,
	diagnose,
	resolveScanConfig,
} from "../../src/engine/scanner.js";

const FIXTURE = resolve(import.meta.dirname, "../fixtures/nest12-esm-app");
const NEST_12 = /^12\./;

async function scan() {
	const scanConfig = await resolveScanConfig(FIXTURE);
	const context = await buildAnalysisContext(FIXTURE, scanConfig);
	return { context, output: await diagnose(context) };
}

describe("NestJS 12 ESM app", () => {
	it("reads the framework major from package.json", async () => {
		const { context } = await scan();
		expect(context.project.nestVersion).toMatch(NEST_12);
	});

	it("resolves .js relative imports to the TypeScript modules", async () => {
		const { context } = await scan();
		const modules = context.moduleGraph.modules;
		expect([...modules.keys()].sort()).toEqual([
			"AppModule",
			"CoreModule",
			"OrdersModule",
			"UsersModule",
		]);
		expect(modules.get("AppModule")?.imports).toEqual(
			expect.arrayContaining(["CoreModule", "UsersModule", "OrdersModule"])
		);
		expect(modules.get("OrdersModule")?.imports).toContain("UsersModule");
		expect(modules.get("UsersModule")?.exports).toContain("UsersService");
	});

	it("traces the schema-validated routes", async () => {
		const { context } = await scan();
		const routes = context.endpointGraph.endpoints
			.map((endpoint) => `${endpoint.httpMethod} ${endpoint.routePath}`)
			.sort();
		expect(routes).toEqual([
			"GET /orders",
			"GET /users/:id",
			"POST /orders",
			"POST /users",
		]);
	});

	it("reports nothing on Nest 12 idioms it should accept", async () => {
		const { output } = await scan();
		const findings = output.diagnostics.map(
			(diagnostic) => `${diagnostic.rule}: ${diagnostic.message}`
		);
		expect(findings).toEqual([]);
	});
});
