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
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "tinyglobby";
import type { Project } from "ts-morph";
import type {
	SchemaColumn,
	SchemaEntity,
	SchemaRelation,
} from "../../common/schema.js";
import { posixDirname } from "../graph/module-graph.js";
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

// Directories whose .prisma files describe something other than this project:
// scaffolding, vendored copies, generated client output, build artefacts.
const NOT_THIS_PROJECT = [
	"**/node_modules/**",
	"**/dist/**",
	"**/build/**",
	"**/out/**",
	"**/.next/**",
	"**/coverage/**",
	"**/generated/**",
	"**/templates/**",
	"**/template/**",
	"**/examples/**",
	"**/example/**",
	"**/samples/**",
	"**/sample/**",
	"**/fixtures/**",
	"**/__fixtures__/**",
	"**/test/**",
	"**/tests/**",
	"**/__tests__/**",
	"**/e2e/**",
];

const PRISMA_CONFIG_FILES = [
	"prisma.config.ts",
	"prisma.config.mts",
	"prisma.config.js",
	"prisma.config.mjs",
];

const CONFIG_SCHEMA_VALUE = /\bschema\s*:\s*["'`]([^"'`]+)["'`]/g;
const LINE_COMMENT = /\/\/[^\n]*/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

/**
 * Every `.prisma` file directly inside `directory`. Prisma merges siblings, so
 * they are all part of one schema.
 */
function prismaFilesIn(directory: string): string[] {
	try {
		return readdirSync(directory)
			.filter((name) => name.endsWith(".prisma"))
			.map((name) => join(directory, name))
			.sort();
	} catch {
		return [];
	}
}

/** The `.prisma` files a declared path names, whether it is a file or a folder. */
function filesAtDeclaredPath(targetPath: string, declared: string): string[] {
	const resolved = join(targetPath, declared);
	if (!existsSync(resolved)) {
		return [];
	}
	return statSync(resolved).isDirectory()
		? prismaFilesIn(resolved)
		: [resolved];
}

/** True when these files hold at least one model, so they are a real schema. */
function declaresModels(files: string[]): boolean {
	return files.length > 0 && parseSchemaFiles(files).models.length > 0;
}

/** The `.prisma` files a `prisma.config.*` declares, if one is readable. */
function schemaFromPrismaConfig(targetPath: string): string[] {
	for (const name of PRISMA_CONFIG_FILES) {
		const configPath = join(targetPath, name);
		if (!existsSync(configPath)) {
			continue;
		}
		try {
			const source = readFileSync(configPath, "utf-8")
				.replace(BLOCK_COMMENT, "")
				.replace(LINE_COMMENT, "");
			// A config can hold more than one `schema` key, so each candidate is
			// tried and the first that declares a model is taken.
			for (const match of source.matchAll(CONFIG_SCHEMA_VALUE)) {
				const files = filesAtDeclaredPath(targetPath, match[1]);
				if (declaresModels(files)) {
					return files;
				}
			}
		} catch {
			// Unreadable config — try the next name
		}
	}
	return [];
}

/**
 * The `.prisma` files nearest the project root, when no convention located
 * them. Nx and similar layouts keep the schema inside a library.
 */
function searchForPrismaSchema(targetPath: string): string[] {
	let found: string[];
	try {
		found = globSync(["**/*.prisma"], {
			cwd: targetPath,
			absolute: true,
			ignore: NOT_THIS_PROJECT,
		});
	} catch {
		return [];
	}
	const directories = [...new Set(found.map(posixDirname))].sort((a, b) => {
		const byDepth = a.split("/").length - b.split("/").length;
		if (byDepth !== 0) {
			return byDepth;
		}
		return a < b ? -1 : 1;
	});
	// Shallowest first. A guessed directory must also look like a schema's own,
	// which keeps a vendored reference schema from standing in for the project's.
	for (const directory of directories) {
		const files = prismaFilesIn(directory).filter(
			(file) => directory.endsWith("/prisma") || file.endsWith("/schema.prisma")
		);
		if (declaresModels(files)) {
			return files;
		}
	}
	return [];
}

function findPrismaSchemaFiles(targetPath: string): string[] {
	// Prisma reads prisma.config.* first and ignores the package.json key when
	// one exists, so a declared path wins over both conventional locations.
	const declared = schemaFromPrismaConfig(targetPath);
	if (declared.length > 0) {
		return declared;
	}

	try {
		const pkg = JSON.parse(
			readFileSync(join(targetPath, "package.json"), "utf-8")
		);
		if (pkg.prisma?.schema) {
			const files = filesAtDeclaredPath(targetPath, pkg.prisma.schema);
			if (files.length > 0) {
				return files;
			}
		}
	} catch {
		// package.json not found or unreadable
	}

	// prisma/schema.prisma, plus the folder form Prisma has allowed since 5.15
	const conventional = prismaFilesIn(join(targetPath, "prisma"));
	if (conventional.length > 0) {
		return conventional;
	}

	const root = join(targetPath, "schema.prisma");
	if (existsSync(root)) {
		return [root];
	}

	return searchForPrismaSchema(targetPath);
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
	readsFromTargetPath: true,
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
