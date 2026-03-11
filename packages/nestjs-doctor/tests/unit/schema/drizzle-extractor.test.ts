import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { extractSchema } from "../../../src/engine/schema/extract.js";

function createProject(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	return { project, paths };
}

describe("Drizzle Extractor", () => {
	it("should extract a basic pgTable with columns", () => {
		const { project, paths } = createProject({
			"users.ts": `
import { pgTable, integer, varchar } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar().notNull(),
  email: varchar().notNull().unique(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		expect(graph.entities.size).toBe(1);

		const users = graph.entities.get("users");
		expect(users).toBeDefined();
		expect(users!.name).toBe("users");
		expect(users!.tableName).toBe("users");
		expect(users!.columns).toHaveLength(3);

		const idCol = users!.columns.find((c) => c.name === "id");
		expect(idCol!.isPrimary).toBe(true);
		expect(idCol!.isGenerated).toBe(true);
		expect(idCol!.type).toBe("integer");

		const nameCol = users!.columns.find((c) => c.name === "name");
		expect(nameCol!.isNullable).toBe(false);

		const emailCol = users!.columns.find((c) => c.name === "email");
		expect(emailCol!.isNullable).toBe(false);
		expect(emailCol!.isUnique).toBe(true);
	});

	it("should extract a mysqlTable", () => {
		const { project, paths } = createProject({
			"users.ts": `
import { mysqlTable, int, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable('users', {
  id: int().primaryKey().autoincrement(),
  name: varchar({ length: 255 }).notNull(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		expect(graph.entities.size).toBe(1);

		const users = graph.entities.get("users");
		expect(users).toBeDefined();
		expect(users!.tableName).toBe("users");
		expect(users!.columns).toHaveLength(2);

		const idCol = users!.columns.find((c) => c.name === "id");
		expect(idCol!.isPrimary).toBe(true);
		expect(idCol!.isGenerated).toBe(true);
		expect(idCol!.type).toBe("int");
	});

	it("should extract a sqliteTable", () => {
		const { project, paths } = createProject({
			"users.ts": `
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable('users', {
  id: integer().primaryKey(),
  name: text().notNull(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		expect(graph.entities.size).toBe(1);

		const users = graph.entities.get("users");
		expect(users).toBeDefined();
		expect(users!.columns).toHaveLength(2);

		const idCol = users!.columns.find((c) => c.name === "id");
		expect(idCol!.isPrimary).toBe(true);
		expect(idCol!.type).toBe("integer");

		const nameCol = users!.columns.find((c) => c.name === "name");
		expect(nameCol!.isNullable).toBe(false);
		expect(nameCol!.type).toBe("text");
	});

	it("should extract column type from the base function name", () => {
		const { project, paths } = createProject({
			"users.ts": `
import { pgTable, integer, varchar, text, timestamp, boolean, uuid } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: uuid().primaryKey(),
  age: integer(),
  name: varchar(),
  bio: text(),
  createdAt: timestamp(),
  isActive: boolean(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		const users = graph.entities.get("users");

		expect(users!.columns.find((c) => c.name === "id")!.type).toBe("uuid");
		expect(users!.columns.find((c) => c.name === "age")!.type).toBe("integer");
		expect(users!.columns.find((c) => c.name === "name")!.type).toBe("varchar");
		expect(users!.columns.find((c) => c.name === "bio")!.type).toBe("text");
		expect(users!.columns.find((c) => c.name === "createdAt")!.type).toBe(
			"timestamp"
		);
		expect(users!.columns.find((c) => c.name === "isActive")!.type).toBe(
			"boolean"
		);
	});

	it("should mark columns as nullable by default", () => {
		const { project, paths } = createProject({
			"users.ts": `
import { pgTable, text } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  name: text(),
  email: text().notNull(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		const users = graph.entities.get("users");

		const nameCol = users!.columns.find((c) => c.name === "name");
		expect(nameCol!.isNullable).toBe(true);

		const emailCol = users!.columns.find((c) => c.name === "email");
		expect(emailCol!.isNullable).toBe(false);
	});

	it("should extract default values", () => {
		const { project, paths } = createProject({
			"users.ts": `
import { pgTable, integer, varchar, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: integer().primaryKey(),
  status: varchar().default('active').notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		const users = graph.entities.get("users");

		const statusCol = users!.columns.find((c) => c.name === "status");
		expect(statusCol!.defaultValue).toBe("active");

		const createdAtCol = users!.columns.find((c) => c.name === "createdAt");
		expect(createdAtCol!.defaultValue).toContain("now()");
	});

	it("should extract timestamp with defaultNow", () => {
		const { project, paths } = createProject({
			"users.ts": `
import { pgTable, integer, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: integer().primaryKey(),
  createdAt: timestamp().defaultNow().notNull(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		const users = graph.entities.get("users");

		const createdAtCol = users!.columns.find((c) => c.name === "createdAt");
		expect(createdAtCol!.type).toBe("timestamp");
		expect(createdAtCol!.defaultValue).toContain("now()");
	});

	it("should extract references as many-to-one relations", () => {
		const { project, paths } = createProject({
			"schema.ts": `
import { pgTable, integer, text } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: integer().primaryKey(),
  name: text().notNull(),
});

export const posts = pgTable('posts', {
  id: integer().primaryKey(),
  title: text().notNull(),
  authorId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		expect(graph.entities.size).toBe(2);
		expect(graph.relations).toHaveLength(1);

		const rel = graph.relations[0];
		expect(rel.fromEntity).toBe("posts");
		expect(rel.toEntity).toBe("users");
		expect(rel.type).toBe("many-to-one");
		expect(rel.onDelete).toBe("cascade");
		expect(rel.propertyName).toBe("authorId");
	});

	it("should extract references without onDelete", () => {
		const { project, paths } = createProject({
			"schema.ts": `
import { pgTable, integer, text } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: integer().primaryKey(),
});

export const posts = pgTable('posts', {
  id: integer().primaryKey(),
  authorId: integer().notNull().references(() => users.id),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		const rel = graph.relations[0];
		expect(rel).toBeDefined();
		expect(rel.toEntity).toBe("users");
		expect(rel.onDelete).toBeUndefined();
	});

	it("should extract nullable foreign key", () => {
		const { project, paths } = createProject({
			"schema.ts": `
import { pgTable, integer } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: integer().primaryKey(),
});

export const posts = pgTable('posts', {
  id: integer().primaryKey(),
  authorId: integer().references(() => users.id),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		const rel = graph.relations[0];
		expect(rel.isNullable).toBe(true);
	});

	it("should treat serial() as generated", () => {
		const { project, paths } = createProject({
			"users.ts": `
import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: serial().primaryKey(),
  name: text(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		const users = graph.entities.get("users");

		const idCol = users!.columns.find((c) => c.name === "id");
		expect(idCol!.isGenerated).toBe(true);
		expect(idCol!.type).toBe("serial");
	});

	it("should extract multiple tables from the same file", () => {
		const { project, paths } = createProject({
			"schema.ts": `
import { pgTable, integer, text } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: integer().primaryKey(),
  name: text(),
});

export const posts = pgTable('posts', {
  id: integer().primaryKey(),
  title: text(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		expect(graph.entities.size).toBe(2);
		expect(graph.entities.get("users")).toBeDefined();
		expect(graph.entities.get("posts")).toBeDefined();

		const users = graph.entities.get("users");
		const posts = graph.entities.get("posts");
		expect(users!.filePath).toBe(posts!.filePath);
	});

	it("should skip non-table variable declarations", () => {
		const { project, paths } = createProject({
			"schema.ts": `
import { pgTable, integer, text } from "drizzle-orm/pg-core";

const someConfig = { foo: "bar" };
const someFunction = () => {};
export const someValue = 42;

export const users = pgTable('users', {
  id: integer().primaryKey(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		expect(graph.entities.size).toBe(1);
		expect(graph.entities.get("users")).toBeDefined();
	});

	it("should handle columns without any modifiers", () => {
		const { project, paths } = createProject({
			"users.ts": `
import { pgTable, text } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  name: text(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		const users = graph.entities.get("users");
		const nameCol = users!.columns.find((c) => c.name === "name");

		expect(nameCol!.type).toBe("text");
		expect(nameCol!.isNullable).toBe(true);
		expect(nameCol!.isPrimary).toBe(false);
		expect(nameCol!.isGenerated).toBe(false);
		expect(nameCol!.isUnique).toBe(false);
	});

	it("should extract self-referencing foreign key", () => {
		const { project, paths } = createProject({
			"categories.ts": `
import { pgTable, integer, text } from "drizzle-orm/pg-core";

export const categories = pgTable('categories', {
  id: integer().primaryKey(),
  name: text().notNull(),
  parentId: integer().references(() => categories.id),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		expect(graph.entities.size).toBe(1);

		const rel = graph.relations[0];
		expect(rel.fromEntity).toBe("categories");
		expect(rel.toEntity).toBe("categories");
		expect(rel.type).toBe("many-to-one");
	});

	it("should handle old Drizzle syntax with column name string arg", () => {
		const { project, paths } = createProject({
			"users.ts": `
import { pgTable, serial, varchar } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name').notNull(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		const users = graph.entities.get("users");
		expect(users).toBeDefined();
		expect(users!.columns).toHaveLength(2);

		const idCol = users!.columns.find((c) => c.name === "id");
		expect(idCol!.isPrimary).toBe(true);
		expect(idCol!.isGenerated).toBe(true);
		expect(idCol!.type).toBe("serial");

		const nameCol = users!.columns.find((c) => c.name === "name");
		expect(nameCol!.isNullable).toBe(false);
		expect(nameCol!.type).toBe("varchar");
	});

	it("should extract indexes from third pgTable argument", () => {
		const { project, paths } = createProject({
			"users.ts": `
import { pgTable, integer, varchar, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: integer().primaryKey(),
  email: varchar().notNull(),
}, (table) => [uniqueIndex('email_idx').on(table.email)]);`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		const users = graph.entities.get("users");

		expect(users!.indexes).toBeDefined();
		expect(users!.indexes).toHaveLength(1);
		expect(users!.indexes![0].isUnique).toBe(true);
		expect(users!.indexes![0].columns).toEqual(["email"]);

		const emailCol = users!.columns.find((c) => c.name === "email");
		expect(emailCol!.hasIndex).toBe(true);
	});

	it("should extract a complex e-commerce schema", () => {
		const { project, paths } = createProject({
			"schema.ts": `
import { pgTable, integer, varchar, text, timestamp, serial, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: serial().primaryKey(),
  email: varchar().notNull().unique(),
  name: varchar(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: serial().primaryKey(),
  name: varchar().notNull(),
  parentId: integer().references(() => categories.id),
});

export const posts = pgTable('posts', {
  id: serial().primaryKey(),
  title: varchar().notNull(),
  content: text(),
  authorId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  categoryId: integer().references(() => categories.id),
});

export const orders = pgTable('orders', {
  id: serial().primaryKey(),
  userId: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar().default('pending').notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: serial().primaryKey(),
  orderId: integer().notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productName: varchar().notNull(),
  quantity: integer().notNull(),
  price: integer().notNull(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");

		// 5 entities
		expect(graph.entities.size).toBe(5);

		// Table names
		expect(graph.entities.get("users")!.tableName).toBe("users");
		expect(graph.entities.get("categories")!.tableName).toBe("categories");
		expect(graph.entities.get("orderItems")!.tableName).toBe("order_items");

		// Users columns
		const users = graph.entities.get("users")!;
		const userIdCol = users.columns.find((c) => c.name === "id");
		expect(userIdCol!.isPrimary).toBe(true);
		expect(userIdCol!.isGenerated).toBe(true);
		expect(userIdCol!.type).toBe("serial");

		const emailCol = users.columns.find((c) => c.name === "email");
		expect(emailCol!.isUnique).toBe(true);
		expect(emailCol!.isNullable).toBe(false);

		const nameCol = users.columns.find((c) => c.name === "name");
		expect(nameCol!.isNullable).toBe(true);

		const createdAtCol = users.columns.find((c) => c.name === "createdAt");
		expect(createdAtCol!.type).toBe("timestamp");
		expect(createdAtCol!.defaultValue).toContain("now()");

		// Category self-relation
		const cat = graph.entities.get("categories")!;
		const catSelfRel = cat.relations.find((r) => r.toEntity === "categories");
		expect(catSelfRel).toBeDefined();
		expect(catSelfRel!.type).toBe("many-to-one");
		expect(catSelfRel!.isNullable).toBe(true);

		// Posts relations
		const posts = graph.entities.get("posts")!;
		expect(posts.relations).toHaveLength(2);

		const postUserRel = posts.relations.find((r) => r.toEntity === "users");
		expect(postUserRel!.onDelete).toBe("cascade");
		expect(postUserRel!.isNullable).toBe(false);

		const postCatRel = posts.relations.find((r) => r.toEntity === "categories");
		expect(postCatRel!.isNullable).toBe(true);

		// Order onDelete
		const orders = graph.entities.get("orders")!;
		const orderUserRel = orders.relations.find((r) => r.toEntity === "users");
		expect(orderUserRel!.onDelete).toBe("cascade");

		// Order default value
		const statusCol = orders.columns.find((c) => c.name === "status");
		expect(statusCol!.defaultValue).toBe("pending");

		// OrderItems cascade
		const orderItems = graph.entities.get("orderItems")!;
		const orderItemOrderRel = orderItems.relations.find(
			(r) => r.toEntity === "orders"
		);
		expect(orderItemOrderRel!.onDelete).toBe("cascade");

		// Total relations: categories(1) + posts(2) + orders(1) + orderItems(1) = 5
		expect(graph.relations).toHaveLength(5);
	});
});
