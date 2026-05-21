/**
 * MikroORM Schema Extractor
 *
 * Strategy: AST analysis via ts-morph — walks TypeScript source files through
 * the ts-morph Project, inspecting class decorators (`@Entity`, `@PrimaryKey`,
 * `@Property`, `@ManyToOne`, etc. from `@mikro-orm/core`) to extract schema
 * information.
 *
 * Call order:
 *
 *   mikroOrmExtractor.extract()
 *     → for each file → project.getSourceFile()
 *       → for each class → extractEntityFromClass()
 *         → hasDecorator(cls, "Entity")        — skip non-entity classes
 *         → @Entity({ abstract: true })        — skip abstract bases (BaseEntity)
 *         → extractTableName()                 — read @Entity({ tableName })
 *         → class-level @Index / @Unique       — composite indexes
 *         → for each property:
 *           → extractColumn()                 — read @PrimaryKey/@Property/@Enum decorator args
 *           → extractRelation()               — read @ManyToOne/@OneToMany/etc., extract target via entity callback or Collection<T>/Ref<T> type argument
 */
import type { ClassDeclaration, Decorator, Project } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type {
	SchemaColumn,
	SchemaEntity,
	SchemaRelation,
} from "../../common/schema.js";
import { hasDecorator } from "../nest-class-inspector.js";
import type { OrmSchemaExtractor } from "./extract.js";

