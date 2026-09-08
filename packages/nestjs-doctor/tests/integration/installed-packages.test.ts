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
const tempRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "nestjs-doctor-installed-")
);

afterAll(() => {
	fs.rmSync(tempRoot, { recursive: true, force: true });
});

/** Copies the fixture and puts its vendored package in node_modules, or not. */
function plant(name: string, how: "link" | "copy" | "none") {
	const root = path.join(tempRoot, name);
	fs.cpSync(resolve(FIXTURES, "package-types-app"), root, { recursive: true });
	const source = path.join(root, "vendor", "rest");
	const target = path.join(root, "node_modules", "@fixture", "rest");
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

async function scan(target: string) {
	const scanConfig = await resolveScanConfig(target);
	const context = await buildAnalysisContext(target, scanConfig);
	return { context, output: await diagnose(context) };
}

describe("a decorator that composes @Controller", () => {
	it("finds the routes when the package is a workspace link", async () => {
		const { context } = await scan(plant("linked", "link"));
		const routes = context.endpointGraph.endpoints.map((e) => e.routePath);
		expect(routes).toContain("/reports");
	});

	// A package installed as its own copy is not read, so the routes it wraps
	// are not discovered. Controllers written with @Controller are unaffected.
	it("finds only the plain controller when the package is an installed copy", async () => {
		const { context } = await scan(plant("copied", "copy"));
		const routes = context.endpointGraph.endpoints.map((e) => e.routePath);
		expect(routes).toContain("/plain");
		expect(routes).not.toContain("/reports");
	});

	it("finds only the plain controller when the package is missing", async () => {
		const { context } = await scan(plant("bare", "none"));
		const routes = context.endpointGraph.endpoints.map((e) => e.routePath);
		expect(routes).toContain("/plain");
		expect(routes).not.toContain("/reports");
	});
});

describe("a promise the scan can see", () => {
	it("is still reported when it is not awaited", async () => {
		const { output } = await scan(plant("promise", "link"));
		const findings = output.diagnostics.filter(
			(diagnostic) => diagnostic.rule === "correctness/no-fire-and-forget-async"
		);
		expect(findings).toHaveLength(1);
		expect(findings[0].filePath).toContain("dispatch.service.ts");
	});
});

describe("an entity type a rule has to read", () => {
	it("is reported when the entity is first-party", async () => {
		const { output } = await scan(plant("entity-local", "link"));
		const flagged = output.diagnostics
			.filter(
				(diagnostic) => diagnostic.rule === "security/no-raw-entity-in-response"
			)
			.map((diagnostic) => diagnostic.filePath.split("/").pop());
		expect(flagged).toContain("local.controller.ts");
	});

	// The entity is declared in an installed package, so the return type reads
	// as `any` and the rule has nothing to match against.
	it("is not reported when the entity comes from an installed copy", async () => {
		const { output } = await scan(plant("entity-copy", "copy"));
		const flagged = output.diagnostics
			.filter(
				(diagnostic) => diagnostic.rule === "security/no-raw-entity-in-response"
			)
			.map((diagnostic) => diagnostic.filePath.split("/").pop());
		expect(flagged).toContain("local.controller.ts");
		expect(flagged).not.toContain("users.controller.ts");
	});
});
