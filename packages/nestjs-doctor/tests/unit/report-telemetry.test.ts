import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DiagnoseResult } from "../../src/common/result.js";
import type { ModuleGraph } from "../../src/engine/graph/module-graph.js";
import { buildHtmlReport } from "../../src/report/html-report.js";
import {
	buildBeacon,
	getTelemetryScript,
} from "../../src/report/ui/telemetry.js";
import { generatedIn } from "../../src/telemetry/environment.js";

const emptyGraph = (): ModuleGraph => ({
	edges: new Map(),
	modules: new Map(),
	providerToModule: new Map(),
});

const emptyResult = (): DiagnoseResult =>
	({
		score: { value: 100, label: "Excellent" },
		diagnostics: [],
		project: {
			name: "app",
			nestVersion: "11.0.0",
			orm: "prisma",
			framework: "express",
			fileCount: 1,
			moduleCount: 1,
		},
		summary: {
			total: 0,
			errors: 0,
			warnings: 0,
			info: 0,
			byCategory: {
				security: 0,
				performance: 0,
				correctness: 0,
				architecture: 0,
				schema: 0,
			},
		},
		ruleErrors: [],
		elapsedMs: 1,
	}) as DiagnoseResult;

const TAINT = "/Users/someone/private-app/src/orders.controller.ts";

const SECTION_NAMES = [
	"summary",
	"diagnosis",
	"modules",
	"endpoints",
	"schema",
	"lab",
];

const ALLOWED_PROPERTIES = [
	"$current_url",
	"version",
	"generated_in",
	"section",
	"clicks",
];

/**
 * Executes the beacon against a stub page whose every readable value is TAINT,
 * then returns the request bodies it produced.
 */
function runBeacon() {
	const source = buildBeacon("phc_key", "1.2.3", "cli")
		.replace("<script>", "")
		.replace("</script>", "");
	const sent: Record<string, never>[] = [];
	const on: Record<string, ((ev?: unknown) => void)[]> = {};
	const listen = (type: string, fn: (ev?: unknown) => void) => {
		on[type] = on[type] ?? [];
		on[type].push(fn);
	};

	const node = (active: boolean) => ({
		classList: { contains: (c: string) => active && c === "active" },
		className: TAINT,
		dataset: { path: TAINT, module: TAINT },
		getAttribute: () => TAINT,
		innerHTML: TAINT,
		innerText: TAINT,
		outerHTML: TAINT,
		textContent: TAINT,
		title: TAINT,
		closest: () => node(active),
	});

	const doc = {
		addEventListener: listen,
		body: node(false),
		getElementById: (id: string) => node(id === "tab-summary"),
		referrer: TAINT,
		title: TAINT,
		visibilityState: "visible",
	};
	const win = {
		addEventListener: listen,
		innerHeight: 800,
		innerWidth: 1000,
		location: { href: TAINT, pathname: TAINT },
	};
	const fetchStub = (_url: string, init: { body: string }) => {
		sent.push(JSON.parse(init.body));
		return { catch: () => undefined };
	};

	new Function("window", "document", "crypto", "fetch", source)(
		win,
		doc,
		{ randomUUID: () => "00000000-0000-0000-0000-000000000000" },
		fetchStub
	);

	const target = node(false);
	for (const fn of on.click ?? []) {
		fn({ clientX: 250, clientY: 200, srcElement: target, target });
	}
	for (const fn of on.pagehide ?? []) {
		fn();
	}

	return { sent, track: win as unknown as { __ndTrack?: (n: string) => void } };
}

describe("report telemetry", () => {
	it("embeds no beacon when telemetry is off", () => {
		const html = buildHtmlReport(emptyGraph(), emptyResult(), {
			telemetry: false,
		});

		// The tab handler's `window.__ndTrack?.()` call always ships and is
		// inert without the beacon that defines it.
		expect(html).not.toContain("posthog");
		expect(html).not.toContain("report_opened");
		expect(html).not.toContain("window.__ndTrack =");
	});

	it("embeds the beacon with the configured key", () => {
		const script = getTelemetryScript("1.2.3");

		expect(script).toContain("window.__ndTrack =");
		expect(script).toContain('var VERSION = "1.2.3"');
	});

	it("sends nothing off the page, whatever the beacon reads", () => {
		const { sent } = runBeacon();

		// Every DOM value the stub exposes is TAINT. If any API reaches one and
		// puts it in a payload, it shows up here whichever property was used.
		expect(sent.length).toBeGreaterThan(0);
		expect(JSON.stringify(sent)).not.toContain(TAINT);
	});

	it("posts only allow-listed keys", () => {
		const { sent } = runBeacon();

		for (const body of sent) {
			expect(Object.keys(body).sort()).toEqual([
				"api_key",
				"distinct_id",
				"event",
				"properties",
			]);
			for (const key of Object.keys(body.properties)) {
				expect(ALLOWED_PROPERTIES).toContain(key);
			}
		}
	});

	it("reports a click as coordinates and an allow-listed tab", () => {
		const { sent } = runBeacon();
		const clicks = sent.find((b) => b.event === "report_clicks");

		expect(clicks).toBeDefined();
		for (const record of clicks.properties.clicks) {
			expect(Object.keys(record).sort()).toEqual(["tab", "x", "y"]);
			expect(typeof record.x).toBe("number");
			expect([...SECTION_NAMES, "unknown"]).toContain(record.tab);
		}
	});

	it("posts only the fixed events and a known section", () => {
		const script = buildBeacon("phc_key", "1.2.3", "cli");

		expect(script).toContain("report_opened");
		expect(script).toContain("report_section_viewed");
		expect(script).toContain(
			'["summary", "diagnosis", "modules", "endpoints", "schema", "lab"]'
		);
		expect(script).toContain("report_action");
		expect(script).toContain("rule_lab_run");
		expect(script).toContain('"1.2.3"');
	});

	it("allows every name the report actually tracks", () => {
		const scripts = ["scripts.ts", "codemirror.ts"]
			.map((f) =>
				readFileSync(
					fileURLToPath(new URL(`../../src/report/ui/${f}`, import.meta.url)),
					"utf8"
				)
			)
			.join("\n");
		const script = buildBeacon("phc_key", "1.2.3", "cli");
		const tracked = [...scripts.matchAll(/__ndTrack\?\.\("([a-z_]+)"\)/g)].map(
			(m) => m[1]
		);

		expect(tracked.length).toBeGreaterThan(5);
		for (const name of new Set(tracked)) {
			// A name missing from the beacon's lists is dropped without a trace.
			expect(script).toContain(`"${name}"`);
		}
	});

	it("stamps where the report was generated", () => {
		expect(buildBeacon("phc_key", "1.2.3", "ci")).toContain(
			'var SOURCE = "ci"'
		);
		expect(buildBeacon("phc_key", "1.2.3", "cli")).toContain(
			'var SOURCE = "cli"'
		);
	});

	it("reads CI from the environment, ignoring its off spellings", () => {
		expect(generatedIn({ CI: "true" })).toBe("ci");
		expect(generatedIn({ CI: "1" })).toBe("ci");
		expect(generatedIn({ GITHUB_ACTIONS: "true" })).toBe("ci");
		// Set-but-off is how some shells and runners spell "not CI".
		expect(generatedIn({ CI: "false" })).toBe("cli");
		expect(generatedIn({ CI: "0" })).toBe("cli");
		expect(generatedIn({ CI: "" })).toBe("cli");
		expect(generatedIn({})).toBe("cli");
	});
});
