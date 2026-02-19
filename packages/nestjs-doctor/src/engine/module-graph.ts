import type {
	ClassDeclaration,
	ObjectLiteralExpression,
	Project,
} from "ts-morph";
import { SyntaxKind } from "ts-morph";

const FORWARD_REF_REGEX = /=>\s*(\w+)/;

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

export function buildModuleGraph(
	project: Project,
	files: string[]
): ModuleGraph {
	const modules = new Map<string, ModuleNode>();
	const edges = new Map<string, Set<string>>();

	// First pass: collect all @Module() classes
	for (const filePath of files) {
		const sourceFile = project.getSourceFile(filePath);
		if (!sourceFile) {
			continue;
		}

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
					node.imports = extractArrayPropertyNames(obj, "imports");
					node.exports = extractArrayPropertyNames(obj, "exports");
					node.providers = extractArrayPropertyNames(obj, "providers");
					node.controllers = extractArrayPropertyNames(obj, "controllers");
				}
			}

			modules.set(name, node);
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

function extractArrayPropertyNames(
	obj: ObjectLiteralExpression,
	propertyName: string
): string[] {
	const prop = obj.getProperty(propertyName);
	if (!prop) {
		return [];
	}

	const initializer = prop.getChildrenOfKind(
		SyntaxKind.ArrayLiteralExpression
	)[0];
	if (!initializer) {
		return [];
	}

	return initializer.getElements().map((el) => {
		const text = el.getText();
		// Handle forwardRef(() => SomeModule)
		if (text.startsWith("forwardRef")) {
			const match = text.match(FORWARD_REF_REGEX);
			return match ? match[1] : text;
		}
		// Handle spread operator
		if (text.startsWith("...")) {
			return text.slice(3).trim();
		}
		return text;
	});
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

export function getModuleByClassName(
	graph: ModuleGraph,
	className: string
): ModuleNode | undefined {
	return graph.modules.get(className);
}

export function findProviderModule(
	graph: ModuleGraph,
	providerName: string
): ModuleNode | undefined {
	return graph.providerToModule.get(providerName);
}
