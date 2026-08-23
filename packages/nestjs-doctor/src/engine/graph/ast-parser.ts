import { Project } from "ts-morph";
import { YIELD_INTERVAL, yieldToEventLoop } from "../yield.js";
import type { PathAliasMap } from "./tsconfig-paths.js";

export async function createAstParser(
	files: string[],
	pathAliases?: PathAliasMap,
	baseUrl?: string,
	onFileParsed?: (parsed: number, total: number) => void
): Promise<Project> {
	const project = new Project({
		compilerOptions: {
			strict: true,
			target: 99, // ESNext
			module: 99, // ESNext
			skipFileDependencyResolution: true,
			baseUrl,
			paths:
				pathAliases && pathAliases.size > 0
					? Object.fromEntries(pathAliases)
					: undefined,
		},
		skipAddingFilesFromTsConfig: true,
	});

	for (let index = 0; index < files.length; index++) {
		project.addSourceFileAtPath(files[index]);
		onFileParsed?.(index + 1, files.length);
		if ((index + 1) % YIELD_INTERVAL === 0) {
			await yieldToEventLoop();
		}
	}

	return project;
}
