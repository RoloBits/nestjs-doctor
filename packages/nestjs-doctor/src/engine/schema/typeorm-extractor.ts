/**
 * TypeORM Schema Extractor
 *
 * Strategy: AST analysis via ts-morph — walks TypeScript source files through
 * the ts-morph Project, inspecting class decorators (`@Entity`, `@Column`,
 * `@OneToMany`, etc.) to extract schema information.
 *
 * Call order:
 *
 *   typeormExtractor.extract()
 *     → for each file → project.getSourceFile()
 *       → for each class → extractEntityFromClass()
 *         → hasDecorator(cls, "Entity")    — skip non-entity classes
 *         → extractTableName()             — read @Entity('name') or @Entity({ name })
 *         → class-level @Index decorators  — extract composite indexes
 *         → for each property:
 *           → extractColumn()             — read @Column/@PrimaryGeneratedColumn/etc. decorator args
 *           → extractRelation()           — read @OneToMany/@ManyToOne/etc., extract target via () => Target
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

const COLUMN_DECORATORS = new Set([
	"Column",
	"PrimaryColumn",
	"PrimaryGeneratedColumn",
	"CreateDateColumn",
	"UpdateDateColumn",
	"DeleteDateColumn",
	"VersionColumn",
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

	// @Entity('table_name')
	const strArg = getDecoratorStringArg(decorator);
	if (strArg) {
		return strArg;
	}

	// @Entity({ name: 'table_name' })
	const objArg = getDecoratorObjectArg(decorator);
	if (objArg?.name) {
		return objArg.name.replace(/['"]/g, "");
	}

	return cls.getName() ?? "UnknownEntity";
}

function extractColumn(
	propertyName: string,
	decorator: Decorator
): SchemaColumn {
	const decoratorName = decorator.getName();
	const isPrimary =
		decoratorName === "PrimaryColumn" ||
		decoratorName === "PrimaryGeneratedColumn";
	const isGenerated =
		decoratorName === "PrimaryGeneratedColumn" ||
		decoratorName === "CreateDateColumn" ||
		decoratorName === "UpdateDateColumn" ||
		decoratorName === "DeleteDateColumn" ||
		decoratorName === "VersionColumn";

	let type = "unknown";
	let isNullable = false;
	let isUnique = false;
	let defaultValue: string | undefined;

	// Parse string arg: @Column('varchar')
	const strArg = getDecoratorStringArg(decorator);
	if (strArg) {
		type = strArg;
	}

	// Parse object arg: @Column({ type: 'varchar', nullable: true, ... })
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
	}

	// Special type defaults
	if (type === "unknown") {
		if (decoratorName === "PrimaryGeneratedColumn") {
			type = "integer";
		} else if (
			decoratorName === "CreateDateColumn" ||
			decoratorName === "UpdateDateColumn" ||
			decoratorName === "DeleteDateColumn"
		) {
			type = "timestamp";
		} else if (decoratorName === "VersionColumn") {
			type = "integer";
		}
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

function extractRelation(
	entityName: string,
	propertyName: string,
	decorator: Decorator
): SchemaRelation | null {
	const decoratorName = decorator.getName();
	const relationType = RELATION_DECORATORS[decoratorName];
	if (!relationType) {
		return null;
	}

	// Extract target entity from () => Target
	const args = decorator.getArguments();
	if (args.length === 0) {
		return null;
	}

	const firstArg = args[0].getText();
	const match = FORWARD_REF_REGEX.exec(firstArg);
	if (!match) {
		return null;
	}

	const targetEntity = match[1];

	const objArg = getDecoratorObjectArg(decorator);
	const isNullable = objArg?.nullable === "true";
	const onDelete = objArg?.onDelete?.replace(/['"]/g, "");

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

	const name = cls.getName();
	if (!name) {
		return null;
	}

	const tableName = extractTableName(cls);
	const filePath = cls.getSourceFile().getFilePath();
	const columns: SchemaColumn[] = [];
	const relations: SchemaRelation[] = [];
	const indexes: { columns: string[]; isUnique: boolean }[] = [];

	// Extract class-level @Index decorators
	for (const dec of cls.getDecorators()) {
		if (dec.getName() === "Index") {
			const args = dec.getArguments();
			for (const arg of args) {
				if (arg.getKind() === SyntaxKind.ArrayLiteralExpression) {
					const arr = arg.asKind(SyntaxKind.ArrayLiteralExpression);
					if (arr) {
						const cols = arr
							.getElements()
							.map((e) =>
								e.getKind() === SyntaxKind.StringLiteral
									? (e.asKind(SyntaxKind.StringLiteral)?.getLiteralValue() ??
										"")
									: ""
							)
							.filter(Boolean);
						if (cols.length > 0) {
							const objArg = getDecoratorObjectArg(dec);
							indexes.push({
								columns: cols,
								isUnique: objArg?.unique === "true",
							});
						}
					}
				}
			}
		}
	}

	// Track which properties have @Index decorators
	const indexedProps = new Set<string>();

	for (const prop of cls.getProperties()) {
		const propName = prop.getName();
		const decorators = prop.getDecorators();

		// Check for property-level @Index
		const hasIndex = decorators.some((d) => d.getName() === "Index");
		if (hasIndex) {
			indexedProps.add(propName);
			indexes.push({ columns: [propName], isUnique: false });
		}

		for (const dec of decorators) {
			const decName = dec.getName();

			if (COLUMN_DECORATORS.has(decName)) {
				const col = extractColumn(propName, dec);
				if (hasIndex) {
					col.hasIndex = true;
				}
				columns.push(col);
				break;
			}

			if (decName in RELATION_DECORATORS) {
				const relation = extractRelation(name, propName, dec);
				if (relation) {
					relations.push(relation);
				}
				break;
			}
		}
	}

	// Mark columns that appear in class-level indexes
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

export const typeormExtractor: OrmSchemaExtractor = {
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
