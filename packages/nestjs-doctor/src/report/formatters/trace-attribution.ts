import { bareModuleName } from "../../common/artifact.js";
import type { LoadedBootTrace } from "../timings.js";

const only = (set: Set<string | undefined> | undefined) =>
	set && set.size === 1 ? [...set][0] : undefined;

/** Decides each dump's project: its label, its root module, or the modules only one project owns. */
export function attributeTraces(
	traces: LoadedBootTrace[],
	modules: Iterable<{ name: string; project?: string }>,
	projects: string[] | undefined,
	bootstrapRoots: string[] | undefined
): {
	projects: (string | undefined)[];
	rootedProjects: Set<string>;
} {
	const rootSet = new Set(bootstrapRoots ?? []);
	const projectsByBare = new Map<string, Set<string | undefined>>();
	const rootProjectsByBare = new Map<string, Set<string | undefined>>();
	const rootedProjects = new Set<string>();
	for (const node of modules) {
		const bare = bareModuleName(node);
		const owners = projectsByBare.get(bare) ?? new Set();
		owners.add(node.project);
		projectsByBare.set(bare, owners);
		if (rootSet.has(node.name)) {
			const rootOwners = rootProjectsByBare.get(bare) ?? new Set();
			rootOwners.add(node.project);
			rootProjectsByBare.set(bare, rootOwners);
			if (node.project) {
				rootedProjects.add(node.project);
			}
		}
	}
	const attributeProject = (t: LoadedBootTrace): string | undefined => {
		if (!projects?.length) {
			return undefined;
		}
		if (t.label && projects.includes(t.label)) {
			return t.label;
		}
		if (t.timings.rootModule) {
			const owner = only(rootProjectsByBare.get(t.timings.rootModule));
			if (owner) {
				return owner;
			}
		}
		const votes = new Map<string, number>();
		for (const bare of t.timings.byModule.keys()) {
			const owner = only(projectsByBare.get(bare));
			if (owner) {
				votes.set(owner, (votes.get(owner) ?? 0) + 1);
			}
		}
		const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
		if (
			ranked.length > 0 &&
			(ranked.length === 1 || (ranked[0]?.[1] ?? 0) > (ranked[1]?.[1] ?? 0))
		) {
			return ranked[0]?.[0];
		}
		return undefined;
	};
	return { projects: traces.map(attributeProject), rootedProjects };
}
