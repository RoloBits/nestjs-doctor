import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { CodeGraph, NodeId } from "../../src/common/code-graph.js";
import {
	indexNodes,
	outgoing,
	reachableFrom,
} from "../../src/common/code-graph.js";
import { buildCodeGraph } from "../../src/engine/graph/code-graph.js";
import { buildEndpointGraph } from "../../src/engine/graph/endpoint-graph.js";
import { resolveProviders } from "../../src/engine/graph/type-resolver.js";

function build(files: Record<string, string>, reverse = false): CodeGraph {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	const ordered = reverse ? [...paths].reverse() : paths;
	const providers = resolveProviders(project, ordered);
	const endpoints = buildEndpointGraph(project, ordered, providers).endpoints;
	return buildCodeGraph(project, ordered, providers, endpoints);
}

function edgesInto(graph: CodeGraph, to: NodeId) {
	return graph.edges.filter((edge) => edge.to === to);
}

function edgesOutOf(graph: CodeGraph, from: NodeId) {
	return graph.edges.filter((edge) => edge.from === from);
}

const TWO_ENDPOINTS = {
	"users.controller.ts": `
		import { Controller, Get } from '@nestjs/common';
		import { UsersService } from './users.service';
		@Controller('users')
		export class UsersController {
			constructor(private readonly users: UsersService) {}

			@Get('list')
			list() {
				return this.users.find();
			}

			@Get('first')
			first() {
				return this.users.find();
			}
		}
	`,
	"users.service.ts": `
		import { Injectable } from '@nestjs/common';
		@Injectable()
		export class UsersService {
			find() {
				return [];
			}
		}
	`,
};

describe("code-graph", () => {
	it("gives one node and two inbound edges when two endpoints reach one method", () => {
		const graph = build(TWO_ENDPOINTS);
		const find = "/users.service.ts::UsersService#find";

		expect(graph.nodes.filter((node) => node.id === find)).toHaveLength(1);
		expect(edgesInto(graph, find)).toHaveLength(2);
		expect(graph.entries).toHaveLength(2);
		expect(graph.entries.map((entry) => entry.node)).toEqual([
			"/users.controller.ts::UsersController#first",
			"/users.controller.ts::UsersController#list",
		]);
	});

	it("makes the closing call of a cycle an edge and lists the method once", () => {
		const graph = build({
			"a.service.ts": `
				import { Injectable } from '@nestjs/common';
				import { B } from './b.service';
				@Injectable()
				export class A {
					constructor(private readonly b: B) {}
					foo() {
						return this.b.bar();
					}
				}
			`,
			"b.service.ts": `
				import { Injectable } from '@nestjs/common';
				import { A } from './a.service';
				@Injectable()
				export class B {
					constructor(private readonly a: A) {}
					bar() {
						return this.a.foo();
					}
				}
			`,
		});
		const foo = "/a.service.ts::A#foo";
		const bar = "/b.service.ts::B#bar";

		expect(graph.nodes.filter((node) => node.id === foo)).toHaveLength(1);
		expect(edgesOutOf(graph, foo).map((edge) => edge.to)).toEqual([bar]);
		expect(edgesOutOf(graph, bar).map((edge) => edge.to)).toEqual([foo]);
		expect(reachableFrom(graph, [foo])).toEqual(new Set([foo, bar]));
		expect([...outgoing(graph).keys()].sort()).toEqual([foo, bar]);
	});

	it("keeps two same-named classes in different files apart", () => {
		const graph = build({
			"billing/user.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class UserService {
					charge() {}
				}
			`,
			"auth/user.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class UserService {
					login() {}
				}
			`,
		});
		const ids = graph.nodes.map((node) => node.id);

		expect(ids).toContain("/billing/user.service.ts::UserService#charge");
		expect(ids).toContain("/auth/user.service.ts::UserService#login");
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("turns a two-level receiver into a db node carrying the member", () => {
		const graph = build({
			"users.repository.ts": `
				import { Injectable } from '@nestjs/common';
				import { PrismaService } from './prisma.service';
				@Injectable()
				export class UsersRepository {
					constructor(private readonly prisma: PrismaService) {}
					byId(id: string) {
						return this.prisma.user.findUnique({ where: { id } });
					}
				}
			`,
			"prisma.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class PrismaService {
					onModuleInit() {}
				}
			`,
		});
		const db = graph.nodes.find((node) => node.kind === "db");

		expect(db).toBeDefined();
		expect(db?.member).toBe("user");
		expect(db?.methodName).toBe("findUnique");
		expect(db?.id).toBe("/prisma.service.ts::PrismaService#user.findUnique");
		expect(
			edgesOutOf(graph, "/users.repository.ts::UsersRepository#byId").map(
				(edge) => edge.to
			)
		).toEqual([db?.id]);
	});

	it("reaches every unresolved reason and drops no call", () => {
		const graph = build({
			"mixed.service.ts": `
				import { Inject, Injectable } from '@nestjs/common';
				import { AxiosInstance } from 'axios';
				import { Known } from './known.service';

				export interface UserRepo {
					find(): void;
				}

				@Injectable()
				export class MixedService {
					constructor(
						private readonly http: AxiosInstance,
						@Inject('REPO') private readonly repo: UserRepo,
						private readonly known: Known,
						private readonly loose,
					) {}

					run() {
						this.http.get('/x');
						this.repo.find();
						this.known.missing();
						this.loose.doThing();
					}
				}
			`,
			"known.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class Known {
					present() {}
				}
			`,
		});
		const out = edgesOutOf(graph, "/mixed.service.ts::MixedService#run");
		const byId = indexNodes(graph);
		const reasons = out.map((edge) => byId.get(edge.to)?.unresolved);

		expect(out).toHaveLength(4);
		expect(new Set(reasons)).toEqual(
			new Set([
				"external-package",
				"interface-token",
				"method-not-found",
				"receiver-unknown",
			])
		);
		for (const node of graph.nodes.filter((n) => n.unresolved)) {
			expect(node.line).toBe(0);
		}
	});

	it("builds the same graph twice and in reverse file order", () => {
		expect(build(TWO_ENDPOINTS)).toEqual(build(TWO_ENDPOINTS));
		expect(build(TWO_ENDPOINTS, true)).toEqual(build(TWO_ENDPOINTS));
	});

	it("makes a same-class helper an edge instead of inlining it", () => {
		const graph = build({
			"orders.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class OrdersService {
					place() {
						return this.validate();
					}
					validate() {
						return true;
					}
				}
			`,
		});
		const place = "/orders.service.ts::OrdersService#place";
		const validate = "/orders.service.ts::OrdersService#validate";

		expect(graph.nodes.map((node) => node.id)).toEqual([place, validate]);
		expect(edgesOutOf(graph, place).map((edge) => edge.to)).toEqual([validate]);
	});

	it("keeps two calls to one callee as two ordered edges", () => {
		const graph = build({
			"a.service.ts": `
				import { Injectable } from '@nestjs/common';
				import { B } from './b.service';
				@Injectable()
				export class A {
					constructor(private readonly b: B) {}
					foo() {
						this.b.bar();
						this.b.bar();
					}
				}
			`,
			"b.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class B {
					bar() {}
				}
			`,
		});
		const out = edgesOutOf(graph, "/a.service.ts::A#foo");

		expect(out).toHaveLength(2);
		expect(out[0].to).toBe(out[1].to);
		expect(out[0].order).not.toBe(out[1].order);
		expect(out[0].line).not.toBe(out[1].line);
	});
});
