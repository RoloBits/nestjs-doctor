import fs from "node:fs";
import os from "node:os";
import path, { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
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

	it("counts a decorator that returns UseGuards from another package", async () => {
		const { output } = await scan("composed-guard-app/src");
		const flagged = output.diagnostics
			.filter((diagnostic) => diagnostic.rule === GUARD_RULE)
			.map((diagnostic) => diagnostic.filePath.split("/").pop())
			.sort();
		expect(flagged).toEqual([
			"documented.controller.ts",
			"maybe-auth.controller.ts",
			"unguarded.controller.ts",
		]);
	});

	it("does not count a decorator that returns a guard on only one path", async () => {
		const { output } = await scan("composed-guard-app/src");
		const flagged = output.diagnostics.filter(
			(diagnostic) =>
				diagnostic.rule === GUARD_RULE &&
				diagnostic.filePath.endsWith("maybe-auth.controller.ts")
		);
		expect(flagged).toHaveLength(1);
	});

	it("finds every route in the composed decorator fixture", async () => {
		const { context } = await scan("composed-guard-app/src");
		expect(context.endpointGraph.endpoints).toHaveLength(7);
	});

	// The decorator lives in a package, so the checker only reads it when that
	// package is installed. Both directions are pinned here.
	describe("a decorator imported from a package", () => {
		const tempRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "nestjs-doctor-package-guard-")
		);

		afterAll(() => {
			fs.rmSync(tempRoot, { recursive: true, force: true });
		});

		function plant(name: string, how: "link" | "copy" | "none") {
			const root = path.join(tempRoot, name);
			fs.cpSync(resolve(FIXTURES, "package-guard-app"), root, {
				recursive: true,
			});
			const source = path.join(root, "vendor", "auth");
			const target = path.join(root, "node_modules", "@fixture", "auth");
			if (how !== "none") {
				fs.mkdirSync(path.dirname(target), { recursive: true });
			}
			if (how === "link") {
				fs.symlinkSync(source, target, "dir");
			}
			if (how === "copy") {
				fs.cpSync(source, target, { recursive: true });
			}
			return path.join(root, "src");
		}

		async function guardFindings(target: string) {
			const scanConfig = await resolveScanConfig(target);
			const context = await buildAnalysisContext(target, scanConfig);
			const output = await diagnose(context);
			return output.diagnostics.filter(
				(diagnostic) => diagnostic.rule === GUARD_RULE
			);
		}

		it("counts a guard from a workspace package linked into node_modules", async () => {
			expect(await guardFindings(plant("linked", "link"))).toEqual([]);
		});

		it("reports the endpoint when the decorator is only an installed copy", async () => {
			const findings = await guardFindings(plant("installed", "copy"));
			expect(findings).toHaveLength(1);
			expect(findings[0].filePath).toContain("orders.controller.ts");
		});

		it("reports the endpoint when the package is missing", async () => {
			const findings = await guardFindings(plant("bare", "none"));
			expect(findings).toHaveLength(1);
			expect(findings[0].filePath).toContain("orders.controller.ts");
		});
	});
});
