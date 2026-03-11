/**
 * Drizzle ORM Schema Extractor
 *
 * Strategy: AST analysis via ts-morph — walks variable declarations looking for
 * `pgTable`/`mysqlTable`/`sqliteTable` calls, extracts columns by walking
 * method chains, and extracts `.references()` for foreign key relations.
 *
 * Call order:
 *
 *   drizzleExtractor.extract()
 *     → for each file → project.getSourceFile()
 *       → for each variable declaration → extractTablesFromFile()
 *         → check if initializer is pgTable/mysqlTable/sqliteTable call
 *         → extractColumns() — walk each column's method chain
 *         → extractRelationsFromColumns() — find .references() calls
 *         → extractIndexes() — parse third pgTable argument (optional)
 */
import type {
	Expression,
	ObjectLiteralExpression,
	Project,
	SourceFile,
} from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type {
	SchemaColumn,
	SchemaEntity,
	SchemaRelation,
} from "../../common/schema.js";
import type { OrmSchemaExtractor } from "./extract.js";

const TABLE_FACTORIES = new Set(["pgTable", "mysqlTable", "sqliteTable"]);
const AUTO_GEN_TYPES = new Set(["serial", "bigserial", "smallserial"]);
const FORWARD_REF_REGEX = /=>\s*(\w+)/;

interface ColumnInfo {
	defaultValue?: string;
	isGenerated: boolean;
	isNullable: boolean;
	isPrimary: boolean;
	isUnique: boolean;
	reference?: {
		toEntity: string;
		onDelete?: string;
	};
	type: string;
}

