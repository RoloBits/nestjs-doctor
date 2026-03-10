import type { SchemaEntity } from "../../../../common/schema.js";
import type { SchemaRule } from "../../types.js";

const DELETE_NAME_REGEX = /delete/i;

function hasTimestampColumns(entity: SchemaEntity, orm: string): boolean {
	const names = new Set(entity.columns.map((c) => c.name.toLowerCase()));

	// Check by common column names
	if (names.has("createdat") || names.has("created_at")) {
		return true;
	}

	if (orm === "typeorm") {
		// Check for CreateDateColumn/UpdateDateColumn decorator types
		// Exclude columns with "delete" in name (DeleteDateColumn for soft deletes)
		return entity.columns.some(
			(c) =>
				c.type === "timestamp" &&
				c.isGenerated &&
				!DELETE_NAME_REGEX.test(c.name)
		);
	}

	if (orm === "prisma") {
		// Check for DateTime fields with @default(now())
		return entity.columns.some(
			(c) =>
				c.type === "DateTime" &&
				c.defaultValue !== undefined &&
				c.defaultValue.includes("now()")
		);
	}

	return false;
}

export const requireTimestamps: SchemaRule = {
	meta: {
		id: "schema/require-timestamps",
		category: "schema",
		scope: "schema",
		severity: "warning",
		description: "Entities should have timestamp columns (createdAt/updatedAt)",
		help: "Add createdAt/updatedAt columns to track when records are created and modified.",
	},

	check(context) {
		for (const entity of context.schemaGraph.entities.values()) {
			if (!hasTimestampColumns(entity, context.orm)) {
				context.report({
					filePath: entity.filePath,
					entity: entity.name,
					message: `Entity '${entity.name}' has no timestamp columns (createdAt/updatedAt).`,
					help: this.meta.help,
				});
			}
		}
	},
};
