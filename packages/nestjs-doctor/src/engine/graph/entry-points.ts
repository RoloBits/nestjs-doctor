import { type Identifier, type Node, type Project, SyntaxKind } from "ts-morph";
import type { ModuleGraph } from "./module-graph.js";

const WRAPPER_NAME = /bootstrap/i;
const NEST_FACTORY_CALL = /\b(?:NestFactory|CommandFactory)\s*\./;
const wrapperVerdicts = new Map<string, boolean>();
const entryModulesCache = new WeakMap<ModuleGraph, Set<string>>();

// Declaration kinds that are import bindings, not implementations.
const IMPORT_BINDING_KINDS = new Set<SyntaxKind>([
	SyntaxKind.ImportSpecifier,
	SyntaxKind.ImportClause,
	SyntaxKind.NamespaceImport,
	SyntaxKind.ImportEqualsDeclaration,
]);

/** A declaration whose text can contain calls: not ambient, not a bodiless overload. */
function hasImplementationText(decl: Node): boolean {
	if (decl.getSourceFile().isDeclarationFile()) {
		return false;
	}
	const fn = decl.asKind(SyntaxKind.FunctionDeclaration);
	return fn ? fn.getBody() !== undefined : true;
}

/**
 * A bootstrap helper like `standaloneBootstrap(BootstrapModule)`: an
 * implementation must reach a Nest factory; without one (unresolvable import,
 * ambient declaration) the name decides.
 */
function isBootstrapWrapper(callee: Identifier): boolean {
	let symbol = callee.getSymbol();
	const aliased = symbol?.getAliasedSymbol();
	if (aliased) {
		symbol = aliased;
	}
	const decls = (symbol?.getDeclarations() ?? []).filter(
		(d) => !IMPORT_BINDING_KINDS.has(d.getKind()) && hasImplementationText(d)
	);
	if (decls.length === 0) {
		return WRAPPER_NAME.test(callee.getText());
	}
	const first = decls[0];
	const key = `${first.getSourceFile().getFilePath()}:${first.getPos()}:${first.getEnd()}:${decls.length}`;
	const cached = wrapperVerdicts.get(key);
	if (cached !== undefined) {
		return cached;
	}
	const verdict = decls.some((decl) => NEST_FACTORY_CALL.test(decl.getText()));
	wrapperVerdicts.set(key, verdict);
	return verdict;
}

/** A module declared here is the application root whatever its class is called. */
const ROOT_MODULE_FILE = /(^|\/)(app|root)\.module\.[mc]?ts$/;

const FACTORY_METHODS = new Set([
	"create",
	"createApplicationContext",
	"createMicroservice",
]);

/**
 * Module names handed to NestFactory. An application root is never imported by
 * another module, and a project may bootstrap several.
 */
function collectBootstrappedModules(
	project: Project,
	files: string[]
): Set<string> {
	const roots = new Set<string>();

	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}

		for (const call of sourceFile.getDescendantsOfKind(
			SyntaxKind.CallExpression
		)) {
			const callee = call
				.getExpression()
				.asKind(SyntaxKind.PropertyAccessExpression);
			if (callee) {
				const calleeObject = callee.getExpression().getText();
				const isNestFactory =
					calleeObject.endsWith("NestFactory") &&
					FACTORY_METHODS.has(callee.getName());
				const isCommandFactory =
					calleeObject.endsWith("CommandFactory") &&
					callee.getName().startsWith("run");
				if (!(isNestFactory || isCommandFactory)) {
					continue;
				}
				const target = call.getArguments()[0];
				if (target?.getKind() === SyntaxKind.Identifier) {
					roots.add(target.getText());
				}
				continue;
			}

			const wrapper = call.getExpression().asKind(SyntaxKind.Identifier);
			if (!(wrapper && isBootstrapWrapper(wrapper))) {
				continue;
			}
			for (const arg of call.getArguments()) {
				if (arg.getKind() === SyntaxKind.Identifier) {
					roots.add(arg.getText());
				}
			}
		}
	}

	return roots;
}

/** Drops the memoized entry set for a graph that is about to change. */
export function invalidateEntryModules(moduleGraph: ModuleGraph): void {
	entryModulesCache.delete(moduleGraph);
}

/**
 * Names of the modules that are an application root: handed to NestFactory,
 * called AppModule, or declared in an app/root module file. Memoized per graph.
 */
export function collectEntryModules(
	project: Project,
	files: string[],
	moduleGraph: ModuleGraph
): Set<string> {
	const cached = entryModulesCache.get(moduleGraph);
	if (cached) {
		return cached;
	}
	const bootstrapped = collectBootstrappedModules(project, files);
	const entries = new Set<string>();

	for (const mod of moduleGraph.modules.values()) {
		if (
			mod.name === "AppModule" ||
			ROOT_MODULE_FILE.test(mod.filePath) ||
			bootstrapped.has(mod.name)
		) {
			entries.add(mod.name);
		}
	}

	entryModulesCache.set(moduleGraph, entries);
	return entries;
}
