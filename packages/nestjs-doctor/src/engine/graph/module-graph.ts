import type {
	CallExpression,
	ClassDeclaration,
	ObjectLiteralExpression,
	Project,
	SourceFile,
} from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { baseClassName } from "../nest-class-inspector.js";
import { YIELD_INTERVAL, yieldToEventLoop } from "../yield.js";
import {
	asyncOptionsCallee,
	isTestFile,
	unwrapped,
} from "./custom-providers.js";
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

/** The imports of a single `@Module()` declaration. */
interface ModuleImports {
	names: string[];
	/** Import name → the file its import statement resolves to. */
	targets: Record<string, string>;
}

/** What one `DynamicModule` literal registers on its module. */
interface DynamicMetadata {
	controllers: string[];
	exports: string[];
	isGlobal: boolean;
	providers: string[];
	providerTokens: string[];
}

export interface ModuleNode {
	/** Name of the class this module extends, e.g. `ConfigurableModuleClass`. */
	baseClass?: string;
	/** Absent once the graph is detached. */
	classDeclaration?: ClassDeclaration;
	controllers: string[];
	/** File → what its `DynamicModule` literals added to this module. */
	dynamicByFile?: Record<string, DynamicMetadata>;
	/** Import name → the dynamic method it was imported with, e.g. `forRoot`. */
	dynamicImports?: Record<string, string>;
	exports: string[];
	filePath: string;
	/** Every declaration file, when same-name variants were unioned. */
	filePaths?: string[];
	forwardRefImports: Set<string>;
	imports: string[];
	/** Declaration file → the imports declared in that file. */
	importsByFile?: Record<string, ModuleImports>;
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

		const base = baseClassName(cls);
		const node: ModuleNode = {
			name,
			filePath,
			classDeclaration: cls,
			...(base ? { baseClass: base } : {}),
			imports: [],
			forwardRefImports: new Set<string>(),
			exports: [],
			providers: [],
			providerTokens: [],
			controllers: [],
			isGlobal: cls.getDecorator("Global") !== undefined,
			line: cls.getStartLineNumber(),
		};

		// `@Module(meta)` with `const meta = {...}` at the top of the same file.
		const obj =
			args?.asKind(SyntaxKind.ObjectLiteralExpression) ??
			(Node.isIdentifier(args)
				? sourceFile
						.getVariableDeclaration(args.getText())
						?.getInitializer()
						?.asKind(SyntaxKind.ObjectLiteralExpression)
				: undefined);
		if (obj) {
			const importTags = extractArrayPropertyNames(obj, "imports", pathAliases);
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
			Object.assign(node, unionMetadata(node, readMetadata(obj, pathAliases)));
		}

