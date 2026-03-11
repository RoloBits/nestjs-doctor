import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { SchemaGraph } from "../../../src/common/schema.js";
import {
	extractSchema,
	serializeSchemaGraph,
	updateSchemaForFile,
} from "../../../src/engine/schema/extract.js";

function createProject(files: Record<string, string>) {
	const project = new Project({ useInMemoryFileSystem: true });
	const paths: string[] = [];
	for (const [name, code] of Object.entries(files)) {
		project.createSourceFile(name, code);
		paths.push(name);
	}
	return { project, paths };
}

describe("Extract Orchestration", () => {
	it("updateSchemaForFile should add a new entity incrementally", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @OneToMany(() => Post, p => p.user)
  posts: Post[];
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		expect(graph.entities.size).toBe(1);

		// Add a new file
		project.createSourceFile(
			"post.entity.ts",
			`
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";

@Entity()
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @ManyToOne(() => User, u => u.posts)
  user: User;
}`
		);

		updateSchemaForFile(graph, project, "/post.entity.ts", "/test");

		expect(graph.entities.size).toBe(2);
		expect(graph.entities.get("Post")).toBeDefined();
		expect(graph.relations.length).toBeGreaterThanOrEqual(2);
	});

	it("updateSchemaForFile should remove entities when file no longer has @Entity", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;
}`,
			"post.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		expect(graph.entities.size).toBe(2);

		// Replace post file with a non-entity class
		const postFile = project.getSourceFile("post.entity.ts");
		postFile!.replaceWithText("export class PostService {}");

		updateSchemaForFile(graph, project, "/post.entity.ts", "/test");

		expect(graph.entities.size).toBe(1);
		expect(graph.entities.get("User")).toBeDefined();
		expect(graph.entities.get("Post")).toBeUndefined();
		expect(graph.relations).toHaveLength(0);
	});

	it("updateSchemaForFile should modify an existing entity", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		expect(graph.entities.get("User")!.columns).toHaveLength(2);

		// Add a new column
		const userFile = project.getSourceFile("user.entity.ts");
		userFile!.replaceWithText(`
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  email: string;
}`);

		updateSchemaForFile(graph, project, "/user.entity.ts", "/test");

		expect(graph.entities.get("User")!.columns).toHaveLength(3);
		const emailCol = graph.entities
			.get("User")!
			.columns.find((c) => c.name === "email");
		expect(emailCol).toBeDefined();
	});

	it("updateSchemaForFile should skip re-extraction for Prisma (supportsIncrementalUpdate: false)", () => {
		// Build a graph as if it came from Prisma
		const graph: SchemaGraph = {
			entities: new Map([
				[
					"User",
					{
						name: "User",
						tableName: "User",
						filePath: "prisma/schema.prisma",
						columns: [
							{
								name: "id",
								type: "Int",
								isPrimary: true,
								isNullable: false,
								isGenerated: true,
								isUnique: false,
							},
						],
						relations: [],
					},
				],
			]),
			relations: [],
			orm: "prisma",
		};

		const project = new Project({ useInMemoryFileSystem: true });
		updateSchemaForFile(graph, project, "prisma/schema.prisma", "/test");

		// Entity should be removed (it was from that file) but NOT re-extracted
		expect(graph.entities.size).toBe(0);
		expect(graph.relations).toHaveLength(0);
	});

	it("serializeSchemaGraph should convert Map to array", () => {
		const graph: SchemaGraph = {
			entities: new Map([
				[
					"User",
					{
						name: "User",
						tableName: "users",
						filePath: "user.ts",
						columns: [],
						relations: [
							{
								type: "one-to-many",
								fromEntity: "User",
								toEntity: "Post",
								propertyName: "posts",
								isNullable: false,
							},
						],
					},
				],
				[
					"Post",
					{
						name: "Post",
						tableName: "posts",
						filePath: "post.ts",
						columns: [],
						relations: [
							{
								type: "many-to-one",
								fromEntity: "Post",
								toEntity: "User",
								propertyName: "user",
								isNullable: false,
							},
						],
					},
				],
			]),
			relations: [
				{
					type: "one-to-many",
					fromEntity: "User",
					toEntity: "Post",
					propertyName: "posts",
					isNullable: false,
				},
				{
					type: "many-to-one",
					fromEntity: "Post",
					toEntity: "User",
					propertyName: "user",
					isNullable: false,
				},
			],
			orm: "typeorm",
		};

		const serialized = serializeSchemaGraph(graph);

		expect(Array.isArray(serialized.entities)).toBe(true);
		expect(serialized.entities).toHaveLength(2);
		expect(serialized.orm).toBe("typeorm");
		expect(serialized.relations).toHaveLength(2);

		const names = serialized.entities.map((e) => e.name);
		expect(names).toContain("User");
		expect(names).toContain("Post");
	});

	it("updateSchemaForFile should add a new Drizzle entity incrementally", () => {
		const { project, paths } = createProject({
			"users.ts": `
