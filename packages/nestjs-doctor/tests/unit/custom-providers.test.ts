import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { collectCustomProviderClasses } from "../../src/engine/graph/custom-providers.js";

function collect(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	for (const [path, code] of Object.entries(files)) {
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
		const { constructedClasses } = collect({
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
});
