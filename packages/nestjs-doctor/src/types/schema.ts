export interface SchemaColumn {
	defaultValue?: string;
	hasIndex?: boolean;
	isGenerated: boolean;
	isNullable: boolean;
	isPrimary: boolean;
	isUnique: boolean;
	name: string;
	type: string;
}

export interface SchemaRelation {
	fromEntity: string;
	isNullable: boolean;
	onDelete?: string;
	propertyName: string;
	toEntity: string;
	type: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
}

export interface SchemaEntity {
	columns: SchemaColumn[];
	filePath: string;
	indexes?: { columns: string[]; isUnique: boolean }[];
	name: string;
	relations: SchemaRelation[];
	tableName: string;
}

/**
 * In-memory schema graph used during analysis.
 * Entities are stored in a Map for O(1) lookup by name.
 */
export interface SchemaGraph {
	entities: Map<string, SchemaEntity>;
	orm: string;
	relations: SchemaRelation[];
}

/**
 * JSON-safe version of SchemaGraph for HTML reports and API responses.
 * Entities are flattened to an array since Maps are not serializable.
 */
export interface SerializedSchemaGraph {
	entities: SerializedSchemaEntity[];
	orm: string;
	relations: SchemaRelation[];
}

/**
 * JSON-safe version of SchemaEntity (omits indexes since they are
 * only needed during rule analysis, not in serialized output).
 */
export interface SerializedSchemaEntity {
	columns: SchemaColumn[];
	filePath: string;
	name: string;
	relations: SchemaRelation[];
	tableName: string;
}
