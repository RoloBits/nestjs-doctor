import type {
	ReportArtifact,
	ReportProvider,
} from "../../src/common/artifact.js";
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

/**
 * An artifact with enough graph, schema and endpoint data that the report's
 * sidebar trees, tab panels and detail views all render something.
 */
export const RICH_ARTIFACT: ReportArtifact = {
	...EMPTY_ARTIFACT,
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