import { pgTable, integer, text } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: integer().primaryKey(),
  name: text().notNull(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		expect(graph.entities.size).toBe(1);

		project.createSourceFile(
			"posts.ts",
			`
import { pgTable, integer, text } from "drizzle-orm/pg-core";

export const posts = pgTable('posts', {
  id: integer().primaryKey(),
  title: text().notNull(),
  authorId: integer().references(() => users.id),
});`
		);

		updateSchemaForFile(graph, project, "/posts.ts", "/test");

		expect(graph.entities.size).toBe(2);
		expect(graph.entities.get("posts")).toBeDefined();
		expect(graph.relations).toHaveLength(1);
	});

	it("updateSchemaForFile should remove Drizzle entities when file changes", () => {
		const { project, paths } = createProject({
			"users.ts": `
import { pgTable, integer, text } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: integer().primaryKey(),
  name: text().notNull(),
});`,
			"posts.ts": `
import { pgTable, integer, text } from "drizzle-orm/pg-core";

export const posts = pgTable('posts', {
  id: integer().primaryKey(),
  title: text().notNull(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		expect(graph.entities.size).toBe(2);

		const postFile = project.getSourceFile("posts.ts");
		postFile!.replaceWithText("export const config = {};");

		updateSchemaForFile(graph, project, "/posts.ts", "/test");

		expect(graph.entities.size).toBe(1);
		expect(graph.entities.get("users")).toBeDefined();
		expect(graph.entities.get("posts")).toBeUndefined();
		expect(graph.relations).toHaveLength(0);
	});

	it("updateSchemaForFile should modify existing Drizzle entity", () => {
		const { project, paths } = createProject({
			"users.ts": `
import { pgTable, integer, text } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: integer().primaryKey(),
  name: text().notNull(),
});`,
		});

		const graph = extractSchema(project, paths, "drizzle", "/test");
		expect(graph.entities.get("users")!.columns).toHaveLength(2);

		const userFile = project.getSourceFile("users.ts");
		userFile!.replaceWithText(`
import { pgTable, integer, text, varchar } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: integer().primaryKey(),
  name: text().notNull(),
  email: varchar().notNull().unique(),
});`);

		updateSchemaForFile(graph, project, "/users.ts", "/test");

		expect(graph.entities.get("users")!.columns).toHaveLength(3);
		const emailCol = graph.entities
			.get("users")!
			.columns.find((c) => c.name === "email");
		expect(emailCol).toBeDefined();
		expect(emailCol!.isUnique).toBe(true);
	});

	it("updateSchemaForFile should handle multiple entities from same file", () => {
		const { project, paths } = createProject({
			"entities.ts": `
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;
}

@Entity()
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		expect(graph.entities.size).toBe(2);

		// Update file to have only one entity
		const file = project.getSourceFile("entities.ts");
		file!.replaceWithText(`
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;
}`);

		updateSchemaForFile(graph, project, "/entities.ts", "/test");

		expect(graph.entities.size).toBe(1);
		expect(graph.entities.get("User")).toBeDefined();
		expect(graph.entities.get("Post")).toBeUndefined();
	});
});
