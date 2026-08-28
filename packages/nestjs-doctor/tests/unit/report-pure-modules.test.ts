import { describe, expect, it } from "vitest";
import {
	columnKind,
	fkKeys,
	foreignKeyColumns,
	keyName,
} from "../../src/report/ui/app/lib/column-kinds.js";
import {
	buildEndpointGraph,
	layoutEndpointGraph,
} from "../../src/report/ui/app/lib/endpoint-layout.js";
import {
	endpointsOf,
	providersOf,
	wiringChildren,
} from "../../src/report/ui/app/lib/module-joins.js";
import {
	getScoreColor,
	makeScoreRingSvg,
} from "../../src/report/ui/app/lib/score-ring.js";
import {
	buildSharedJson,
	isNotScored,
	scoredCount,
} from "../../src/report/ui/app/lib/share-payload.js";

describe("column classification", () => {
	it("normalises names to lowercase alphanumerics", () => {
		expect(keyName("User_Name!")).toBe("username");
		expect(keyName(42)).toBe("42");
	});

	it("offers the property itself and its Id suffix as FK candidates", () => {
		expect(fkKeys("author")).toEqual(["author", "authorid"]);
	});

	it("matches an fk column across naming styles", () => {
		const fks = foreignKeyColumns({
			relations: [{ propertyName: "author" }, {}],
		});
		expect(columnKind({ name: "author_id" }, fks)).toBe("fk");
		expect(columnKind({ name: "AuthorId" }, fks)).toBe("fk");
		expect(columnKind({ name: "editor_id" }, fks)).toBeNull();
	});

	it("ranks primary over fk, and unique or indexed as idx", () => {
		const fks = foreignKeyColumns({ relations: [{ propertyName: "id" }] });
		expect(columnKind({ name: "id", isPrimary: true }, fks)).toBe("pk");
		expect(columnKind({ name: "email", isUnique: true }, {})).toBe("idx");
		expect(columnKind({ name: "createdAt", hasIndex: true }, {})).toBe("idx");
		expect(columnKind({ name: "title" }, {})).toBeNull();
	});
});

describe("endpoint graph", () => {
	const ep = {
		controllerClass: "OrdersController",
		handlerMethod: "create",
		filePath: "src/orders.controller.ts",
		line: 12,
		dependencies: [
			{
				className: "OrdersService",
				type: "service",
				methodName: "create",
				conditional: false,
				order: 0,
				totalMethods: 3,
				dependencies: [
					{
						className: "PaymentsService",
						type: "service",
						methodName: "charge",
						conditional: true,
						order: 0,
						totalMethods: 1,
					},
				],
			},
		],
	};

	it("flattens the dependency tree under a controller root", () => {
		const { nodes, edges } = buildEndpointGraph(ep);
		expect(nodes.map((n) => n.className)).toEqual([
			"OrdersController",
			"OrdersService",
			"PaymentsService",
		]);
		expect(nodes[0].type).toBe("controller");
		expect(edges).toEqual([
			{ from: 0, to: 1, conditional: false },
			{ from: 1, to: 2, conditional: true },
		]);
	});

	it("stacks nodes vertically when dagre is absent", () => {
		const { nodes, edges } = buildEndpointGraph(ep);
		layoutEndpointGraph(nodes, edges, undefined);
		expect(nodes.map((n) => n.x)).toEqual([300, 300, 300]);
		expect(nodes.map((n) => n.y)).toEqual([60, 160, 260]);
	});
});

describe("module joins", () => {
	it("filters providers and endpoints by their owner", () => {
		const providers = [
			{ name: "a", module: "Users" },
			{ name: "b", module: "Orders" },
		];
		expect(providersOf(providers, "Users")).toEqual([providers[0]]);
		expect(
			endpointsOf(
				{ endpoints: [{ controllerClass: "A" }, { controllerClass: "B" }] },
				"B"
			)
		).toEqual([{ controllerClass: "B" }]);
		expect(endpointsOf(undefined, "A")).toEqual([]);
	});

	it("collapses statement nodes and dedupes collaborators", () => {
		const deps = [
			{
				className: "Stmt",
				methodName: "x",
				type: "statement",
				dependencies: [
					{ className: "MailService", methodName: "send", type: "service" },
				],
			},
			{ className: "MailService", methodName: "send", type: "service" },
			{ className: "AuthGuard", methodName: "canActivate", type: "guard" },
		];
		const out = wiringChildren(deps);
		expect(out.map((d) => `${d.className}.${d.methodName}`)).toEqual([
			"MailService.send",
			"AuthGuard.canActivate",
		]);
	});
});

describe("score ring", () => {
	it("colors by the 75 and 50 thresholds", () => {
		expect(getScoreColor(75)).toBe("var(--score-green)");
		expect(getScoreColor(74)).toBe("var(--score-yellow)");
		expect(getScoreColor(50)).toBe("var(--score-yellow)");
		expect(getScoreColor(49)).toBe("var(--score-red)");
	});

	it("closes the arc at 100 and empties it at 0", () => {
		expect(makeScoreRingSvg(120, 6, 100)).toContain('stroke-dashoffset="0"');
		const empty = makeScoreRingSvg(120, 6, 0);
		const r = (120 - 6) / 2;
		expect(empty).toContain(`stroke-dashoffset="${2 * Math.PI * r}"`);
		expect(empty).toContain(">0</text>");
	});
});

describe("share payload", () => {
	const finding = (severity: string, surfaces?: string[]) => ({
		severity,
		category: "security",
		surfaces,
		sourceLines: ["secret"],
	});
	const share = {
		version: 1,
		findingsByCategory: {
			security: {
				findings: [finding("error"), finding("warning", ["report"])],
				schemaIssues: [],
			},
		},
		schema: { entities: [] },
	};

	it("treats a finding without the score surface as not scored", () => {
		expect(isNotScored({ severity: "info", category: "c" })).toBe(false);
		expect(
			isNotScored({ severity: "info", category: "c", surfaces: ["report"] })
		).toBe(true);
	});

	it("counts only scored findings per section", () => {
		expect(scoredCount(share, "findings:security")).toBe(1);
		expect(scoredCount(share, "findings:performance")).toBe(0);
		expect(scoredCount(share, "schema")).toBeNull();
	});

	it("drops code snippets unless asked and gates sections on the pick", () => {
		const out = buildSharedJson(share, "nestjs-doctor", false, [
			"findings:security",
		]) as Record<string, unknown>;
		const findings = out.findings as Record<string, unknown>[];
		expect(findings).toHaveLength(1);
		expect(findings[0].sourceLines).toBeUndefined();
		expect(out.summary).toMatchObject({ total: 1, errors: 1 });
		expect(out.schema).toBeUndefined();
		expect(out.includeCode).toBe(false);

		const withCode = buildSharedJson(share, "nestjs-doctor", true, [
			"findings:security",
			"schema",
		]) as Record<string, unknown>;
		expect(
			(withCode.findings as Record<string, unknown>[])[0].sourceLines
		).toEqual(["secret"]);
		expect(withCode.includeCode).toBe(true);
		expect(withCode.schema).toEqual({ entities: [] });
	});
});
