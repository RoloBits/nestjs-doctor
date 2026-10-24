import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diagnoseMonorepo } from "../../src/api/index.js";

const roots: string[] = [];
const rule = "security/require-guards-on-endpoints";

async function workspace(extraApp?: string, guardImport = "@fixture/auth") {
	const root = await mkdtemp(join(tmpdir(), "doctor-workspace-guards-"));
	roots.push(root);
	await writeFile(
		join(root, "package.json"),
		JSON.stringify({ private: true, workspaces: ["packages/*"] })
	);
	const files = {
		auth: `import { Module } from '@nestjs/common';
      import { APP_GUARD } from '@nestjs/core';
      @Module({ providers: [{ provide: APP_GUARD, useClass: AuthGuard }] }) export class AuthModule {}`,
		business: `import { Controller, Get, Module } from '@nestjs/common';
      @Controller('business') class BusinessController { @Get() read() {} }
      @Module({ controllers: [BusinessController] }) export class BusinessModule {}`,
		orphan: `import { Controller, Get, Module } from '@nestjs/common';
      @Controller('orphan') class OrphanController { @Get() read() {} }
      @Module({ controllers: [OrphanController] }) export class OrphanModule {}`,
		api: `import { Module } from '@nestjs/common';
      import { AuthModule } from '${guardImport}';
      import { BusinessModule } from '@fixture/business';
      @Module({ imports: [AuthModule, BusinessModule] }) export class AppModule {}`,
		...(extraApp ? { other: extraApp } : {}),
	};
	await Promise.all(
		Object.entries(files).map(async ([name, source]) => {
			const directory = join(root, "packages", name);
			await mkdir(join(directory, "src"), { recursive: true });
			await writeFile(
				join(directory, "package.json"),
				JSON.stringify({
					name: `@fixture/${name}`,
					dependencies: { "@nestjs/common": "12.2.0" },
				})
			);
			await writeFile(join(directory, "src", "module.ts"), source);
		})
	);
	return root;
}

async function flagged(root: string) {
	const result = await diagnoseMonorepo(root);
	return result.combined.diagnostics
		.filter((item) => item.rule === rule)
		.map((item) => item.filePath.split("/").at(-3))
		.sort();
}

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
	);
});

async function composeProviders(root: string, expression: string) {
	const auth = join(root, "packages", "auth", "src");
	await writeFile(
		join(auth, "providers.ts"),
		`import { APP_GUARD } from '@nestjs/core'; export const PROVIDERS = [{ provide: APP_GUARD, useClass: AuthGuard }];`
	);
	await writeFile(
		join(auth, "module.ts"),
		`import { Module } from '@nestjs/common'; import { PROVIDERS } from './providers.js'; @Module({ providers: ${expression} }) export class AuthModule {}`
	);
}

async function composeImports(root: string, auth = "@fixture/auth") {
	const api = join(root, "packages", "api", "src");
	await writeFile(
		join(api, "imports.ts"),
		`import { AuthModule } from '${auth}'; import { BusinessModule } from '@fixture/business'; export const IMPORTS = [AuthModule, BusinessModule];`
	);
	await writeFile(
		join(api, "module.ts"),
		`import { Module } from '@nestjs/common'; import { IMPORTS } from './imports.js'; @Module({ imports: [...IMPORTS] }) export class AppModule {}`
	);
}

describe("workspace application global guards", () => {
	it("follows imported provider and module arrays", async () => {
		const root = await workspace();
		await composeProviders(root, "[...PROVIDERS]");
		await composeImports(root);
		expect(await flagged(root)).toEqual(["orphan"]);
	});

	it("does not turn a conditional provider list into guaranteed protection", async () => {
		const root = await workspace();
		await composeProviders(root, "[...(enabled ? PROVIDERS : [])]");
		expect(await flagged(root)).toEqual(["business", "orphan"]);
	});

	it("retains package provenance through imported module arrays", async () => {
		const root = await workspace();
		await composeImports(root, "@external/auth");
		expect(await flagged(root)).toEqual(["business", "orphan"]);
	});

	it("does not count a conditionally imported guard module", async () => {
		const root = await workspace();
		await writeFile(
			join(root, "packages/api/src/module.ts"),
			`import { Module } from '@nestjs/common'; import { AuthModule } from '@fixture/auth'; import { BusinessModule } from '@fixture/business'; @Module({ imports: [...(enabled ? [AuthModule] : []), BusinessModule] }) export class AppModule {}`
		);
		expect(await flagged(root)).toEqual(["business", "orphan"]);
	});

	it("keeps optional consumers in the unguarded-root check", async () => {
		const source = `import { Module } from '@nestjs/common'; import { BusinessModule } from '@fixture/business'; @Module({ imports: [...(enabled ? [BusinessModule] : [])] }) export class AppModule {}`;
		expect(await flagged(await workspace(source))).toEqual([
			"business",
			"orphan",
		]);
	});

	it("does not count a guard hidden in an unused dynamic registration", async () => {
		const root = await workspace();
		await writeFile(
			join(root, "packages/auth/src/module.ts"),
			`import { Module } from '@nestjs/common'; import { APP_GUARD } from '@nestjs/core'; @Module({}) export class AuthModule { static forRoot() { return { module: AuthModule, providers: [{ provide: APP_GUARD, useClass: AuthGuard }] }; } }`
		);
		expect(await flagged(root)).toEqual(["business", "orphan"]);
	});

	it("terminates on a cyclic provider binding without inferring a guard", async () => {
		const root = await workspace();
		await composeProviders(root, "[...PROVIDERS]");
		await writeFile(
			join(root, "packages/auth/src/providers.ts"),
			"export const PROVIDERS = [...PROVIDERS];"
		);
		expect(await flagged(root)).toEqual(["business", "orphan"]);
	});

	it("follows sibling workspace imports without blessing an orphan controller", async () => {
		expect(await flagged(await workspace())).toEqual(["orphan"]);
	});

	it("does not leak protection to a different application with the same root class name", async () => {
		const source = `import { Controller, Get, Module } from '@nestjs/common';
      @Controller() class BusinessController { @Get() read() {} }
      @Module({ controllers: [BusinessController] }) export class AppModule {}`;
		expect(await flagged(await workspace(source))).toEqual(["orphan", "other"]);
	});

	it("reports a shared controller reached by an unguarded application too", async () => {
		const source = `import { Module } from '@nestjs/common';
      import { BusinessModule } from '@fixture/business';
      @Module({ imports: [BusinessModule] }) export class AppModule {}`;
		expect(await flagged(await workspace(source))).toEqual([
			"business",
			"orphan",
		]);
	});

	it("does not mistake an unresolved package for a same-named workspace guard", async () => {
		expect(await flagged(await workspace(undefined, "@external/auth"))).toEqual(
			["business", "orphan"]
		);
	});
});