const FORWARD_REF_REGEX = /=>\s*(\w+)/;
// Intentionally unanchored — ts-morph may surface the type as a bare
// `Collection<Book>` (when annotated) or a namespace-prefixed
// `import("@mikro-orm/core").Collection<Book>` (when only the initializer is
// present and the resolver injects a fully-qualified type), and both must match.
const COLLECTION_TYPE_REGEX = /\bCollection<\s*(\w+)/;
const REF_TYPE_REGEX = /\b(?:Ref|IdentifiedReference|Reference)<\s*(\w+)/;
// Captures the property names listed inside `@Index({ properties: ['a', 'b'] })`
// / `@Unique({ properties: [...] })`. Hoisted to module scope to avoid
// recompiling on every class iteration.
const INDEX_PROPERTIES_REGEX = /['"](\w+)['"]/g;

const COLUMN_DECORATORS = new Set([
	"Property",
	"PrimaryKey",
	"SerializedPrimaryKey",
	"Enum",
	"Formula",
]);

const RELATION_DECORATORS: Record<string, SchemaRelation["type"]> = {
	OneToOne: "one-to-one",
	OneToMany: "one-to-many",
	ManyToOne: "many-to-one",
	ManyToMany: "many-to-many",
};

function getDecoratorObjectArg(
	decorator: Decorator
): Record<string, string> | null {
	const args = decorator.getArguments();
	for (const arg of args) {
		if (arg.getKind() === SyntaxKind.ObjectLiteralExpression) {
			const result: Record<string, string> = {};
			const obj = arg.asKind(SyntaxKind.ObjectLiteralExpression);
			if (!obj) {
				continue;
			}
			for (const prop of obj.getProperties()) {
				if (prop.getKind() === SyntaxKind.PropertyAssignment) {
					const pa = prop.asKind(SyntaxKind.PropertyAssignment);
					if (pa) {
						result[pa.getName()] = pa.getInitializer()?.getText() ?? "";
					}
				}
			}
			return result;
		}
	}
	return null;
}

function getDecoratorStringArg(decorator: Decorator): string | null {
	const args = decorator.getArguments();
	if (args.length === 0) {
		return null;
	}
	const first = args[0];
	if (first.getKind() === SyntaxKind.StringLiteral) {
		return first.asKind(SyntaxKind.StringLiteral)?.getLiteralValue() ?? null;
	}
	return null;
}

function extractTableName(cls: ClassDeclaration): string {
	const decorator = cls.getDecorator("Entity");
	if (!decorator) {
		return cls.getName() ?? "UnknownEntity";
	}

	const objArg = getDecoratorObjectArg(decorator);
	if (objArg?.tableName) {
		return objArg.tableName.replace(/['"]/g, "");
	}
	if (objArg?.collection) {
		return objArg.collection.replace(/['"]/g, "");
	}

	return cls.getName() ?? "UnknownEntity";
}

function extractColumn(
	propertyName: string,
	decorator: Decorator
): SchemaColumn {
	const decoratorName = decorator.getName();
	const isPrimary =
		decoratorName === "PrimaryKey" || decoratorName === "SerializedPrimaryKey";

	let type = "unknown";
	let isNullable = false;
	let isUnique = false;
	let defaultValue: string | undefined;
	let isGenerated = false;

	const strArg = getDecoratorStringArg(decorator);
	if (strArg) {
		type = strArg;
	}

	const objArg = getDecoratorObjectArg(decorator);
	if (objArg) {
		if (objArg.type) {
			type = objArg.type.replace(/['"]/g, "");
		}
		if (objArg.nullable === "true") {
			isNullable = true;
		}
		if (objArg.unique === "true") {
			isUnique = true;
		}
		if (objArg.default !== undefined) {
			defaultValue = objArg.default;
		}
		if (objArg.defaultRaw !== undefined) {
			defaultValue = objArg.defaultRaw;
		}
		if (objArg.onCreate !== undefined || objArg.onUpdate !== undefined) {
			isGenerated = true;
		}
	}

	if (type === "unknown" && isPrimary) {
		type = "integer";
	}

	if (type === "unknown" && decoratorName === "Enum") {
		type = "enum";
	}

	return {
		name: propertyName,
		type,
		isPrimary,
		isNullable,
		isGenerated,
		isUnique,
		defaultValue,
	};
}

function resolveRelationTarget(
	decorator: Decorator,
	propertyTypeText: string
): string | null {
	const args = decorator.getArguments();
	if (args.length > 0) {
		const firstText = args[0].getText();
		const match = FORWARD_REF_REGEX.exec(firstText);
		if (match) {
			return match[1];
		}
	}

	const objArg = getDecoratorObjectArg(decorator);
	if (objArg?.entity) {
		const match = FORWARD_REF_REGEX.exec(objArg.entity);
		if (match) {
			return match[1];
		}
	}

	const collMatch = COLLECTION_TYPE_REGEX.exec(propertyTypeText);
	if (collMatch) {
		return collMatch[1];
	}
	const refMatch = REF_TYPE_REGEX.exec(propertyTypeText);
	if (refMatch) {
		return refMatch[1];
	}

	return null;
}

function extractRelation(
	entityName: string,
	propertyName: string,
	propertyTypeText: string,
	decorator: Decorator
): SchemaRelation | null {
	const decoratorName = decorator.getName();
	const relationType = RELATION_DECORATORS[decoratorName];
	if (!relationType) {
		return null;
	}

	const targetEntity = resolveRelationTarget(decorator, propertyTypeText);
	if (!targetEntity) {
		return null;
	}

	const objArg = getDecoratorObjectArg(decorator);
	const isNullable = objArg?.nullable === "true";

	// MikroORM v6 uses `deleteRule`; legacy uses `onDelete`. Both map to the
	// same downstream concept and rule consumers normalise to lowercase.
	const rawOnDelete = objArg?.deleteRule ?? objArg?.onDelete;
	const onDelete = rawOnDelete?.replace(/['"]/g, "");

	return {
		type: relationType,
		fromEntity: entityName,
		toEntity: targetEntity,
		propertyName,
		isNullable,
		...(onDelete ? { onDelete } : {}),
	};
}

function extractEntityFromClass(cls: ClassDeclaration): SchemaEntity | null {
	if (!hasDecorator(cls, "Entity")) {
		return null;
	}

	const entityDecorator = cls.getDecorator("Entity");
	if (entityDecorator) {
		const entityArgs = getDecoratorObjectArg(entityDecorator);
		if (entityArgs?.abstract === "true") {
			return null;
		}
	}

	const name = cls.getName();
	if (!name) {
		return null;
	}

	const tableName = extractTableName(cls);
	const filePath = cls.getSourceFile().getFilePath();
	const columns: SchemaColumn[] = [];
	const relations: SchemaRelation[] = [];
	const indexes: { columns: string[]; isUnique: boolean }[] = [];

	for (const dec of cls.getDecorators()) {
		const decName = dec.getName();
		if (decName !== "Index" && decName !== "Unique") {
			continue;
		}
		const objArg = getDecoratorObjectArg(dec);
		if (!objArg?.properties) {
			continue;
		}
		const propsText = objArg.properties;
		const cols = [...propsText.matchAll(INDEX_PROPERTIES_REGEX)].map(
			(m) => m[1]
		);
		if (cols.length > 0) {
			indexes.push({ columns: cols, isUnique: decName === "Unique" });
		}
	}

	const indexedProps = new Set<string>();

	for (const prop of cls.getProperties()) {
		const propName = prop.getName();
		const propTypeText =
			prop.getTypeNode()?.getText() ?? prop.getType().getText();
		const decorators = prop.getDecorators();

		for (const d of decorators) {
			const dn = d.getName();
			if (dn === "Index") {
				indexedProps.add(propName);
				indexes.push({ columns: [propName], isUnique: false });
			} else if (dn === "Unique") {
				indexedProps.add(propName);
				indexes.push({ columns: [propName], isUnique: true });
			}
		}

		for (const dec of decorators) {
			const decName = dec.getName();

			if (COLUMN_DECORATORS.has(decName)) {
				const col = extractColumn(propName, dec);
				if (indexedProps.has(propName)) {
					col.hasIndex = true;
				}
				columns.push(col);
				break;
			}

			if (decName in RELATION_DECORATORS) {
				const relation = extractRelation(name, propName, propTypeText, dec);
				if (relation) {
					relations.push(relation);
				}
				break;
			}
		}
	}

	for (const idx of indexes) {
		for (const colName of idx.columns) {
			const col = columns.find((c) => c.name === colName);
			if (col) {
				col.hasIndex = true;
			}
		}
	}

	return { name, tableName, filePath, columns, relations, indexes };
}

export const mikroOrmExtractor: OrmSchemaExtractor = {
	supportsIncrementalUpdate: true,
	extract(project: Project, files: string[]): SchemaEntity[] {
		const entities: SchemaEntity[] = [];

		for (const filePath of files) {
			const sourceFile = project.getSourceFile(filePath);
			if (!sourceFile) {
				continue;
			}

			for (const cls of sourceFile.getClasses()) {
				const entity = extractEntityFromClass(cls);
				if (entity) {
					entities.push(entity);
				}
			}
		}

		return entities;
	},
};
