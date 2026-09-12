import type {
	ReportArtifact,
	ReportProvider,
} from "../../src/common/artifact.js";
import type {
	CallEdge,
	CodeGraph,
	MethodNode,
} from "../../src/common/code-graph.js";
import { encodeCodeGraph } from "../../src/common/code-graph-codec.js";
import type {
	CodeDiagnostic,
	Diagnostic,
} from "../../src/common/diagnostic.js";
import type { DiagnoseResult } from "../../src/common/result.js";

export const resultWith = (diagnostics: Diagnostic[]): DiagnoseResult =>
	({
		score: { value: 90, label: "Excellent" },
		diagnostics,
		project: {
			name: "app",
			nestVersion: "11.0.0",
			orm: "prisma",
			framework: "express",
			fileCount: 4,
			moduleCount: 1,
		},
		summary: {
			total: diagnostics.length,
			errors: 0,
			warnings: diagnostics.length,
			info: 0,
			byCategory: {
				security: 0,
				performance: diagnostics.length,
				correctness: 0,
				architecture: 0,
				schema: 0,
			},
		},
		ruleErrors: [],
		endpoints: undefined,
		schema: undefined,
		scope: undefined,
		elapsedMs: 10,
	}) as DiagnoseResult;

export const emptyResult = (): DiagnoseResult => resultWith([]);

export const codeDiagnostic = (
	overrides: Partial<CodeDiagnostic>
): CodeDiagnostic => ({
	rule: "performance/no-unused-providers",
	category: "performance",
	severity: "warning",
	filePath: "/repo/src/a.service.ts",
	message: "Provider is never injected.",
	help: "Remove it.",
	line: 3,
	column: 1,
	...overrides,
});

export const EMPTY_ARTIFACT: ReportArtifact = {
	schemaVersion: 1,
	generator: { name: "nestjs-doctor", version: "0.0.0" },
	generatedAt: "2026-01-01T00:00:00.000Z",
	monorepo: false,
	project: {
		name: "app",
		nestVersion: null,
		orm: null,
		framework: null,
		fileCount: 1,
		moduleCount: 1,
	},
	score: { value: 100, label: "Excellent" },
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
	diagnostics: [] as Diagnostic[],
	ruleErrors: [],
	elapsedMs: 0,
	graph: {
		modules: [],
		edges: [],
		circularDeps: [],
		circularDepRecommendations: {},
		projects: [],
		bootstrapRoots: [],
		timingsTrace: {},
	},
	providers: [] as ReportProvider[],
	endpoints: { endpoints: [] },
	schema: { entities: [], relations: [], orm: "" },
	share: {
		filename: "nestjs-doctor-shared.json",
		findingsByCategory: {},
		project: {
			name: "app",
			nestVersion: null,
			orm: null,
			framework: null,
			fileCount: 1,
			moduleCount: 1,
		},
		sections: [
			{ count: 100, id: "score", label: "Health score and project info" },
		],
		score: { value: 100, label: "Excellent" },
		version: 1,
	},
	examples: {},
	sources: {},
};

export const EMPTY_ARTIFACT_JSON = JSON.stringify(EMPTY_ARTIFACT);

const descentNode = (
	filePath: string,
	className: string,
	methodName: string,
	kind: MethodNode["kind"],
	extra: Partial<MethodNode> = {}
): MethodNode => ({
	body: [],
	classMethodCount: 1,
	className,
	endLine: 10,
	filePath,
	id: extra.member
		? `${filePath}::${className}#${extra.member}.${methodName}`
		: `${filePath}::${className}#${methodName}`,
	kind,
	line: 1,
	methodName,
	parameters: [],
	returnType: null,
	...extra,
});

const descentEdge = (
	from: string,
	to: string,
	order: number,
	extra: Partial<CallEdge> = {}
): CallEdge => ({
	assignedTo: null,
	awaited: true,
	branchGroupId: null,
	branchKind: null,
	comment: null,
	conditional: false,
	conditionPath: [],
	conditionText: null,
	from,
	guardThrow: null,
	iterationKind: null,
	iterationLabel: null,
	line: 2,
	order,
	to,
	tryRegion: null,
	...extra,
});

