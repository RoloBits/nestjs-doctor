import type {
	CallExpression,
	ClassDeclaration,
	Node,
	ObjectLiteralExpression,
	Project,
	SourceFile,
} from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { YIELD_INTERVAL, yieldToEventLoop } from "../yield.js";
import { invalidateEntryModules } from "./entry-points.js";
import type { PathAliasMap } from "./tsconfig-paths.js";
import { resolvePathAlias } from "./tsconfig-paths.js";
import type { ProviderInfo } from "./type-resolver.js";

const NATIVE_SEPARATOR_RE = /\\/g;
const TRAILING_SEGMENT_RE = /\/[^/]*$/;

const toPosix = (path: string): string =>
	path.replace(NATIVE_SEPARATOR_RE, "/");

/** The directory part of a posix path, without consulting the platform. */
export const posixDirname = (path: string): string => {
	const trimmed = toPosix(path);
	const cut = trimmed.replace(TRAILING_SEGMENT_RE, "");
	return cut === "" && trimmed.startsWith("/") ? "/" : cut;
};

/**
 * Resolves a relative import using posix rules only, keeping the base's own
 * prefix so a posix root, a Windows drive root, and an in-memory `/` all work.
 */
export function resolvePosix(fromDirectory: string, specifier: string): string {
	const base = toPosix(fromDirectory);
	const segments = `${base}/${toPosix(specifier)}`.split("/");
	const resolved: string[] = [];

	for (const segment of segments) {
		if (segment === "" || segment === ".") {
			// A leading empty segment is the posix root and has to survive.
			if (resolved.length === 0 && segment === "") {
				resolved.push("");
			}
			continue;
		}
		if (segment === "..") {
			// Never pop the root marker or a `D:` drive prefix.
			if (
				resolved.length > 1 ||
				(resolved.length === 1 && resolved[0] !== "")
			) {
				resolved.pop();
			}
			continue;
		}
		resolved.push(segment);
	}

	return resolved.length === 1 && resolved[0] === "" ? "/" : resolved.join("/");
}

const JS_EXT_REGEX = /\.js$/;

export interface ModuleNode {
	/** Absent once the graph is detached. */
	classDeclaration?: ClassDeclaration;
	controllers: string[];
	/** Import name → the dynamic method it was imported with, e.g. `forRoot`. */
	dynamicImports?: Record<string, string>;
	exports: string[];
	filePath: string;
	/** Every declaration file, when same-name variants were unioned. */
	filePaths?: string[];
	forwardRefImports: Set<string>;
	imports: string[];
	isGlobal: boolean;
	/** Line of the class declaration. Absent when the graph was built without one. */
	line?: number;
	name: string;
	/** Import name → its bare package specifier, when not workspace code. */
	packageImports?: Record<string, string>;
	/** Sub-project this module belongs to. Set by `mergeModuleGraphs`. */
	project?: string;
	providers: string[];
	/** `provide` tokens of object-literal providers, which `providers` keeps as raw text. */
	providerTokens: string[];
}

export interface ModuleGraph {
	edges: Map<string, Set<string>>;
	modules: Map<string, ModuleNode>;
	providerToModule: Map<string, ModuleNode>;
}

/** Local names bound by bare-package import specifiers, mapped to the specifier. */
function collectPackageImportNames(
	sourceFile: ReturnType<Project["getSourceFile"]> & object,
	pathAliases: PathAliasMap
): Map<string, string> {
	const names = new Map<string, string>();
	for (const imp of sourceFile.getImportDeclarations()) {
		// Throws on a non-literal specifier (schematics template files).
		let spec: string;
		try {
			spec = imp.getModuleSpecifierValue();
		} catch {
			continue;
		}
		if (spec.startsWith(".")) {
			continue;
		}
		if (resolvePathAlias(spec, pathAliases) !== undefined) {
			continue;
		}
		for (const named of imp.getNamedImports()) {
			names.set(named.getAliasNode()?.getText() ?? named.getName(), spec);
		}
		const defaultImport = imp.getDefaultImport();
		if (defaultImport) {
			names.set(defaultImport.getText(), spec);
		}
	}
	return names;
}

