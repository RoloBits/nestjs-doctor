import {
	type ClassDeclaration,
	type Decorator,
	type MethodDeclaration,
	type Node,
	SyntaxKind,
} from "ts-morph";

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

interface WrapperTargets {
	/** The wrapper's implementation composes `Controller()`. */
	controller: boolean;
	/**
	 * HTTP method the wrapper composes (`GET`, `POST`, ...), `ROUTE` when the
	 * implementation branches over several methods, or null for none.
	 */
	httpMethod: string | null;
	/**
	 * Index of the wrapper parameter forwarded to the composed HTTP call's
	 * path slot; -1 when that call takes no path, null when undetermined.
	 */
	pathParamIndex: number | null;
}

const NO_TARGETS: WrapperTargets = {
	controller: false,
	httpMethod: null,
	pathParamIndex: null,
};
const CONTROLLER_CALL = /\bController\s*\(/;
const HTTP_CALL = /\b(Get|Post|Put|Patch|Delete|Head|Options|All)\s*\(/g;
const wrapperCache = new Map<string, WrapperTargets>();

// Declaration kinds that are import bindings, not implementations.
const IMPORT_BINDING_KINDS = new Set<SyntaxKind>([
	SyntaxKind.ImportSpecifier,
	SyntaxKind.ImportClause,
	SyntaxKind.NamespaceImport,
	SyntaxKind.ImportEqualsDeclaration,
]);

/**
 * Which wrapper parameter the implementation hands to `Get(...)`/`Post(...)`,
 * scanning every composed HTTP call: -1 when all are argless, null when any
 * takes something other than a resolvable parameter.
 */
function resolvePathParamIndex(decls: Node[]): number | null {
	let sawArglessCall = false;
	let sawOpaqueArg = false;
	for (const decl of decls) {
		const fn =
			decl.asKind(SyntaxKind.FunctionDeclaration) ??
			decl.getFirstDescendantByKind(SyntaxKind.ArrowFunction) ??
			decl.getFirstDescendantByKind(SyntaxKind.FunctionExpression);
		if (!fn) {
			continue;
		}
		const params = fn.getParameters().map((p) => p.getName());
		for (const call of fn.getDescendantsOfKind(SyntaxKind.CallExpression)) {
			if (!HTTP_DECORATORS.has(call.getExpression().getText())) {
				continue;
			}
			const arg = call.getArguments()[0];
			if (arg === undefined) {
				sawArglessCall = true;
				continue;
			}
			if (arg.getKind() === SyntaxKind.Identifier) {
				const index = params.indexOf(arg.getText());
				if (index >= 0) {
					return index;
				}
			}
			sawOpaqueArg = true;
		}
	}
	if (sawOpaqueArg) {
		return null;
	}
	return sawArglessCall ? -1 : null;
}

/**
 * The framework decorators a wrapper decorator composes via `applyDecorators()`:
 * `@XxxRestController()` reads as a controller, `@XxxReadOneOk()` as a GET handler.
 */
export function resolveDecoratorWrapper(decorator: Decorator): WrapperTargets {
	let symbol = decorator.getNameNode().getSymbol();
	const aliased = symbol?.getAliasedSymbol();
	if (aliased) {
		symbol = aliased;
	}
	const decls = (symbol?.getDeclarations() ?? []).filter(
		(d) => !IMPORT_BINDING_KINDS.has(d.getKind())
	);
	if (decls.length === 0) {
		return NO_TARGETS;
	}
	const first = decls[0];
	const key = `${first.getSourceFile().getFilePath()}:${first.getPos()}:${first.getEnd()}:${decls.length}`;
	const cached = wrapperCache.get(key);
	if (cached) {
		return cached;
	}
	// Overloaded declarations put the implementation last; scan them all.
	const body = decls.map((d) => d.getText()).join("\n");
	const methods = new Set<string>();
	for (const match of body.matchAll(HTTP_CALL)) {
		methods.add(match[1].toUpperCase());
	}
	let httpMethod: string | null = null;
	if (methods.size === 1) {
		httpMethod = [...methods][0];
	} else if (methods.size > 1) {
		httpMethod = "ROUTE";
	}
	const targets: WrapperTargets = {
		controller: CONTROLLER_CALL.test(body),
		httpMethod,
		pathParamIndex: httpMethod === null ? null : resolvePathParamIndex(decls),
	};
	wrapperCache.set(key, targets);
	return targets;
}

/** The class decorator that composes `Controller()`, standard or wrapper. */
export function controllerDecorator(
	cls: ClassDeclaration
): Decorator | undefined {
	return (
		cls.getDecorator("Controller") ??
		cls.getDecorators().find((d) => resolveDecoratorWrapper(d).controller)
	);
}

type NestClassType =
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

/** Name of the class this one extends, without namespace or type arguments. */
export function baseClassName(cls: ClassDeclaration): string | undefined {
	const base = cls.getExtends()?.getExpression().getText();
	return base?.split("<")[0].split(".").pop() ?? base;
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
	return controllerDecorator(cls) !== undefined;
}

/**
 * True when the class carries `@Controller()` or declares a route handler. Both
 * a decorator composing `Controller()` and an undecorated base class whose
 * concrete subclass carries it end up here, because Nest reads route metadata
 * off the prototype chain.
 */
export function declaresRoutes(cls: ClassDeclaration): boolean {
	return isController(cls) || cls.getMethods().some(isHttpHandler);
}

export function isService(cls: ClassDeclaration): boolean {
	return hasDecorator(cls, "Injectable");
}

// Classes NestJS treats as DI participants, controllers included.
export function isInjectable(cls: ClassDeclaration): boolean {
	return (
		hasDecorator(cls, "Injectable") ||
		hasDecorator(cls, "Resolver") ||
		hasDecorator(cls, "WebSocketGateway") ||
		isController(cls)
	);
}

/**
 * True when TypeScript emits `design:paramtypes` for the class, which is what
 * the injector reads. A class decorator triggers it, and so does a decorator on
 * any constructor parameter.
 */
export function emitsConstructorMetadata(cls: ClassDeclaration): boolean {
	if (cls.getDecorators().length > 0) {
		return true;
	}
	return cls
		.getConstructors()
		.some((ctor) =>
			ctor.getParameters().some((param) => param.getDecorators().length > 0)
		);
}

export function isModule(cls: ClassDeclaration): boolean {
	return hasDecorator(cls, "Module");
}

export function isHttpHandler(method: MethodDeclaration): boolean {
	return method
		.getDecorators()
		.some(
			(d) =>
				HTTP_DECORATORS.has(d.getName()) ||
				resolveDecoratorWrapper(d).httpMethod !== null
		);
}

// Entry points the framework awaits for you, the same way it awaits a route
// handler: GraphQL, WebSockets, microservice patterns, ts-rest and gRPC.
const FRAMEWORK_HANDLER_DECORATORS = new Set([
	"EventPattern",
	"GrpcMethod",
	"GrpcStreamMethod",
	"MessagePattern",
	"Mutation",
	"Query",
	"ResolveField",
	"ResolveProperty",
	"ResolveReference",
	"SubscribeMessage",
	"Subscription",
	"TsRestHandler",
]);

export function isFrameworkHandler(method: MethodDeclaration): boolean {
	return method
		.getDecorators()
		.some((d) => FRAMEWORK_HANDLER_DECORATORS.has(d.getName()));
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