function walkColumnChain(expr: Expression): ColumnInfo {
	const info: ColumnInfo = {
		type: "unknown",
		isPrimary: false,
		isNullable: true, // Drizzle columns are nullable by default
		isGenerated: false,
		isUnique: false,
	};

	function walk(node: Expression): void {
		const kind = node.getKind();

		if (kind === SyntaxKind.CallExpression) {
			const call = node.asKindOrThrow(SyntaxKind.CallExpression);
			const callExpr = call.getExpression();

			if (callExpr.getKind() === SyntaxKind.PropertyAccessExpression) {
				const propAccess = callExpr.asKindOrThrow(
					SyntaxKind.PropertyAccessExpression
				);
				const methodName = propAccess.getName();

				switch (methodName) {
					case "primaryKey":
						info.isPrimary = true;
						break;
					case "notNull":
						info.isNullable = false;
						break;
					case "unique":
						info.isUnique = true;
						break;
					case "default": {
						const args = call.getArguments();
						if (args.length > 0) {
							info.defaultValue = args[0].getText().replace(/['"]/g, "");
						}
						break;
					}
					case "defaultNow":
						info.defaultValue = "now()";
						break;
					case "generatedAlwaysAsIdentity":
					case "autoincrement":
						info.isGenerated = true;
						break;
					case "references": {
						const args = call.getArguments();
						if (args.length > 0) {
							const firstArg = args[0].getText();
							const match = FORWARD_REF_REGEX.exec(firstArg);
							if (match) {
								info.reference = { toEntity: match[1] };
							}
							if (args.length > 1) {
								const secondArg = args[1];
								if (
									secondArg.getKind() === SyntaxKind.ObjectLiteralExpression
								) {
									const obj = secondArg.asKindOrThrow(
										SyntaxKind.ObjectLiteralExpression
									);
									for (const prop of obj.getProperties()) {
										if (prop.getKind() === SyntaxKind.PropertyAssignment) {
											const pa = prop.asKindOrThrow(
												SyntaxKind.PropertyAssignment
											);
											if (pa.getName() === "onDelete") {
												const val = pa.getInitializer()?.getText();
												if (val) {
													info.reference!.onDelete = val.replace(/['"]/g, "");
												}
											}
										}
									}
								}
							}
						}
						break;
					}
					default:
						break;
				}

				walk(propAccess.getExpression());
			} else if (callExpr.getKind() === SyntaxKind.Identifier) {
				const typeName = callExpr.getText();
				info.type = typeName;
				if (AUTO_GEN_TYPES.has(typeName)) {
					info.isGenerated = true;
				}
			}
		}
	}

	walk(expr);
	return info;
}

function extractColumns(obj: ObjectLiteralExpression): SchemaColumn[] {
	const columns: SchemaColumn[] = [];

	for (const prop of obj.getProperties()) {
		if (prop.getKind() !== SyntaxKind.PropertyAssignment) {
			continue;
		}

		const pa = prop.asKindOrThrow(SyntaxKind.PropertyAssignment);
		const name = pa.getName();
		const init = pa.getInitializer();
		if (!init) {
			continue;
		}

		const info = walkColumnChain(init);
		columns.push({
			name,
			type: info.type,
			isPrimary: info.isPrimary,
			isNullable: info.isNullable,
			isGenerated: info.isGenerated,
			isUnique: info.isUnique,
			defaultValue: info.defaultValue,
		});
	}

	return columns;
}

function extractRelationsFromColumns(
	obj: ObjectLiteralExpression,
	entityName: string
): SchemaRelation[] {
	const relations: SchemaRelation[] = [];

	for (const prop of obj.getProperties()) {
		if (prop.getKind() !== SyntaxKind.PropertyAssignment) {
			continue;
		}

		const pa = prop.asKindOrThrow(SyntaxKind.PropertyAssignment);
		const propertyName = pa.getName();
		const init = pa.getInitializer();
		if (!init) {
			continue;
		}

		const info = walkColumnChain(init);
		if (info.reference) {
			relations.push({
				type: "many-to-one",
				fromEntity: entityName,
				toEntity: info.reference.toEntity,
				propertyName,
				isNullable: info.isNullable,
				...(info.reference.onDelete
					? { onDelete: info.reference.onDelete }
					: {}),
			});
		}
	}

	return relations;
}

function extractIndexes(
	thirdArg: Expression
): { columns: string[]; isUnique: boolean }[] {
	const indexes: { columns: string[]; isUnique: boolean }[] = [];

	const callExprs = thirdArg.getDescendantsOfKind(SyntaxKind.CallExpression);

	for (const call of callExprs) {
		const expr = call.getExpression();
		if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) {
			continue;
		}

		const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
		if (propAccess.getName() !== "on") {
			continue;
		}

		const columns: string[] = [];
		for (const arg of call.getArguments()) {
			if (arg.getKind() === SyntaxKind.PropertyAccessExpression) {
				const pa = arg.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
				columns.push(pa.getName());
			}
		}

		if (columns.length === 0) {
			continue;
		}

		const fullText = call.getText();
		const isUnique = fullText.includes("uniqueIndex");

		indexes.push({ columns, isUnique });
	}

	return indexes;
}

function extractTablesFromFile(sourceFile: SourceFile): SchemaEntity[] {
	const entities: SchemaEntity[] = [];
	const filePath = sourceFile.getFilePath();

	for (const varDecl of sourceFile.getDescendantsOfKind(
		SyntaxKind.VariableDeclaration
	)) {
		const init = varDecl.getInitializer();
		if (!init || init.getKind() !== SyntaxKind.CallExpression) {
			continue;
		}

		const call = init.asKindOrThrow(SyntaxKind.CallExpression);
		const callExpr = call.getExpression();

		if (callExpr.getKind() !== SyntaxKind.Identifier) {
			continue;
		}

		const factoryName = callExpr.getText();
		if (!TABLE_FACTORIES.has(factoryName)) {
			continue;
		}

		const args = call.getArguments();
		if (args.length < 2) {
			continue;
		}

		const tableNameArg = args[0];
		let tableName = varDecl.getName();
		if (tableNameArg.getKind() === SyntaxKind.StringLiteral) {
			tableName = tableNameArg
				.asKindOrThrow(SyntaxKind.StringLiteral)
				.getLiteralValue();
		}

		const columnsArg = args[1];
		if (columnsArg.getKind() !== SyntaxKind.ObjectLiteralExpression) {
			continue;
		}

		const obj = columnsArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
		const entityName = varDecl.getName();
		const columns = extractColumns(obj);
		const relations = extractRelationsFromColumns(obj, entityName);

		let indexes: { columns: string[]; isUnique: boolean }[] | undefined;
		if (args.length >= 3) {
			indexes = extractIndexes(args[2]);
			if (indexes) {
				for (const idx of indexes) {
					for (const colName of idx.columns) {
						const col = columns.find((c) => c.name === colName);
						if (col) {
							col.hasIndex = true;
						}
					}
				}
			}
		}

		entities.push({
			name: entityName,
			tableName,
			filePath,
			columns,
			relations,
			indexes,
		});
	}

	return entities;
}

export const drizzleExtractor: OrmSchemaExtractor = {
	supportsIncrementalUpdate: true,
	extract(project: Project, files: string[]): SchemaEntity[] {
		const entities: SchemaEntity[] = [];

		for (const filePath of files) {
			const sourceFile = project.getSourceFile(filePath);
			if (!sourceFile) {
				continue;
			}

			entities.push(...extractTablesFromFile(sourceFile));
		}

		return entities;
	},
};