		const targets: Record<string, string> = {};
		for (const imp of node.imports) {
			const resolved = resolveImportedSourceFile(imp, sourceFile, pathAliases);
			if (resolved) {
				targets[imp] = resolved.sourceFile.getFilePath();
			}
		}
		node.importsByFile = { [filePath]: { names: node.imports, targets } };

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

/** The per-file imports of a node, falling back to its single declaration. */
function declaredImports(node: ModuleNode): Record<string, ModuleImports> {
	return (
		node.importsByFile ?? {
			[node.filePath]: { names: node.imports, targets: {} },
		}
	);
}

const union = (x: string[], y: string[]) => [...new Set([...x, ...y])];

function unionMetadata(
	a: DynamicMetadata,
	b: DynamicMetadata
): DynamicMetadata {
	return {
		controllers: union(a.controllers, b.controllers),
		exports: union(a.exports, b.exports),
		isGlobal: a.isGlobal || b.isGlobal,
		providerTokens: union(a.providerTokens, b.providerTokens),
		providers: union(a.providers, b.providers),
	};
}

/** Unions the metadata of two same-name @Module declarations. */
function mergeSameNameModules(a: ModuleNode, b: ModuleNode): ModuleNode {
	const merged: ModuleNode = {
		...a,
		...unionMetadata(a, b),
		imports: union(a.imports, b.imports),
		forwardRefImports: new Set([
			...a.forwardRefImports,
			...b.forwardRefImports,
		]),
		filePaths: [...new Set([...(a.filePaths ?? [a.filePath]), b.filePath])],
		importsByFile: { ...declaredImports(a), ...declaredImports(b) },
	};
	if (a.dynamicByFile || b.dynamicByFile) {
		merged.dynamicByFile = { ...a.dynamicByFile };
		for (const [file, meta] of Object.entries(b.dynamicByFile ?? {})) {
			absorb(merged, meta, file);
		}
	}
	if (a.dynamicImports || b.dynamicImports) {
		merged.dynamicImports = { ...a.dynamicImports, ...b.dynamicImports };
	}
	if (a.packageImports || b.packageImports) {
		merged.packageImports = { ...a.packageImports, ...b.packageImports };
	}
	return merged;
}

/** Same-name declarations union their metadata, wherever they are declared. */
function addModuleNode(
	modules: Map<string, ModuleNode>,
	node: ModuleNode
): void {
	const existing = modules.get(node.name);
	modules.set(
		node.name,
		existing ? mergeSameNameModules(existing, node) : node
	);
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

	const providerToModule = new Map<string, ModuleNode>();
	indexProviders(modules, providerToModule);

	return { modules, edges, providerToModule };
}

/** Rebuilds the provider name → module index in place. */
function indexProviders(
	modules: Map<string, ModuleNode>,
	providerToModule: Map<string, ModuleNode>
): void {
	providerToModule.clear();
	for (const mod of modules.values()) {
		for (const provider of mod.providers) {
			providerToModule.set(provider, mod);
		}
	}
}

export function buildModuleGraph(
	project: Project,
	files: string[],
	pathAliases: PathAliasMap = new Map()
): ModuleGraph {
	const modules = collectModuleNodes(project, files, pathAliases);
	for (const filePath of files) {
		applyDynamicMetadataForFile(modules, project, filePath, pathAliases);
	}
	return finishModuleGraph(modules);
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
	for (let index = 0; index < files.length; index++) {
		applyDynamicMetadataForFile(modules, project, files[index], pathAliases);
		if ((index + 1) % YIELD_INTERVAL === 0) {
			await yieldToEventLoop();
		}
	}
	return finishModuleGraph(modules);
}

const DYNAMIC_TYPE_RE = /DynamicModule|ModuleMetadata/;

const simpleName = (text: string): string =>
	text.split("<")[0].split(".").pop() as string;

/** Module metadata Nest can load: a `module` key, a returned or assigned `DynamicModule` or `ModuleMetadata`, or a `setExtras` body. */
function isModuleMetadataLiteral(obj: ObjectLiteralExpression): boolean {
	if (obj.getProperty("module")) {
		return true;
	}
	if (
		obj.getProperty("provide") ||
		obj.getFirstAncestorByKind(SyntaxKind.ObjectLiteralExpression)
	) {
		return false;
	}
	const fn = obj.getFirstAncestor(Node.isFunctionLikeDeclaration);
	if (
		fn &&
		DYNAMIC_TYPE_RE.test(fn.getReturnTypeNode()?.getText() ?? "") &&
		isReturned(obj, fn)
	) {
		return true;
	}
	const parent = obj.getParent();
	const typeNode =
		Node.isVariableDeclaration(parent) ||
		Node.isPropertyDeclaration(parent) ||
		Node.isAsExpression(parent) ||
		Node.isSatisfiesExpression(parent)
			? parent.getTypeNode()
			: undefined;
	if (DYNAMIC_TYPE_RE.test(typeNode?.getText() ?? "")) {
		return true;
	}
	return (
		obj.getFirstAncestor(
			(node) =>
				Node.isCallExpression(node) &&
				node
					.getExpression()
					.asKind(SyntaxKind.PropertyAccessExpression)
					?.getName() === "setExtras"
		) !== undefined
	);
}

/** Whether `fn` returns `obj`: directly, or through a variable a `return` names. */
function isReturned(obj: ObjectLiteralExpression, fn: Node): boolean {
	const parent = unwrapped(obj).getParent();
	if (parent === fn || Node.isReturnStatement(parent)) {
		return true;
	}
	if (!Node.isVariableDeclaration(parent)) {
		return false;
	}
	return fn
		.getDescendantsOfKind(SyntaxKind.ReturnStatement)
		.some(
			(statement) =>
				statement.getFirstAncestor(Node.isFunctionLikeDeclaration) === fn &&
				statement.getExpression()?.getText() === parent.getName()
		);
}

interface DynamicContribution {
	/** Names a module class may extend to receive this, e.g. `ConfigurableModuleClass`. */
	extending?: string[];
	meta: DynamicMetadata;
	/** The module the literal names, or the class enclosing it. */
	module?: string;
}

function dynamicOwner(
	obj: ObjectLiteralExpression
): Omit<DynamicContribution, "meta"> | undefined {
	const enclosingClass = obj
		.getFirstAncestorByKind(SyntaxKind.ClassDeclaration)
		?.getName();
	const moduleValue = propertyInitializer(obj, "module");
	if (moduleValue) {
		const name =
			moduleValue.getKind() === SyntaxKind.ThisKeyword
				? enclosingClass
				: simpleName(moduleValue.getText());
		return name ? { module: name } : undefined;
	}
	if (enclosingClass) {
		return { module: enclosingClass };
	}
	const binding = obj
		.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)
		?.getNameNode();
	if (binding && Node.isObjectBindingPattern(binding)) {
		return { extending: binding.getElements().map((e) => e.getName()) };
	}
	return undefined;
}

