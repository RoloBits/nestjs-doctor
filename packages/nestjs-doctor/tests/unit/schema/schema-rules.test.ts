import { describe, expect, it } from "vitest";
import type { SchemaDiagnostic } from "../../../src/common/diagnostic.js";
import type {
	SchemaColumn,
	SchemaEntity,
	SchemaGraph,
	SchemaRelation,
} from "../../../src/common/schema.js";
import { requireCascadeRule } from "../../../src/engine/rules/definitions/schema/require-cascade-rule.js";
import { requirePrimaryKey } from "../../../src/engine/rules/definitions/schema/require-primary-key.js";
import { requireTimestamps } from "../../../src/engine/rules/definitions/schema/require-timestamps.js";
import type { SchemaRule } from "../../../src/engine/rules/types.js";

function runSchemaRule(
	rule: SchemaRule,
	graph: SchemaGraph
): SchemaDiagnostic[] {
	const diagnostics: SchemaDiagnostic[] = [];
	rule.check({
		schemaGraph: graph,
		orm: graph.orm,
		report(partial) {
			diagnostics.push({
				...partial,
				rule: rule.meta.id,
				category: rule.meta.category,
				scope: "schema",
				severity: rule.meta.severity,
			});
		},
	});
	return diagnostics;
}

function makeColumn(overrides: Partial<SchemaColumn> = {}): SchemaColumn {
	return {
		name: "id",
		type: "integer",
		isPrimary: false,
		isNullable: false,
		isGenerated: false,
		isUnique: false,
		...overrides,
	};
}

function makeEntity(overrides: Partial<SchemaEntity> = {}): SchemaEntity {
	return {
		name: "TestEntity",
		tableName: "test_entity",
		filePath: "/test/entity.ts",
		columns: [],
		relations: [],
		...overrides,
	};
}

function makeRelation(overrides: Partial<SchemaRelation> = {}): SchemaRelation {
	return {
		fromEntity: "TestEntity",
		toEntity: "OtherEntity",
		propertyName: "other",
		type: "many-to-one",
		isNullable: false,
		...overrides,
	};
}

function makeGraph(entities: SchemaEntity[], orm = "typeorm"): SchemaGraph {
	const entityMap = new Map<string, SchemaEntity>();
	const relations: SchemaRelation[] = [];
	for (const entity of entities) {
		entityMap.set(entity.name, entity);
		relations.push(...entity.relations);
	}
	return { entities: entityMap, relations, orm };
}

// ── require-primary-key ──

describe("schema/require-primary-key", () => {
	it("should report entity without primary key", () => {
		const entity = makeEntity({
			columns: [makeColumn({ name: "email", isPrimary: false })],
		});
		const graph = makeGraph([entity]);
		const diagnostics = runSchemaRule(requirePrimaryKey, graph);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].message).toContain("TestEntity");
		expect(diagnostics[0].message).toContain("no primary key");
	});

	it("should not report entity with primary key", () => {
		const entity = makeEntity({
			columns: [makeColumn({ name: "id", isPrimary: true })],
		});
		const graph = makeGraph([entity]);
		const diagnostics = runSchemaRule(requirePrimaryKey, graph);

		expect(diagnostics).toHaveLength(0);
	});

	it("should not report entity with no columns (edge case)", () => {
		const entity = makeEntity({ columns: [] });
		const graph = makeGraph([entity]);
		const diagnostics = runSchemaRule(requirePrimaryKey, graph);

		expect(diagnostics).toHaveLength(1);
	});
});

// ── require-timestamps ──

describe("schema/require-timestamps", () => {
	it("should report entity without timestamp columns", () => {
		const entity = makeEntity({
			columns: [makeColumn({ name: "id", isPrimary: true })],
		});
		const graph = makeGraph([entity]);
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].message).toContain("no timestamp");
	});

	it("should not report entity with createdAt column", () => {
		const entity = makeEntity({
			columns: [
				makeColumn({ name: "id", isPrimary: true }),
				makeColumn({ name: "createdAt" }),
			],
		});
		const graph = makeGraph([entity]);
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(0);
	});

	it("should not report entity with created_at column (snake_case)", () => {
		const entity = makeEntity({
			columns: [
				makeColumn({ name: "id", isPrimary: true }),
				makeColumn({ name: "created_at" }),
			],
		});
		const graph = makeGraph([entity]);
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(0);
	});

	it("should detect TypeORM generated timestamp columns", () => {
		const entity = makeEntity({
			columns: [
				makeColumn({ name: "id", isPrimary: true }),
				makeColumn({
					name: "creationDate",
					type: "timestamp",
					isGenerated: true,
				}),
			],
		});
		const graph = makeGraph([entity], "typeorm");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(0);
	});

	it("should detect Prisma DateTime with @default(now())", () => {
		const entity = makeEntity({
			columns: [
				makeColumn({ name: "id", isPrimary: true }),
				makeColumn({
					name: "registeredAt",
					type: "DateTime",
					defaultValue: "now()",
				}),
			],
		});
		const graph = makeGraph([entity], "prisma");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(0);
	});
});

// ── require-cascade-rule ──

describe("schema/require-cascade-rule", () => {
	it("should report relation without onDelete", () => {
		const entity = makeEntity({
			relations: [makeRelation()],
		});
		const graph = makeGraph([entity]);
		const diagnostics = runSchemaRule(requireCascadeRule, graph);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].message).toContain("no explicit onDelete");
	});

	it("should not report relation with onDelete", () => {
		const entity = makeEntity({
			relations: [makeRelation({ onDelete: "CASCADE" })],
		});
		const graph = makeGraph([entity]);
		const diagnostics = runSchemaRule(requireCascadeRule, graph);

		expect(diagnostics).toHaveLength(0);
	});

	it("should skip one-to-many and many-to-many relations", () => {
		const entity = makeEntity({
			relations: [
				makeRelation({ type: "one-to-many" }),
				makeRelation({ type: "many-to-many", propertyName: "tags" }),
			],
		});
		const graph = makeGraph([entity]);
		const diagnostics = runSchemaRule(requireCascadeRule, graph);

		expect(diagnostics).toHaveLength(0);
	});
});
