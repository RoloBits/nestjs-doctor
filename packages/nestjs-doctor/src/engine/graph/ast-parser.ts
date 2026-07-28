import { Project } from "ts-morph";
import type { PathAliasMap } from "./tsconfig-paths.js";

export function createAstParser(
	files: string[],
	pathAliases?: PathAliasMap
): Project {
	const paths =
		pathAliases && pathAliases.size > 0
			? Object.fromEntries(pathAliases)
			: undefined;

	const project = new Project({
		compilerOptions: {
			strict: true,
			target: 99, // ESNext
			module: 99, // ESNext
			skipFileDependencyResolution: true,
			...(paths ? { paths } : {}),
		},
		skipAddingFilesFromTsConfig: true,
	});

	for (const file of files) {
		project.addSourceFileAtPath(file);
	}

	return project;
}
