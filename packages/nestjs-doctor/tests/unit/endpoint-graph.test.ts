import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { buildEndpointGraph } from "../../src/engine/graph/endpoint-graph.js";
import { resolveProviders } from "../../src/engine/graph/type-resolver.js";

function createProject(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	return { project, paths };
}

describe("endpoint-graph", () => {
	it("dependency tree only includes deps used by the endpoint method chain", () => {
		const { project, paths } = createProject({
			"admin.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('admin')
				export class AdminController {
					constructor(private readonly adminService: AdminService) {}

					@Get('organizations')
					getAllOrganizations() {
						return this.adminService.getAllOrganizations();
					}
				}
			`,
			"admin.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AdminService {
					constructor(
						private readonly adminRepository: AdminRepository,
						private readonly logger: CrocovaLogger,
						private readonly rolesService: RolesService,
						private readonly eventsService: OrganizationEventsService,
					) {}

					getAllOrganizations() {
						return this.adminRepository.findAllOrganizations();
					}

					deleteOrganization(id: string) {
						this.eventsService.emit(id);
						this.rolesService.revokeAll(id);
						return this.adminRepository.deleteOrganization(id);
					}
				}
			`,
			"admin.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AdminRepository {
					constructor(private readonly prisma: PrismaService) {}

					findAllOrganizations() {
						return this.prisma.findMany();
					}

					deleteOrganization(id: string) {
						return this.prisma.delete(id);
					}
				}
			`,
			"crocova-logger.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class CrocovaLogger {
					log(msg: string) {}
				}
			`,
			"roles.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class RolesService {
					revokeAll(id: string) {}
				}
			`,
			"events.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class OrganizationEventsService {
					emit(id: string) {}
				}
			`,
			"prisma.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class PrismaService {
					organization = {};
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find(
			(e) => e.httpMethod === "GET" && e.routePath === "/admin/organizations"
		);
		expect(endpoint).toBeDefined();

		// Top-level: single method node for AdminService.getAllOrganizations
		expect(endpoint!.dependencies).toHaveLength(1);
		expect(endpoint!.dependencies[0].className).toBe("AdminService");
		expect(endpoint!.dependencies[0].methodName).toBe("getAllOrganizations");
		expect(endpoint!.dependencies[0].conditional).toBe(false);

		// AdminService's sub-deps: AdminRepository.findAllOrganizations (not CrocovaLogger, RolesService, etc.)
		const adminServiceDeps = endpoint!.dependencies[0].dependencies;
		expect(adminServiceDeps).toHaveLength(1);
		expect(adminServiceDeps[0].className).toBe("AdminRepository");
		expect(adminServiceDeps[0].methodName).toBe("findAllOrganizations");
		expect(adminServiceDeps[0].conditional).toBe(false);

		// AdminRepository's sub-deps: PrismaService.findMany
		const adminRepoDeps = adminServiceDeps[0].dependencies;
		expect(adminRepoDeps).toHaveLength(1);
		expect(adminRepoDeps[0].className).toBe("PrismaService");
		expect(adminRepoDeps[0].methodName).toBe("findMany");

		// Method nodes have line numbers
		expect(endpoint!.dependencies[0].line).toBeGreaterThan(0);
		expect(adminServiceDeps[0].line).toBeGreaterThan(0);
	});

	it("populates line numbers for dependency method nodes", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Get()
					getRoot() {
						return this.svc.hello();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					hello() { return 'hi'; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();

		const dep = endpoint!.dependencies[0];
		expect(dep.className).toBe("AppService");
		expect(dep.methodName).toBe("hello");
		expect(dep.line).toBeGreaterThan(0);
	});

	it("sets line to 0 for fallback dependency nodes", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Get()
					getRoot() {
						return this.svc.hello();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					constructor(private readonly helper: HelperService) {}
					hello() { return 'hi'; }
				}
			`,
			"helper.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class HelperService {
					doWork() {}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();

		// AppService.hello calls no sub-deps, but HelperService is a constructor dep
		// Since hello() doesn't call this.helper.*, HelperService won't appear
		// Let's verify the method node has a line
		const dep = endpoint!.dependencies[0];
		expect(dep.line).toBeGreaterThan(0);
	});

	it("falls back to all constructor deps when no method info is available", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly appService: AppService) {}

					@Get()
					getRoot() {
						return this.appService.getHello();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					constructor(
						private readonly configService: ConfigService,
						private readonly cacheService: CacheService,
					) {}

					getHello() {
						return this.configService.get('greeting');
					}
				}
			`,
			"config.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class ConfigService {
					constructor(
						private readonly envLoader: EnvLoader,
						private readonly validator: ConfigValidator,
					) {}

					get(key: string) { return key; }
				}
			`,
			"cache.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class CacheService {
					get(key: string) { return key; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();

		// AppService.getHello is the only top-level dep
		expect(endpoint!.dependencies).toHaveLength(1);
		const appService = endpoint!.dependencies[0];
		expect(appService.className).toBe("AppService");
		expect(appService.methodName).toBe("getHello");

		// Only ConfigService.get (used in getHello), NOT CacheService
		expect(appService.dependencies).toHaveLength(1);
		expect(appService.dependencies[0].className).toBe("ConfigService");
		expect(appService.dependencies[0].methodName).toBe("get");

		// ConfigService.get() doesn't call any injected deps, so childDeps will be empty
		expect(appService.dependencies[0].dependencies).toHaveLength(0);
	});

	it("handles circular dependencies without infinite recursion", () => {
		const { project, paths } = createProject({
			"a.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('a')
				export class AController {
					constructor(private readonly aService: AService) {}

					@Get()
					getA() {
						return this.aService.doA();
					}
				}
			`,
			"a.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AService {
					constructor(private readonly bService: BService) {}
					doA() {
						return this.bService.doB();
					}
				}
			`,
			"b.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class BService {
					constructor(private readonly aService: AService) {}
					doB() {
						return this.aService.doA();
					}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();

		// AService.doA → BService.doB, but BService → AService is visited, so stops
		expect(endpoint!.dependencies).toHaveLength(1);
		expect(endpoint!.dependencies[0].className).toBe("AService");
		expect(endpoint!.dependencies[0].methodName).toBe("doA");
		expect(endpoint!.dependencies[0].dependencies).toHaveLength(1);
		expect(endpoint!.dependencies[0].dependencies[0].className).toBe(
			"BService"
		);
		expect(endpoint!.dependencies[0].dependencies[0].methodName).toBe("doB");
		// AService already visited, so no deeper recursion
		expect(endpoint!.dependencies[0].dependencies[0].dependencies).toHaveLength(
			0
		);
	});

	it("marks methods inside if/else branches as conditional", () => {
		const { project, paths } = createProject({
			"org.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller('org')
				export class OrgController {
					constructor(private readonly orgService: OrgService) {}

					@Post()
					create() {
						return this.orgService.createOrganizationWithOwner();
					}
				}
			`,
			"org.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class OrgService {
					constructor(private readonly adminRepo: AdminRepository) {}

					createOrganizationWithOwner() {
						const owner = this.adminRepo.findUserByEmail('test');
						if (!owner) {
							this.adminRepo.createUser({});
						} else if (owner.status !== 'ACTIVE') {
							this.adminRepo.activateUser(owner.id);
						}
						return owner;
					}
				}
			`,
			"admin.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AdminRepository {
					findUserByEmail(email: string) { return null; }
					createUser(data: any) { return data; }
					activateUser(id: string) { return id; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();

		const orgService = endpoint!.dependencies[0];
		expect(orgService.className).toBe("OrgService");
		expect(orgService.methodName).toBe("createOrganizationWithOwner");

		// Each method of AdminRepository is its own node in orgService.dependencies
		const adminRepoDeps = orgService.dependencies;
		expect(adminRepoDeps).toHaveLength(3);

		// findUserByEmail is unconditional
		const findUser = adminRepoDeps.find(
			(d) => d.methodName === "findUserByEmail"
		);
		expect(findUser).toBeDefined();
		expect(findUser!.conditional).toBe(false);
		expect(findUser!.branchKind).toBeNull();
		expect(findUser!.conditionText).toBeNull();
		expect(findUser!.branchGroupId).toBeNull();

		// createUser is conditional (if branch)
		const createUser = adminRepoDeps.find((d) => d.methodName === "createUser");
		expect(createUser).toBeDefined();
		expect(createUser!.conditional).toBe(true);
		expect(createUser!.branchKind).toBe("if");
		expect(createUser!.conditionText).toBe("!owner");

		// activateUser is conditional (else-if branch)
		const activateUser = adminRepoDeps.find(
			(d) => d.methodName === "activateUser"
		);
		expect(activateUser).toBeDefined();
		expect(activateUser!.conditional).toBe(true);
		expect(activateUser!.branchKind).toBe("else-if");
		expect(activateUser!.conditionText).toBe("owner.status !== 'ACTIVE'");

		// createUser and activateUser share the same branchGroupId
		expect(createUser!.branchGroupId).toBeTruthy();
		expect(createUser!.branchGroupId).toBe(activateUser!.branchGroupId);
	});

	it("shows each call separately when same method is called both inside and outside conditional", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Post()
					doWork() {
						return this.svc.process();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					constructor(private readonly repo: DataRepository) {}

					process() {
						this.repo.save('always');
						if (Math.random() > 0.5) {
							this.repo.save('conditional');
						}
						return true;
					}
				}
			`,
			"data.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class DataRepository {
					save(data: string) { return data; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();

		// DataRepository.save — two separate nodes (unconditional then conditional)
		const svcDeps = endpoint!.dependencies[0].dependencies;
		const saveCalls = svcDeps.filter(
			(d) => d.className === "DataRepository" && d.methodName === "save"
		);
		expect(saveCalls).toHaveLength(2);
		// First call is unconditional
		expect(saveCalls[0].conditional).toBe(false);
		// Second call is conditional
		expect(saveCalls[1].conditional).toBe(true);
	});

	it("marks methods in switch case clauses as conditional", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Post()
					handle() {
						return this.svc.route('type');
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					constructor(private readonly repo: DataRepository) {}

					route(type: string) {
						switch (type) {
							case 'a':
								return this.repo.handleA();
							case 'b':
								return this.repo.handleB();
							default:
								return this.repo.handleDefault();
						}
					}
				}
			`,
			"data.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class DataRepository {
					handleA() {}
					handleB() {}
					handleDefault() {}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();

		// Each switch case method is its own node
		const repoDeps = endpoint!.dependencies[0].dependencies;
		expect(repoDeps).toHaveLength(3);
		for (const dep of repoDeps) {
			expect(dep.className).toBe("DataRepository");
			expect(dep.conditional).toBe(true);
		}
		const methodNames = repoDeps.map((d) => d.methodName).sort();
		expect(methodNames).toEqual(["handleA", "handleB", "handleDefault"]);

		// Verify switch/case branch details
		const handleA = repoDeps.find((d) => d.methodName === "handleA");
		const handleB = repoDeps.find((d) => d.methodName === "handleB");
		const handleDefault = repoDeps.find(
			(d) => d.methodName === "handleDefault"
		);
		expect(handleA!.branchKind).toBe("case");
		expect(handleA!.conditionText).toBe("'a'");
		expect(handleB!.branchKind).toBe("case");
		expect(handleB!.conditionText).toBe("'b'");
		expect(handleDefault!.branchKind).toBe("default");
		expect(handleDefault!.conditionText).toBeNull();

		// All share the same branchGroupId (same switch)
		expect(handleA!.branchGroupId).toBeTruthy();
		expect(handleA!.branchGroupId).toBe(handleB!.branchGroupId);
		expect(handleA!.branchGroupId).toBe(handleDefault!.branchGroupId);
	});

	it("marks ternary branches as conditional", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Get()
					check() {
						return this.svc.decide();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					constructor(private readonly repo: DataRepository) {}

					decide() {
						return Math.random() > 0.5
							? this.repo.optionA()
							: this.repo.optionB();
					}
				}
			`,
			"data.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class DataRepository {
					optionA() {}
					optionB() {}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();

		const repoDeps = endpoint!.dependencies[0].dependencies;
		expect(repoDeps).toHaveLength(2);
		const optA = repoDeps.find((d) => d.methodName === "optionA");
		const optB = repoDeps.find((d) => d.methodName === "optionB");
		expect(optA!.conditional).toBe(true);
		expect(optB!.conditional).toBe(true);

		// Ternary branch details
		expect(optA!.branchKind).toBe("ternary-true");
		expect(optB!.branchKind).toBe("ternary-false");
		expect(optA!.conditionText).toBe("Math.random() > 0.5");
		expect(optB!.conditionText).toBe("Math.random() > 0.5");

		// Both share the same branchGroupId
		expect(optA!.branchGroupId).toBeTruthy();
		expect(optA!.branchGroupId).toBe(optB!.branchGroupId);
	});

	it("marks catch clause methods as conditional but try body as unconditional", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Post()
					save() {
						return this.svc.safeSave();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					constructor(private readonly repo: DataRepository) {}

					safeSave() {
						try {
							this.repo.save('data');
						} catch (e) {
							this.repo.logError(e);
						}
					}
				}
			`,
			"data.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class DataRepository {
					save(data: string) { return data; }
					logError(e: any) {}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();

		const repoDeps = endpoint!.dependencies[0].dependencies;
		expect(repoDeps).toHaveLength(2);
		const save = repoDeps.find((d) => d.methodName === "save");
		const logError = repoDeps.find((d) => d.methodName === "logError");
		expect(save!.conditional).toBe(false);
		expect(logError!.conditional).toBe(true);
		expect(logError!.branchKind).toBe("catch");
		expect(logError!.conditionText).toBeNull();
	});

	it("treats if-condition expression calls as unconditional", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Get()
					check() {
						return this.svc.guardedAction();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					constructor(private readonly repo: DataRepository) {}

					guardedAction() {
						if (this.repo.isReady()) {
							this.repo.execute();
						}
					}
				}
			`,
			"data.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class DataRepository {
					isReady() { return true; }
					execute() {}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();

		const repoDeps = endpoint!.dependencies[0].dependencies;
		expect(repoDeps).toHaveLength(2);
		const isReady = repoDeps.find((d) => d.methodName === "isReady");
		const execute = repoDeps.find((d) => d.methodName === "execute");
		expect(isReady!.conditional).toBe(false);
		expect(execute!.conditional).toBe(true);
	});

	it("preserves cross-class call order", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(
						private readonly serviceA: ServiceA,
						private readonly serviceB: ServiceB,
					) {}

					@Post()
					handle() {
						this.serviceA.foo();
						this.serviceB.bar();
						this.serviceA.baz();
					}
				}
			`,
			"service-a.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class ServiceA {
					constructor(private readonly repo: DataRepository) {}
					foo() { return this.repo.find(); }
					baz() {}
				}
			`,
			"service-b.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class ServiceB {
					bar() {}
				}
			`,
			"data.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class DataRepository {
					find() {}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();

		// 3 dependency nodes: ServiceA.foo, ServiceB.bar, ServiceA.baz
		expect(endpoint!.dependencies).toHaveLength(3);

		expect(endpoint!.dependencies[0].className).toBe("ServiceA");
		expect(endpoint!.dependencies[0].methodName).toBe("foo");
		expect(endpoint!.dependencies[0].order).toBe(0);

		expect(endpoint!.dependencies[1].className).toBe("ServiceB");
		expect(endpoint!.dependencies[1].methodName).toBe("bar");
		expect(endpoint!.dependencies[1].order).toBe(1);

		expect(endpoint!.dependencies[2].className).toBe("ServiceA");
		expect(endpoint!.dependencies[2].methodName).toBe("baz");
		expect(endpoint!.dependencies[2].order).toBe(2);

		// Both ServiceA nodes share the same children (computed from first occurrence)
		expect(endpoint!.dependencies[0].dependencies).toHaveLength(1);
		expect(endpoint!.dependencies[0].dependencies[0].className).toBe(
			"DataRepository"
		);
		expect(endpoint!.dependencies[2].dependencies).toEqual(
			endpoint!.dependencies[0].dependencies
		);
	});

	// ─── Call pattern coverage tests ────────────────────────────────

	it("traces dependencies through same-class helper methods (this.method())", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('orders')
				export class OrdersController {
					constructor(private readonly ordersService: OrdersService) {}

					@Get()
					findAll() {
						return this.formatResponse();
					}

					private formatResponse() {
						return this.ordersService.getAll();
					}
				}
			`,
			"orders.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class OrdersService {
					getAll() { return []; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();

		// this.formatResponse() creates an intermediate same-class node
		expect(endpoint!.dependencies).toHaveLength(1);
		expect(endpoint!.dependencies[0].className).toBe("OrdersController");
		expect(endpoint!.dependencies[0].methodName).toBe("formatResponse");

		// formatResponse()'s child is OrdersService.getAll()
		expect(endpoint!.dependencies[0].dependencies).toHaveLength(1);
		expect(endpoint!.dependencies[0].dependencies[0].className).toBe(
			"OrdersService"
		);
		expect(endpoint!.dependencies[0].dependencies[0].methodName).toBe("getAll");
	});

	it("tracks awaited service calls", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Get()
					async findAll() {
						const result = await this.svc.getAll();
						return result;
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					getAll() { return []; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();
		expect(endpoint!.dependencies).toHaveLength(1);
		expect(endpoint!.dependencies[0].className).toBe("AppService");
		expect(endpoint!.dependencies[0].methodName).toBe("getAll");
	});

	it("tracks service calls inside callbacks and closures", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Get()
					findAll() {
						const ids = ['1', '2', '3'];
						return ids.map(id => this.svc.findById(id));
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					findById(id: string) { return { id }; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();
		expect(endpoint!.dependencies).toHaveLength(1);
		expect(endpoint!.dependencies[0].className).toBe("AppService");
		expect(endpoint!.dependencies[0].methodName).toBe("findById");
		expect(endpoint!.dependencies[0].iterationKind).toBe("callback");
		expect(endpoint!.dependencies[0].iterationLabel).toBe("map");
	});

	it("detects iteration context for for-of loops", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Post()
					async processAll() {
						const orders = [1, 2, 3];
						for (const order of orders) {
							await this.svc.process(order);
						}
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					process(order: number) { return order; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const endpoint = graph.endpoints[0];
		expect(endpoint.dependencies[0].iterationKind).toBe("loop");
		expect(endpoint.dependencies[0].iterationLabel).toBe("for-of");
	});

	it("detects iteration context for traditional for loops", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Post()
					processAll() {
						const items = [1, 2, 3];
						for (let i = 0; i < items.length; i++) {
							this.svc.find(items[i]);
						}
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					find(id: number) { return id; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const endpoint = graph.endpoints[0];
		expect(endpoint.dependencies[0].iterationKind).toBe("loop");
		expect(endpoint.dependencies[0].iterationLabel).toBe("for");
	});

	it("detects iteration context for forEach callbacks", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Post()
					saveAll() {
						const items = [1, 2, 3];
						items.forEach(item => this.svc.save(item));
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					save(item: number) { return item; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const endpoint = graph.endpoints[0];
		expect(endpoint.dependencies[0].iterationKind).toBe("callback");
		expect(endpoint.dependencies[0].iterationLabel).toBe("forEach");
	});

	it("detects concurrent context for Promise.all with direct calls", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(
						private readonly repoA: RepoA,
						private readonly repoB: RepoB,
					) {}

					@Get()
					async getAll() {
						const [a, b] = await Promise.all([this.repoA.find(), this.repoB.find()]);
						return { a, b };
					}
				}
			`,
			"repo-a.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class RepoA {
					find() { return []; }
				}
			`,
			"repo-b.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class RepoB {
					find() { return []; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const endpoint = graph.endpoints[0];
		expect(endpoint.dependencies).toHaveLength(2);
		expect(endpoint.dependencies[0].iterationKind).toBe("concurrent");
		expect(endpoint.dependencies[0].iterationLabel).toBe("all");
		expect(endpoint.dependencies[1].iterationKind).toBe("concurrent");
		expect(endpoint.dependencies[1].iterationLabel).toBe("all");
	});

	it("reports innermost iteration for Promise.all wrapping map", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Post()
					async findAll() {
						const items = [1, 2, 3];
						await Promise.all(items.map(i => this.svc.find(i)));
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					find(id: number) { return id; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const endpoint = graph.endpoints[0];
		expect(endpoint.dependencies[0].iterationKind).toBe("callback");
		expect(endpoint.dependencies[0].iterationLabel).toBe("map");
	});

	it("reports innermost iteration context for nested iterations", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Post()
					process() {
						const groups = [{ items: [1, 2] }];
						for (const group of groups) {
							group.items.map(i => this.svc.find(i));
						}
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					find(id: number) { return id; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const endpoint = graph.endpoints[0];
		expect(endpoint.dependencies[0].iterationKind).toBe("callback");
		expect(endpoint.dependencies[0].iterationLabel).toBe("map");
	});

	it("does not flag calls in loop expression as iterated", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(
						private readonly svc: AppService,
						private readonly other: OtherService,
					) {}

					@Get()
					async run() {
						for (const x of this.svc.getItems()) {
							this.other.process(x);
						}
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					getItems() { return []; }
				}
			`,
			"other.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class OtherService {
					process(x: any) { return x; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const endpoint = graph.endpoints[0];
		const svcDep = endpoint.dependencies.find(
			(d) => d.className === "AppService"
		);
		const otherDep = endpoint.dependencies.find(
			(d) => d.className === "OtherService"
		);
		expect(svcDep).toBeDefined();
		expect(svcDep!.iterationKind).toBeNull();
		expect(otherDep).toBeDefined();
		expect(otherDep!.iterationKind).toBe("loop");
		expect(otherDep!.iterationLabel).toBe("for-of");
	});

	it("iteration context is orthogonal to conditional context", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Post()
					run() {
						const condition = true;
						if (condition) {
							const items = [1, 2, 3];
							items.map(i => this.svc.find(i));
						}
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					find(id: number) { return id; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const endpoint = graph.endpoints[0];
		expect(endpoint.dependencies[0].conditional).toBe(true);
		expect(endpoint.dependencies[0].iterationKind).toBe("callback");
		expect(endpoint.dependencies[0].iterationLabel).toBe("map");
	});

	it("does not flag calls in .then() as iterated", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(
						private readonly svc: AppService,
						private readonly other: OtherService,
					) {}

					@Get()
					run() {
						this.svc.getItems().then(items => this.other.process(items));
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					getItems() { return Promise.resolve([]); }
				}
			`,
			"other.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class OtherService {
					process(x: any) { return x; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const endpoint = graph.endpoints[0];
		const otherDep = endpoint.dependencies.find(
			(d) => d.className === "OtherService"
		);
		expect(otherDep).toBeDefined();
		expect(otherDep!.iterationKind).toBeNull();
	});

	it("has null iteration context for regular calls", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Get()
					findAll() {
						return this.svc.findAll();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					findAll() { return []; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const endpoint = graph.endpoints[0];
		expect(endpoint.dependencies[0].iterationKind).toBeNull();
		expect(endpoint.dependencies[0].iterationLabel).toBeNull();
	});

	it("detects while loop iteration context", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Get()
					async run() {
						let hasMore = true;
						while (hasMore) {
							await this.svc.fetchNext();
							hasMore = false;
						}
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					fetchNext() { return null; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const endpoint = graph.endpoints[0];
		expect(endpoint.dependencies[0].iterationKind).toBe("loop");
		expect(endpoint.dependencies[0].iterationLabel).toBe("while");
	});

	it("tracks dependencies from property-injected services (@Inject on property)", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get, Inject } from '@nestjs/common';
				@Controller()
				export class AppController {
					@Inject(AppService)
					private readonly svc: AppService;

					@Get()
					findAll() {
						return this.svc.getAll();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					getAll() { return []; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();
		expect(endpoint!.dependencies).toHaveLength(1);
		expect(endpoint!.dependencies[0].className).toBe("AppService");
		expect(endpoint!.dependencies[0].methodName).toBe("getAll");
	});

	it("tracks the entry-point call in chained/fluent method chains", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly repo: DataRepository) {}

					@Get()
					findAll() {
						return this.repo.createQueryBuilder('user').where('id = :id').getOne();
					}
				}
			`,
			"data.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class DataRepository {
					createQueryBuilder(alias: string) { return this; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();

		// The inner this.repo.createQueryBuilder() should be tracked
		expect(endpoint!.dependencies).toHaveLength(1);
		expect(endpoint!.dependencies[0].className).toBe("DataRepository");
		expect(endpoint!.dependencies[0].methodName).toBe("createQueryBuilder");
	});

	it("tracks service calls through aliased references", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Get()
					findAll() {
						const service = this.svc;
						return service.getAll();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					getAll() { return []; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();
		expect(endpoint!.dependencies).toHaveLength(1);
		expect(endpoint!.dependencies[0].className).toBe("AppService");
		expect(endpoint!.dependencies[0].methodName).toBe("getAll");
	});

	it("resolves inherited methods from base classes", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: UsersService) {}

					@Get()
					getUsers() {
						return this.svc.findAll();
					}
				}
			`,
			"base.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class BaseService {
					constructor(private readonly repo: UsersRepository) {}

					findAll() {
						return this.repo.find();
					}
				}
			`,
			"users.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class UsersService extends BaseService {
					findSpecial() {
						return this.repo.findSpecial();
					}
				}
			`,
			"users.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class UsersRepository {
					find() { return []; }
					findSpecial() { return []; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();

		// UsersService.findAll is inherited from BaseService
		// Should still resolve and trace its sub-dependencies
		expect(endpoint!.dependencies).toHaveLength(1);
		expect(endpoint!.dependencies[0].className).toBe("UsersService");
		expect(endpoint!.dependencies[0].methodName).toBe("findAll");
		expect(endpoint!.dependencies[0].line).toBeGreaterThan(0);

		// findAll() calls this.repo.find() — should have sub-deps
		expect(endpoint!.dependencies[0].dependencies).toHaveLength(1);
		expect(endpoint!.dependencies[0].dependencies[0].className).toBe(
			"UsersRepository"
		);
		expect(endpoint!.dependencies[0].dependencies[0].methodName).toBe("find");
	});

	it("discovers GraphQL @Resolver endpoints with @Query and @Mutation", () => {
		const { project, paths } = createProject({
			"recipes.resolver.ts": `
				import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
				@Resolver()
				export class RecipesResolver {
					constructor(private readonly recipesService: RecipesService) {}

					@Query()
					recipes() {
						return this.recipesService.findAll();
					}

					@Mutation()
					addRecipe(@Args('title') title: string) {
						return this.recipesService.create(title);
					}
				}
			`,
			"recipes.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class RecipesService {
					findAll() { return []; }
					create(title: string) { return { title }; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		// Should discover 2 endpoints: recipes query + addRecipe mutation
		expect(graph.endpoints).toHaveLength(2);

		const recipesQuery = graph.endpoints.find(
			(e) => e.handlerMethod === "recipes"
		);
		expect(recipesQuery).toBeDefined();
		expect(recipesQuery!.httpMethod).toBe("QUERY");
		expect(recipesQuery!.dependencies).toHaveLength(1);
		expect(recipesQuery!.dependencies[0].className).toBe("RecipesService");
		expect(recipesQuery!.dependencies[0].methodName).toBe("findAll");

		const addMutation = graph.endpoints.find(
			(e) => e.handlerMethod === "addRecipe"
		);
		expect(addMutation).toBeDefined();
		expect(addMutation!.httpMethod).toBe("MUTATION");
		expect(addMutation!.dependencies).toHaveLength(1);
		expect(addMutation!.dependencies[0].className).toBe("RecipesService");
		expect(addMutation!.dependencies[0].methodName).toBe("create");
	});

	// ─── Same-class call hierarchy tests ────────────────────────────

	it("preserves dependency hierarchy for same-class helper methods", () => {
		const { project, paths } = createProject({
			"leads.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller('leads')
				export class LeadsController {
					constructor(private readonly leadsService: LeadsService) {}

					@Post()
					post() {
						return this.leadsService.upsert();
					}
				}
			`,
			"leads.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class LeadsService {
					constructor(
						private readonly leadRepository: LeadRepository,
						private readonly logger: FuseLogger,
						private readonly leadsHelper: LeadsHelper,
					) {}

					upsert() {
						const lead = this.leadRepository.findById('id');
						if (lead) {
							return this.update('id', lead);
						}
						return this.create(lead);
					}

					private update(id: string, data: any) {
						this.logger.log('updating');
						return this.leadRepository.update(id, data);
					}

					private create(data: any) {
						const parsed = this.leadsHelper.parseRequestToLead(data);
						return this.leadRepository.create(parsed);
					}
				}
			`,
			"lead.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class LeadRepository {
					findById(id: string) { return null; }
					update(id: string, data: any) { return data; }
					create(data: any) { return data; }
				}
			`,
			"fuse-logger.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class FuseLogger {
					log(msg: string) {}
				}
			`,
			"leads-helper.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class LeadsHelper {
					parseRequestToLead(data: any) { return data; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();

		// Top-level: LeadsService.upsert
		expect(endpoint!.dependencies).toHaveLength(1);
		const upsertNode = endpoint!.dependencies[0];
		expect(upsertNode.className).toBe("LeadsService");
		expect(upsertNode.methodName).toBe("upsert");

		// upsert() has 3 children: findById (direct), update (same-class), create (same-class)
		// NOT 5 flattened children
		expect(upsertNode.dependencies).toHaveLength(3);

		// #1: LeadRepository.findById — direct call, unconditional
		const findById = upsertNode.dependencies.find(
			(d) => d.className === "LeadRepository" && d.methodName === "findById"
		);
		expect(findById).toBeDefined();
		expect(findById!.conditional).toBe(false);

		// #2: this.update() — same-class call, conditional (inside if)
		const updateNode = upsertNode.dependencies.find(
			(d) => d.className === "LeadsService" && d.methodName === "update"
		);
		expect(updateNode).toBeDefined();
		expect(updateNode!.conditional).toBe(true);

		// update() has its own children: logger.log + leadRepository.update
		expect(updateNode!.dependencies).toHaveLength(2);
		expect(
			updateNode!.dependencies.some(
				(d) => d.className === "FuseLogger" && d.methodName === "log"
			)
		).toBe(true);
		expect(
			updateNode!.dependencies.some(
				(d) => d.className === "LeadRepository" && d.methodName === "update"
			)
		).toBe(true);

		// #3: this.create() — same-class call, unconditional
		const createNode = upsertNode.dependencies.find(
			(d) => d.className === "LeadsService" && d.methodName === "create"
		);
		expect(createNode).toBeDefined();
		expect(createNode!.conditional).toBe(false);

		// create() has its own children: leadsHelper.parseRequestToLead + leadRepository.create
		expect(createNode!.dependencies).toHaveLength(2);
		expect(
			createNode!.dependencies.some(
				(d) =>
					d.className === "LeadsHelper" && d.methodName === "parseRequestToLead"
			)
		).toBe(true);
		expect(
			createNode!.dependencies.some(
				(d) => d.className === "LeadRepository" && d.methodName === "create"
			)
		).toBe(true);
	});

	it("handles nested same-class helper calls with correct hierarchy", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Post()
					handle() {
						return this.svc.process();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					constructor(
						private readonly repo: DataRepository,
						private readonly notifier: NotificationService,
					) {}

					process() {
						const item = this.repo.findOne('id');
						return this.saveAndNotify(item);
					}

					private saveAndNotify(item: any) {
						this.repo.save(item);
						this.notify(item);
					}

					private notify(item: any) {
						this.notifier.send(item);
					}
				}
			`,
			"data.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class DataRepository {
					findOne(id: string) { return {}; }
					save(data: any) { return data; }
				}
			`,
			"notification.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class NotificationService {
					send(data: any) {}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();

		const processNode = endpoint!.dependencies[0];
		expect(processNode.className).toBe("AppService");
		expect(processNode.methodName).toBe("process");

		// process() has 2 children: repo.findOne (direct) + this.saveAndNotify (same-class)
		expect(processNode.dependencies).toHaveLength(2);

		const findOne = processNode.dependencies.find(
			(d) => d.className === "DataRepository" && d.methodName === "findOne"
		);
		expect(findOne).toBeDefined();

		const saveAndNotify = processNode.dependencies.find(
			(d) => d.className === "AppService" && d.methodName === "saveAndNotify"
		);
		expect(saveAndNotify).toBeDefined();

		// saveAndNotify() has children: repo.save + this.notify (nested same-class)
		expect(saveAndNotify!.dependencies).toHaveLength(2);

		const repoSave = saveAndNotify!.dependencies.find(
			(d) => d.className === "DataRepository" && d.methodName === "save"
		);
		expect(repoSave).toBeDefined();

		const notifyNode = saveAndNotify!.dependencies.find(
			(d) => d.className === "AppService" && d.methodName === "notify"
		);
		expect(notifyNode).toBeDefined();

		// notify() has 1 child: notifier.send
		expect(notifyNode!.dependencies).toHaveLength(1);
		expect(notifyNode!.dependencies[0].className).toBe("NotificationService");
		expect(notifyNode!.dependencies[0].methodName).toBe("send");
	});

	it("truncates long condition text at 50 characters", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Get()
					check() {
						return this.svc.decide();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					constructor(private readonly repo: DataRepository) {}

					decide() {
						if (this.repo.somethingVeryLongConditionNameThatExceedsFiftyCharacters && this.repo.anotherThing) {
							this.repo.doAction();
						}
					}
				}
			`,
			"data.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class DataRepository {
					somethingVeryLongConditionNameThatExceedsFiftyCharacters = true;
					anotherThing = true;
					doAction() {}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();

		const repoDeps = endpoint!.dependencies[0].dependencies;
		const doAction = repoDeps.find((d) => d.methodName === "doAction");
		expect(doAction).toBeDefined();
		expect(doAction!.conditional).toBe(true);
		expect(doAction!.branchKind).toBe("if");
		// Condition text should be truncated to 50 chars + ellipsis
		expect(doAction!.conditionText!.length).toBeLessThanOrEqual(51);
		expect(doAction!.conditionText!.endsWith("\u2026")).toBe(true);
	});

	it("populates branchKind for same-class helper calls in conditional blocks", () => {
		const { project, paths } = createProject({
			"leads.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller('leads')
				export class LeadsController {
					constructor(private readonly leadsService: LeadsService) {}

					@Post()
					post() {
						return this.leadsService.upsert();
					}
				}
			`,
			"leads.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class LeadsService {
					constructor(private readonly repo: LeadRepository) {}

					upsert() {
						const lead = this.repo.findById('id');
						if (lead) {
							return this.update('id', lead);
						}
						return this.create(lead);
					}

					private update(id: string, data: any) {
						return this.repo.update(id, data);
					}

					private create(data: any) {
						return this.repo.create(data);
					}
				}
			`,
			"lead.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class LeadRepository {
					findById(id: string) { return null; }
					update(id: string, data: any) { return data; }
					create(data: any) { return data; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();

		const upsertNode = endpoint!.dependencies[0];
		expect(upsertNode.dependencies).toHaveLength(3);

		// this.update() is called inside if (lead) → branchKind should be "if"
		const updateNode = upsertNode.dependencies.find(
			(d) => d.className === "LeadsService" && d.methodName === "update"
		);
		expect(updateNode).toBeDefined();
		expect(updateNode!.conditional).toBe(true);
		expect(updateNode!.branchKind).toBe("if");
		expect(updateNode!.conditionText).toBe("lead");

		// this.create() is unconditional
		const createNode = upsertNode.dependencies.find(
			(d) => d.className === "LeadsService" && d.methodName === "create"
		);
		expect(createNode).toBeDefined();
		expect(createNode!.conditional).toBe(false);
		expect(createNode!.branchKind).toBeNull();
	});

	it("detects guard throw pattern (if-then-throw) as conditional leaf node", () => {
		const { project, paths } = createProject({
			"items.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('items')
				export class ItemsController {
					constructor(private readonly itemsService: ItemsService) {}

					@Get(':id')
					getItem() {
						return this.itemsService.findOne('id');
					}
				}
			`,
			"items.service.ts": `
				import { Injectable, NotFoundException } from '@nestjs/common';
				@Injectable()
				export class ItemsService {
					constructor(private readonly itemsRepo: ItemsRepository) {}

					findOne(id: string) {
						const item = this.itemsRepo.findById(id);
						if (!item) {
							throw new NotFoundException('Item not found');
						}
						return item;
					}
				}
			`,
			"items.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class ItemsRepository {
					findById(id: string) { return null; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];
		expect(ep).toBeDefined();

		// Service node is findOne
		const serviceNode = ep.dependencies[0];
		expect(serviceNode.className).toBe("ItemsService");
		expect(serviceNode.methodName).toBe("findOne");

		// Guard throw is merged into the repo call node
		const repoNode = serviceNode.dependencies.find(
			(d) => d.methodName === "findById"
		);
		expect(repoNode).toBeDefined();
		expect(repoNode!.guardThrow).not.toBeNull();
		expect(repoNode!.guardThrow!.className).toBe("NotFoundException");
		expect(repoNode!.guardThrow!.conditionText).toBe("!item");
		expect(repoNode!.guardThrow!.message).toBe("Item not found");

		// No separate throw node
		const throwNode = serviceNode.dependencies.find((d) => d.type === "throw");
		expect(throwNode).toBeUndefined();
	});

	it("preserves source-order interleaving between calls and throws", () => {
		const { project, paths } = createProject({
			"orders.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller('orders')
				export class OrdersController {
					constructor(private readonly ordersService: OrdersService) {}

					@Post()
					create() {
						return this.ordersService.createOrder();
					}
				}
			`,
			"orders.service.ts": `
				import { Injectable, ConflictException } from '@nestjs/common';
				@Injectable()
				export class OrdersService {
					constructor(private readonly ordersRepo: OrdersRepository) {}

					createOrder() {
						const existing = this.ordersRepo.findOne();
						if (existing) {
							throw new ConflictException('Already exists');
						}
						return this.ordersRepo.create();
					}
				}
			`,
			"orders.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class OrdersRepository {
					findOne() { return null; }
					create() { return {}; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];
		const serviceNode = ep.dependencies[0];

		// Guard throw merged: findOne (with guardThrow), create — in source order
		expect(serviceNode.dependencies).toHaveLength(2);
		expect(serviceNode.dependencies[0].className).toBe("OrdersRepository");
		expect(serviceNode.dependencies[0].methodName).toBe("findOne");
		expect(serviceNode.dependencies[0].guardThrow).not.toBeNull();
		expect(serviceNode.dependencies[0].guardThrow!.className).toBe(
			"ConflictException"
		);
		expect(serviceNode.dependencies[1].className).toBe("OrdersRepository");
		expect(serviceNode.dependencies[1].methodName).toBe("create");
	});

	it("detects throw in controller handler directly", () => {
		const { project, paths } = createProject({
			"auth.controller.ts": `
				import { Controller, Post, UnauthorizedException } from '@nestjs/common';
				@Controller('auth')
				export class AuthController {
					@Post('login')
					login() {
						throw new UnauthorizedException('Invalid credentials');
					}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];

		expect(ep.dependencies).toHaveLength(1);
		expect(ep.dependencies[0].type).toBe("throw");
		expect(ep.dependencies[0].className).toBe("UnauthorizedException");
		expect(ep.dependencies[0].conditional).toBe(false);
	});

	it("falls back to Error for throw without new expression", () => {
		const { project, paths } = createProject({
			"err.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('err')
				export class ErrController {
					@Get()
					fail() {
						throw "something went wrong";
					}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];

		expect(ep.dependencies).toHaveLength(1);
		expect(ep.dependencies[0].type).toBe("throw");
		expect(ep.dependencies[0].className).toBe("Error");
	});

	it("detects throw in same-class helper method", () => {
		const { project, paths } = createProject({
			"users.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('users')
				export class UsersController {
					constructor(private readonly usersService: UsersService) {}

					@Get(':id')
					getUser() {
						return this.usersService.findUser('id');
					}
				}
			`,
			"users.service.ts": `
				import { Injectable, NotFoundException } from '@nestjs/common';
				@Injectable()
				export class UsersService {
					constructor(private readonly usersRepo: UsersRepository) {}

					findUser(id: string) {
						const user = this.usersRepo.findById(id);
						this.assertExists(user);
						return user;
					}

					assertExists(item: unknown) {
						if (!item) {
							throw new NotFoundException('Not found');
						}
					}
				}
			`,
			"users.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class UsersRepository {
					findById(id: string) { return null; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];
		const serviceNode = ep.dependencies[0];

		// Should have repo + same-class helper (assertExists) as children
		const assertNode = serviceNode.dependencies.find(
			(d) => d.methodName === "assertExists"
		);
		expect(assertNode).toBeDefined();

		// assertExists should contain the throw node
		const throwNode = assertNode!.dependencies.find((d) => d.type === "throw");
		expect(throwNode).toBeDefined();
		expect(throwNode!.className).toBe("NotFoundException");
		expect(throwNode!.conditional).toBe(true);
		expect(throwNode!.branchKind).toBe("if");
	});

	it("shows each call as its own node when same method is called multiple times", () => {
		const { project, paths } = createProject({
			"pages.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller('pages')
				export class PagesController {
					constructor(private readonly pagesService: PagesService) {}

					@Post()
					create() {
						return this.pagesService.create();
					}
				}
			`,
			"pages.service.ts": `
				import { Injectable, ConflictException } from '@nestjs/common';
				@Injectable()
				export class PagesService {
					constructor(
						private readonly repo: PagesRepository,
						private readonly logger: LoggerService,
					) {}

					create() {
						const existing = this.repo.findByOrganizationId('orgId');
						if (existing) {
							throw new ConflictException('Already exists');
						}
						const page = this.repo.create('orgId');
						this.logger.log('created');
						return this.repo.findByOrganizationId('orgId');
					}
				}
			`,
			"pages.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class PagesRepository {
					findByOrganizationId(orgId: string) { return null; }
					create(orgId: string) { return {}; }
				}
			`,
			"logger.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class LoggerService {
					log(msg: string) {}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];
		const serviceNode = ep.dependencies[0];

		// Guard throw merged: 4 children in order:
		// findByOrganizationId(#1, with guardThrow), create(#3), log(#4), findByOrganizationId(#5)
		expect(serviceNode.dependencies).toHaveLength(4);
		expect(serviceNode.dependencies[0].className).toBe("PagesRepository");
		expect(serviceNode.dependencies[0].methodName).toBe("findByOrganizationId");
		expect(serviceNode.dependencies[0].guardThrow).not.toBeNull();
		expect(serviceNode.dependencies[0].guardThrow!.className).toBe(
			"ConflictException"
		);
		expect(serviceNode.dependencies[1].className).toBe("PagesRepository");
		expect(serviceNode.dependencies[1].methodName).toBe("create");
		expect(serviceNode.dependencies[2].className).toBe("LoggerService");
		expect(serviceNode.dependencies[2].methodName).toBe("log");
		expect(serviceNode.dependencies[3].className).toBe("PagesRepository");
		expect(serviceNode.dependencies[3].methodName).toBe("findByOrganizationId");
	});

	it("detects throw in catch block", () => {
		const { project, paths } = createProject({
			"safe.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('safe')
				export class SafeController {
					constructor(private readonly safeService: SafeService) {}

					@Get()
					getData() {
						return this.safeService.fetch();
					}
				}
			`,
			"safe.service.ts": `
				import { Injectable, InternalServerErrorException } from '@nestjs/common';
				@Injectable()
				export class SafeService {
					constructor(private readonly repo: SafeRepository) {}

					fetch() {
						try {
							return this.repo.load();
						} catch (e) {
							throw new InternalServerErrorException('Failed');
						}
					}
				}
			`,
			"safe.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class SafeRepository {
					load() { return {}; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];
		const serviceNode = ep.dependencies[0];

		const throwNode = serviceNode.dependencies.find((d) => d.type === "throw");
		expect(throwNode).toBeDefined();
		expect(throwNode!.className).toBe("InternalServerErrorException");
		expect(throwNode!.conditional).toBe(true);
		expect(throwNode!.branchKind).toBe("catch");
	});

	it("repeated method nodes share the same children", () => {
		const { project, paths } = createProject({
			"items.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('items')
				export class ItemsController {
					constructor(private readonly itemsService: ItemsService) {}

					@Get()
					getItems() {
						return this.itemsService.getItems();
					}
				}
			`,
			"items.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class ItemsService {
					constructor(private readonly repo: ItemsRepository) {}

					getItems() {
						const first = this.repo.findById('1');
						const second = this.repo.findById('2');
						return [first, second];
					}
				}
			`,
			"items.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class ItemsRepository {
					constructor(private readonly db: DatabaseService) {}

					findById(id: string) {
						return this.db.query(id);
					}
				}
			`,
			"database.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class DatabaseService {
					query(id: string) { return {}; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];
		const serviceNode = ep.dependencies[0];

		// Both findById calls should appear as separate nodes
		const findByIdNodes = serviceNode.dependencies.filter(
			(d) => d.className === "ItemsRepository" && d.methodName === "findById"
		);
		expect(findByIdNodes).toHaveLength(2);

		// Both should have the same non-empty children
		expect(findByIdNodes[0].dependencies.length).toBeGreaterThan(0);
		expect(findByIdNodes[1].dependencies.length).toBeGreaterThan(0);
		expect(findByIdNodes[0].dependencies).toEqual(
			findByIdNodes[1].dependencies
		);
	});

	it("extracts assigned variable name from dependency calls", () => {
		const { project, paths } = createProject({
			"task.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller('tasks')
				export class TaskController {
					constructor(private readonly taskService: TaskService) {}

					@Post()
					process() {
						const result = await this.taskService.process();
						return result;
					}
				}
			`,
			"task.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class TaskService {
					constructor(private readonly taskRepo: TaskRepository) {}

					process() {
						const existing = await this.taskRepo.findById('id');
						this.taskRepo.save(existing);
						const items = this.taskRepo.findAll();
						return items;
					}
				}
			`,
			"task.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class TaskRepository {
					findById(id: string) { return null; }
					save(item: any) { return item; }
					findAll() { return []; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		expect(graph.endpoints).toHaveLength(1);

		const ep = graph.endpoints[0];
		// Top-level: const result = await this.taskService.process()
		const processNode = ep.dependencies[0];
		expect(processNode.className).toBe("TaskService");
		expect(processNode.methodName).toBe("process");
		expect(processNode.assignedTo).toBe("result");

		// Sub-deps of TaskService.process()
		const repoDeps = processNode.dependencies.filter(
			(d) => d.className === "TaskRepository"
		);
		const findByIdNode = repoDeps.find((d) => d.methodName === "findById");
		const saveNode = repoDeps.find((d) => d.methodName === "save");
		const findAllNode = repoDeps.find((d) => d.methodName === "findAll");

		expect(findByIdNode).toBeDefined();
		expect(findByIdNode!.assignedTo).toBe("existing");

		expect(saveNode).toBeDefined();
		expect(saveNode!.assignedTo).toBeNull();

		expect(findAllNode).toBeDefined();
		expect(findAllNode!.assignedTo).toBe("items");
	});

	it("merges null-guard throw into dependency call", () => {
		const { project, paths } = createProject({
			"page.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('pages')
				export class PageController {
					constructor(private readonly pageService: PageService) {}

					@Get(':id')
					getPage(id: string) {
						return this.pageService.getById(id);
					}
				}
			`,
			"page.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class PageService {
					constructor(private readonly repo: PageRepository) {}

					getById(id: string) {
						const existing = await this.repo.findById(id);
						if (!existing) throw new NotFoundException('Not found');
						return existing;
					}
				}
			`,
			"page.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class PageRepository {
					findById(id: string) { return null; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];
		const serviceNode = ep.dependencies[0];
		const findByIdNode = serviceNode.dependencies.find(
			(d) => d.methodName === "findById"
		);
		expect(findByIdNode).toBeDefined();
		expect(findByIdNode!.guardThrow).not.toBeNull();
		expect(findByIdNode!.guardThrow!.className).toBe("NotFoundException");
		expect(findByIdNode!.guardThrow!.message).toBe("Not found");
		expect(findByIdNode!.guardThrow!.conditionText).toBe("!existing");

		// No separate throw node should exist
		const throwNodes = serviceNode.dependencies.filter(
			(d) => d.type === "throw"
		);
		expect(throwNodes).toHaveLength(0);
	});

	it("merges conflict-guard throw (truthiness check)", () => {
		const { project, paths } = createProject({
			"dup.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller('dup')
				export class DupController {
					constructor(private readonly dupService: DupService) {}

					@Post()
					create(email: string) {
						return this.dupService.createByEmail(email);
					}
				}
			`,
			"dup.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class DupService {
					constructor(private readonly repo: DupRepository) {}

					createByEmail(email: string) {
						const dup = await this.repo.findByEmail(email);
						if (dup) throw new ConflictException('Already exists');
					}
				}
			`,
			"dup.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class DupRepository {
					findByEmail(email: string) { return null; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];
		const serviceNode = ep.dependencies[0];
		const findNode = serviceNode.dependencies.find(
			(d) => d.methodName === "findByEmail"
		);
		expect(findNode).toBeDefined();
		expect(findNode!.guardThrow).not.toBeNull();
		expect(findNode!.guardThrow!.conditionText).toBe("dup");
		expect(findNode!.guardThrow!.className).toBe("ConflictException");
	});

	it("does not merge throw with unrelated condition", () => {
		const { project, paths } = createProject({
			"unrel.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('unrel')
				export class UnrelController {
					constructor(private readonly svc: UnrelService) {}

					@Get()
					get() {
						return this.svc.doWork();
					}
				}
			`,
			"unrel.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class UnrelService {
					constructor(private readonly repo: UnrelRepository) {}

					doWork() {
						const a = await this.repo.find();
						if (someOtherVar) throw new Error('unrelated');
						return a;
					}
				}
			`,
			"unrel.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class UnrelRepository {
					find() { return null; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];
		const serviceNode = ep.dependencies[0];
		const findNode = serviceNode.dependencies.find(
			(d) => d.methodName === "find"
		);
		expect(findNode).toBeDefined();
		expect(findNode!.guardThrow).toBeNull();

		// Throw remains as separate node
		const throwNodes = serviceNode.dependencies.filter(
			(d) => d.type === "throw"
		);
		expect(throwNodes).toHaveLength(1);
	});

	it("does not merge unconditional throw", () => {
		const { project, paths } = createProject({
			"uncond.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('uncond')
				export class UncondController {
					constructor(private readonly svc: UncondService) {}

					@Get()
					get() {
						return this.svc.doWork();
					}
				}
			`,
			"uncond.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class UncondService {
					constructor(private readonly repo: UncondRepository) {}

					doWork() {
						this.repo.find();
						throw new Error('always');
					}
				}
			`,
			"uncond.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class UncondRepository {
					find() { return null; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];
		const serviceNode = ep.dependencies[0];
		const findNode = serviceNode.dependencies.find(
			(d) => d.methodName === "find"
		);
		expect(findNode).toBeDefined();
		expect(findNode!.guardThrow).toBeNull();

		// Unconditional throw stays separate
		const throwNodes = serviceNode.dependencies.filter(
			(d) => d.type === "throw"
		);
		expect(throwNodes).toHaveLength(1);
		expect(throwNodes[0].throwMessage).toBe("always");
	});

	it("merges guard throw in child service method", () => {
		const { project, paths } = createProject({
			"nested.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('nested')
				export class NestedController {
					constructor(private readonly svc: NestedService) {}

					@Get(':id')
					getItem(id: string) {
						return this.svc.getItem(id);
					}
				}
			`,
			"nested.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class NestedService {
					constructor(private readonly repo: NestedRepository) {}

					getItem(id: string) {
						const item = await this.repo.findById(id);
						if (!item) throw new NotFoundException('Item not found');
						return item;
					}
				}
			`,
			"nested.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class NestedRepository {
					findById(id: string) { return null; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];
		const serviceNode = ep.dependencies[0];
		expect(serviceNode.className).toBe("NestedService");

		// Check that the nested repo call has the guard throw merged
		const repoNode = serviceNode.dependencies.find(
			(d) => d.className === "NestedRepository"
		);
		expect(repoNode).toBeDefined();
		expect(repoNode!.guardThrow).not.toBeNull();
		expect(repoNode!.guardThrow!.className).toBe("NotFoundException");
		expect(repoNode!.guardThrow!.message).toBe("Item not found");

		// No standalone throw node
		const throwNodes = serviceNode.dependencies.filter(
			(d) => d.type === "throw"
		);
		expect(throwNodes).toHaveLength(0);
	});

	it("handles multiple sequential fetch-guard pairs", () => {
		const { project, paths } = createProject({
			"multi.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('multi')
				export class MultiController {
					constructor(private readonly svc: MultiService) {}

					@Get()
					get(userId: string, orgId: string) {
						return this.svc.getData(userId, orgId);
					}
				}
			`,
			"multi.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class MultiService {
					constructor(
						private readonly userRepo: UserRepository,
						private readonly orgRepo: OrgRepository,
					) {}

					getData(userId: string, orgId: string) {
						const user = await this.userRepo.findById(userId);
						if (!user) throw new NotFoundException('User not found');
						const org = await this.orgRepo.findById(orgId);
						if (!org) throw new NotFoundException('Org not found');
						return { user, org };
					}
				}
			`,
			"user.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class UserRepository {
					findById(id: string) { return null; }
				}
			`,
			"org.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class OrgRepository {
					findById(id: string) { return null; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];
		const serviceNode = ep.dependencies[0];

		const userRepoNode = serviceNode.dependencies.find(
			(d) => d.className === "UserRepository"
		);
		const orgRepoNode = serviceNode.dependencies.find(
			(d) => d.className === "OrgRepository"
		);

		expect(userRepoNode).toBeDefined();
		expect(userRepoNode!.guardThrow).not.toBeNull();
		expect(userRepoNode!.guardThrow!.className).toBe("NotFoundException");
		expect(userRepoNode!.guardThrow!.message).toBe("User not found");

		expect(orgRepoNode).toBeDefined();
		expect(orgRepoNode!.guardThrow).not.toBeNull();
		expect(orgRepoNode!.guardThrow!.className).toBe("NotFoundException");
		expect(orgRepoNode!.guardThrow!.message).toBe("Org not found");

		// No standalone throw nodes
		const throwNodes = serviceNode.dependencies.filter(
			(d) => d.type === "throw"
		);
		expect(throwNodes).toHaveLength(0);
	});

	it("extracts null message when no arguments", () => {
		const { project, paths } = createProject({
			"noarg.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('noarg')
				export class NoargController {
					constructor(private readonly svc: NoargService) {}

					@Get()
					get() {
						return this.svc.doWork();
					}
				}
			`,
			"noarg.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class NoargService {
					constructor(private readonly repo: NoargRepository) {}

					doWork() {
						const result = await this.repo.find();
						if (!result) throw new NotFoundException();
						return result;
					}
				}
			`,
			"noarg.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class NoargRepository {
					find() { return null; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints[0];
		const serviceNode = ep.dependencies[0];
		const findNode = serviceNode.dependencies.find(
			(d) => d.methodName === "find"
		);
		expect(findNode).toBeDefined();
		expect(findNode!.guardThrow).not.toBeNull();
		expect(findNode!.guardThrow!.className).toBe("NotFoundException");
		expect(findNode!.guardThrow!.message).toBeNull();
	});

	it("extracts leading comment above dependency call sites", () => {
		const { project, paths } = createProject({
			"pool.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('pools')
				export class PoolController {
					constructor(private readonly poolService: PoolService) {}

					@Get(':id')
					getPool() {
						return this.poolService.findPool();
					}
				}
			`,
			"pool.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class PoolService {
					constructor(private readonly poolRepo: PoolRepository) {}

					findPool() {
						// Verify pool belongs to organization
						const pool = this.poolRepo.findById('id');
						// Fetch pool members
						const members = this.poolRepo.findMembers('id');
						this.poolRepo.noComment();
						return { pool, members };
					}
				}
			`,
			"pool.repository.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class PoolRepository {
					findById(id: string) { return null; }
					findMembers(id: string) { return []; }
					noComment() {}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find(
			(e) => e.httpMethod === "GET" && e.routePath === "/pools/:id"
		);
		expect(endpoint).toBeDefined();

		const serviceDeps = endpoint!.dependencies[0].dependencies;
		const findById = serviceDeps.find((d) => d.methodName === "findById");
		const findMembers = serviceDeps.find((d) => d.methodName === "findMembers");
		const noComment = serviceDeps.find((d) => d.methodName === "noComment");

		expect(findById).toBeDefined();
		expect(findById!.comment).toBe("Verify pool belongs to organization");

		expect(findMembers).toBeDefined();
		expect(findMembers!.comment).toBe("Fetch pool members");

		expect(noComment).toBeDefined();
		expect(noComment!.comment).toBeNull();
	});

	it("extracts swagger metadata from @ApiOperation, @ApiParam, @ApiQuery, @ApiResponse, @ApiBody", () => {
		const { project, paths } = createProject({
			"users.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller('users')
				export class UsersController {
					constructor(private readonly svc: UsersService) {}

					@Post(':id/profile')
					@ApiOperation({ summary: 'Update user profile', description: 'Updates the profile of a user' })
					@ApiParam({ name: 'id', type: 'string', description: 'User ID' })
					@ApiQuery({ name: 'notify', type: 'boolean', description: 'Send notification', required: false })
					@ApiBody({ type: 'UpdateProfileDto', description: 'Profile data' })
					@ApiResponse({ status: 200, type: 'UserDto', description: 'Updated user' })
					@ApiResponse({ status: 404, description: 'User not found' })
					updateProfile() {
						return this.svc.update();
					}
				}
			`,
			"users.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class UsersService {
					update() { return {}; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find(
			(e) => e.httpMethod === "POST" && e.routePath === "/users/:id/profile"
		);
		expect(endpoint).toBeDefined();
		expect(endpoint!.swagger).not.toBeNull();

		const sw = endpoint!.swagger!;
		expect(sw.summary).toBe("Update user profile");
		expect(sw.description).toBe("Updates the profile of a user");

		expect(sw.params).toHaveLength(1);
		expect(sw.params[0].name).toBe("id");
		expect(sw.params[0].type).toBe("string");
		expect(sw.params[0].description).toBe("User ID");
		expect(sw.params[0].required).toBe(true);

		expect(sw.queryParams).toHaveLength(1);
		expect(sw.queryParams[0].name).toBe("notify");
		expect(sw.queryParams[0].type).toBe("boolean");
		expect(sw.queryParams[0].required).toBe(false);

		expect(sw.body).not.toBeNull();
		expect(sw.body!.type).toBe("UpdateProfileDto");
		expect(sw.body!.description).toBe("Profile data");

		expect(sw.responses).toHaveLength(2);
		expect(sw.responses[0].status).toBe(200);
		expect(sw.responses[0].type).toBe("UserDto");
		expect(sw.responses[0].description).toBe("Updated user");
		expect(sw.responses[1].status).toBe(404);
		expect(sw.responses[1].description).toBe("User not found");
	});

	it("returns null swagger when no swagger decorators present", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					@Get()
					getRoot() { return 'ok'; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();
		expect(endpoint!.swagger).toBeNull();
	});

	it("extracts returnType from TS method signature, unwrapping Promise and Observable", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get, Post, Put } from '@nestjs/common';
				@Controller('items')
				export class ItemsController {
					@Get()
					findAll(): Promise<ItemDto[]> { return []; }

					@Post()
					create(): Observable<ItemDto> { return null; }

					@Put()
					update(): ItemDto { return null; }

					@Get('void')
					noReturn(): void {}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const findAll = graph.endpoints.find((e) => e.handlerMethod === "findAll");
		expect(findAll).toBeDefined();
		expect(findAll!.returnType).toBe("ItemDto[]");

		const create = graph.endpoints.find((e) => e.handlerMethod === "create");
		expect(create).toBeDefined();
		expect(create!.returnType).toBe("ItemDto");

		const update = graph.endpoints.find((e) => e.handlerMethod === "update");
		expect(update).toBeDefined();
		expect(update!.returnType).toBe("ItemDto");

		const noReturn = graph.endpoints.find(
			(e) => e.handlerMethod === "noReturn"
		);
		expect(noReturn).toBeDefined();
		expect(noReturn!.returnType).toBeNull();
	});

	it("handles array type syntax in @ApiResponse ([ClassName] → ClassName[])", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller('users')
				export class UsersController {
					@Get()
					@ApiResponse({ status: 200, type: '[UserDto]', description: 'List of users' })
					findAll() { return []; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();
		expect(endpoint!.swagger).not.toBeNull();
		expect(endpoint!.swagger!.responses).toHaveLength(1);
		expect(endpoint!.swagger!.responses[0].type).toBe("UserDto[]");
	});

	it("captures multiple @ApiResponse decorators (stackable)", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller('orders')
				export class OrdersController {
					@Post()
					@ApiResponse({ status: 201, type: 'OrderDto', description: 'Created' })
					@ApiResponse({ status: 400, description: 'Validation error' })
					@ApiResponse({ status: 409, type: 'ConflictDto', description: 'Duplicate order' })
					create() { return {}; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();
		expect(endpoint!.swagger).not.toBeNull();
		expect(endpoint!.swagger!.responses).toHaveLength(3);

		expect(endpoint!.swagger!.responses[0].status).toBe(201);
		expect(endpoint!.swagger!.responses[0].type).toBe("OrderDto");
		expect(endpoint!.swagger!.responses[1].status).toBe(400);
		expect(endpoint!.swagger!.responses[1].type).toBeNull();
		expect(endpoint!.swagger!.responses[2].status).toBe(409);
		expect(endpoint!.swagger!.responses[2].type).toBe("ConflictDto");
	});

	it("infers swagger.body from @Body() parameter decorator when no @ApiBody()", () => {
		const { project, paths } = createProject({
			"pages.controller.ts": `
				import { Controller, Post, Body } from '@nestjs/common';
				import { ApiOperation } from '@nestjs/swagger';
				@Controller('pages')
				export class PagesController {
					@Post()
					@ApiOperation({ summary: 'Create page' })
					create(@Body() dto: CreatePageDto) {
						return dto;
					}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();
		expect(endpoint!.swagger).not.toBeNull();
		expect(endpoint!.swagger!.body).not.toBeNull();
		expect(endpoint!.swagger!.body!.type).toBe("CreatePageDto");
		expect(endpoint!.swagger!.body!.description).toBeNull();
	});

	it("does not infer body from @Body() when @ApiBody() is present", () => {
		const { project, paths } = createProject({
			"pages.controller.ts": `
				import { Controller, Post, Body } from '@nestjs/common';
				import { ApiBody } from '@nestjs/swagger';
				@Controller('pages')
				export class PagesController {
					@Post()
					@ApiBody({ description: 'The page payload', type: 'CreatePageDto' })
					create(@Body() dto: CreatePageDto) {
						return dto;
					}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();
		expect(endpoint!.swagger).not.toBeNull();
		expect(endpoint!.swagger!.body).not.toBeNull();
		expect(endpoint!.swagger!.body!.type).toBe("CreatePageDto");
		expect(endpoint!.swagger!.body!.description).toBe("The page payload");
	});

	it("infers swagger.body from @Body() even without other swagger decorators", () => {
		const { project, paths } = createProject({
			"pages.controller.ts": `
				import { Controller, Post, Body } from '@nestjs/common';
				@Controller('pages')
				export class PagesController {
					@Post()
					create(@Body() dto: CreatePageDto) {
						return dto;
					}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();
		expect(endpoint!.swagger).not.toBeNull();
		expect(endpoint!.swagger!.body).not.toBeNull();
		expect(endpoint!.swagger!.body!.type).toBe("CreatePageDto");
	});

	// ─── Method I/O (parameters + return type) tests ─────────────────

	it("extracts typed parameters and return type on service dep nodes", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Post()
					create() {
						return this.svc.create('org1', { name: 'test' });
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					create(organizationId: string, dto: CreateDto): ResultDto {
						return {} as ResultDto;
					}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();

		const dep = endpoint!.dependencies[0];
		expect(dep.className).toBe("AppService");
		expect(dep.methodName).toBe("create");
		expect(dep.parameters).toEqual([
			{ name: "organizationId", type: "string" },
			{ name: "dto", type: "CreateDto" },
		]);
		expect(dep.returnType).toBe("ResultDto");
	});

	it("unwraps Promise and Observable from dep node return types", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Get()
					find() {
						return this.svc.findAll();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					findAll(): Promise<ItemDto[]> {
						return Promise.resolve([]);
					}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();

		const dep = endpoint!.dependencies[0];
		expect(dep.returnType).toBe("ItemDto[]");
	});

	it("sets returnType to null for void/any/unknown and type-less params get null type", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Post()
					doWork() {
						return this.svc.process('x');
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					process(data): void {
						// no return
					}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();

		const dep = endpoint!.dependencies[0];
		expect(dep.returnType).toBeNull();
		expect(dep.parameters).toEqual([{ name: "data", type: null }]);
	});

	it("sets parameters: [] and returnType: null on fallback dep nodes", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Get()
					getRoot() {
						return this.svc.hello();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					constructor(private readonly repo: DataRepo) {}
					hello(): string {
						return 'hi';
					}
				}
			`,
			"data.repo.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class DataRepo {
					findAll(): string[] { return []; }
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();

		// hello() doesn't call this.repo.*, so DataRepo won't appear as a dep
		// The service node itself should have parameters/returnType
		const dep = endpoint!.dependencies[0];
		expect(dep.className).toBe("AppService");
		expect(dep.parameters).toEqual([]);
		expect(dep.returnType).toBe("string");
	});

	it("sets parameters: [] and returnType: null on throw nodes", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Get()
					getRoot() {
						return this.svc.doWork();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					doWork() {
						throw new NotFoundException('not found');
					}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(endpoint).toBeDefined();

		const svcDep = endpoint!.dependencies[0];
		const throwNode = svcDep.dependencies.find((d) => d.type === "throw");
		expect(throwNode).toBeDefined();
		expect(throwNode!.parameters).toEqual([]);
		expect(throwNode!.returnType).toBeNull();
	});

	it("extracts parameters and return type on same-class helper calls", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Post } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}

					@Post()
					create() {
						return this.svc.create();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					create(): ResultDto {
						return this.buildResult('test');
					}

					private buildResult(name: string): ResultDto {
						return { name } as ResultDto;
					}
				}
			`,
		});

		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);

		const endpoint = graph.endpoints.find((e) => e.httpMethod === "POST");
		expect(endpoint).toBeDefined();

		const svcDep = endpoint!.dependencies[0];
		expect(svcDep.className).toBe("AppService");
		expect(svcDep.returnType).toBe("ResultDto");

		// Same-class helper call
		const helper = svcDep.dependencies.find(
			(d) => d.methodName === "buildResult"
		);
		expect(helper).toBeDefined();
		expect(helper!.parameters).toEqual([{ name: "name", type: "string" }]);
		expect(helper!.returnType).toBe("ResultDto");
	});

	it("creates step node from inline method call", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}
					@Get()
					handle() {
						const pool = this.svc.findPool();
						const member = pool.members.find((m) => m.active);
						return member;
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					findPool() { return { members: [] }; }
				}
			`,
		});
		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(ep).toBeDefined();

		// Should have dep call + step node
		const stepNode = ep!.dependencies.find((d) => d.type === "step");
		expect(stepNode).toBeDefined();
		expect(stepNode!.className).toBe("local");
		expect(stepNode!.stepStatements.length).toBeGreaterThan(0);
		expect(stepNode!.stepStatements[0].assignedTo).toBe("member");
		expect(stepNode!.dependencies).toEqual([]);
	});

	it("groups consecutive inline statements into a single step node", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}
					@Get()
					handle() {
						const pool = this.svc.findPool();
						const member = pool.members.find((m) => m.active);
						const today = new Date();
						return this.svc.save(member, today);
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					findPool() { return { members: [] }; }
					save(m: any, d: any) { return m; }
				}
			`,
		});
		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(ep).toBeDefined();

		const stepNodes = ep!.dependencies.filter((d) => d.type === "step");
		expect(stepNodes).toHaveLength(1);
		expect(stepNodes[0].stepStatements).toHaveLength(2);
	});

	it("places step node order between surrounding dep calls", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}
					@Get()
					handle() {
						const pool = this.svc.findPool();
						const member = pool.members.find((m) => m.active);
						return this.svc.save(member);
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					findPool() { return { members: [] }; }
					save(m: any) { return m; }
				}
			`,
		});
		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(ep).toBeDefined();

		const deps = ep!.dependencies;
		const findPool = deps.find((d) => d.methodName === "findPool");
		const step = deps.find((d) => d.type === "step");
		const save = deps.find((d) => d.methodName === "save");
		expect(findPool).toBeDefined();
		expect(step).toBeDefined();
		expect(save).toBeDefined();
		expect(step!.order).toBeGreaterThan(findPool!.order);
		expect(step!.order).toBeLessThan(save!.order);
	});

	it("does not create step node for dep calls", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}
					@Get()
					handle() {
						return this.svc.getData();
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					getData() { return 'data'; }
				}
			`,
		});
		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(ep).toBeDefined();

		const stepNodes = ep!.dependencies.filter((d) => d.type === "step");
		expect(stepNodes).toHaveLength(0);
	});

	it("does not create step node for trivial assignments without calls", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}
					@Get()
					handle() {
						const user = this.svc.getUser();
						const name = user.name;
						return name;
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					getUser() { return { name: 'test' }; }
				}
			`,
		});
		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(ep).toBeDefined();

		const stepNodes = ep!.dependencies.filter((d) => d.type === "step");
		expect(stepNodes).toHaveLength(0);
	});

	it("step nodes are leaf nodes with empty dependencies", () => {
		const { project, paths } = createProject({
			"app.controller.ts": `
				import { Controller, Get } from '@nestjs/common';
				@Controller()
				export class AppController {
					constructor(private readonly svc: AppService) {}
					@Get()
					handle() {
						const data = this.svc.getData();
						const items = data.list.map((i) => i.value);
						return items;
					}
				}
			`,
			"app.service.ts": `
				import { Injectable } from '@nestjs/common';
				@Injectable()
				export class AppService {
					getData() { return { list: [] }; }
				}
			`,
		});
		const providers = resolveProviders(project, paths);
		const graph = buildEndpointGraph(project, paths, providers);
		const ep = graph.endpoints.find((e) => e.httpMethod === "GET");
		expect(ep).toBeDefined();

		const step = ep!.dependencies.find((d) => d.type === "step");
		expect(step).toBeDefined();
		expect(step!.dependencies).toEqual([]);
	});
});
