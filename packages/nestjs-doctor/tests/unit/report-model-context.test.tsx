// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { ReportArtifact } from "../../src/common/artifact.js";
import { encodeCodeGraph } from "../../src/common/code-graph-codec.js";
import { registerModelContext } from "../../src/report/ui/app/lib/model-context.js";
import { EndpointsTab } from "../../src/report/ui/app/templates/endpoints.js";
import {
	codeDiagnostic,
	DESCENT_GRAPH,
	EMPTY_ARTIFACT,
} from "./report-artifact-fixture.js";

const EXPLAIN_HEAD = /^POST \/a → AController\.handle/;
const NO_STEP_YET = /^no step yet · read before write/;
const STEP_TWO =
	/^@2 of 9 · depth 2 · PrismaService#user\.findUnique · db read/;

interface Registered {
	signal?: AbortSignal;
	tool: {
		annotations?: Record<string, boolean>;
		execute: (input: Record<string, unknown>) => Promise<{
			content: { text: string }[];
		}>;
		name: string;
	};
}

const ARTIFACT: ReportArtifact = {
	...EMPTY_ARTIFACT,
	codeGraph: encodeCodeGraph(DESCENT_GRAPH),
	diagnostics: [
		codeDiagnostic({
			filePath: "/repo/src/a.ts",
			line: 4,
			message: "eval is here",
			rule: "security/no-eval",
			severity: "error",
		}),
		codeDiagnostic({
			filePath: "/repo/src/b.ts",
			line: 9,
			message: "sync read",
			rule: "performance/no-sync-io",
			severity: "warning",
		}),
	],
	root: "/repo",
};

function install(): Registered[] {
	const registered: Registered[] = [];
	Object.defineProperty(document, "modelContext", {
		configurable: true,
		value: {
			registerTool: (
				tool: Registered["tool"],
				options?: { signal?: AbortSignal }
			) => {
				registered.push({ signal: options?.signal, tool });
			},
		},
	});
	return registered;
}

async function run(
	registered: Registered[],
	name: string,
	input: Record<string, unknown> = {}
): Promise<string> {
	const entry = registered.find((r) => r.tool.name === name);
	if (!entry) {
		throw new Error(`no tool ${name}`);
	}
	const result = await entry.tool.execute(input);
	return result.content[0]?.text ?? "";
}

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("registerModelContext", () => {
	afterEach(() => {
		Reflect.deleteProperty(document, "modelContext");
	});

	it("does nothing in a browser without a model context", () => {
		expect(() => registerModelContext(ARTIFACT)()).not.toThrow();
	});

	it("registers four read-only tools and aborts them on unregister", () => {
		const registered = install();
		const unregister = registerModelContext(ARTIFACT);
		expect(registered.map((r) => r.tool.name)).toEqual([
			"get_summary",
			"list_findings",
			"explain_endpoint",
			"explain_boot_trace",
			"show_endpoint",
			"walk_step",
			"walk_position",
		]);
		for (const { signal, tool } of registered) {
			expect(tool.annotations?.untrustedContentHint).toBe(true);
			expect(signal?.aborted).toBe(false);
		}
		expect(
			registered
				.filter((r) => r.tool.annotations?.readOnlyHint === false)
				.map((r) => r.tool.name)
		).toEqual(["show_endpoint", "walk_step"]);
		unregister();
		expect(registered.every((r) => r.signal?.aborted)).toBe(true);
	});

	it("answers each tool from the artifact", async () => {
		const registered = install();
		registerModelContext(ARTIFACT);
		expect(await run(registered, "get_summary")).toContain("score 100/100");
		expect(await run(registered, "list_findings", { severity: "error" })).toBe(
			"error  security/no-eval  src/a.ts:4  eval is here"
		);
		expect(await run(registered, "list_findings", { file: "b.ts" })).toContain(
			"performance/no-sync-io"
		);
		expect(await run(registered, "list_findings", { rule: "none" })).toBe(
			"no findings match"
		);
		expect(
			await run(registered, "explain_endpoint", { method: "post", path: "/a" })
		).toMatch(EXPLAIN_HEAD);
		expect(await run(registered, "explain_endpoint", { path: "/nope" })).toBe(
			"no route GET /nope in this report"
		);
		expect(await run(registered, "explain_boot_trace")).toBe(
			"this report carries no boot trace"
		);
	});

	it("drives the Endpoints tab: shows a route with a preset and steps the walk", async () => {
		const registered = install();
		const container = document.createElement("div");
		container.id = "tab-endpoints";
		document.body.appendChild(container);
		const root = createRoot(container);
		act(() => {
			root.render(<EndpointsTab report={ARTIFACT} />);
		});
		try {
			registerModelContext(ARTIFACT);
			const shown = await act(() =>
				run(registered, "show_endpoint", {
					method: "post",
					path: "/a",
					preset: "all",
				})
			);
			expect(shown).toBe("POST /a: read before write · @2 then @5 · 10 steps");
			expect(await act(() => run(registered, "walk_position"))).toMatch(
				NO_STEP_YET
			);
			expect(await act(() => run(registered, "walk_step", { delta: 1 }))).toBe(
				"@0 of 9 · depth 0 · AController#handle · call · src/a.controller.ts:1"
			);
			expect(await act(() => run(registered, "walk_step", { to: 2 }))).toMatch(
				STEP_TWO
			);
			expect(
				await act(() => run(registered, "show_endpoint", { path: "/nope" }))
			).toBe("no route GET /nope in this report");
		} finally {
			act(() => root.unmount());
			container.remove();
		}
	});
});