function extractModulesFromFile(
	sourceFile: ReturnType<Project["getSourceFile"]> & object,
	filePath: string,
	pathAliases: PathAliasMap
): ModuleNode[] {
	const modules: ModuleNode[] = [];
	const packageNames = collectPackageImportNames(sourceFile, pathAliases);
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
			forwardRefImports: new Set<string>(),
			exports: [],
			providers: [],
			providerTokens: [],
			controllers: [],
			isGlobal: cls.getDecorator("Global") !== undefined,
			line: cls.getStartLineNumber(),
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
					if (t.dynamicMethod) {
						node.dynamicImports ??= {};
						node.dynamicImports[t.name] = t.dynamicMethod;
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
				node.providerTokens = extractProviderTokens(obj);
				node.controllers = extractArrayPropertyNames(
					obj,
					"controllers",
					pathAliases
				).map((t) => t.name);
			}
		}

		const pkgImports = node.imports.filter((imp) => packageNames.has(imp));
		if (pkgImports.length > 0) {
			node.packageImports = {};
			for (const imp of pkgImports) {
				node.packageImports[imp] = packageNames.get(imp) as string;
			}
		}

		modules.push(node);
	}
	return modules;
}

/** Unions the metadata of two same-name @Module declarations. */
function mergeSameNameModules(a: ModuleNode, b: ModuleNode): ModuleNode {
	const union = (x: string[], y: string[]) => [...new Set([...x, ...y])];
	const merged: ModuleNode = {
		...a,
		imports: union(a.imports, b.imports),
		exports: union(a.exports, b.exports),
		providers: union(a.providers, b.providers),
		providerTokens: union(a.providerTokens, b.providerTokens),
		controllers: union(a.controllers, b.controllers),
		forwardRefImports: new Set([
			...a.forwardRefImports,
			...b.forwardRefImports,
		]),
		isGlobal: a.isGlobal || b.isGlobal,
		filePaths: [...new Set([...(a.filePaths ?? [a.filePath]), b.filePath])],
	};
	if (a.dynamicImports || b.dynamicImports) {
		merged.dynamicImports = { ...a.dynamicImports, ...b.dynamicImports };
	}
	if (a.packageImports || b.packageImports) {
		merged.packageImports = { ...a.packageImports, ...b.packageImports };
	}
	return merged;
}

function moduleDir(filePath: string): string {
	return filePath.slice(0, filePath.lastIndexOf("/") + 1);
}

/**
 * Same-name declarations in one directory union their metadata; elsewhere
 * the latest declaration wins.
 */
function addModuleNode(
	modules: Map<string, ModuleNode>,
	node: ModuleNode
): void {
	const existing = modules.get(node.name);
	if (existing && moduleDir(existing.filePath) === moduleDir(node.filePath)) {
		modules.set(node.name, mergeSameNameModules(existing, node));
		return;
	}
	modules.set(node.name, node);
}

function collectModuleNodes(
	project: Project,
	files: string[],
	pathAliases: PathAliasMap = new Map()
): Map<string, ModuleNode> {
	const modules = new Map<string, ModuleNode>();
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
			addModuleNode(modules, node);
		}
	}
	return modules;
}

