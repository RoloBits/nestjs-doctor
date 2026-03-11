import { dirname, resolve } from "node:path";
import type {
	CallExpression,
	ClassDeclaration,
	Node,
	ObjectLiteralExpression,
	Project,
	SourceFile,
} from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { PathAliasMap } from "./tsconfig-paths.js";
import { resolvePathAlias } from "./tsconfig-paths.js";
import type { ProviderInfo } from "./type-resolver.js";

const FORWARD_REF_REGEX = /=>\s*(\w+)/;
const JS_EXT_REGEX = /\.js$/;

export interface ModuleNode {
	classDeclaration: ClassDeclaration;
	controllers: string[];
	exports: string[];
	filePath: string;
	imports: string[];
	name: string;
	providers: string[];
}

export interface ModuleGraph {
	edges: Map<string, Set<string>>;
	modules: Map<string, ModuleNode>;
	providerToModule: Map<string, ModuleNode>;
}

function extractModulesFromFile(
	sourceFile: ReturnType<Project["getSourceFile"]> & object,
	filePath: string,
	pathAliases: PathAliasMap
): ModuleNode[] {
	const modules: ModuleNode[] = [];
	for (const cls of sourceFile.getClasses()) {
		const moduleDecorator = cls.getDecorator("Module");
		if (!moduleDecorator) {
			continue;
		}

		const name = cls.getName() ?? "AnonymousModule";
		const args = moduleDecorator.getArguments()[0];

		const node: ModuleNode = {
			name,
			filePath,
			classDeclaration: cls,
			imports: [],
			exports: [],
			providers: [],
			controllers: [],
		};

		if (args && args.getKind() === SyntaxKind.ObjectLiteralExpression) {
			const obj = args.asKind(SyntaxKind.ObjectLiteralExpression);
			if (obj) {
				node.imports = extractArrayPropertyNames(obj, "imports", pathAliases);
				node.exports = extractArrayPropertyNames(obj, "exports", pathAliases);
				node.providers = extractArrayPropertyNames(
					obj,
					"providers",
					pathAliases
				);
				node.controllers = extractArrayPropertyNames(
					obj,
					"controllers",
					pathAliases
				);
			}
		}

		modules.push(node);
	}
	return modules;
}

export function buildModuleGraph(
	project: Project,
	files: string[],
	pathAliases: PathAliasMap = new Map()
): ModuleGraph {
	const modules = new Map<string, ModuleNode>();
	const edges = new Map<string, Set<string>>();

	// First pass: collect all @Module() classes
	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}

		for (const node of extractModulesFromFile(
			sourceFile,
			filePath,
			pathAliases
		)) {
			modules.set(node.name, node);
		}
	}

	// Second pass: build edges from import relationships
	for (const [name, node] of modules) {
		const importSet = new Set<string>();
		for (const imp of node.imports) {
			if (modules.has(imp)) {
				importSet.add(imp);
			}
		}
		edges.set(name, importSet);
	}

	// Build inverse index: provider name → module
	const providerToModule = new Map<string, ModuleNode>();
	for (const mod of modules.values()) {
		for (const provider of mod.providers) {
			providerToModule.set(provider, mod);
		}
	}

	return { modules, edges, providerToModule };
}

const MAX_RESOLVE_DEPTH = 5;

const DYNAMIC_MODULE_METHODS = new Set([
	"forRoot",
	"forRootAsync",
	"forFeature",
	"forFeatureAsync",
	"forChild",
	"forChildAsync",
	"register",
	"registerAsync",
]);

function extractArrayPropertyNames(
	obj: ObjectLiteralExpression,
	propertyName: string,
	pathAliases: PathAliasMap
): string[] {
	const prop = obj.getProperty(propertyName);
	if (!prop) {
		return [];
	}

	const assignment = prop.asKind(SyntaxKind.PropertyAssignment);
	if (!assignment) {
		return [];
	}

	const initializer = assignment.getInitializer();
	if (!initializer) {
		return [];
	}

	return extractNamesFromExpression(
		initializer,
		obj.getSourceFile(),
		0,
		pathAliases
	);
}

