import { describe, expect, it } from "vitest";
import {
	buildEndpointGraph,
	EndpointsPainter,
	groupEndpoints,
} from "../src/canvas/endpoints-painter";
import type { EndpointNodePayload } from "../src/model";

const ep: EndpointNodePayload = {
	controllerClass: "UserController",
	dependencies: [
		{
			className: "UserService",
			dependencies: [
				{
					className: "UserRepository",
					methodName: "findById",
					type: "repository",
				},
			],
			methodName: "findOne",
			type: "service",
		},
		{
			className: "AuthGuard",
			conditional: true,
			methodName: "canActivate",
			type: "guard",
		},
	],
	filePath: "/u.ts",
	handlerMethod: "getUser",
	httpMethod: "GET",
	line: 10,
	routePath: "/users/:id",
};

describe("buildEndpointGraph", () => {
	it("walks the dependency tree into nodes and edges", () => {
		const { nodes, edges } = buildEndpointGraph(ep);
		expect(nodes.map((n) => n.className)).toEqual([
			"UserController",
			"UserService",
			"UserRepository",
			"AuthGuard",
		]);
		expect(edges).toHaveLength(3);
		expect(edges.find((e) => e.to === nodes[3].id)?.conditional).toBe(true);
		expect(nodes[0].type).toBe("controller");
	});
});

describe("EndpointsPainter", () => {
	it("lays the selected endpoint out in dead mode for tests", () => {
		const canvas = {
			getContext: () => null,
		} as unknown as HTMLCanvasElement;
		const painter = new EndpointsPainter(canvas);
		painter.select(ep);
		expect(painter.nodes).toHaveLength(4);
		expect(painter.edges).toHaveLength(3);
		const root = painter.nodes[0];
		const child = painter.nodes[1];
		expect(child.y).toBeGreaterThan(root.y);

		painter.select(null);
		expect(painter.nodes).toHaveLength(0);
	});
});

describe("groupEndpoints", () => {
	it("groups by controller and sorts routes", () => {
		const groups = groupEndpoints([
			ep,
			{
				...ep,
				httpMethod: "POST",
				routePath: "/users",
				handlerMethod: "create",
			},
			{ ...ep, controllerClass: "OrderController" },
		]);
		expect(groups.map((g) => g.controller)).toEqual([
			"OrderController",
			"UserController",
		]);
		expect(groups[1].endpoints.map((e) => e.routePath)).toEqual([
			"/users",
			"/users/:id",
		]);
	});
});