const CTL = "src/a.controller.ts::AController#handle";
const LOAD = "src/a.service.ts::AService#load";
const SAVE = "src/a.service.ts::AService#save";
const FIND = "src/prisma.service.ts::PrismaService#user.findUnique";
const UPDATE = "src/prisma.service.ts::PrismaService#user.update";
const LOG = "src/app.logger.ts::AppLogger#log";

/**
 * One controller over two services, a Prisma read and write, a logger, a
 * second visit to a service, and a call back to the handler on the path.
 */
export const DESCENT_GRAPH: CodeGraph = {
	edges: [
		descentEdge(CTL, LOAD, 0),
		descentEdge(CTL, SAVE, 1, { conditional: true }),
		descentEdge(LOAD, FIND, 0),
		descentEdge(LOAD, LOG, 1, { awaited: false }),
		descentEdge(SAVE, UPDATE, 0),
		descentEdge(SAVE, LOAD, 1, { iterationKind: "concurrent" }),
		descentEdge(SAVE, CTL, 2),
	],
	entries: [
		{
			controllerClass: "AController",
			handlerMethod: "handle",
			httpMethod: "POST",
			node: CTL,
			returnType: null,
			routePath: "/a",
			swagger: null,
		},
		{
			controllerClass: "AController",
			handlerMethod: "peek",
			httpMethod: "GET",
			node: "src/a.controller.ts::AController#peek",
			returnType: null,
			routePath: "/a/peek",
			swagger: null,
		},
	],
	nodes: [
		descentNode("src/a.controller.ts", "AController", "handle", "controller"),
		descentNode("src/a.controller.ts", "AController", "peek", "controller"),
		descentNode("src/a.service.ts", "AService", "load", "service"),
		descentNode("src/a.service.ts", "AService", "save", "service"),
		descentNode("src/prisma.service.ts", "PrismaService", "findUnique", "db", {
			member: "user",
		}),
		descentNode("src/prisma.service.ts", "PrismaService", "update", "db", {
			member: "user",
		}),
		descentNode("src/app.logger.ts", "AppLogger", "log", "service"),
	],
};

/**
 * A controller calling a straight chain of `steps - 1` services, so the walk
 * is exactly `steps` long. `withDb` makes the last one a db node.
 */
export const chainGraph = (steps: number, withDb: boolean): CodeGraph => {
	const nodes: MethodNode[] = [
		descentNode(
			"src/chain.controller.ts",
			"ChainController",
			"run",
			"controller"
		),
	];
	const edges: CallEdge[] = [];
	for (let i = 1; i < steps; i++) {
		const last = withDb && i === steps - 1;
		nodes.push(
			descentNode(
				`src/chain${i}.service.ts`,
				`Chain${i}Service`,
				last ? "findMany" : `step${i}`,
				last ? "db" : "service"
			)
		);
		edges.push(
			descentEdge(nodes[i - 1]?.id as string, nodes[i]?.id as string, 0)
		);
	}
	return {
		edges,
		entries: [
			{
				controllerClass: "ChainController",
				handlerMethod: "run",
				httpMethod: "GET",
				node: nodes[0]?.id as string,
				returnType: null,
				routePath: "/chain",
				swagger: null,
			},
		],
		nodes,
	};
};

/** A controller calling one node `visits` times, for the visit strip. */
export const callsGraph = (
	visits: number,
	kind: MethodNode["kind"],
	member?: string
): CodeGraph => {
	const caller = descentNode(
		"src/calls.controller.ts",
		"CallsController",
		"run",
		"controller"
	);
	const callee = descentNode(
		kind === "unresolved" ? "@nestjs/config" : "src/callee.service.ts",
		"Callee",
		"hit",
		kind,
		member ? { member } : {}
	);
	return {
		edges: Array.from({ length: visits }, (_, i) =>
			descentEdge(caller.id, callee.id, i, { line: 10 + i })
		),
		entries: [
			{
				controllerClass: "CallsController",
				handlerMethod: "run",
				httpMethod: "GET",
				node: caller.id,
				returnType: null,
				routePath: "/calls",
				swagger: null,
			},
		],
		nodes: [caller, callee],
	};
};