function readMetadata(
	obj: ObjectLiteralExpression,
	pathAliases: PathAliasMap
): DynamicMetadata {
	const names = (key: string) =>
		extractArrayPropertyNames(obj, key, pathAliases).map((t) => t.name);
	return {
		controllers: names("controllers"),
		exports: names("exports"),
		isGlobal:
			propertyInitializer(obj, "global")?.getKind() === SyntaxKind.TrueKeyword,
		providerTokens: extractProviderTokens(obj),
		providers: names("providers"),
	};
}

function extractDynamicMetadata(
	sourceFile: SourceFile,
	pathAliases: PathAliasMap
): DynamicContribution[] {
	const contributions: DynamicContribution[] = [];
	for (const obj of sourceFile.getDescendantsOfKind(
		SyntaxKind.ObjectLiteralExpression
	)) {
		const options = asyncOptionsContribution(obj, pathAliases);
		if (options) {
			contributions.push(options);
		}
		if (!isModuleMetadataLiteral(obj)) {
			continue;
		}
		const owner = dynamicOwner(obj);
		if (!owner) {
			continue;
		}
		const meta = readMetadata(obj, pathAliases);
		if (
			meta.isGlobal ||
			meta.providers.length + meta.exports.length + meta.controllers.length > 0
		) {
			contributions.push({ ...owner, meta });
		}
	}
	return contributions;
}

/** `X.forRootAsync({ useClass: C, extraProviders: [D] })` registers `C` and `D` on `X`. */
function asyncOptionsContribution(
	obj: ObjectLiteralExpression,
	pathAliases: PathAliasMap
): DynamicContribution | undefined {
	const useClass = propertyInitializer(obj, "useClass");
	const providers = [
		...(useClass
			? extractNamesFromElement(useClass, obj.getSourceFile(), 0, pathAliases)
			: []),
		...extractArrayPropertyNames(obj, "extraProviders", pathAliases),
	].map((t) => t.name);
	const callee = providers.length > 0 ? asyncOptionsCallee(obj) : undefined;
	if (!callee) {
		return undefined;
	}
	const receiver = callee.getExpression();
	const module =
		receiver.getKind() === SyntaxKind.ThisKeyword
			? callee.getFirstAncestorByKind(SyntaxKind.ClassDeclaration)?.getName()
			: simpleName(receiver.getText());
	if (!module) {
		return undefined;
	}
	return {
		module,
		meta: {
			controllers: [],
			exports: [],
			isGlobal: false,
			providerTokens: [],
			providers,
		},
	};
}

