import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { collectCustomProviderClasses } from "../../src/engine/graph/custom-providers.js";

function collect(
	files: Record<string, string>,
	unscanned: Record<string, string> = {}
) {
	const project = new Project({ useInMemoryFileSystem: true });
	for (const [path, code] of Object.entries({ ...files, ...unscanned })) {
		project.createSourceFile(path, code);
	}
	return {
		project,
		...collectCustomProviderClasses(project, Object.keys(files)),
	};
}

describe("collectCustomProviderClasses", () => {
	it("collects local classes constructed under inline factory and value providers", () => {
		const { constructedClasses } = collect({
			"providers.ts": `
        class RootService {}
        class HelperService {}
        class AlternativeService {}
        class BundleService {}
        class ValueService {}

        const providers = [
          {
            provide: 'ROOT',
            useFactory: async () => new RootService(new HelperService()),
          },
          {
            provide: 'ALTERNATIVE',
            useFactory() {
              if (process.env.ALT) return new AlternativeService();
              return { service: new BundleService() };
            },
          },
          { provide: 'VALUE', useValue: new ValueService() },
        ];
      `,
		});

		expect(
			new Set([...constructedClasses].map((cls) => cls.getName()))
		).toEqual(
			new Set([
				"RootService",
				"HelperService",
				"AlternativeService",
				"BundleService",
				"ValueService",
			])
		);
	});

	it("resolves named factories, static factories, values, and passthrough factories", () => {
		const { constructedClasses, implementationNames } = collect({
			"factory.ts": `
        export class MailerService {}
        export function createMailer() { return new MailerService(); }
      `,
			"default-factory.ts": `
        export class DefaultService {}
        export default () => new DefaultService();
      `,
			"providers.ts": `
        import { createMailer } from './factory';
        import createDefault from './default-factory';

        class StaticService {}
        class ValueService {}
        class CapturedService {}
        class ShorthandFactoryService {}
        class ShorthandValueService {}

        class ProviderFactory {
          static create() { return new StaticService(); }
        }

        const value = new ValueService();
        const captured = new CapturedService();
        const useFactory = () => new ShorthandFactoryService();
        const useValue = new ShorthandValueService();

        const providers = [
          { provide: 'MAILER', useFactory: createMailer },
          { provide: 'DEFAULT', useFactory: createDefault },
          { provide: 'STATIC', useFactory: ProviderFactory.create },
          { provide: 'VALUE', useValue: value },
          { provide: 'CAPTURED', useFactory: () => captured },
          { provide: 'SHORTHAND_FACTORY', useFactory },
          { provide: 'SHORTHAND_VALUE', useValue },
        ];
      `,
		});

		expect(
			new Set([...constructedClasses].map((cls) => cls.getName()))
		).toEqual(
			new Set([
				"MailerService",
				"DefaultService",
				"StaticService",
				"ValueService",
				"CapturedService",
				"ShorthandFactoryService",
				"ShorthandValueService",
			])
		);
		expect([...constructedClasses].map((cls) => cls.getName())).not.toContain(
			"ProviderFactory"
		);
		expect(implementationNames).not.toContain("ProviderFactory");
	});

	it("terminates on circular factory indirection and still collects", () => {
		const { constructedClasses } = collect({
			"a.ts": `
        import { getCycleB } from './b';
        export class PingService {}
        export function cycleA() { return new PingService(getCycleB()); }
      `,
			"b.ts": `
        import { cycleA } from './a';
        export function getCycleB() { return cycleA(); }
      `,
			"providers.ts": `
        import { getCycleB } from './b';
        export const provider = { provide: 'CYCLE', useFactory: getCycleB };
      `,
		});

		expect(
			new Set([...constructedClasses].map((cls) => cls.getName()))
		).toEqual(new Set(["PingService"]));
	});

	it("requires provide, ignores unresolved classes, and keeps declaration identity", () => {
		const { constructedClasses, project } = collect({
			"a.ts": "export class DuplicateService {}",
			"b.ts": "export class DuplicateService {}",
			"providers.ts": `
        import { DuplicateService } from './a';
        class OrphanService {}

        const invalid = { useFactory: () => new OrphanService() };
        const external = { provide: 'STRIPE', useFactory: () => new Stripe() };
        const valid = { provide: 'DUPLICATE', useValue: new DuplicateService() };
      `,
		});

		expect(constructedClasses).toEqual(
			new Set([
				project
					.getSourceFileOrThrow("a.ts")
					.getClassOrThrow("DuplicateService"),
			])
		);
	});

	it("resolves a class returned by a function used as useClass", () => {
		const { constructedClasses, implementationNames } = collect({
			"app.service.ts": "export class AppService {}",
			"app.module.ts": `
        import { AppService } from './app.service';
        function providerFactory() { return AppService; }
        export const provider = { provide: 'TOK', useClass: providerFactory() };
      `,
		});

		expect([...constructedClasses].map((cls) => cls.getName())).toContain(
			"AppService"
		);
		expect(implementationNames).not.toContain("AppService");
	});

	it("registers a useClass value that has no provide key", () => {
		const { constructedClasses, implementationNames } = collect({
			"mail.config.ts": "export class MailConfig {}",
			"app.module.ts": `
        import { MailConfig } from './mail.config';
        export const imports = [MailModule.forRootAsync({ useClass: MailConfig })];
      `,
		});

		expect([...constructedClasses].map((cls) => cls.getName())).toContain(
			"MailConfig"
		);
		expect(implementationNames).toContain("MailConfig");
	});

	it("registers useClass without provide only inside an Async call", () => {
		const { constructedClasses, implementationNames } = collect({
			"dead.service.ts": `
        export class DeadService {}
        export class DeadService2 {}
      `,
			"app.module.ts": `
        import { DeadService, DeadService2 } from './dead.service';
        export const staleOptions = { useClass: DeadService, retries: 3 };
        export const described = Thing.describe({ useClass: DeadService2 });
      `,
		});

		const constructed = [...constructedClasses].map((cls) => cls.getName());
		expect(constructed).not.toContain("DeadService");
		expect(constructed).not.toContain("DeadService2");
		expect(implementationNames).not.toContain("DeadService");
		expect(implementationNames).not.toContain("DeadService2");
	});

	it("registers a bare useClass passed to an Async call through a variable", () => {
		const { constructedClasses, implementationNames } = collect({
			"cfg.ts": `
        export class Cfg2 {}
        export class Dead {}
      `,
			"imports.ts": `
        import { Cfg2, Dead } from './cfg';
        const opts = { useClass: Cfg2 };
        const unused = { useClass: Dead };
        export const imports = [OrmModule.forRootAsync(opts)];
      `,
		});

		const constructed = [...constructedClasses].map((cls) => cls.getName());
		expect(constructed).toContain("Cfg2");
		expect(implementationNames).toContain("Cfg2");
		expect(constructed).not.toContain("Dead");
		expect(implementationNames).not.toContain("Dead");
	});

	it("keeps a chain through an unscanned file on the declaration channel", () => {
		const { constructedClasses, implementationNames, project } = collect(
			{
				"app.service.ts": "export class AppService {}",
				"app.module.ts": `
          import { impl } from './registry';
          export const provider = { provide: 'TOK', useClass: impl };
        `,
			},
			{
				"registry.ts": `
          import { AppService } from './app.service';
          export const impl = AppService;
        `,
			}
		);

		expect(implementationNames).not.toContain("AppService");
		expect(constructedClasses).toEqual(
			new Set([
				project
					.getSourceFileOrThrow("app.service.ts")
					.getClassOrThrow("AppService"),
			])
		);
	});

	it("records only the name when the resolved class lives in an unscanned file", () => {
		const { constructedClasses, implementationNames } = collect(
			{
				"app.module.ts": `
          import { impl } from './registry';
          export const provider = { provide: 'TOK', useClass: impl };
        `,
			},
			{
				"app.service.ts": "export class AppService {}",
				"registry.ts": `
          import { AppService } from './app.service';
          export const impl = AppService;
        `,
			}
		);

		expect(implementationNames).toContain("AppService");
		expect(constructedClasses.size).toBe(0);
	});

	it("keeps declaration identity for a resolved class with a same-named twin", () => {
		const { constructedClasses, implementationNames, project } = collect({
			"a.ts": "export class DuplicateService {}",
			"b.ts": "export class DuplicateService {}",
			"app.module.ts": `
        import { DuplicateService } from './a';
        function pick() { return DuplicateService; }
        export const provider = { provide: 'TOK', useClass: pick() };
      `,
		});

		expect(implementationNames).not.toContain("DuplicateService");
		expect(constructedClasses).toEqual(
			new Set([
				project
					.getSourceFileOrThrow("a.ts")
					.getClassOrThrow("DuplicateService"),
			])
		);
	});

	it("attributes useClass targets to the file that registers them", () => {
		const { usesByFile, project } = collect({
			"shared.service.ts": "export class SharedService {}",
			"pick.ts": `
        import { SharedService } from './shared.service';
        export function pickShared() { return SharedService; }
      `,
			"consumer.module.ts": `
        import { pickShared } from './pick';
        export const provider = { provide: 'TOK', useClass: pickShared() };
      `,
			"other.module.ts": `
        import { SharedService } from './shared.service';
        export const provider = { provide: SharedService, useValue: {} };
      `,
		});

		const targetsIn = (path: string) =>
			usesByFile.get(project.getSourceFileOrThrow(path));
		expect(targetsIn("consumer.module.ts")).toEqual(
			new Set(["pickShared()", "SharedService"])
		);
		expect(targetsIn("other.module.ts")).toEqual(new Set());
	});

	it("resolves an alias used as a token and then as a useExisting target", () => {
		const { usesByFile, project } = collect({
			"shared.service.ts": "export class SharedService {}",
			"fake.service.ts": "export class FakeService {}",
			"tokens.ts": `
        import { SharedService } from './shared.service';
        export const SHARED = SharedService;
      `,
			"app.module.ts": `
        import { SHARED } from './tokens';
        import { FakeService } from './fake.service';
        export const providers = [
          { provide: SHARED, useClass: FakeService },
          { provide: 'ALIAS', useExisting: SHARED },
        ];
      `,
		});

		expect(
			usesByFile.get(project.getSourceFileOrThrow("app.module.ts"))
		).toEqual(new Set(["FakeService", "SHARED", "SharedService"]));
	});

	it("lists inject entries as used classes, not as registrations", () => {
		const { usedClasses, constructedClasses, usesByFile, project } = collect({
			"config.service.ts": "export class ConfigService {}",
			"cache.service.ts": "export class CacheService {}",
			"queue.service.ts": "export class QueueService {}",
			"app.module.ts": `
        import { forwardRef } from '@nestjs/common';
        import { ConfigService } from './config.service';
        import { CacheService } from './cache.service';
        import { QueueService } from './queue.service';
        export const providers = [
          {
            provide: 'QUEUE',
            useFactory: (c: ConfigService, cache: CacheService, q: QueueService) => c,
            inject: [ConfigService, forwardRef(() => CacheService), { token: QueueService, optional: true }],
          },
        ];
      `,
		});

		expect(new Set([...usedClasses].map((cls) => cls.getName()))).toEqual(
			new Set(["ConfigService", "CacheService", "QueueService"])
		);
		expect(constructedClasses.size).toBe(0);
		expect(
			usesByFile.get(project.getSourceFileOrThrow("app.module.ts"))
		).toEqual(new Set(["ConfigService", "CacheService", "QueueService"]));
	});

	it("reads inject on an options object that has no provide key", () => {
		const { usedClasses } = collect({
			"config.service.ts": "export class ConfigService {}",
			"app.module.ts": `
        import { ConfigService } from './config.service';
        export const options = { useFactory: (c: ConfigService) => ({ url: c }), inject: [ConfigService] };
      `,
		});

		expect([...usedClasses].map((cls) => cls.getName())).toEqual([
			"ConfigService",
		]);
	});

	it("treats a useExisting target as used, not registered", () => {
		const { usedClasses, constructedClasses, implementationNames } = collect({
			"app.service.ts": "export class AppService {}",
			"app.module.ts": `
        import { AppService } from './app.service';
        export const provider = { provide: 'ALIAS', useExisting: AppService };
      `,
		});

		expect([...usedClasses].map((cls) => cls.getName())).toEqual([
			"AppService",
		]);
		expect(constructedClasses.size).toBe(0);
		expect(implementationNames.size).toBe(0);
	});

	it("ignores classes a useClass helper merely calls or reads", () => {
		const { constructedClasses } = collect({
			"classes.ts": `
        export class SmtpMailer {}
        export class Logger { static log(message: string) {} }
        export class AuditService { static enabled = false; }
        export class Registry { static mailer = SmtpMailer; }
      `,
			"app.module.ts": `
        import { AuditService, Logger, Registry, SmtpMailer } from './classes';
        function pickMailer() {
          Logger.log('picking');
          if (AuditService.enabled) { return Registry.mailer; }
          return SmtpMailer;
        }
        export const provider = { provide: 'MAILER', useClass: pickMailer() };
      `,
		});

		expect(
			new Set([...constructedClasses].map((cls) => cls.getName()))
		).toEqual(new Set(["SmtpMailer"]));
	});
});
