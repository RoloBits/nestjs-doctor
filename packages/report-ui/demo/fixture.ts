import type { ReportModel } from "../src/model";

/** A small deterministic model for the dev harness and tests. */
export function fixtureModel(): ReportModel {
	return {
		diagnostics: [
			{
				category: "performance",
				column: 1,
				filePath: "/repo/src/foo.service.ts",
				help: "Inject it somewhere or remove it.",
				line: 5,
				message: "Provider 'FooService' is never injected.",
				rule: "performance/no-unused-providers",
				severity: "warning",
			},
			{
				category: "schema",
				entity: "User",
				filePath: "/repo/prisma/schema.prisma",
				help: "Add @@id or @id.",
				message: "Model 'User' has no primary key.",
				rule: "schema/require-primary-key",
				severity: "error",
			},
		],
		elapsedMs: 4210,
		endpoints: { endpoints: [] },
		examples: {},
		fileSources: {},
		graph: {
			bootstrapRoots: ["AppModule"],
			circularDepRecommendations: {},
			circularDeps: [["AuthModule", "AppModule"]],
			edges: [{ from: "AppModule", to: "AuthModule" }],
			modules: [
				{
					controllers: ["UserController"],
					exports: [],
					filePath: "/repo/src/app.module.ts",
					imports: ["AuthModule"],
					isGlobal: false,
					name: "AppModule",
					providers: ["FooService"],
					providerTokens: [],
				},
				{
					controllers: [],
					exports: ["AuthModule"],
					filePath: "/repo/src/auth/auth.module.ts",
					imports: [],
					isGlobal: false,
					name: "AuthModule",
					providers: [],
					providerTokens: [],
				},
			],
			projects: [],
		},
		project: {
			fileCount: 12,
			framework: "express",
			moduleCount: 2,
			name: "sample-app",
			nestVersion: "11.0.0",
			orm: "prisma",
			score: { label: "Good", value: 82 },
		},
		providers: [
			{
				dependencies: ["ConfigService"],
				filePath: "/repo/src/foo.service.ts",
				module: "AppModule",
				name: "FooService",
				publicMethodCount: 3,
			},
		],
		schema: { entities: [], relations: [], orm: "prisma" },
		sourceLines: [null, null],
		summary: {
			byCategory: {
				architecture: 0,
				correctness: 0,
				performance: 1,
				schema: 1,
				security: 0,
			},
			errors: 1,
			info: 0,
			total: 2,
			warnings: 1,
		},
	};
}
