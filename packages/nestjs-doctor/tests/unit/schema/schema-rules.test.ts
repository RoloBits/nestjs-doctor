import { Project } from "ts-morph";
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
import { extractSchema } from "../../../src/engine/schema/extract.js";

const TIMESTAMP_MESSAGE_REGEX = /timestamp/;

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

// ── require-primary-key vs MikroORM relation primary keys (issue #294) ──

function createProject(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	return { project, paths };
}

const RELATION_PK_FILES = {
	"user.entity.ts": `
import { Entity, ManyToOne, OneToOne, PrimaryKey, Property, Ref, Rel } from "@mikro-orm/core";

@Entity()
export class User {
  @PrimaryKey()
  id!: number;
}

@Entity({ tableName: "user_bases" })
export class UserBases {
  @ManyToOne(() => User, { ref: true, fieldName: "user_id", primary: true })
  user!: Ref<User>;

  @ManyToOne(() => User, { ref: true, fieldName: "base_id", primary: true })
  base!: Ref<User>;
}

@Entity({ tableName: "user_profiles" })
export class UserProfile {
  @OneToOne(() => User, { ref: true, fieldName: "user_id", primary: true })
  user!: Ref<User>;
}

@Entity({ tableName: "order_items" })
export class OrderItem {
  @ManyToOne({ primary: true })
  order!: Rel<User>;

  @Property({ default: 1 })
  amount!: number;
}

@Entity({ tableName: "event_details" })
export class EventDetail {
  @ManyToOne(() => User, { fieldName: "weekday_id", primary: true })
  weekday!: Rel<User>;

  @PrimaryKey()
  slot!: string;
}

@Entity({ tableName: "keyless_things" })
export class KeylessThing {
  @ManyToOne(() => User)
  user!: Rel<User>;

  @Property()
  label!: string;
}`,
};

describe("require-primary-key with MikroORM relation primary keys (issue #294)", () => {
	it("should not report entities whose primary keys come from relations", () => {
		const { project, paths } = createProject(RELATION_PK_FILES);
		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		const diagnostics = runSchemaRule(requirePrimaryKey, graph);

		const relationKeyed = [
			"UserBases",
			"UserProfile",
			"OrderItem",
			"EventDetail",
		];
		expect(diagnostics.filter((d) => relationKeyed.includes(d.entity))).toEqual(
			[]
		);
	});

	it("should still report KeylessThing as missing a primary key", () => {
		const { project, paths } = createProject(RELATION_PK_FILES);
		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		const diagnostics = runSchemaRule(requirePrimaryKey, graph);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].entity).toBe("KeylessThing");
	});
});

// ── require-timestamps ──

