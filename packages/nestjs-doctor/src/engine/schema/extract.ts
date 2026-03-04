import type { Project } from "ts-morph";
import type {
	SchemaEntity,
	SchemaGraph,
	SchemaRelation,
	SerializedSchemaGraph,
} from "../../types/schema.js";
import { prismaExtractor } from "./prisma-extractor.js";
import { typeormExtractor } from "./typeorm-extractor.js";

export interface OrmSchemaExtractor {
	extract(
		project: Project,
		files: string[],
		targetPath: string
	): SchemaEntity[];
}

// Explicit strategy map — add new ORMs here
const extractors: Record<string, OrmSchemaExtractor> = {
	prisma: prismaExtractor,
	typeorm: typeormExtractor,
};

export function extractSchema(
	project: Project,
	files: string[],
	orm: string | null,
	targetPath: string
): SchemaGraph {
	const emptyGraph: SchemaGraph = {
		entities: new Map(),
		relations: [],
		orm: orm ?? "unknown",
	};

	if (!orm) {
		return emptyGraph;
	}

	const extractor = extractors[orm];
	if (!extractor) {
		return emptyGraph;
	}

	const entities = extractor.extract(project, files, targetPath);
	const entityMap = new Map<string, SchemaEntity>();
	const allRelations: SchemaRelation[] = [];

	for (const entity of entities) {
		entityMap.set(entity.name, entity);
		allRelations.push(...entity.relations);
	}

	return {
		entities: entityMap,
		relations: allRelations,
		orm,
	};
}

export function serializeSchemaGraph(
	graph: SchemaGraph
): SerializedSchemaGraph {
	return {
		entities: [...graph.entities.values()],
		relations: graph.relations,
		orm: graph.orm,
	};
}

/**
 * Incremental update for the LSP / file-watch path.
 *
 * Instead of re-scanning the entire project on every file save, this function
 * surgically updates only the schema entities that originate from the changed
 * file:
 *   1. Delete all entities previously sourced from `filePath`
 *   2. Re-extract entities from the updated file using the ORM extractor
 *   3. Rebuild the flat `relations` array (adding/removing entities changes it)
 */
export function updateSchemaForFile(
	graph: SchemaGraph,
	project: Project,
	filePath: string,
	targetPath: string
): void {
	// Remove existing entities from this file
	for (const [name, entity] of graph.entities) {
		if (entity.filePath === filePath) {
			graph.entities.delete(name);
		}
	}

	const extractor = extractors[graph.orm];
	if (!extractor) {
		rebuildRelations(graph);
		return;
	}

	const entities = extractor.extract(project, [filePath], targetPath);
	for (const entity of entities) {
		graph.entities.set(entity.name, entity);
	}

	rebuildRelations(graph);
}

/** Rebuild the flat relations array from all entities in the graph. */
function rebuildRelations(graph: SchemaGraph): void {
	const allRelations: SchemaRelation[] = [];
	for (const entity of graph.entities.values()) {
		allRelations.push(...entity.relations);
	}
	graph.relations = allRelations;
}
