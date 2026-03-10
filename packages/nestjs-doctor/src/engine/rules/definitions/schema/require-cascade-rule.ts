import type { SchemaRule } from "../../types.js";

export const requireCascadeRule: SchemaRule = {
	meta: {
		id: "schema/require-cascade-rule",
		category: "schema",
		scope: "schema",
		severity: "info",
		description:
			"Relations should have explicit onDelete/cascade behavior defined",
		help: "Add an explicit onDelete option (e.g. CASCADE, SET NULL) to avoid relying on database defaults.",
	},

	check(context) {
		for (const relation of context.schemaGraph.relations) {
			// Only check owning-side relations
			if (relation.type !== "many-to-one" && relation.type !== "one-to-one") {
				continue;
			}

			if (!relation.onDelete) {
				const entity = context.schemaGraph.entities.get(relation.fromEntity);
				if (!entity) {
					continue;
				}
				context.report({
					filePath: entity.filePath,
					entity: entity.name,
					message: `Relation '${relation.propertyName}' on '${relation.fromEntity}' has no explicit onDelete behavior.`,
					help: this.meta.help,
				});
			}
		}
	},
};