function absorb(
	node: ModuleNode,
	meta: DynamicMetadata,
	filePath: string
): void {
	Object.assign(node, unionMetadata(node, meta));
	node.dynamicByFile ??= {};
	const prior = node.dynamicByFile[filePath];
	node.dynamicByFile[filePath] = prior ? unionMetadata(prior, meta) : meta;
}

/** Whether `mod` extends one of `names` as declared in `definitionFile`, directly or by import. */
function extendsBuiltClass(
	mod: ModuleNode,
	names: string[],
	definitionFile: SourceFile,
	pathAliases: PathAliasMap
): boolean {
	const cls = mod.classDeclaration;
	const base = mod.baseClass;
	if (!(cls && base && names.includes(base))) {
		return false;
	}
	let file = cls.getSourceFile();
	let local = base;
	for (let hop = 0; file !== definitionFile && hop < MAX_RESOLVE_DEPTH; hop++) {
		const next = resolveImportedSourceFile(local, file, pathAliases);
		if (!next) {
			return false;
		}
		file = next.sourceFile;
		local = next.localName;
	}
	return file === definitionFile;
}

/** Attaches the `DynamicModule` literals of one file to the modules they name. */
function applyDynamicMetadataForFile(
	modules: Map<string, ModuleNode>,
	project: Project,
	filePath: string,
	pathAliases: PathAliasMap
): void {
	const sourceFile = project.getSourceFile(filePath);
	if (!sourceFile || isTestFile(filePath)) {
		return;
	}
	for (const contribution of extractDynamicMetadata(sourceFile, pathAliases)) {
		const owners =
			contribution.module === undefined
				? [...modules.values()].filter((mod) =>
						extendsBuiltClass(
							mod,
							contribution.extending ?? [],
							sourceFile,
							pathAliases
						)
					)
				: [modules.get(contribution.module)];
		for (const owner of owners) {
			if (owner) {
				absorb(owner, contribution.meta, filePath);
			}
		}
	}
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

/** The initializer of `obj.propertyName`, or the name of a shorthand `{ providers }`. */
function propertyInitializer(
	obj: ObjectLiteralExpression,
	propertyName: string
): Node | undefined {
	const property = obj.getProperty(propertyName);
	return (
		property?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer() ??
		property?.asKind(SyntaxKind.ShorthandPropertyAssignment)?.getNameNode()
	);
}

/** The variable declaration `name` binds to in the scopes enclosing `scope`. */
function localVariable(scope: Node, name: string) {
	for (const ancestor of scope.getAncestors()) {
		if (Node.isStatemented(ancestor)) {
			const declaration = ancestor.getVariableDeclaration(name);
			if (declaration) {
				return declaration;
			}
		}
	}
}

/** `provide` tokens of the object-literal entries in a module's `providers`. */
function extractProviderTokens(obj: ObjectLiteralExpression): string[] {
	const value = propertyInitializer(obj, "providers");
	const initializer = (
		Node.isIdentifier(value)
			? localVariable(value, value.getText())?.getInitializer()
			: value
	)?.asKind(SyntaxKind.ArrayLiteralExpression);
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

	if (
		Node.isParenthesizedExpression(node) ||
		Node.isAsExpression(node) ||
		Node.isSatisfiesExpression(node) ||
		Node.isNonNullExpression(node) ||
		Node.isTypeAssertion(node)
	) {
		return extractNamesFromExpression(
			node.getExpression(),
			sourceFile,
			depth,
			pathAliases
		);
	}

	// `cond ? [A] : [B]`, `x ?? []`, `x || []`: every side may be the value.
	let sides: Node[] | undefined;
	if (Node.isConditionalExpression(node)) {
		sides = [node.getWhenTrue(), node.getWhenFalse()];
	} else if (
		Node.isBinaryExpression(node) &&
		[SyntaxKind.QuestionQuestionToken, SyntaxKind.BarBarToken].includes(
			node.getOperatorToken().getKind()
		)
	) {
		sides = [node.getLeft(), node.getRight()];
	}
	if (sides) {
		return sides.flatMap((side) =>
			extractNamesFromExpression(side, sourceFile, depth, pathAliases)
		);
	}

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
			pathAliases,
			node
		);
	}

	if (Node.isObjectLiteralExpression(node)) {
		return namedModule(node);
	}

	return [];
}

