/**
 * Prisma Schema Extractor
 *
 * Strategy: Static file parsing — reads `.prisma` schema files directly from
 * disk (no AST/ts-morph needed). Ignores the `project` and `files` arguments;
 * only uses `targetPath` to locate Prisma schema files.
 *
 * Call order:
 *
 *   prismaExtractor.extract()
 *     → findPrismaSchemaFiles()   — locate .prisma files (prisma/schema.prisma, root, or package.json custom path)
 *     → parseSchemaFiles()        — line-by-line regex parsing: detect model/enum blocks, parse fields and @@attributes
 *       → parseField()            — extract field name, type, optional/list flags, and @attributes
 *       → parseBlockIndex()       — extract @@index/@@unique block-level attributes
 *     → buildEntities()           — convert ParsedModels into SchemaEntity[]
 *       → fieldToColumn()         — map scalar fields to SchemaColumn (primary, nullable, default, generated)
 *       → extractOnDelete()       — extract onDelete action from @relation attribute
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "ts-morph";
import type {
	SchemaColumn,
	SchemaEntity,
	SchemaRelation,
} from "../../types/schema.js";
import type { OrmSchemaExtractor } from "./extract.js";

const MODEL_REGEX = /^model\s+(\w+)\s*\{/;
const ENUM_REGEX = /^enum\s+(\w+)\s*\{/;
const FIELD_REGEX = /^(\w+)\s+(\w+)(\?)?(\[\])?(.*)$/;
const ATTR_REGEX = /@(\w+)(\((?:[^()]*|\([^()]*\))*\))?/g;
const DEFAULT_VALUE_REGEX = /@default\(((?:[^()]*|\([^()]*\))*)\)/;
const MAP_REGEX = /^@@map\(\s*"([^"]+)"\s*\)/;

interface ParsedField {
	attributes: string[];
	isList: boolean;
	isOptional: boolean;
	name: string;
	type: string;
}

interface ParsedIndex {
	columns: string[];
	isUnique: boolean;
}

interface ParsedModel {
	compositeIdColumns: string[];
	fields: ParsedField[];
	filePath: string;
	indexes: ParsedIndex[];
	name: string;
	tableName?: string;
}

function findPrismaSchemaFiles(targetPath: string): string[] {
	// Check prisma/schema.prisma (standard)
	const standard = join(targetPath, "prisma", "schema.prisma");
	if (existsSync(standard)) {
		// Also check for multi-file schemas (prisma/*.prisma since Prisma v5.15)
		const prismaDir = join(targetPath, "prisma");
		const files = readdirSync(prismaDir).filter((f) => f.endsWith(".prisma"));
		if (files.length > 1) {
			return files.map((f) => join(prismaDir, f));
		}
		return [standard];
	}

	// Check schema.prisma in root
	const root = join(targetPath, "schema.prisma");
	if (existsSync(root)) {
		return [root];
	}

	// Check package.json for custom path
	try {
		const pkgPath = join(targetPath, "package.json");
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
		const customPath = pkg.prisma?.schema;
		if (customPath) {
			const resolved = join(targetPath, customPath);
			if (existsSync(resolved)) {
				return [resolved];
			}
		}
	} catch {
		// package.json not found or unreadable
	}

	return [];
}

function parseSchemaFiles(filePaths: string[]): {
	enums: Set<string>;
	models: ParsedModel[];
} {
	const models: ParsedModel[] = [];
	const enums = new Set<string>();

	for (const filePath of filePaths) {
		let content: string;
		try {
			content = readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const lines = content.split("\n");
		let currentBlock: { name: string; type: "model" | "enum" } | null = null;
		let currentFields: ParsedField[] = [];
		let currentIndexes: ParsedIndex[] = [];
		let currentCompositeId: string[] = [];
		let currentTableName: string | undefined;

		for (const rawLine of lines) {
			const line = rawLine.trim();

			// Detect model start
			const modelMatch = MODEL_REGEX.exec(line);
			if (modelMatch) {
				currentBlock = { type: "model", name: modelMatch[1] };
				currentFields = [];
				currentIndexes = [];
				currentCompositeId = [];
				currentTableName = undefined;
				continue;
			}

			// Detect enum start
			const enumMatch = ENUM_REGEX.exec(line);
			if (enumMatch) {
				currentBlock = { type: "enum", name: enumMatch[1] };
				enums.add(enumMatch[1]);
				continue;
			}

			// Detect block end
			if (line === "}") {
				if (currentBlock?.type === "model") {
					models.push({
						name: currentBlock.name,
						fields: currentFields,
						indexes: currentIndexes,
						compositeIdColumns: currentCompositeId,
						filePath,
						tableName: currentTableName,
					});
				}
				currentBlock = null;
				currentFields = [];
				currentIndexes = [];
				currentCompositeId = [];
				currentTableName = undefined;
				continue;
			}

			// Parse fields inside model block
			if (currentBlock?.type === "model" && line && !line.startsWith("//")) {
				// Capture @@id, @@index and @@unique block-level attributes
				if (line.startsWith("@@")) {
					const compositeIdMatch = COMPOSITE_ID_REGEX.exec(line);
					if (compositeIdMatch) {
						currentCompositeId = compositeIdMatch[1]
							.split(",")
							.map((c) => c.trim());
					}
					const idx = parseBlockIndex(line);
					if (idx) {
						currentIndexes.push(idx);
					}
					// Check for @@map
					const mapMatch = MAP_REGEX.exec(line);
					if (mapMatch) {
						currentTableName = mapMatch[1];
					}
					continue;
				}

				const field = parseField(line);
				if (field) {
					currentFields.push(field);
				}
			}
		}
	}

	return { models, enums };
}

const BLOCK_INDEX_REGEX = /^@@(index|unique)\(\[([^\]]*)\]\)/;
const COMPOSITE_ID_REGEX = /^@@id\(\[([^\]]*)\]\)/;

function parseBlockIndex(line: string): ParsedIndex | null {
	const match = BLOCK_INDEX_REGEX.exec(line);
	if (!match) {
		return null;
	}
	const isUnique = match[1] === "unique";
	const columns = match[2]
		.split(",")
		.map((c) => c.trim())
		.filter(Boolean);
	if (columns.length === 0) {
		return null;
	}
	return { columns, isUnique };
}

function parseField(line: string): ParsedField | null {
	// Field format: fieldName FieldType?[] @attribute1 @attribute2
	const fieldMatch = FIELD_REGEX.exec(line);
	if (!fieldMatch) {
		return null;
	}

	const name = fieldMatch[1];
	const baseType = fieldMatch[2];
	const isOptional = fieldMatch[3] === "?";
	const isList = fieldMatch[4] === "[]";
	const rest = fieldMatch[5] ?? "";

	// Extract @attributes
	const attributes: string[] = [];
	const localRegex = new RegExp(ATTR_REGEX.source, ATTR_REGEX.flags);
	let match = localRegex.exec(rest);
	while (match !== null) {
		attributes.push(`@${match[1]}${match[2] ?? ""}`);
		match = localRegex.exec(rest);
	}

	return { name, type: baseType, isOptional, isList, attributes };
}

function fieldToColumn(field: ParsedField): SchemaColumn {
	const isPrimary = field.attributes.some((a) => a.startsWith("@id"));
	const isUnique = field.attributes.some((a) => a.startsWith("@unique"));

	const defaultAttr = field.attributes.find((a) => a.startsWith("@default("));
	let isGenerated = false;
	let defaultValue: string | undefined;

	if (defaultAttr) {
		const valueMatch = DEFAULT_VALUE_REGEX.exec(defaultAttr);
		if (valueMatch) {
			const val = valueMatch[1];
			defaultValue = val;
			if (
				val === "autoincrement()" ||
				val === "uuid()" ||
				val === "cuid()" ||
				val === "dbgenerated()"
			) {
				isGenerated = true;
			}
		}
	}

	return {
		name: field.name,
		type: field.type,
		isPrimary,
		isNullable: field.isOptional,
		isGenerated,
		isUnique,
		defaultValue,
	};
}

const ON_DELETE_REGEX = /onDelete:\s*(\w+)/;

function extractOnDelete(field: ParsedField): string | undefined {
	const relationAttr = field.attributes.find((a) => a.startsWith("@relation"));
	if (!relationAttr) {
		return undefined;
	}
	const match = ON_DELETE_REGEX.exec(relationAttr);
	return match ? match[1] : undefined;
}

function buildEntities(
	models: ParsedModel[],
	enums: Set<string>
): SchemaEntity[] {
	const modelNames = new Set(models.map((m) => m.name));

	return models.map((model) => {
		const columns: SchemaColumn[] = [];
		const relations: SchemaRelation[] = [];

		// Build a set of indexed column names from @@index/@@unique
		const indexedColumns = new Set<string>();
		for (const idx of model.indexes) {
			for (const col of idx.columns) {
				indexedColumns.add(col);
			}
		}

		// Build a set of composite primary key columns from @@id
		const compositeIdSet = new Set(model.compositeIdColumns);

		for (const field of model.fields) {
			const isRelationField =
				modelNames.has(field.type) && !enums.has(field.type);

			if (isRelationField) {
				// Determine relation type
				let relType: SchemaRelation["type"];
				if (field.isList) {
					relType = "one-to-many";
				} else {
					relType = "many-to-one";
				}

				const isNullable = field.isOptional;

				// If field is a list and target also has a list, it's many-to-many
				if (field.isList) {
					const targetModel = models.find((m) => m.name === field.type);
					const reverseField = targetModel?.fields.find(
						(f) => f !== field && f.type === model.name && f.isList
					);
					if (reverseField) {
						relType = "many-to-many";
					}
				}

				const onDelete = extractOnDelete(field);

				relations.push({
					type: relType,
					fromEntity: model.name,
					toEntity: field.type,
					propertyName: field.name,
					isNullable: isNullable ?? false,
					...(onDelete ? { onDelete } : {}),
				});
			} else if (!field.attributes.some((a) => a.startsWith("@relation"))) {
				const col = fieldToColumn(field);
				if (compositeIdSet.has(field.name)) {
					col.isPrimary = true;
				}
				if (
					indexedColumns.has(field.name) ||
					field.attributes.some((a) => a.startsWith("@unique"))
				) {
					col.hasIndex = true;
				}
				columns.push(col);
			}
		}

		return {
			name: model.name,
			tableName: model.tableName ?? model.name,
			filePath: model.filePath,
			columns,
			relations,
			indexes: model.indexes,
		};
	});
}

export const prismaExtractor: OrmSchemaExtractor = {
	supportsIncrementalUpdate: false,
	extract(
		_project: Project,
		_files: string[],
		targetPath: string
	): SchemaEntity[] {
		const schemaFiles = findPrismaSchemaFiles(targetPath);
		if (schemaFiles.length === 0) {
			return [];
		}

		const { models, enums } = parseSchemaFiles(schemaFiles);
		return buildEntities(models, enums);
	},
};
