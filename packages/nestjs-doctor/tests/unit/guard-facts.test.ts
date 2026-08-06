import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { buildGuardDecoratorIndex } from "../../src/engine/graph/guard-decorators.js";
import { buildGuardFacts } from "../../src/engine/graph/guard-facts.js";
import { buildModuleGraph } from "../../src/engine/graph/module-graph.js";

function setup(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	// Mirror the pathAliases argument shape used in tests/unit/module-graph.test.ts
	const moduleGraph = buildModuleGraph(project, paths, new Map());
	const guardDecorators = buildGuardDecoratorIndex(project, paths);
	return buildGuardFacts(project, paths, moduleGraph, guardDecorators);
}

describe("buildGuardFacts", () => {
	it("detects APP_GUARD registration", () => {
		const facts = setup({
			"app.module.ts": `
				import { Module } from '@nestjs/common';
				import { APP_GUARD } from '@nestjs/core';
				@Module({ providers: [{ provide: APP_GUARD, useClass: AuthGuard }] })
				export class AppModule {}
			`,
		});
		expect(facts.globallyRegistered).toBe(true);
	});

	it("reports no global guard for a plain module", () => {
		const facts = setup({
			"app.module.ts": `
				import { Module } from '@nestjs/common';
				@Module({ providers: [SomeService] })
				export class AppModule {}
			`,
		});
		expect(facts.globallyRegistered).toBe(false);
	});

	it("collects decorators composing UseGuards and guarded base classes", () => {
		const facts = setup({
			"auth.decorator.ts": `
				import { applyDecorators, UseGuards } from '@nestjs/common';
				export function Auth() {
					return applyDecorators(UseGuards(JwtGuard));
				}
			`,
			"admin.controller.ts": `
				import { Controller, UseGuards } from '@nestjs/common';
				@Controller('admin')
				@UseGuards(JwtGuard)
				export class AdminController extends BaseController {}
			`,
		});
		expect(facts.composedDecorators.has("Auth")).toBe(true);
		expect(facts.guardedBaseClasses.has("BaseController")).toBe(true);
	});
});