function finishModuleGraph(modules: Map<string, ModuleNode>): ModuleGraph {
	// Build edges from import relationships
	const edges = new Map<string, Set<string>>();
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

export function buildModuleGraph(
	project: Project,
	files: string[],
	pathAliases: PathAliasMap = new Map()
): ModuleGraph {
	return finishModuleGraph(collectModuleNodes(project, files, pathAliases));
}

/** Batched variant of buildModuleGraph; yields between files. */
export async function buildModuleGraphAsync(
	project: Project,
	files: string[],
	pathAliases: PathAliasMap = new Map()
): Promise<ModuleGraph> {
	const modules = new Map<string, ModuleNode>();
	for (let index = 0; index < files.length; index++) {
		const sourceFile = project.getSourceFile(files[index]);
		if (sourceFile) {
			for (const node of extractModulesFromFile(
				sourceFile,
				files[index],
				pathAliases
			)) {
				addModuleNode(modules, node);
			}
		}
		if ((index + 1) % YIELD_INTERVAL === 0) {
			await yieldToEventLoop();
		}
	}
	return finishModuleGraph(modules);
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
	/** The dynamic module method the name was extracted from, e.g. `forRoot`. */
	dynamicMethod?: string;
	name: string;
	viaForwardRef: boolean;
}

function plain(name: string): ExtractedName {
	return { name, viaForwardRef: false };
}

/** The initializer of `obj.propertyName`, if it is a plain assignment. */
function propertyInitializer(
	obj: ObjectLiteralExpression,
	propertyName: string
): Node | undefined {
	return obj
		.getProperty(propertyName)
		?.asKind(SyntaxKind.PropertyAssignment)
		?.getInitializer();
}

/** `provide` tokens of the object-literal entries in a module's `providers`. */
function extractProviderTokens(obj: ObjectLiteralExpression): string[] {
	const initializer = propertyInitializer(obj, "providers")?.asKind(
		SyntaxKind.ArrayLiteralExpression
	);
	if (!initializer) {
		return [];
	}

	const tokens: string[] = [];
	for (const element of initializer.getElements()) {
		const literal = element.asKind(SyntaxKind.ObjectLiteralExpression);
		const token = literal && propertyInitializer(literal, "provide")?.getText();
		if (token) {
			tokens.push(token.split(".").pop() as string);
		}
	}
	return tokens;
}

function extractArrayPropertyNames(
	obj: ObjectLiteralExpression,
	propertyName: string,
	pathAliases: PathAliasMap
): ExtractedName[] {
	const initializer = propertyInitializer(obj, propertyName);
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

	// Plain identifier: it may be a variable holding a dynamic-module call,
	// e.g. const cfg = ConfigModule.forFeature(X); imports: [cfg]
	if (kind === SyntaxKind.Identifier) {
		const resolved = resolveIdentifier(
			el.getText(),
			sourceFile,
			depth + 1,
			pathAliases
		);
		return resolved.length > 0 ? resolved : [plain(el.getText())];
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
			return [
				{
					name: access.getExpression().getText(),
					viaForwardRef: false,
					dynamicMethod: methodName,
				},
			];
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
		const aliasPath = toPosix(aliasResolved);
		const candidates = [
			`${aliasPath}.ts`,
			`${aliasPath}/index.ts`,
			aliasPath,
			aliasPath.replace(JS_EXT_REGEX, ".ts"),
		];
		for (const candidate of candidates) {
			const target = project.getSourceFile(candidate);
			if (target) {
				return target;
			}
		}
		return undefined;
	}

	const dir = posixDirname(sourceFile.getFilePath());
	const resolved = resolvePosix(dir, specifier);
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
	invalidateEntryModules(graph);
	// 1. Remove stale modules declared in this file, tracking sibling files of
	// any same-name union so their halves can be re-added below.
	const siblingFiles = new Set<string>();
	for (const [name, node] of graph.modules) {
		const declarationFiles = node.filePaths ?? [node.filePath];
		if (declarationFiles.includes(filePath)) {
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
			for (const sibling of declarationFiles) {
				if (sibling !== filePath) {
					siblingFiles.add(sibling);
				}
			}
		}
	}

	// 2. Re-scan the changed file plus union siblings, with the same
	// collision handling the full build uses.
	const newModules: ModuleNode[] = [];
	const added = new Map<string, ModuleNode>();
	for (const scanPath of [filePath, ...siblingFiles]) {
		const sourceFile = project.getSourceFile(scanPath);
		if (!sourceFile) {
			continue;
		}
		for (const node of extractModulesFromFile(
			sourceFile,
			scanPath,
			pathAliases
		)) {
			addModuleNode(added, node);
		}
	}
	for (const [name, node] of added) {
		// A surviving same-name module from another directory keeps its slot.
		if (graph.modules.has(name)) {
			continue;
		}
		graph.modules.set(name, node);
		newModules.push(node);
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

	const projectNames = [...graphs.keys()];
	// Bare module name → every prefixed name it could stand for.
	const byBareName = new Map<string, string[]>();
	for (const [projectName, graph] of graphs) {
		for (const name of graph.modules.keys()) {
			const candidates = byBareName.get(name) ?? [];
			candidates.push(`${projectName}/${name}`);
			byBareName.set(name, candidates);
		}
	}

	/**
	 * The prefixed name a reference stands for: its own sub-project first, then a
	 * single match elsewhere. An ambiguous or unknown name is left bare.
	 */
	const resolve = (
		graph: ModuleGraph,
		projectName: string,
		name: string,
		importer?: ModuleNode
	): string => {
		if (graph.modules.has(name)) {
			return `${projectName}/${name}`;
		}
		// A package-imported name binds only when its specifier (or a subpath
		// of it) is a scanned workspace project declaring the module.
		const spec =
			importer?.packageImports && Object.hasOwn(importer.packageImports, name)
				? importer.packageImports[name]
				: undefined;
		if (spec !== undefined) {
			const rootKey = graphs.has(spec)
				? spec
				: projectNames.find((k) => spec.startsWith(`${k}/`));
			return rootKey !== undefined && graphs.get(rootKey)?.modules.has(name)
				? `${rootKey}/${name}`
				: name;
		}
		const candidates = byBareName.get(name);
		return candidates?.length === 1 ? candidates[0] : name;
	};

	for (const [projectName, graph] of graphs) {
		for (const [name, node] of graph.modules) {
			const prefixed = `${projectName}/${name}`;
			const prefixedForwardRef = new Set<string>();
			for (const ref of node.forwardRefImports) {
				prefixedForwardRef.add(resolve(graph, projectName, ref, node));
			}
			let dynamicImports: Record<string, string> | undefined;
			if (node.dynamicImports) {
				dynamicImports = {};
				for (const [imp, method] of Object.entries(node.dynamicImports)) {
					dynamicImports[resolve(graph, projectName, imp, node)] = method;
				}
			}
			const mergedNode: ModuleNode = {
				...node,
				name: prefixed,
				project: projectName,
				imports: node.imports.map((imp) =>
					resolve(graph, projectName, imp, node)
				),
				forwardRefImports: prefixedForwardRef,
				exports: node.exports.map((exp) =>
					resolve(graph, projectName, exp, node)
				),
				...(dynamicImports ? { dynamicImports } : {}),
			};
			modules.set(prefixed, mergedNode);
		}

		for (const [provider, node] of graph.providerToModule) {
			const prefixedModuleName = `${projectName}/${node.name}`;
			const existingNode = modules.get(prefixedModuleName);
			if (existingNode) {
				providerToModule.set(`${projectName}/${provider}`, existingNode);
			}
		}
	}

	// Edges last, so an import pointing at another sub-project resolves.
	for (const [name, node] of modules) {
		const targets = new Set<string>();
		for (const imp of node.imports) {
			if (modules.has(imp)) {
				targets.add(imp);
			}
		}
		edges.set(name, targets);
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

/** A standalone copy of the graph, holding no ts-morph nodes and no shared state. */
export function detachModuleGraph(graph: ModuleGraph): ModuleGraph {
	const modules = new Map<string, ModuleNode>();
	// Keyed by the original node, so the rebuild below survives any change to
	// what `modules` is keyed by.
	const detachedByOriginal = new Map<ModuleNode, ModuleNode>();
	for (const [key, node] of graph.modules) {
		const detached: ModuleNode = { ...node, classDeclaration: undefined };
		modules.set(key, detached);
		detachedByOriginal.set(node, detached);
	}

	const providerToModule = new Map<string, ModuleNode>();
	for (const [provider, node] of graph.providerToModule) {
		providerToModule.set(provider, detachedByOriginal.get(node) ?? node);
	}

	const edges = new Map<string, Set<string>>();
	for (const [name, targets] of graph.edges) {
		edges.set(name, new Set(targets));
	}

	return { modules, edges, providerToModule };
}