describe("schema/require-timestamps", () => {
	it("should report entity without timestamp columns", () => {
		const entity = makeEntity({
			columns: [
				makeColumn({ name: "id", isPrimary: true }),
				makeColumn({ name: "email" }),
			],
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

	it("should detect Drizzle timestamp with defaultNow()", () => {
		const entity = makeEntity({
			columns: [
				makeColumn({ name: "id", isPrimary: true }),
				makeColumn({
					name: "registeredAt",
					type: "timestamp",
					defaultValue: "now()",
				}),
			],
		});
		const graph = makeGraph([entity], "drizzle");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(0);
	});

	it("should detect Drizzle createdAt by column name", () => {
		const entity = makeEntity({
			columns: [
				makeColumn({ name: "id", isPrimary: true }),
				makeColumn({ name: "createdAt", type: "timestamp" }),
			],
		});
		const graph = makeGraph([entity], "drizzle");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(0);
	});

	it("should report Drizzle entity without timestamp columns", () => {
		const entity = makeEntity({
			columns: [
				makeColumn({ name: "id", isPrimary: true }),
				makeColumn({ name: "name", type: "text" }),
			],
		});
		const graph = makeGraph([entity], "drizzle");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(1);
	});

	// `registeredAt` / `lastSeenAt` deliberately bypass the name-based
	// shortcut on lines 10-12 of require-timestamps.ts so the new
	// MikroORM branch is actually exercised.
	it("should not report MikroORM entity with defaultRaw='now()' timestamp", () => {
		const entity = makeEntity({
			columns: [
				makeColumn({ name: "id", isPrimary: true }),
				makeColumn({
					name: "registeredAt",
					type: "Date",
					defaultValue: '"now()"',
				}),
			],
		});
		const graph = makeGraph([entity], "mikro-orm");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(0);
	});

	it("should not report MikroORM entity with onUpdate-driven generated timestamp", () => {
		const entity = makeEntity({
			columns: [
				makeColumn({ name: "id", isPrimary: true }),
				makeColumn({
					name: "lastSeenAt",
					type: "Date",
					isGenerated: true,
				}),
			],
		});
		const graph = makeGraph([entity], "mikro-orm");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(0);
	});

	it("should report MikroORM entity without any timestamp column", () => {
		const entity = makeEntity({
			columns: [
				makeColumn({ name: "id", isPrimary: true }),
				makeColumn({ name: "name", type: "string" }),
			],
		});
		const graph = makeGraph([entity], "mikro-orm");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].message).toMatch(TIMESTAMP_MESSAGE_REGEX);
	});

	it("should NOT treat MikroORM UUID @PrimaryKey({ onCreate }) as a timestamp", () => {
		// Guards against false-negatives: a UUID-on-create column has
		// isGenerated=true but type !== Date. The branch must gate on type,
		// not just isGenerated.
		const entity = makeEntity({
			columns: [
				makeColumn({
					name: "id",
					type: "string",
					isPrimary: true,
					isGenerated: true,
				}),
				makeColumn({ name: "name", type: "string" }),
			],
		});
		const graph = makeGraph([entity], "mikro-orm");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(1);
	});

	it("skips a Prisma join table whose columns are all composite-@@id FKs", () => {
		const entity = makeEntity({
			name: "PostTag",
			columns: [
				makeColumn({ name: "postId", isPrimary: true }),
				makeColumn({ name: "tagId", isPrimary: true }),
			],
			relations: [
				makeRelation({ propertyName: "post", toEntity: "Post" }),
				makeRelation({ propertyName: "tag", toEntity: "Tag" }),
			],
		});
		const graph = makeGraph([entity], "prisma");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(0);
	});

	it("skips a TypeORM join entity with only @PrimaryColumn FKs", () => {
		const entity = makeEntity({
			name: "PostTag",
			columns: [
				makeColumn({ name: "postId", isPrimary: true }),
				makeColumn({ name: "tagId", isPrimary: true }),
			],
			relations: [
				makeRelation({ propertyName: "post", toEntity: "Post" }),
				makeRelation({ propertyName: "tag", toEntity: "Tag" }),
			],
		});
		const graph = makeGraph([entity], "typeorm");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(0);
	});

	it("skips a Drizzle join table whose only columns are references()", () => {
		const entity = makeEntity({
			name: "PostTag",
			columns: [
				makeColumn({ name: "postId", isPrimary: false }),
				makeColumn({ name: "tagId", isPrimary: false }),
			],
			relations: [
				makeRelation({ propertyName: "postId", toEntity: "Post" }),
				makeRelation({ propertyName: "tagId", toEntity: "Tag" }),
			],
		});
		const graph = makeGraph([entity], "drizzle");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(0);
	});

	it("skips a MikroORM entity whose only column is a primary: true relation FK", () => {
		const entity = makeEntity({
			name: "PostTag",
			columns: [makeColumn({ name: "user", isPrimary: true })],
			relations: [makeRelation({ propertyName: "user", toEntity: "User" })],
		});
		const graph = makeGraph([entity], "mikro-orm");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(0);
	});

	it("still reports a join table that carries a payload column", () => {
		const entity = makeEntity({
			name: "PostTag",
			columns: [
				makeColumn({ name: "postId", isPrimary: false }),
				makeColumn({ name: "tagId", isPrimary: false }),
				makeColumn({ name: "role", type: "text" }),
			],
			relations: [
				makeRelation({ propertyName: "postId", toEntity: "Post" }),
				makeRelation({ propertyName: "tagId", toEntity: "Tag" }),
			],
		});
		const graph = makeGraph([entity], "drizzle");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].entity).toBe("PostTag");
	});

	it("still reports an ordinary entity with a FK and a data column", () => {
		const entity = makeEntity({
			name: "Post",
			columns: [
				makeColumn({ name: "id", isPrimary: true }),
				makeColumn({ name: "title", type: "text" }),
				makeColumn({ name: "authorId" }),
			],
			relations: [makeRelation({ propertyName: "author", toEntity: "User" })],
		});
		const graph = makeGraph([entity], "typeorm");
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].entity).toBe("Post");
	});

	it("reports at info severity", () => {
		const entity = makeEntity({
			columns: [
				makeColumn({ name: "id", isPrimary: true }),
				makeColumn({ name: "email" }),
			],
		});
		const graph = makeGraph([entity]);
		const diagnostics = runSchemaRule(requireTimestamps, graph);

		expect(diagnostics[0].severity).toBe("info");
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