/**
 * An artifact with enough graph, schema and endpoint data that the report's
 * sidebar trees, tab panels and detail views all render something.
 */
export const RICH_ARTIFACT: ReportArtifact = {
	...EMPTY_ARTIFACT,
	codeGraph: encodeCodeGraph(DESCENT_GRAPH),
	project: { ...EMPTY_ARTIFACT.project, fileCount: 4, moduleCount: 3 },
	diagnostics: [
		codeDiagnostic({
			rule: "performance/no-unused-providers",
			message: "Provider 'OrderService' is never injected.",
			filePath: "src/order/order.service.ts",
		}),
	],
	graph: {
		...EMPTY_ARTIFACT.graph,
		projects: ["api"],
		modules: [
			{
				name: "AppModule",
				filePath: "src/app.module.ts",
				imports: ["UserModule", "OrderModule", "ConfigModule"],
				dynamicImports: { ConfigModule: "forRoot" },
				exports: [],
				providers: [],
				controllers: [],
				project: "api",
			},
			{
				name: "UserModule",
				filePath: "src/user/user.module.ts",
				imports: [],
				exports: ["UserService", "SharedModule"],
				providerTokens: ["USER_CONFIG"],
				providers: ["UserService"],
				controllers: ["UserController"],
				project: "api",
			},
			{
				name: "OrderModule",
				filePath: "src/order/order.module.ts",
				isGlobal: true,
				imports: ["UserModule"],
				exports: [],
				providers: ["OrderService"],
				controllers: [],
				project: "api",
			},
		],
		edges: [
			{ from: "AppModule", to: "UserModule" },
			{ from: "AppModule", to: "OrderModule" },
			{ from: "OrderModule", to: "UserModule" },
			{ from: "UserModule", to: "OrderModule" },
		],
		circularDeps: [["OrderModule", "UserModule"]],
	},
	providers: [
		{
			name: "UserService",
			filePath: "src/user/user.service.ts",
			module: "UserModule",
			dependencies: [],
			publicMethodCount: 3,
		},
		{
			name: "OrderService",
			filePath: "src/order/order.service.ts",
			module: "OrderModule",
			dependencies: ["UserService"],
			publicMethodCount: 2,
			scope: "request",
		},
	],
	endpoints: {
		endpoints: [
			{
				controllerClass: "UserController",
				handlerMethod: "findAll",
				httpMethod: "GET",
				routePath: "/users",
				filePath: "src/user/user.controller.ts",
				line: 10,
				endLine: 14,
				returnType: "User[]",
				swagger: null,
				dependencies: [],
			},
			{
				controllerClass: "UserController",
				handlerMethod: "create",
				httpMethod: "POST",
				routePath: "/users",
				filePath: "src/user/user.controller.ts",
				line: 16,
				endLine: 20,
				returnType: "User",
				swagger: null,
				dependencies: [],
			},
		],
	},
	schema: {
		orm: "typeorm",
		entities: [
			{
				name: "User",
				tableName: "users",
				filePath: "src/user/user.entity.ts",
				columns: [
					{
						name: "id",
						type: "uuid",
						isPrimary: true,
						isNullable: false,
						isUnique: true,
					},
					{
						name: "email",
						type: "varchar",
						isPrimary: false,
						isNullable: false,
						isUnique: true,
					},
				],
				relations: [],
			},
			{
				name: "Order",
				tableName: "orders",
				filePath: "src/order/order.entity.ts",
				columns: [
					{
						name: "id",
						type: "uuid",
						isPrimary: true,
						isNullable: false,
						isUnique: true,
					},
				],
				relations: [
					{
						fromEntity: "Order",
						toEntity: "User",
						propertyName: "user",
						type: "many-to-one",
						isNullable: false,
					},
				],
			},
		],
		relations: [
			{
				fromEntity: "Order",
				toEntity: "User",
				propertyName: "user",
				type: "many-to-one",
				isNullable: false,
			},
		],
	},
};

export const RICH_ARTIFACT_JSON = JSON.stringify(RICH_ARTIFACT);