function extractNamesFromExpression(
	node: Node,
	sourceFile: SourceFile,
	depth: number,
	pathAliases: PathAliasMap
): string[] {
	if (depth > MAX_RESOLVE_DEPTH) {
		return [];
	}

	const kind = node.getKind();

	if (kind === SyntaxKind.ArrayLiteralExpression) {
		const arr = node.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
		const names: string[] = [];
		for (const el of arr.getElements()) {
			names.push(
				...extractNamesFromElement(el, sourceFile, depth, pathAliases)
			);
		}
		return names;
	}

	if (kind === SyntaxKind.CallExpression) {
		return extractNamesFromCallExpression(
			node.asKindOrThrow(SyntaxKind.CallExpression),
			sourceFile,
			depth,
			pathAliases
		);
	}

	if (kind === SyntaxKind.Identifier) {
		return resolveIdentifier(
			node.getText(),
			sourceFile,
			depth + 1,
			pathAliases
		);
	}

	return [];
}

function extractNamesFromElement(
	el: Node,
	sourceFile: SourceFile,
	depth: number,
	pathAliases: PathAliasMap
): string[] {
	const text = el.getText();

	// Handle forwardRef(() => SomeModule)
	if (text.startsWith("forwardRef")) {
		const match = text.match(FORWARD_REF_REGEX);
		return match ? [match[1]] : [text];
	}

	const kind = el.getKind();

	// Handle spread elements: ...getImports() or ...someArray
	if (kind === SyntaxKind.SpreadElement) {
		const spread = el.asKindOrThrow(SyntaxKind.SpreadElement);
		return extractNamesFromExpression(
			spread.getExpression(),
			sourceFile,
			depth,
			pathAliases
		);
	}

	// Handle call expressions: ConfigModule.forRoot(), someFunction()
	if (kind === SyntaxKind.CallExpression) {
		return extractNamesFromCallExpression(
			el.asKindOrThrow(SyntaxKind.CallExpression),
			sourceFile,
			depth,
			pathAliases
		);
	}

	// Handle property access without call: SomeModule.SomeProperty
	if (kind === SyntaxKind.PropertyAccessExpression) {
		const access = el.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
		return [access.getExpression().getText()];
	}

	// Plain identifier
	if (kind === SyntaxKind.Identifier) {
		return [text];
	}

	return [text];
}

function extractNamesFromCallExpression(
	call: CallExpression,
	sourceFile: SourceFile,
	depth: number,
	pathAliases: PathAliasMap
): string[] {
	const expr = call.getExpression();

	// Handle .concat() chains: [A, B].concat([C, D])
	if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
		const access = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
		const methodName = access.getName();

		if (methodName === "concat") {
			const receiverNames = extractNamesFromExpression(
				access.getExpression(),
				sourceFile,
				depth,
				pathAliases
			);
			const argNames: string[] = [];
			for (const arg of call.getArguments()) {
				argNames.push(
					...extractNamesFromExpression(arg, sourceFile, depth, pathAliases)
				);
			}
			return [...receiverNames, ...argNames];
		}

		// Handle dynamic module methods: ConfigModule.forRoot(), TypeOrmModule.forFeature()
		if (DYNAMIC_MODULE_METHODS.has(methodName)) {
			return [access.getExpression().getText()];
		}

		// Unknown property access call — try to use the leftmost identifier
		return [access.getExpression().getText()];
	}

	// Handle plain function calls: getImports()
	if (expr.getKind() === SyntaxKind.Identifier) {
		const funcName = expr.getText();
		return resolveFunctionCall(funcName, sourceFile, depth + 1, pathAliases);
	}

	return [];
}

