import { Project } from "ts-morph";

export function createAstParser(files: string[]): Project {
	const project = new Project({
		compilerOptions: {
			strict: true,
			target: 99, // ESNext
			module: 99, // ESNext
			skipFileDependencyResolution: true,
		},
		skipAddingFilesFromTsConfig: true,
	});

	for (const file of files) {
		project.addSourceFileAtPath(file);
	}

	return project;
}
