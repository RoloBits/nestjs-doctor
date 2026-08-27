import type { SerializedModuleNode } from "./artifact";
import type { Category, CodeDiagnostic, SchemaDiagnostic } from "./diagnostic";
import type { DiagnoseSummary, ProjectInfo, Score } from "./result";
import type { SchemaRelation, SerializedSchemaEntity } from "./schema";
import type { ScopeInfo } from "./scope";

export interface ShareSection {
	count: number;
	id: string;
	label: string;
}

export interface SharedEndpoint {
	controllerClass: string;
	handlerMethod: string;
	httpMethod: string;
	routePath: string;
}

export interface ShareCategorySlice {
	findings: CodeDiagnostic[];
	schemaIssues: SchemaDiagnostic[];
	summary: DiagnoseSummary;
}

export interface SharedModules {
	bootstrapRoots?: string[];
	circularDeps: string[][];
	edges: Array<{ from: string; to: string }>;
	modules: Array<
		Omit<SerializedModuleNode, "filePath" | "hookTimings" | "initTimings"> & {
			filePath: string;
		}
	>;
	projects: string[];
}

export interface SharedSchema {
	entities: Array<
		Omit<SerializedSchemaEntity, "filePath"> & { filePath: string }
	>;
	orm: string;
	relations: SchemaRelation[];
}

export interface ShareManifest {
	endpoints?: SharedEndpoint[];
	filename: string;
	findingsByCategory: Partial<Record<Category, ShareCategorySlice>>;
	modules?: SharedModules;
	project: ProjectInfo;
	schema?: SharedSchema;
	scope?: ScopeInfo;
	score: Score;
	sections: ShareSection[];
	version: number;
}
