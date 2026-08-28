import type { SerializedModuleNode } from "./artifact.js";
import type {
	Category,
	CodeDiagnostic,
	SchemaDiagnostic,
} from "./diagnostic.js";
import type { DiagnoseSummary, ProjectInfo, Score } from "./result.js";
import type { SchemaRelation, SerializedSchemaEntity } from "./schema.js";
import type { ScopeInfo } from "./scope.js";

/** Version of the shared payload shape, stamped on every shared file. */
export const SHARED_REPORT_VERSION = 1;

/** A section the share flow can offer, with the count shown beside it. */
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

/** One findings category's slice: its diagnostics and its counts alone. */
export interface ShareCategorySlice {
	findings: CodeDiagnostic[];
	schemaIssues: SchemaDiagnostic[];
	summary: DiagnoseSummary;
}

/** The module graph as a share exports it: no timings, relative paths. */
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

/**
 * Everything the report page needs to assemble a shared payload without
 * deciding anything about its shape: the sections, each section's slice,
 * and the payload constants.
 */
export interface ShareManifest {
	endpoints?: SharedEndpoint[];
	filename: string;
	findingsByCategory: Partial<Record<Category, ShareCategorySlice>>;
	modules?: SharedModules;
	/** Offered to the share when the score section is picked. */
	project: ProjectInfo;
	schema?: SharedSchema;
	/** What the scan's diagnostics covered, when anything was narrowed. */
	scope?: ScopeInfo;
	score: Score;
	sections: ShareSection[];
	version: number;
}

/** The assembled shareable document, whichever surface produced it. */
export interface SharedReport {
	endpoints?: SharedEndpoint[];
	findings: CodeDiagnostic[];
	generatedAt: string;
	generator: { name: "nestjs-doctor"; version: string };
	includeCode: boolean;
	modules?: SharedModules;
	/** Present only when the score section is shared. */
	project?: ProjectInfo;
	schema?: SharedSchema;
	schemaIssues: SchemaDiagnostic[];
	/** Present when the scan ran narrowed, so a thin share reads as such. */
	scope?: ScopeInfo;
	/** Present only when the score section is shared. */
	score?: Score;
	sections: string[];
	summary: DiagnoseSummary;
	version: number;
}