/** The module a `{ module: X, ... }` literal stands for when it sits in `imports`. */
function namedModule(obj: ObjectLiteralExpression): ExtractedName[] {
	if (!obj.getProperty("module")) {
		return [];
	}
	const owner = dynamicOwner(obj)?.module;
	return owner ? [plain(owner)] : [];
}

/** Names from every `return` of a function body. */
function returnedNames(
	fn: Node,
	sourceFile: SourceFile,
	depth: number,
	pathAliases: PathAliasMap
): ExtractedName[] {
	const names: ExtractedName[] = [];
	for (const returnStmt of fn.getDescendantsOfKind(
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
			pathAliases,
			el
		);
		return resolved.length > 0 ? resolved : [plain(el.getText())];
	}

	if (Node.isObjectLiteralExpression(el) && el.getProperty("module")) {
		return namedModule(el);
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
			const inner =
				body.getKind() === SyntaxKind.Block
					? returnedNames(body, sourceFile, depth, pathAliases)
					: extractNamesFromExpression(body, sourceFile, depth, pathAliases);
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

		// `this.createProviders(o)` / `CacheModule.createProviders(o)`: read the
		// helper's returns.
		const receiver = access.getExpression();
		const enclosingClass = call.getFirstAncestorByKind(
			SyntaxKind.ClassDeclaration
		);
		const helper =
			receiver.getKind() === SyntaxKind.ThisKeyword ||
			receiver.getText() === enclosingClass?.getName()
				? enclosingClass?.getMethod(methodName)
				: undefined;
		if (helper) {
			return returnedNames(helper, sourceFile, depth + 1, pathAliases);
		}

		// `providers.filter(Boolean)`, `impls.map(f)`: the receiver holds the
		// names; an unresolved receiver keeps its leftmost identifier.
		const receiverNames = extractNamesFromExpression(
			receiver,
			sourceFile,
			depth + 1,
			pathAliases
		);
		return receiverNames.length > 0
			? receiverNames
			: [plain(receiver.getText())];
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
	pathAliases: PathAliasMap,
	scope?: Node
): ExtractedName[] {
	if (depth > MAX_RESOLVE_DEPTH) {
		return [];
	}

	// Variable lookup, innermost enclosing scope first; the initializer plus
	// every `name.push(...)` bound to that declaration.
	const declaration = scope
		? localVariable(scope, name)
		: sourceFile.getVariableDeclaration(name);
	const init = declaration?.getInitializer();
	if (declaration && init) {
		const names = extractNamesFromExpression(
			init,
			sourceFile,
			depth,
			pathAliases
		);
		const block = declaration.getFirstAncestor(Node.isStatemented);
		for (const call of block?.getDescendantsOfKind(SyntaxKind.CallExpression) ??
			[]) {
			if (
				call.getExpression().getText() === `${name}.push` &&
				localVariable(call, name) === declaration
			) {
				for (const arg of call.getArguments()) {
					names.push(
						...extractNamesFromElement(arg, sourceFile, depth, pathAliases)
					);
				}
			}
		}
		return names;
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
			return returnedNames(body, sourceFile, depth, pathAliases);
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

		return returnedNames(funcDecl, sourceFile, depth, pathAliases);
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
	pathAliases: PathAliasMap = new Map(),
	files?: string[]
): void {
	invalidateEntryModules(graph);
	const before = new Set(graph.modules.keys());
	const extendsSomething = (node: ModuleNode) => node.baseClass !== undefined;
	let fullPass = false;
	// 1. Files to rescan: the changed file, then every declaration file of a
	// module declared in, or fed by a DynamicModule literal in, a rescanned file.
	const rescan = new Set<string>([toPosix(filePath)]);
	const declarationFiles = (node: ModuleNode) =>
		node.filePaths ?? [node.filePath];
	const touches = (node: ModuleNode) =>
		declarationFiles(node).some((file) => rescan.has(file)) ||
		Object.keys(node.dynamicByFile ?? {}).some((file) => rescan.has(file));
	for (let grew = true; grew; ) {
		grew = false;
		for (const node of graph.modules.values()) {
			if (!touches(node)) {
				continue;
			}
			for (const file of declarationFiles(node)) {
				if (!rescan.has(file)) {
					rescan.add(file);
					grew = true;
				}
			}
		}
	}

	// 2. Remove the stale modules, keeping what files outside the rescan set
	// contributed to them.
	const kept = new Map<string, Record<string, DynamicMetadata>>();
	for (const [name, node] of graph.modules) {
		if (!touches(node)) {
			continue;
		}
		graph.modules.delete(name);
		graph.edges.delete(name);
		for (const edgeSet of graph.edges.values()) {
			edgeSet.delete(name);
		}
		fullPass ||= extendsSomething(node);
		const remaining = Object.entries(node.dynamicByFile ?? {}).filter(
			([file]) => !rescan.has(file)
		);
		if (remaining.length > 0) {
			kept.set(name, Object.fromEntries(remaining));
		}
	}

	// 3. Re-extract from the rescan set with the same collision handling the
	// full build uses, re-apply the kept contributions, then the rescanned ones.
	const added = new Map<string, ModuleNode>();
	for (const scanPath of rescan) {
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
		const existing = graph.modules.get(name);
		graph.modules.set(
			name,
			existing ? mergeSameNameModules(existing, node) : node
		);
		fullPass ||= !before.has(name) || extendsSomething(node);
	}
	// Every file when a declaration is new or extends a class; otherwise the
	// kept contributions plus the rescan set.
	if (!fullPass) {
		for (const [name, contributions] of kept) {
			const node = graph.modules.get(name);
			for (const [file, meta] of Object.entries(contributions)) {
				if (node) {
					absorb(node, meta, file);
				}
			}
		}
	}
	const passFiles = fullPass
		? (files ?? project.getSourceFiles().map((file) => file.getFilePath()))
		: rescan;
	for (const scanPath of passFiles) {
		applyDynamicMetadataForFile(graph.modules, project, scanPath, pathAliases);
	}

	// 4. Rebuild every edge and the provider index.
	for (const [name, node] of graph.modules) {
		const importSet = new Set<string>();
		for (const imp of node.imports) {
			if (graph.modules.has(imp)) {
				importSet.add(imp);
			}
		}
		graph.edges.set(name, importSet);
	}
	indexProviders(graph.modules, graph.providerToModule);
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
			let prefixedImportsByFile: Record<string, ModuleImports> | undefined;
			if (node.importsByFile) {
				prefixedImportsByFile = {};
				for (const [file, declared] of Object.entries(node.importsByFile)) {
					const targets: Record<string, string> = {};
					for (const [imp, targetFile] of Object.entries(declared.targets)) {
						targets[resolve(graph, projectName, imp, node)] = targetFile;
					}
					prefixedImportsByFile[file] = {
						names: declared.names.map((imp) =>
							resolve(graph, projectName, imp, node)
						),
						targets,
					};
				}
			}
			const mergedNode: ModuleNode = {
				...node,
				dynamicByFile: undefined,
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
				...(prefixedImportsByFile
					? { importsByFile: prefixedImportsByFile }
					: {}),
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

interface ModuleDeclaration extends ModuleImports {
	filePath: string;
	name: string;
}

interface DeclarationGraph {
	declarations: ModuleDeclaration[];
	idByFileAndName: Map<string, number>;
	idsByName: Map<string, number[]>;
}

const declarationKey = (filePath: string, name: string): string =>
	`${filePath}::${name}`;

/** One node per `@Module()` declaration, so a union node splits back into its files. */
function indexDeclarations(graph: ModuleGraph): DeclarationGraph {
	const declarations: ModuleDeclaration[] = [];
	const idByFileAndName = new Map<string, number>();
	const idsByName = new Map<string, number[]>();

	for (const [name, node] of graph.modules) {
		for (const [filePath, declared] of Object.entries(declaredImports(node))) {
			const id = declarations.length;
			declarations.push({ ...declared, filePath, name });
			idByFileAndName.set(declarationKey(filePath, name), id);
			const ids = idsByName.get(name);
			if (ids) {
				ids.push(id);
			} else {
				idsByName.set(name, [id]);
			}
		}
	}

	return { declarations, idByFileAndName, idsByName };
}

/**
 * A name resolves to the declaration in the file its import statement reaches,
 * then to one in the importing file, then to every declaration carrying it.
 */
function declarationTargets(graph: DeclarationGraph, id: number): number[] {
	const { filePath, names, targets } = graph.declarations[id];
	const ids: number[] = [];
	for (const imported of names) {
		const targetFile = targets[imported];
		const resolved =
			(targetFile === undefined
				? undefined
				: graph.idByFileAndName.get(declarationKey(targetFile, imported))) ??
			graph.idByFileAndName.get(declarationKey(filePath, imported));
		if (resolved === undefined) {
			ids.push(...(graph.idsByName.get(imported) ?? []));
		} else {
			ids.push(resolved);
		}
	}
	return ids;
}

/** The rotation of a cycle that sorts first, so equivalent cycles share a key. */
function cycleKey(names: string[]): string {
	let key = names.join(">");
	for (let i = 1; i < names.length; i++) {
		const rotated = [...names.slice(i), ...names.slice(0, i)].join(">");
		if (rotated < key) {
			key = rotated;
		}
	}
	return key;
}

export function findCircularDeps(graph: ModuleGraph): string[][] {
	const declarationGraph = indexDeclarations(graph);
	const cycles: string[][] = [];
	const reported = new Set<string>();
	const visited = new Set<number>();
	const recursionStack = new Set<number>();

	function record(path: number[]): void {
		const names = path.map((id) => declarationGraph.declarations[id].name);
		const key = cycleKey(names);
		if (!reported.has(key)) {
			reported.add(key);
			cycles.push(names);
		}
	}

	function dfs(node: number, path: number[]): void {
		visited.add(node);
		recursionStack.add(node);

		for (const neighbor of declarationTargets(declarationGraph, node)) {
			if (!visited.has(neighbor)) {
				dfs(neighbor, [...path, neighbor]);
			} else if (recursionStack.has(neighbor)) {
				const cycleStart = path.indexOf(neighbor);
				record(
					cycleStart === -1 ? [...path, neighbor] : path.slice(cycleStart)
				);
			}
		}

		recursionStack.delete(node);
	}

	for (let id = 0; id < declarationGraph.declarations.length; id++) {
		if (!visited.has(id)) {
			dfs(id, [id]);
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
		const detached: ModuleNode = {
			...node,
			classDeclaration: undefined,
			dynamicByFile: node.dynamicByFile && { ...node.dynamicByFile },
		};
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