function resolveModuleSpecifier(
	specifier: string,
	sourceFile: SourceFile,
	pathAliases: PathAliasMap
): SourceFile | undefined {
	if (!specifier.startsWith(".")) {
		const aliasResolved = resolvePathAlias(specifier, pathAliases);
		if (!aliasResolved) {
			return undefined;
		}
		const project = sourceFile.getProject();
		const candidates = [
			`${aliasResolved}.ts`,
			`${aliasResolved}/index.ts`,
			aliasResolved,
			aliasResolved.replace(JS_EXT_REGEX, ".ts"),
		];
		for (const candidate of candidates) {
			const target = project.getSourceFile(candidate);
			if (target) {
				return target;
			}
		}
		return undefined;
	}

	const dir = dirname(sourceFile.getFilePath());
	const resolved = resolve(dir, specifier);
	const project = sourceFile.getProject();

	// Try .ts, /index.ts, exact match, and .js → .ts
	const candidates = [
		`${resolved}.ts`,
		`${resolved}/index.ts`,
		resolved,
		resolved.replace(JS_EXT_REGEX, ".ts"),
	];

	for (const candidate of candidates) {
		const target = project.getSourceFile(candidate);
		if (target) {
			return target;
		}
	}

	return undefined;
}

function resolveImportedSourceFile(
	name: string,
	sourceFile: SourceFile,
	pathAliases: PathAliasMap
): { sourceFile: SourceFile; localName: string } | undefined {
	// Check import declarations: import { foo } from './other' or import { foo as bar } from './other'
	for (const importDecl of sourceFile.getImportDeclarations()) {
		for (const namedImport of importDecl.getNamedImports()) {
			const importedName = namedImport.getAliasNode()
				? namedImport.getAliasNode()!.getText()
				: namedImport.getName();
			if (importedName === name) {
				const specifier = importDecl.getModuleSpecifierValue();
				const target = resolveModuleSpecifier(
					specifier,
					sourceFile,
					pathAliases
				);
				if (target) {
					// Return the original exported name (not the alias)
					return { sourceFile: target, localName: namedImport.getName() };
				}
				return undefined;
			}
		}
	}

	// Check re-exports: export { X } from './other'
	for (const exportDecl of sourceFile.getExportDeclarations()) {
		if (!exportDecl.getModuleSpecifierValue()) {
			continue;
		}
		for (const namedExport of exportDecl.getNamedExports()) {
			const exportedName = namedExport.getAliasNode()
				? namedExport.getAliasNode()!.getText()
				: namedExport.getName();
			if (exportedName === name) {
				const specifier = exportDecl.getModuleSpecifierValue()!;
				const target = resolveModuleSpecifier(
					specifier,
					sourceFile,
					pathAliases
				);
				if (target) {
					return { sourceFile: target, localName: namedExport.getName() };
				}
				return undefined;
			}
		}
	}

	return undefined;
}

function resolveIdentifier(
	name: string,
	sourceFile: SourceFile,
	depth: number,
	pathAliases: PathAliasMap
): string[] {
	if (depth > MAX_RESOLVE_DEPTH) {
		return [];
	}

	// Same-file variable lookup
	for (const stmt of sourceFile.getStatements()) {
		if (stmt.getKind() !== SyntaxKind.VariableStatement) {
			continue;
		}
		const varStmt = stmt.asKindOrThrow(SyntaxKind.VariableStatement);
		for (const decl of varStmt.getDeclarations()) {
			if (decl.getName() === name) {
				const init = decl.getInitializer();
				if (init) {
					return extractNamesFromExpression(
						init,
						sourceFile,
						depth,
						pathAliases
					);
				}
			}
		}
	}

	// Cross-file fallback
	const imported = resolveImportedSourceFile(name, sourceFile, pathAliases);
	if (imported) {
		return resolveIdentifier(
			imported.localName,
			imported.sourceFile,
			depth + 1,
			pathAliases
		);
	}

	return [];
}

function resolveArrowFunctionBody(
	name: string,
	sourceFile: SourceFile,
	depth: number,
	pathAliases: PathAliasMap
): string[] | undefined {
	for (const stmt of sourceFile.getStatements()) {
		if (stmt.getKind() !== SyntaxKind.VariableStatement) {
			continue;
		}
		const varStmt = stmt.asKindOrThrow(SyntaxKind.VariableStatement);
		for (const decl of varStmt.getDeclarations()) {
			if (decl.getName() !== name) {
				continue;
			}
			const init = decl.getInitializer();
			if (!init || init.getKind() !== SyntaxKind.ArrowFunction) {
				continue;
			}
			const arrow = init.asKindOrThrow(SyntaxKind.ArrowFunction);
			const body = arrow.getBody();

			// Concise body: () => [AuthModule, HealthModule]
			if (body.getKind() !== SyntaxKind.Block) {
				return extractNamesFromExpression(body, sourceFile, depth, pathAliases);
			}

			// Block body: () => { return [...] }
			const names: string[] = [];
			for (const returnStmt of body.getDescendantsOfKind(
				SyntaxKind.ReturnStatement
			)) {
				const returnExpr = returnStmt.getExpression();
				if (returnExpr) {
					names.push(
						...extractNamesFromExpression(
							returnExpr,
							sourceFile,
							depth,
							pathAliases
						)
					);
				}
			}
			return names;
		}
	}
	return undefined;
}

