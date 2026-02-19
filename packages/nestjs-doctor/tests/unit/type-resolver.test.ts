import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { resolveProviders } from "../../src/engine/type-resolver.js";

function createProject(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	return { project, paths };
}

describe("type-resolver", () => {
	it("resolves injectable providers", () => {
		const { project, paths } = createProject({
			"users.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class UsersService {
          constructor(private readonly repo: any) {}
          findAll() { return []; }
          findOne(id: string) { return null; }
        }
      `,
		});

		const providers = resolveProviders(project, paths);
		expect(providers.size).toBe(1);

		const usersService = providers.get("UsersService");
		expect(usersService).toBeDefined();
		expect(usersService?.publicMethodCount).toBe(2);
		expect(usersService?.dependencies).toHaveLength(1);
	});

	it("ignores non-injectable classes", () => {
		const { project, paths } = createProject({
			"plain.ts": `
        export class PlainClass {
          constructor(private readonly dep: any) {}
          doStuff() {}
        }
      `,
		});

		const providers = resolveProviders(project, paths);
		expect(providers.size).toBe(0);
	});

	it("resolves typed constructor dependencies from type annotations", () => {
		const { project, paths } = createProject({
			"app.service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class AppService {
          constructor(
            private readonly usersService: UsersService,
            private readonly ordersService: OrdersService,
          ) {}
        }
      `,
		});

		const providers = resolveProviders(project, paths);
		const appService = providers.get("AppService");
		expect(appService).toBeDefined();
		expect(appService?.dependencies).toEqual(["UsersService", "OrdersService"]);
	});

	it("counts public methods correctly", () => {
		const { project, paths } = createProject({
			"service.ts": `
        import { Injectable } from '@nestjs/common';
        @Injectable()
        export class TestService {
          publicOne() {}
          publicTwo() {}
          private privateOne() {}
          protected protectedOne() {}
        }
      `,
		});

		const providers = resolveProviders(project, paths);
		const svc = providers.get("TestService");
		expect(svc?.publicMethodCount).toBe(2);
	});
});
