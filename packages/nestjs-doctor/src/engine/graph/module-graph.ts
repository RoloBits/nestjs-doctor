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

const JS_EXT_REGEX = /\.js$/;

export interface ModuleNode {
	classDeclaration: ClassDeclaration;
	controllers: string[];
	exports: string[];
	filePath: string;
	forwardRefImports: Set<string>;
	importKeys: string[];
	imports: string[];
	key: string;
	name: string;
	providers: string[];
}

export interface ModuleGraph {
	byName: Map<string, ModuleNode[]>;
	edges: Map<string, Set<string>>;
	modules: Map<string, ModuleNode>;
	providerToModule: Map<string, ModuleNode>;
}

function moduleKey(filePath: string, name: string): string {
	return `${filePath}::${name}`;
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
			key: moduleKey(filePath, name),
			filePath,
			classDeclaration: cls,
			imports: [],
			importKeys: [],
			forwardRefImports: new Set<string>(),
			exports: [],
			providers: [],
			controllers: [],
		};

		if (args && args.getKind() === SyntaxKind.ObjectLiteralExpression) {
			const obj = args.asKind(SyntaxKind.ObjectLiteralExpression);
			if (obj) {
				const importTags = extractArrayPropertyNames(
					obj,
					"imports",
					pathAliases
				);
				node.imports = importTags.map((t) => t.name);
				for (const t of importTags) {
					if (t.viaForwardRef) {
						node.forwardRefImports.add(t.name);
					}
				}
				node.exports = extractArrayPropertyNames(
					obj,
					"exports",
					pathAliases
				).map((t) => t.name);
				node.providers = extractArrayPropertyNames(
					obj,
					"providers",
					pathAliases
				).map((t) => t.name);
				node.controllers = extractArrayPropertyNames(
					obj,
					"controllers",
					pathAliases
				).map((t) => t.name);
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
	const byName = new Map<string, ModuleNode[]>();
	const edges = new Map<string, Set<string>>();

	// Pass 1: collect all @Module() classes, key by composite
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
			modules.set(node.key, node);
			const bucket = byName.get(node.name);
			if (bucket) {
				bucket.push(node);
			} else {
				byName.set(node.name, [node]);
			}
		}
	}

	// Pass 2: resolve each module's imports to composite keys, then build edges
	for (const node of modules.values()) {
		const importSet = new Set<string>();
		for (const imp of node.imports) {
			const resolved = resolveImportToKey(
				imp,
				node,
				modules,
				byName,
				pathAliases
			);
			if (resolved) {
				importSet.add(resolved);
			}
		}
		node.importKeys = [...importSet];
		edges.set(node.key, importSet);
	}

	// Build inverse index: provider name → module
	const providerToModule = new Map<string, ModuleNode>();
	for (const mod of modules.values()) {
		for (const provider of mod.providers) {
			providerToModule.set(provider, mod);
		}
	}

	return { modules, byName, edges, providerToModule };
}