function resolveFunctionCall(
	funcName: string,
	sourceFile: SourceFile,
	depth: number,
	pathAliases: PathAliasMap
): string[] {
	if (depth > MAX_RESOLVE_DEPTH) {
		return [];
	}

	// Same-file FunctionDeclaration
	for (const stmt of sourceFile.getStatements()) {
		if (stmt.getKind() !== SyntaxKind.FunctionDeclaration) {
			continue;
		}
		const funcDecl = stmt.asKindOrThrow(SyntaxKind.FunctionDeclaration);
		if (funcDecl.getName() !== funcName) {
			continue;
		}

		const names: string[] = [];
		for (const returnStmt of funcDecl.getDescendantsOfKind(
			SyntaxKind.ReturnStatement
		)) {
			const returnExpr = returnStmt.getExpression();
			if (returnExpr) {
				names.push(
					...extractNamesFromExpression(
						returnExpr,
						sourceFile,
						depth,
						pathAliases
					)
				);
			}
		}
		return names;
	}

	// Same-file arrow function variable: const getImports = () => [...]
	const arrowResult = resolveArrowFunctionBody(
		funcName,
		sourceFile,
		depth,
		pathAliases
	);
	if (arrowResult) {
		return arrowResult;
	}

	// Cross-file fallback
	const imported = resolveImportedSourceFile(funcName, sourceFile, pathAliases);
	if (imported) {
		return resolveFunctionCall(
			imported.localName,
			imported.sourceFile,
			depth + 1,
			pathAliases
		);
	}

	return [];
}

export function updateModuleGraphForFile(
	graph: ModuleGraph,
	project: Project,
	filePath: string,
	pathAliases: PathAliasMap = new Map()
): void {
	// 1. Remove stale modules from this file
	for (const [name, node] of graph.modules) {
		if (node.filePath === filePath) {
			graph.modules.delete(name);
			graph.edges.delete(name);
			// Clean up providerToModule entries for this module's providers
			for (const provider of node.providers) {
				if (graph.providerToModule.get(provider) === node) {
					graph.providerToModule.delete(provider);
				}
			}
			// Clean edges pointing TO this module from other modules
			for (const edgeSet of graph.edges.values()) {
				edgeSet.delete(name);
			}
		}
	}

	// 2. Re-scan only the changed file for @Module() classes
	const sourceFile = project.getSourceFile(filePath);
	if (!sourceFile) {
		return;
	}

	const newModules = extractModulesFromFile(sourceFile, filePath, pathAliases);
	for (const node of newModules) {
		graph.modules.set(node.name, node);
	}

	// 3. Rebuild edges for new modules and update providerToModule
	for (const node of newModules) {
		const importSet = new Set<string>();
		for (const imp of node.imports) {
			if (graph.modules.has(imp)) {
				importSet.add(imp);
			}
		}
		graph.edges.set(node.name, importSet);

		for (const provider of node.providers) {
			graph.providerToModule.set(provider, node);
		}
	}

	// 4. Rebuild edges from existing modules that might reference newly added/renamed modules
	for (const [name, node] of graph.modules) {
		if (node.filePath === filePath) {
			continue;
		}
		const importSet = new Set<string>();
		for (const imp of node.imports) {
			if (graph.modules.has(imp)) {
				importSet.add(imp);
			}
		}
		graph.edges.set(name, importSet);
	}
}

