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
				category: "correctness",
				column: 3,
				filePath: "/repo/src/app.module.ts",
				help: "Await the call.",
				line: 8,
				message: "Async method has no await expression.",
				rule: "correctness/no-async-without-await",
				scope: "file",
				severity: "error",
				sourceLines: [
					{ line: 7, text: "  async onModuleInit() {" },
					{ line: 8, text: "    this.warm();" },
					{ line: 9, text: "  }" },
				],
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
		examples: {
			"performance/no-unused-providers": {
				bad: "@Injectable()\nexport class NeverUsed {}",
				good: "@Injectable()\nexport class UsedByModule {}",
			},
			"correctness/no-async-without-await": {
				bad: "this.warm();",
				good: "await this.warm();",
			},
		},
		fileSources: {
			"/repo/src/app.module.ts": [
				"import { Module } from '@nestjs/common';",
				"",
				"@Module({})",
				"export class AppModule {",
				"  private warm = () => 1;",
				"",
				"  async onModuleInit() {",
				"    this.warm();",
				"  }",
				"}",
			].join("\n"),
		},
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
		sourceLines: [
			null,
			[
				{ line: 7, text: "  async onModuleInit() {" },
				{ line: 8, text: "    this.warm();" },
				{ line: 9, text: "  }" },
			],
			null,
		],
		summary: {
			byCategory: {
				architecture: 0,
				correctness: 1,
				performance: 1,
				schema: 1,
				security: 0,
			},
			errors: 1,
			info: 0,
			total: 3,
			warnings: 1,
		},
	};
}
