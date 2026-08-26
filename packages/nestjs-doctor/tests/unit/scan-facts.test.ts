import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type {
	ModuleGraph,
	ModuleNode,
} from "../../src/engine/graph/module-graph.js";
import type { ProviderInfo } from "../../src/engine/graph/type-resolver.js";
import { collectScanFacts } from "../../src/report/artifact.js";

const moduleNode = (name: string, filePath: string): ModuleNode => ({
	exports: [],
	filePath,
	forwardRefImports: new Set(),
	imports: [],
	isGlobal: false,
	name,
	providers: [],
	providerTokens: [],
});

interface Fixture {
	astProject: Project;
	graph: ModuleGraph;
	providers: Map<string, ProviderInfo>;
}

function fixture(): Fixture {
	const astProject = new Project({ useInMemoryFileSystem: true });
	const servicePath = "/repo/apps/api/src/users.service.ts";
	const serviceFile = astProject.createSourceFile(
		servicePath,
		"export class UsersService {}\n"
	);
	const unownedPath = "/repo/apps/api/src/unowned.service.ts";
	const unownedFile = astProject.createSourceFile(
		unownedPath,
		"export class UnownedService {}\n"
	);

	const usersModule = moduleNode(
		"UsersModule",
		"/repo/apps/api/src/users.module.ts"
	);
	const graph: ModuleGraph = {
		edges: new Map(),
		modules: new Map([
			[
				"AppModule",
				moduleNode("AppModule", "/repo/apps/api/src/app.module.ts"),
			],
			["UsersModule", usersModule],
		]),
		providerToModule: new Map([["UsersService", usersModule]]),
	};

	const providers = new Map<string, ProviderInfo>([
		[
			"UsersService",
			{
				classDeclaration: serviceFile.getClassOrThrow("UsersService"),
				dependencies: ["PrismaService"],
				filePath: servicePath,
				name: "UsersService",
				publicMethodCount: 2,
			},
		],
		[
			"UnownedService",
			{
				classDeclaration: unownedFile.getClassOrThrow("UnownedService"),
				dependencies: [],
				filePath: unownedPath,
				name: "UnownedService",
				publicMethodCount: 0,
				scope: "request",
			},
		],
	]);

	return { astProject, graph, providers };
}

describe("collectScanFacts", () => {
	it("prefixes roots and owner modules with the project name in monorepo mode", () => {
		const { astProject, graph, providers } = fixture();

		const facts = collectScanFacts({
			astProject,
			files: [],
			moduleGraph: graph,
			projectName: "api",
			providers,
		});

		expect(facts.bootstrapRoots).toEqual(["api/AppModule"]);
		expect(facts.providers).toHaveLength(2);
		expect(facts.providers[0]).toEqual({
			dependencies: ["PrismaService"],
			filePath: "/repo/apps/api/src/users.service.ts",
			module: "api/UsersModule",
			name: "UsersService",
			project: "api",
			publicMethodCount: 2,
		});
	});

	it("leaves unmapped owners as undefined while keeping the project label", () => {
		const { astProject, graph, providers } = fixture();

		const facts = collectScanFacts({
			astProject,
			files: [],
			moduleGraph: graph,
			projectName: "api",
			providers,
		});

		expect(facts.providers[1].module).toBeUndefined();
		expect(facts.providers[1].project).toBe("api");
		expect(facts.providers[1].scope).toBe("request");
	});

	it("keeps provider Map insertion order", () => {
		const { astProject, graph, providers } = fixture();

		const facts = collectScanFacts({
			astProject,
			files: [],
			moduleGraph: graph,
			projectName: "api",
			providers,
		});

		expect(facts.providers.map((p) => p.name)).toEqual([
			"UsersService",
			"UnownedService",
		]);
	});

	it("returns unprefixed roots and no project field in single-project mode", () => {
		const { astProject, graph, providers } = fixture();

		const facts = collectScanFacts({
			astProject,
			files: [],
			moduleGraph: graph,
			providers,
		});

		expect(facts.bootstrapRoots).toEqual(["AppModule"]);
		expect(facts.providers[0]).toEqual({
			dependencies: ["PrismaService"],
			filePath: "/repo/apps/api/src/users.service.ts",
			module: "UsersModule",
			name: "UsersService",
			project: undefined,
			publicMethodCount: 2,
		});
		expect(facts.providers[1].module).toBeUndefined();
		expect(facts.providers[1].project).toBeUndefined();
	});
});
