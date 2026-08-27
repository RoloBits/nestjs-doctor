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

export interface SerializedSchemaEntity {
	columns: SchemaColumn[];
	filePath: string;
	name: string;
	relations: SchemaRelation[];
	tableName: string;
}

export interface SerializedSchemaGraph {
	entities: SerializedSchemaEntity[];
	orm: string;
	relations: SchemaRelation[];
}