export function mergeModuleGraphs(
	graphs: Map<string, ModuleGraph>
): ModuleGraph {
	const modules = new Map<string, ModuleNode>();
	const edges = new Map<string, Set<string>>();
	const providerToModule = new Map<string, ModuleNode>();

	for (const [projectName, graph] of graphs) {
		for (const [name, node] of graph.modules) {
			const prefixed = `${projectName}/${name}`;
			const mergedNode: ModuleNode = {
				...node,
				name: prefixed,
				imports: node.imports.map((imp) =>
					graph.modules.has(imp) ? `${projectName}/${imp}` : imp
				),
				exports: node.exports.map((exp) =>
					graph.modules.has(exp) ? `${projectName}/${exp}` : exp
				),
			};
			modules.set(prefixed, mergedNode);
		}

		for (const [name, targets] of graph.edges) {
			const prefixedFrom = `${projectName}/${name}`;
			const prefixedTargets = new Set<string>();
			for (const target of targets) {
				prefixedTargets.add(`${projectName}/${target}`);
			}
			edges.set(prefixedFrom, prefixedTargets);
		}

		for (const [provider, node] of graph.providerToModule) {
			const prefixedModuleName = `${projectName}/${node.name}`;
			const existingNode = modules.get(prefixedModuleName);
			if (existingNode) {
				providerToModule.set(`${projectName}/${provider}`, existingNode);
			}
		}
	}

	return { modules, edges, providerToModule };
}

export function findCircularDeps(graph: ModuleGraph): string[][] {
	const cycles: string[][] = [];
	const visited = new Set<string>();
	const recursionStack = new Set<string>();

	function dfs(node: string, path: string[]): void {
		visited.add(node);
		recursionStack.add(node);

		const neighbors = graph.edges.get(node) ?? new Set();
		for (const neighbor of neighbors) {
			if (!visited.has(neighbor)) {
				dfs(neighbor, [...path, neighbor]);
			} else if (recursionStack.has(neighbor)) {
				const cycleStart = path.indexOf(neighbor);
				if (cycleStart !== -1) {
					cycles.push(path.slice(cycleStart));
				} else {
					cycles.push([...path, neighbor]);
				}
			}
		}

		recursionStack.delete(node);
	}

	for (const moduleName of graph.modules.keys()) {
		if (!visited.has(moduleName)) {
			dfs(moduleName, [moduleName]);
		}
	}

	return cycles;
}

export function findProviderModule(
	graph: ModuleGraph,
	providerName: string
): ModuleNode | undefined {
	return graph.providerToModule.get(providerName);
}

export interface ProviderEdge {
	consumer: string;
	dependency: string;
}

export function traceProviderEdges(
	fromModule: ModuleNode,
	toModule: ModuleNode,
	providers: Map<string, ProviderInfo>,
	providerToModule: Map<string, ModuleNode>,
	project: Project,
	files: string[]
): ProviderEdge[] {
	const edges: ProviderEdge[] = [];

	// Check providers in fromModule that depend on providers in toModule
	for (const providerName of fromModule.providers) {
		const provider = providers.get(providerName);
		if (!provider) {
			continue;
		}
		for (const dep of provider.dependencies) {
			const depModule = providerToModule.get(dep);
			if (depModule && depModule.name === toModule.name) {
				edges.push({ consumer: providerName, dependency: dep });
			}
		}
	}

	// Check controllers in fromModule that depend on providers in toModule
	for (const controllerName of fromModule.controllers) {
		for (const filePath of files) {
			const sourceFile = project.getSourceFile(filePath);
			if (!sourceFile) {
				continue;
			}
			for (const cls of sourceFile.getClasses()) {
				if (cls.getName() !== controllerName) {
					continue;
				}
				const ctor = cls.getConstructors()[0];
				if (!ctor) {
					continue;
				}
				for (const param of ctor.getParameters()) {
					const typeNode = param.getTypeNode();
					const typeText = typeNode
						? typeNode.getText()
						: param.getType().getText();
					const simpleName =
						typeText.split(".").pop()?.split("<")[0] ?? typeText;
					const depModule = providerToModule.get(simpleName);
					if (depModule && depModule.name === toModule.name) {
						edges.push({ consumer: controllerName, dependency: simpleName });
					}
				}
			}
		}
	}

	return edges;
}
