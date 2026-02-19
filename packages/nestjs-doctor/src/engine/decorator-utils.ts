import type { ClassDeclaration, Decorator, MethodDeclaration } from "ts-morph";

export const HTTP_DECORATORS = new Set([
	"Get",
	"Post",
	"Put",
	"Patch",
	"Delete",
	"Head",
	"Options",
	"All",
]);

export type NestClassType =
	| "controller"
	| "service"
	| "module"
	| "guard"
	| "interceptor"
	| "pipe"
	| "filter"
	| "resolver"
	| "gateway"
	| "unknown";

const NEST_CLASS_DECORATORS: Record<string, NestClassType> = {
	Controller: "controller",
	Injectable: "service",
	Module: "module",
	Guard: "guard",
	UseInterceptors: "interceptor",
	UsePipes: "pipe",
	Catch: "filter",
	Resolver: "resolver",
	WebSocketGateway: "gateway",
};

export function hasDecorator(cls: ClassDeclaration, name: string): boolean {
	return cls.getDecorator(name) !== undefined;
}

export function getDecoratorArgs(decorator: Decorator): string | undefined {
	const args = decorator.getArguments();
	if (args.length === 0) {
		return undefined;
	}
	return args[0].getText();
}

export function getClassType(cls: ClassDeclaration): NestClassType {
	for (const [decoratorName, type] of Object.entries(NEST_CLASS_DECORATORS)) {
		if (hasDecorator(cls, decoratorName)) {
			return type;
		}
	}
	return "unknown";
}

export function isController(cls: ClassDeclaration): boolean {
	return hasDecorator(cls, "Controller");
}

export function isService(cls: ClassDeclaration): boolean {
	return hasDecorator(cls, "Injectable");
}

export function isModule(cls: ClassDeclaration): boolean {
	return hasDecorator(cls, "Module");
}

export function isHttpHandler(method: MethodDeclaration): boolean {
	return method.getDecorators().some((d) => HTTP_DECORATORS.has(d.getName()));
}

export function getConstructorParams(
	cls: ClassDeclaration
): { name: string; type: string; isReadonly: boolean }[] {
	const ctor = cls.getConstructors()[0];
	if (!ctor) {
		return [];
	}

	return ctor.getParameters().map((param) => ({
		name: param.getName(),
		type: param.getType().getText(),
		isReadonly: param.isReadonly(),
	}));
}
