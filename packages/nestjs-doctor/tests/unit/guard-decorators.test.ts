import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
	buildGuardDecoratorIndex,
	decoratorAppliesGuards,
	guardDecoratorNames,
} from "../../src/engine/graph/guard-decorators.js";

function index(code: string): Set<string> {
	const project = new Project({ useInMemoryFileSystem: true });
	project.createSourceFile("/decorators.ts", code);
	return new Set(
		guardDecoratorNames(buildGuardDecoratorIndex(project, ["/decorators.ts"]))
	);
}

describe("buildGuardDecoratorIndex", () => {
	it("indexes a function returning applyDecorators(UseGuards(...))", () => {
		const names = index(`
      import { applyDecorators, UseGuards } from '@nestjs/common';
      export function Auth(roles = []) {
        return applyDecorators(Roles(roles), UseGuards(AuthGuard, RolesGuard));
      }
    `);
		expect([...names]).toEqual(["Auth"]);
	});

	it("indexes an arrow function with a concise body", () => {
		const names = index(`
      import { applyDecorators, UseGuards } from '@nestjs/common';
      export const Protected = () => applyDecorators(UseGuards(AuthGuard));
    `);
		expect([...names]).toEqual(["Protected"]);
	});

	it("indexes an arrow function with a block body", () => {
		const names = index(`
      import { applyDecorators, UseGuards } from '@nestjs/common';
      export const Protected = () => {
        return applyDecorators(UseGuards(AuthGuard));
      };
    `);
		expect([...names]).toEqual(["Protected"]);
	});

	it("ignores a composition that applies no guard", () => {
		const names = index(`
      import { applyDecorators } from '@nestjs/common';
      export function Documented() {
        return applyDecorators(ApiOperation(), ApiOkResponse());
      }
    `);
		expect(names.size).toBe(0);
	});

	it("ignores a function that calls UseGuards without composing a decorator", () => {
		const names = index(`
      import { UseGuards } from '@nestjs/common';
      export function notADecorator() {
        const x = UseGuards(AuthGuard);
        return x;
      }
    `);
		expect(names.size).toBe(0);
	});

	it("does not credit a function for a guard its nested function applies", () => {
		const names = index(`
      import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
      export function Auth() {
        function withRoles() {
          return applyDecorators(UseGuards(RolesGuard));
        }
        return SetMetadata('auth', true);
      }
    `);
		expect(names.size).toBe(0);
	});

	it("still credits the outer function when it returns the composition itself", () => {
		const names = index(`
      import { applyDecorators, UseGuards } from '@nestjs/common';
      export function Auth() {
        const extra = () => SetMetadata('x', 1);
        return applyDecorators(extra(), UseGuards(AuthGuard));
      }
    `);
		expect([...names]).toEqual(["Auth"]);
	});

	it("finds a guard chosen by a ternary", () => {
		const names = index(`
      import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
      export function Auth(allowApiKey = false) {
        return applyDecorators(
          SetMetadata('optional', false),
          allowApiKey
            ? UseGuards(MultiAuthGuard, RateLimitGuard)
            : UseGuards(JwtAccessTokenGuard),
        );
      }
    `);
		expect([...names]).toEqual(["Auth"]);
	});

	it("finds a guard spread into the argument list", () => {
		const names = index(`
      import { applyDecorators, UseGuards } from '@nestjs/common';
      export function Auth() {
        return applyDecorators(...[UseGuards(AuthGuard)], SetMetadata('x', 1));
      }
    `);
		expect([...names]).toEqual(["Auth"]);
	});

	it("does not treat a guard merely mentioned inside an argument as applied", () => {
		const names = index(`
      import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
      export function Meta() {
        return applyDecorators(SetMetadata('factory', () => UseGuards(AuthGuard)));
      }
    `);
		expect([...names]).toEqual([]);
	});

	it("does not count a ternary that guards on only one branch", () => {
		const names = index(`
      import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
      export function Maybe(on = false) {
        return applyDecorators(on ? UseGuards(AuthGuard) : SetMetadata('x', 1));
      }
    `);
		expect([...names]).toEqual([]);
	});

	it("does not treat an unrelated nested call as a guard", () => {
		const names = index(`
      import { applyDecorators, SetMetadata } from '@nestjs/common';
      export function Meta(flag = false) {
        return applyDecorators(flag ? SetMetadata('a', 1) : SetMetadata('b', 2));
      }
    `);
		expect([...names]).toEqual([]);
	});

	it("returns an empty set for a file it was not given", () => {
		const project = new Project({ useInMemoryFileSystem: true });
		project.createSourceFile(
			"/other.ts",
			"export function Auth() { return applyDecorators(UseGuards(G)); }"
		);
		const empty = buildGuardDecoratorIndex(project, ["/missing.ts"]);
		expect(guardDecoratorNames(empty).size).toBe(0);
	});
});