function resolveImportToKey(
	importedName: string,
	consumerNode: ModuleNode,
	modules: Map<string, ModuleNode>,
	byName: Map<string, ModuleNode[]>,
	pathAliases: PathAliasMap
): string | undefined {
	// 1. Walk import declarations — chase through barrel re-exports until we
	//    land on a file that actually declares the target @Module class. Without
	//    this loop, `import { X } from './barrel'` followed by
	//    `export { X } from './a'` lands on the barrel file, whose composite key
	//    is not in `modules`, and resolution falls through to the by-name
	//    fallback — which under name collision picks the wrong file.
	let currentSource: SourceFile | undefined =
		consumerNode.classDeclaration.getSourceFile();
	let currentName = importedName;
	const visited = new Set<string>();
	while (currentSource && !visited.has(currentSource.getFilePath())) {
		visited.add(currentSource.getFilePath());
		const next = resolveImportedSourceFile(
			currentName,
			currentSource,
			pathAliases
		);
		if (!next) {
			break;
		}
		const candidate = moduleKey(next.sourceFile.getFilePath(), next.localName);
		if (modules.has(candidate)) {
			return candidate;
		}
		currentSource = next.sourceFile;
		currentName = next.localName;
	}

	// 2. Same-file reference (a module imports another @Module declared in the same file)
	const sameFileCandidate = moduleKey(consumerNode.filePath, importedName);
	if (modules.has(sameFileCandidate)) {
		return sameFileCandidate;
	}

	// 3. Fall back to a unique by-name match (collision-free codebases)
	const bucket = byName.get(importedName);
	if (bucket && bucket.length === 1) {
		return bucket[0].key;
	}

	// 4. Multiple candidates and no import statement to disambiguate — pick the first
	//    arbitrarily to preserve current best-effort behavior for unresolvable symbols.
	if (bucket && bucket.length > 1) {
		return bucket[0].key;
	}

	return undefined;
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

interface ExtractedName {
	name: string;
	viaForwardRef: boolean;
}

function plain(name: string): ExtractedName {
	return { name, viaForwardRef: false };
}

function extractArrayPropertyNames(
	obj: ObjectLiteralExpression,
	propertyName: string,
	pathAliases: PathAliasMap
): ExtractedName[] {
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
): ExtractedName[] {
	if (depth > MAX_RESOLVE_DEPTH) {
		return [];
	}

	const kind = node.getKind();

	if (kind === SyntaxKind.ArrayLiteralExpression) {
		const arr = node.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
		const names: ExtractedName[] = [];
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
): ExtractedName[] {
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

	// Handle call expressions: forwardRef(() => X), ConfigModule.forRoot(), someFunction()
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
		return [plain(access.getExpression().getText())];
	}

	// Plain identifier
	if (kind === SyntaxKind.Identifier) {
		return [plain(el.getText())];
	}

	return [plain(el.getText())];
}

function extractNamesFromCallExpression(
	call: CallExpression,
	sourceFile: SourceFile,
	depth: number,
	pathAliases: PathAliasMap
): ExtractedName[] {
	const expr = call.getExpression();

	// Handle forwardRef(() => SomeModule) — AST-level callee match
	if (
		expr.getKind() === SyntaxKind.Identifier &&
		expr.getText() === "forwardRef"
	) {
		const args = call.getArguments();
		if (args.length === 0) {
			return [];
		}
		const arg = args[0];
		if (arg.getKind() === SyntaxKind.ArrowFunction) {
			const arrow = arg.asKindOrThrow(SyntaxKind.ArrowFunction);
			const body = arrow.getBody();
			if (body.getKind() === SyntaxKind.Identifier) {
				return [{ name: body.getText(), viaForwardRef: true }];
			}
			// Block body: () => { return SomeModule }
			if (body.getKind() === SyntaxKind.Block) {
				const block = body.asKindOrThrow(SyntaxKind.Block);
				const names: ExtractedName[] = [];
				for (const ret of block.getDescendantsOfKind(
					SyntaxKind.ReturnStatement
				)) {
					const retExpr = ret.getExpression();
					if (!retExpr) {
						continue;
					}
					for (const e of extractNamesFromExpression(
						retExpr,
						sourceFile,
						depth,
						pathAliases
					)) {
						names.push({ ...e, viaForwardRef: true });
					}
				}
				return names;
			}
			// Other expression bodies (rare): recurse and tag.
			const inner = extractNamesFromExpression(
				body,
				sourceFile,
				depth,
				pathAliases
			);
			return inner.map((e) => ({ ...e, viaForwardRef: true }));
		}
		return [plain(arg.getText())];
	}

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
			const argNames: ExtractedName[] = [];
			for (const arg of call.getArguments()) {
				argNames.push(
					...extractNamesFromExpression(arg, sourceFile, depth, pathAliases)
				);
			}
			return [...receiverNames, ...argNames];
		}

		// Handle dynamic module methods: ConfigModule.forRoot(), TypeOrmModule.forFeature()
		if (DYNAMIC_MODULE_METHODS.has(methodName)) {
			return [plain(access.getExpression().getText())];
		}

		// Unknown property access call — try to use the leftmost identifier
		return [plain(access.getExpression().getText())];
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
): ExtractedName[] {
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
): ExtractedName[] | undefined {
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
			const names: ExtractedName[] = [];
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
): ExtractedName[] {
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

		const names: ExtractedName[] = [];
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
	// 1. Remove stale modules from this file (composite-keyed)
	for (const [key, node] of graph.modules) {
		if (node.filePath !== filePath) {
			continue;
		}
		graph.modules.delete(key);
		graph.edges.delete(key);
		// Clean up providerToModule entries for this module's providers
		for (const provider of node.providers) {
			if (graph.providerToModule.get(provider) === node) {
				graph.providerToModule.delete(provider);
			}
		}
		// Clean edges pointing TO this module from other modules
		for (const edgeSet of graph.edges.values()) {
			edgeSet.delete(key);
		}
		// Drop from byName bucket
		const bucket = graph.byName.get(node.name);
		if (bucket) {
			const idx = bucket.indexOf(node);
			if (idx !== -1) {
				bucket.splice(idx, 1);
			}
			if (bucket.length === 0) {
				graph.byName.delete(node.name);
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
		graph.modules.set(node.key, node);
		const bucket = graph.byName.get(node.name);
		if (bucket) {
			bucket.push(node);
		} else {
			graph.byName.set(node.name, [node]);
		}
		for (const provider of node.providers) {
			graph.providerToModule.set(provider, node);
		}
	}

	// 3. Rebuild edges for new modules (resolve via the same algorithm buildModuleGraph uses)
	for (const node of newModules) {
		const importSet = new Set<string>();
		for (const imp of node.imports) {
			const resolved = resolveImportToKey(
				imp,
				node,
				graph.modules,
				graph.byName,
				pathAliases
			);
			if (resolved) {
				importSet.add(resolved);
			}
		}
		node.importKeys = [...importSet];
		graph.edges.set(node.key, importSet);
	}

	// 4. Rebuild edges from existing modules that might now reference newly added/renamed modules
	for (const [key, node] of graph.modules) {
		if (node.filePath === filePath) {
			continue;
		}
		const importSet = new Set<string>();
		for (const imp of node.imports) {
			const resolved = resolveImportToKey(
				imp,
				node,
				graph.modules,
				graph.byName,
				pathAliases
			);
			if (resolved) {
				importSet.add(resolved);
			}
		}
		node.importKeys = [...importSet];
		graph.edges.set(key, importSet);
	}
}

export function mergeModuleGraphs(
	graphs: Map<string, ModuleGraph>
): ModuleGraph {
	const modules = new Map<string, ModuleNode>();
	const byName = new Map<string, ModuleNode[]>();
	const edges = new Map<string, Set<string>>();
	const providerToModule = new Map<string, ModuleNode>();

	for (const [projectName, graph] of graphs) {
		// Merged composite key prefixes the inner key with the project name.
		// `node.name` stays as the original class name; project context is preserved
		// in `node.key` (`${projectName}/${filePath}::${name}`) for downstream readers.
		// `forwardRefImports` is class-name based and passes through unchanged via spread.
		for (const [innerKey, node] of graph.modules) {
			const prefixedKey = `${projectName}/${innerKey}`;
			const prefixedImportKeys = node.importKeys.map(
				(k) => `${projectName}/${k}`
			);
			const mergedNode: ModuleNode = {
				...node,
				key: prefixedKey,
				importKeys: prefixedImportKeys,
			};
			modules.set(prefixedKey, mergedNode);
			const bucket = byName.get(node.name);
			if (bucket) {
				bucket.push(mergedNode);
			} else {
				byName.set(node.name, [mergedNode]);
			}
		}

		for (const [innerFromKey, targets] of graph.edges) {
			const prefixedFrom = `${projectName}/${innerFromKey}`;
			const prefixedTargets = new Set<string>();
			for (const target of targets) {
				prefixedTargets.add(`${projectName}/${target}`);
			}
			edges.set(prefixedFrom, prefixedTargets);
		}

		for (const [provider, node] of graph.providerToModule) {
			const prefixedKey = `${projectName}/${node.key}`;
			const existingNode = modules.get(prefixedKey);
			if (existingNode) {
				providerToModule.set(`${projectName}/${provider}`, existingNode);
			}
		}
	}

	return { modules, byName, edges, providerToModule };
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
			if (depModule && depModule.key === toModule.key) {
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
					if (depModule && depModule.key === toModule.key) {
						edges.push({ consumer: controllerName, dependency: simpleName });
					}
				}
			}
		}
	}

	return edges;
}
