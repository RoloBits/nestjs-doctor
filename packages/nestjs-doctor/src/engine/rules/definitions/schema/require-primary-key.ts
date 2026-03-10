import type { SchemaRule } from "../../types.js";

export const requirePrimaryKey: SchemaRule = {
	meta: {
		id: "schema/require-primary-key",
		category: "schema",
		scope: "schema",
		severity: "error",
		description: "Every entity must have at least one primary key column",
		help: "Add a primary key column (e.g. @id in Prisma, @PrimaryColumn/@PrimaryGeneratedColumn in TypeORM).",
	},

	check(context) {
		for (const entity of context.schemaGraph.entities.values()) {
			const hasPrimary = entity.columns.some((col) => col.isPrimary);
			if (!hasPrimary) {
				context.report({
					filePath: entity.filePath,
					entity: entity.name,
					message: `Entity '${entity.name}' has no primary key column.`,
					help: this.meta.help,
				});
			}
		}
	},
};
