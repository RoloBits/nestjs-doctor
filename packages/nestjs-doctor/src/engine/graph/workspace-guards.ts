import { join } from "node:path";
import type { Project } from "ts-morph";
import { createAstParser } from "./ast-parser.js";
import { collectEntryModules } from "./entry-points.js";
import {
	buildModuleGraphAsync,
	detachModuleGraph,
	type ModuleGraph,
	mergeModuleGraphs,
} from "./module-graph.js";
import { loadTsconfigResolution } from "./tsconfig-paths.js";

/** Only unambiguous, locally declared controllers can receive cross-project facts. */
function localControllers(project: Project, files: string[]): Set<string> {
	const declarations = new Map<string, number>();
	for (const file of files) {
		for (const cls of project.getSourceFile(file)?.getClasses() ?? []) {
			const name = cls.getName();
			if (name && cls.getDecorator("Controller")) {
				declarations.set(name, (declarations.get(name) ?? 0) + 1);
			}
		}
	}
	return new Set(
		[...declarations].filter(([, count]) => count === 1).map(([name]) => name)
	);
}

function reachable(
	graph: ModuleGraph,
	root: string,
	mandatory = false
): Set<string> {
	const visited = new Set<string>();
	const pending = [root];
	for (const name of pending) {
		if (visited.has(name)) {
			continue;
		}
		visited.add(name);
		const required = graph.modules.get(name)?.requiredImports ?? [];
		pending.push(
			...[...(graph.edges.get(name) ?? [])].filter(
				(target) => !mandatory || required.includes(target)
			)
		);
	}
	return visited;
}

/** Bare-name guesses across packages cannot establish security facts. */
function restrictWorkspaceEdges(
	graphs: Map<string, ModuleGraph>,
	merged: ModuleGraph
): void {
	for (const [project, graph] of graphs) {
		for (const [name, node] of graph.modules) {
			const key = `${project}/${name}`;
			const targets = merged.modules.get(key)?.imports ?? [];
			const proven = new Set<string>();
			node.imports.forEach((reference, index) => {
				const target = merged.modules.get(targets[index]);
				if (!target?.project) {
					return;
				}
				const specifier = node.packageImports?.[reference];
				const matches =
					specifier === undefined
						? target.project === project ||
							Object.values(node.importsByFile ?? {}).some(
								(entry) => entry.targets[reference] === target.filePath
							)
						: specifier === target.project ||
							specifier.startsWith(`${target.project}/`);
				if (matches) {
					proven.add(target.name);
				}
			});
			merged.edges.set(key, proven);
		}
	}
}

/** A controller shared with any known unguarded application remains reportable. */
function guardedModules(
	graph: ModuleGraph,
	roots: Set<string>
): Map<string, boolean> {
	const protectedByEveryRoot = new Map<string, boolean>();
	for (const root of roots) {
		const modules = reachable(graph, root);
		const guarded = [...reachable(graph, root, true)].some(
			(name) => graph.modules.get(name)?.staticGlobalGuard === true
		);
		for (const name of modules) {
			protectedByEveryRoot.set(
				name,
				guarded && protectedByEveryRoot.get(name) !== false
			);
		}
	}
	return protectedByEveryRoot;
}

/** Collects small detached graphs first, without retaining every project's AST. */
export async function workspaceGuardedControllers(
	targetPath: string,
	projects: Map<string, string>,
	filesByProject: Map<string, string[]>
): Promise<Map<string, Set<string>>> {
	const graphs = new Map<string, ModuleGraph>();
	const roots = new Set<string>();
	const controllers = new Map<string, Set<string>>();
	for (const [name, files] of filesByProject) {
		if (files.length === 0) {
			continue;
		}
		const directory = projects.get(name);
		if (directory === undefined) {
			continue;
		}
		const { aliases, baseUrl } = loadTsconfigResolution(
			join(targetPath, directory)
		);
		const project = await createAstParser(files, aliases, baseUrl);
		const graph = await buildModuleGraphAsync(project, files, aliases);
		for (const entry of collectEntryModules(project, files, graph)) {
			roots.add(`${name}/${entry}`);
		}
		controllers.set(name, localControllers(project, files));
		graphs.set(name, detachModuleGraph(graph));
	}
	const merged = mergeModuleGraphs(graphs);
	restrictWorkspaceEdges(graphs, merged);
	// The graph unions same-name declarations inside a project. That ambiguity
	// cannot establish protection, even if one declaration contains a guard.
	if (
		[...merged.modules.values()].some(
			(node) => (node.filePaths?.length ?? 1) > 1
		)
	) {
		return new Map();
	}
	const guarded = guardedModules(merged, roots);
	const owners = new Map<string, string[]>();
	for (const [name, module] of merged.modules) {
		for (const controller of module.controllers) {
			const key = `${module.project}/${controller}`;
			const modules = owners.get(key) ?? [];
			modules.push(name);
			owners.set(key, modules);
		}
	}
	const result = new Map<string, Set<string>>();
	for (const [project, names] of controllers) {
		result.set(
			project,
			new Set(
				[...names].filter((name) => {
					const modules = owners.get(`${project}/${name}`);
					return (
						modules?.every((owner) => guarded.get(owner) === true) === true
					);
				})
			)
		);
	}
	return result;
}