describe("buildGuardDecoratorIndex, guards applied without applyDecorators", () => {
	it("indexes a function returning UseGuards(...) on its own", () => {
		const names = index(`
      import { UseGuards } from '@nestjs/common';
      export function Auth() {
        return UseGuards(AuthGuard);
      }
    `);
		expect([...names]).toEqual(["Auth"]);
	});

	it("indexes a function expression assigned to a const", () => {
		const names = index(`
      import { UseGuards } from '@nestjs/common';
      export const IsAuthnAuthz = function () {
        return UseGuards(IsAuthnAuthzGuard);
      };
    `);
		expect([...names]).toEqual(["IsAuthnAuthz"]);
	});

	it("indexes an arrow returning UseGuards(...) with a concise body", () => {
		const names = index(`
      import { UseGuards } from '@nestjs/common';
      export const StripeAuthorizer = () => UseGuards(StripeAuthorizerGuard);
    `);
		expect([...names]).toEqual(["StripeAuthorizer"]);
	});

	it("still ignores a UseGuards call that is not what the function returns", () => {
		const names = index(`
      import { UseGuards } from '@nestjs/common';
      export function notADecorator() {
        const x = UseGuards(AuthGuard);
        return x;
      }
    `);
		expect(names.size).toBe(0);
	});
});

describe("decoratorAppliesGuards", () => {
	function decoratorOn(files: Record<string, string>, entry: string) {
		const project = new Project({ useInMemoryFileSystem: true });
		for (const [path, code] of Object.entries(files)) {
			project.createSourceFile(path, code);
		}
		const cls = project.getSourceFileOrThrow(entry).getClasses()[0];
		return cls.getDecorators()[0];
	}

	it("credits a decorator declared in another file", () => {
		const decorator = decoratorOn(
			{
				"/libs/auth/guard.ts": `
          import { UseGuards } from '@nestjs/common';
          export const IsAuthnAuthz = function () {
            return UseGuards(IsAuthnAuthzGuard);
          };
        `,
				"/apps/api/thing.controller.ts": `
          import { IsAuthnAuthz } from '../../libs/auth/guard';
          @IsAuthnAuthz()
          export class ThingController {}
        `,
			},
			"/apps/api/thing.controller.ts"
		);
		expect(decoratorAppliesGuards(decorator)).toBe(true);
	});

	it("credits a decorator built with applyDecorators in another file", () => {
		const decorator = decoratorOn(
			{
				"/libs/auth/guard.ts": `
          import { applyDecorators, UseGuards } from '@nestjs/common';
          export function Auth() {
            return applyDecorators(UseGuards(AuthGuard));
          }
        `,
				"/apps/api/thing.controller.ts": `
          import { Auth } from '../../libs/auth/guard';
          @Auth()
          export class ThingController {}
        `,
			},
			"/apps/api/thing.controller.ts"
		);
		expect(decoratorAppliesGuards(decorator)).toBe(true);
	});

	it("does not credit a decorator that applies no guard", () => {
		const decorator = decoratorOn(
			{
				"/libs/docs/api.ts": `
          import { applyDecorators } from '@nestjs/common';
          export function Documented() {
            return applyDecorators(ApiOperation());
          }
        `,
				"/apps/api/thing.controller.ts": `
          import { Documented } from '../../libs/docs/api';
          @Documented()
          export class ThingController {}
        `,
			},
			"/apps/api/thing.controller.ts"
		);
		expect(decoratorAppliesGuards(decorator)).toBe(false);
	});

	it("does not credit a decorator whose declaration it cannot find", () => {
		const decorator = decoratorOn(
			{
				"/apps/api/thing.controller.ts": `
          import { Mystery } from '@some/package';
          @Mystery()
          export class ThingController {}
        `,
			},
			"/apps/api/thing.controller.ts"
		);
		expect(decoratorAppliesGuards(decorator)).toBe(false);
	});
});

