import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../../src/common/diagnostic.js";
import type { EndpointNode } from "../../src/common/endpoint.js";
import {
	computeEndpointDiagnostics,
	type EndpointDiagnosticCounts,
} from "../../src/report/formatters/endpoint-diagnostics.js";

function emptyCounts(): EndpointDiagnosticCounts {
	return { perEndpoint: {}, perFile: {} };
}

function fakeEndpoint(overrides: Partial<EndpointNode>): EndpointNode {
	return {
		controllerClass: "CatsController",
		dependencies: [],
		endLine: 10,
		filePath: "cats.controller.ts",
		handlerMethod: "list",
		httpMethod: "GET",
		line: 5,
		returnType: null,
		routePath: "cats",
		swagger: null,
		...overrides,
	};
}

function fakeCodeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
	return {
		category: "correctness",
		column: 1,
		filePath: "cats.controller.ts",
		help: "help text",
		line: 7,
		message: "message text",
		rule: "correctness/fake-rule",
		severity: "warning",
		...overrides,
	};
}

function fakeSchemaDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
	return {
		category: "schema",
		entity: "Cat",
		filePath: "cats.controller.ts",
		help: "help text",
		message: "message text",
		rule: "schema/fake-rule",
		severity: "warning",
		...overrides,
	};
}

describe("computeEndpointDiagnostics", () => {
	it("counts a diagnostic on the handler line for the matching endpoint", () => {
		const endpoints = [fakeEndpoint({ line: 5, endLine: 10 })];
		const diagnostics = [fakeCodeDiagnostic({ line: 7 })];

		const result = computeEndpointDiagnostics(endpoints, diagnostics);

		expect(result.perEndpoint["0"]).toEqual({
			error: 0,
			warning: 1,
			info: 0,
		});
		expect(result.perFile).toEqual({});
	});

	it("counts a diagnostic on both endpoints when one handler emits GET+POST", () => {
		const endpoints = [
			fakeEndpoint({ line: 5, endLine: 10, httpMethod: "GET" }),
			fakeEndpoint({ line: 5, endLine: 10, httpMethod: "POST" }),
		];
		const diagnostics = [fakeCodeDiagnostic({ line: 8 })];

		const result = computeEndpointDiagnostics(endpoints, diagnostics);

		expect(result.perEndpoint["0"]).toEqual({
			error: 0,
			warning: 1,
			info: 0,
		});
		expect(result.perEndpoint["1"]).toEqual({
			error: 0,
			warning: 1,
			info: 0,
		});
	});

	it("puts a diagnostic outside every handler range into perFile", () => {
		const endpoints = [fakeEndpoint({ line: 5, endLine: 10 })];
		const diagnostics = [fakeCodeDiagnostic({ line: 2 })];

		const result = computeEndpointDiagnostics(endpoints, diagnostics);

		expect(result.perEndpoint).toEqual({});
		expect(result.perFile["cats.controller.ts"]).toEqual({
			error: 0,
			warning: 1,
			info: 0,
		});
	});

	it("ignores schema diagnostics without crashing", () => {
		const endpoints = [fakeEndpoint({ line: 5, endLine: 10 })];
		const diagnostics = [fakeSchemaDiagnostic()];

		const result = computeEndpointDiagnostics(endpoints, diagnostics);

		expect(result).toEqual(emptyCounts());
	});

	it("ignores diagnostics in files with no endpoints", () => {
		const endpoints = [fakeEndpoint({ filePath: "cats.controller.ts" })];
		const diagnostics = [
			fakeCodeDiagnostic({ filePath: "dogs.controller.ts", line: 3 }),
		];

		const result = computeEndpointDiagnostics(endpoints, diagnostics);

		expect(result).toEqual(emptyCounts());
	});

	it("buckets severities correctly", () => {
		const endpoints = [fakeEndpoint({ line: 5, endLine: 10 })];
		const diagnostics = [
			fakeCodeDiagnostic({ line: 6, severity: "error" }),
			fakeCodeDiagnostic({ line: 7, severity: "warning" }),
			fakeCodeDiagnostic({ line: 8, severity: "info" }),
			fakeCodeDiagnostic({ line: 9, severity: "error" }),
		];

		const result = computeEndpointDiagnostics(endpoints, diagnostics);

		expect(result.perEndpoint["0"]).toEqual({
			error: 2,
			warning: 1,
			info: 1,
		});
	});
});