describe("a guard the decorator does not always apply", () => {
	it("ignores a function that returns a guard on only one path", () => {
		const names = index(`
      import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
      export function MaybeAuth(secure: boolean) {
        if (secure) {
          return UseGuards(AuthGuard);
        }
        return applyDecorators(SetMetadata('public', true));
      }
    `);
		expect(names.size).toBe(0);
	});

	it("ignores a function expression that returns a guard on only one path", () => {
		const names = index(`
      import { UseGuards } from '@nestjs/common';
      export const MaybeAuth = function (secure: boolean) {
        if (secure) {
          return UseGuards(AuthGuard);
        }
        return () => undefined;
      };
    `);
		expect(names.size).toBe(0);
	});

	it("ignores a declaration with no return at all", () => {
		const names = index(`
      import { UseGuards } from '@nestjs/common';
      export function Auth() {
        UseGuards(AuthGuard);
      }
    `);
		expect(names.size).toBe(0);
	});

	it("still counts a function whose every return applies a guard", () => {
		const names = index(`
      import { applyDecorators, UseGuards } from '@nestjs/common';
      export function Auth(strict: boolean) {
        if (strict) {
          return UseGuards(StrictGuard);
        }
        return applyDecorators(UseGuards(AuthGuard));
      }
    `);
		expect([...names]).toEqual(["Auth"]);
	});
});

describe("decoratorAppliesGuards verdict reuse", () => {
	function decoratorFor(implementation: string) {
		const project = new Project({ useInMemoryFileSystem: true });
		project.createSourceFile("/impl.ts", implementation);
		project.createSourceFile(
			"/thing.controller.ts",
			`
        import { Auth } from './impl';
        @Auth()
        export class ThingController {}
      `
		);
		return project
			.getSourceFileOrThrow("/thing.controller.ts")
			.getClasses()[0]
			.getDecorators()[0];
	}

	it("judges each project on its own source, even at the same path", () => {
		// Both bodies are the same length, so a verdict keyed by file offsets
		// would answer the second one from the first.
		const guarded = decoratorFor(
			"export const Auth = () => applyDecorators(UseGuards(AuthGuard));"
		);
		const plain = decoratorFor(
			"export const Auth = () => applyDecorators(SetHeader(AuthGuard));"
		);
		expect(decoratorAppliesGuards(guarded)).toBe(true);
		expect(decoratorAppliesGuards(plain)).toBe(false);
	});

	it("gives the same answer when asked twice", () => {
		const decorator = decoratorFor(
			"export const Auth = () => UseGuards(AuthGuard);"
		);
		expect(decoratorAppliesGuards(decorator)).toBe(true);
		expect(decoratorAppliesGuards(decorator)).toBe(true);
	});
});

describe("a return that hands back nothing", () => {
	it("ignores a function whose disabled path returns bare", () => {
		const names = index(`
      import { UseGuards } from '@nestjs/common';
      export function Auth(enabled = true) {
        if (!enabled) {
          return;
        }
        return UseGuards(JwtGuard);
      }
    `);
		expect(names.size).toBe(0);
	});

	it("ignores a function whose disabled path returns undefined", () => {
		const names = index(`
      import { UseGuards } from '@nestjs/common';
      export function Auth(enabled = true) {
        if (!enabled) {
          return undefined;
        }
        return UseGuards(JwtGuard);
      }
    `);
		expect(names.size).toBe(0);
	});
});
