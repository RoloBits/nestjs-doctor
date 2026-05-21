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

describe("MikroORM Extractor", () => {
	it("should extract a basic entity with @PrimaryKey and @Property", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @Property({ nullable: true })
  email?: string;
}`,
		});

		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		expect(graph.entities.size).toBe(1);

		const user = graph.entities.get("User");
		expect(user).toBeDefined();
		expect(user?.name).toBe("User");
		expect(user?.tableName).toBe("User");
		expect(user?.columns).toHaveLength(3);

		const idCol = user?.columns.find((c) => c.name === "id");
		expect(idCol?.isPrimary).toBe(true);

		const nameCol = user?.columns.find((c) => c.name === "name");
		expect(nameCol?.isNullable).toBe(false);

		const emailCol = user?.columns.find((c) => c.name === "email");
		expect(emailCol?.isNullable).toBe(true);
	});

	it("should extract OneToMany / ManyToOne with arrow callback target", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryKey, OneToMany, Collection } from "@mikro-orm/core";
import { Post } from "./post.entity";

@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @OneToMany(() => Post, (post) => post.user)
  posts = new Collection<Post>(this);
}`,
			"post.entity.ts": `
import { Entity, PrimaryKey, ManyToOne } from "@mikro-orm/core";
import { User } from "./user.entity";

@Entity()
export class Post {
  @PrimaryKey()
  id!: number;

  @ManyToOne(() => User)
  user!: User;
}`,
		});

		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		expect(graph.entities.size).toBe(2);
		expect(graph.relations).toHaveLength(2);

		const userRel = graph.relations.find(
			(r) => r.fromEntity === "User" && r.toEntity === "Post"
		);
		expect(userRel?.type).toBe("one-to-many");
		expect(userRel?.propertyName).toBe("posts");

		const postRel = graph.relations.find(
			(r) => r.fromEntity === "Post" && r.toEntity === "User"
		);
		expect(postRel?.type).toBe("many-to-one");
	});

	it("should fall back to Collection<T> / Ref<T> type when callback is missing", () => {
		const { project, paths } = createProject({
			"author.entity.ts": `
import { Entity, PrimaryKey, OneToMany, ManyToOne, Collection, Ref } from "@mikro-orm/core";
import { Book } from "./book.entity";
import { Publisher } from "./publisher.entity";

@Entity()
export class Author {
  @PrimaryKey()
  id!: number;

  @OneToMany({ mappedBy: "author" })
  books: Collection<Book> = new Collection<Book>(this);

  @ManyToOne()
  publisher!: Ref<Publisher>;
}`,
		});

		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		const author = graph.entities.get("Author");
		expect(author?.relations).toHaveLength(2);

		const booksRel = author?.relations.find((r) => r.propertyName === "books");
		expect(booksRel?.toEntity).toBe("Book");
		expect(booksRel?.type).toBe("one-to-many");

		const publisherRel = author?.relations.find(
			(r) => r.propertyName === "publisher"
		);
		expect(publisherRel?.toEntity).toBe("Publisher");
		expect(publisherRel?.type).toBe("many-to-one");
	});

	it("should handle OneToOne and ManyToMany", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryKey, OneToOne, ManyToMany, Collection } from "@mikro-orm/core";
import { Profile } from "./profile.entity";
import { Role } from "./role.entity";

@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @OneToOne(() => Profile)
  profile!: Profile;

  @ManyToMany(() => Role)
  roles = new Collection<Role>(this);
}`,
		});

		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		const user = graph.entities.get("User");
		expect(user?.relations).toHaveLength(2);

		const profileRel = user?.relations.find((r) => r.toEntity === "Profile");
		expect(profileRel?.type).toBe("one-to-one");

		const roleRel = user?.relations.find((r) => r.toEntity === "Role");
		expect(roleRel?.type).toBe("many-to-many");
	});

	it("should extract deleteRule (v6) and onDelete (legacy) from ManyToOne", () => {
		const { project, paths } = createProject({
			"post.entity.ts": `
import { Entity, PrimaryKey, ManyToOne } from "@mikro-orm/core";
import { User } from "./user.entity";

@Entity()
export class Post {
  @PrimaryKey()
  id!: number;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: User;
}

@Entity()
export class Comment {
  @PrimaryKey()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'cascade' })
  user!: User;
}`,
		});

		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		const post = graph.entities.get("Post");
		expect(post?.relations[0].onDelete).toBe("cascade");

		const comment = graph.entities.get("Comment");
		expect(comment?.relations[0].onDelete).toBe("cascade");
	});

	it("should extract self-referencing relation", () => {
		const { project, paths } = createProject({
			"category.entity.ts": `
import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection } from "@mikro-orm/core";

@Entity()
export class Category {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @ManyToOne(() => Category, { nullable: true })
  parent?: Category;

  @OneToMany(() => Category, (c) => c.parent)
  children = new Collection<Category>(this);
}`,
		});

		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		const cat = graph.entities.get("Category");
		expect(cat?.relations).toHaveLength(2);
		for (const rel of cat?.relations ?? []) {
			expect(rel.fromEntity).toBe("Category");
			expect(rel.toEntity).toBe("Category");
		}
		const parentRel = cat?.relations.find((r) => r.type === "many-to-one");
		expect(parentRel?.isNullable).toBe(true);
	});

	it("should extract custom table name from @Entity({ tableName })", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryKey } from "@mikro-orm/core";

@Entity({ tableName: "users" })
export class User {
  @PrimaryKey()
  id!: number;
}`,
		});
		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		expect(graph.entities.get("User")?.tableName).toBe("users");
	});

	it("should extract @Enum as a column with type 'enum'", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryKey, Enum } from "@mikro-orm/core";

enum Role { Admin = "admin", User = "user" }

@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @Enum(() => Role)
  role!: Role;
}`,
		});
		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		const user = graph.entities.get("User");
		const roleCol = user?.columns.find((c) => c.name === "role");
		expect(roleCol?.type).toBe("enum");
	});

	it("should extract @Property defaultRaw and mark onCreate/onUpdate as generated", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @Property({ defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ onUpdate: () => new Date() })
  updatedAt!: Date;
}`,
		});
		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		const user = graph.entities.get("User");

		const createdAt = user?.columns.find((c) => c.name === "createdAt");
		expect(createdAt?.defaultValue).toBe('"now()"');

		const updatedAt = user?.columns.find((c) => c.name === "updatedAt");
		expect(updatedAt?.isGenerated).toBe(true);
	});

	it("should extract property-level @Unique as a unique index", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryKey, Property, Unique } from "@mikro-orm/core";

@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @Unique()
  @Property()
  email!: string;
}`,
		});
		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		const user = graph.entities.get("User");
		const emailCol = user?.columns.find((c) => c.name === "email");
		expect(emailCol?.hasIndex).toBe(true);
		const emailIdx = user?.indexes?.find((i) => i.columns.includes("email"));
		expect(emailIdx?.isUnique).toBe(true);
	});

	it("should extract class-level @Index({ properties: [...] }) as composite index", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryKey, Property, Index } from "@mikro-orm/core";

@Entity()
@Index({ properties: ["email", "name"] })
export class User {
  @PrimaryKey()
  id!: number;

  @Property()
  email!: string;

  @Property()
  name!: string;
}`,
		});
		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		const user = graph.entities.get("User");
		const composite = user?.indexes?.find((i) => i.columns.length === 2);
		expect(composite).toBeDefined();
		expect(composite?.columns).toEqual(["email", "name"]);

		const emailCol = user?.columns.find((c) => c.name === "email");
		expect(emailCol?.hasIndex).toBe(true);
		const idCol = user?.columns.find((c) => c.name === "id");
		expect(idCol?.hasIndex).toBeUndefined();
	});

	it("should skip classes without @Entity decorator", () => {
		const { project, paths } = createProject({
			"user.service.ts": `
import { Injectable } from "@nestjs/common";

@Injectable()
export class UserService { name!: string; }`,
		});
		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		expect(graph.entities.size).toBe(0);
	});

	it("should inherit columns from @Entity({ abstract: true }) base classes", () => {
		// BaseEntity holds id + createdAt; User extends it and adds name.
		// Without inheritance, User would have only `name` and would fire
		// schema/require-primary-key + schema/require-timestamps false-positives.
		const { project, paths } = createProject({
			"base.entity.ts": `
import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ abstract: true })
export class BaseEntity {
  @PrimaryKey()
  id!: number;

  @Property({ type: "Date", defaultRaw: "now()" })
  createdAt!: Date;
}`,
			"user.entity.ts": `
import { Entity, Property } from "@mikro-orm/core";
import { BaseEntity } from "./base.entity";

@Entity()
export class User extends BaseEntity {
  @Property()
  name!: string;
}`,
		});
		const graph = extractSchema(project, paths, "mikro-orm", "/test");

		expect(graph.entities.has("BaseEntity")).toBe(false);
		const user = graph.entities.get("User");
		expect(user).toBeDefined();

		const colNames = user?.columns.map((c) => c.name).sort();
		expect(colNames).toEqual(["createdAt", "id", "name"]);

		const idCol = user?.columns.find((c) => c.name === "id");
		expect(idCol?.isPrimary).toBe(true);

		const createdAt = user?.columns.find((c) => c.name === "createdAt");
		expect(createdAt?.type).toBe("Date");
		expect(createdAt?.defaultValue).toBe('"now()"');
	});

	it("should inherit through multi-level abstract bases", () => {
		const { project, paths } = createProject({
			"timestamped.entity.ts": `
import { Entity, Property } from "@mikro-orm/core";

@Entity({ abstract: true })
export class Timestamped {
  @Property({ type: "Date", defaultRaw: "now()" })
  createdAt!: Date;
}`,
			"identified.entity.ts": `
import { Entity, PrimaryKey } from "@mikro-orm/core";
import { Timestamped } from "./timestamped.entity";

@Entity({ abstract: true })
export class Identified extends Timestamped {
  @PrimaryKey()
  id!: number;
}`,
			"user.entity.ts": `
import { Entity, Property } from "@mikro-orm/core";
import { Identified } from "./identified.entity";

@Entity()
export class User extends Identified {
  @Property()
  name!: string;
}`,
		});
		const graph = extractSchema(project, paths, "mikro-orm", "/test");

		const user = graph.entities.get("User");
		expect(user).toBeDefined();
		const colNames = user?.columns.map((c) => c.name).sort();
		expect(colNames).toEqual(["createdAt", "id", "name"]);
	});

	it("should inherit relations from abstract base classes", () => {
		// Confirms require-cascade-rule sees inherited @ManyToOne and reads its
		// deleteRule correctly when the relation lives on the abstract parent.
		const { project, paths } = createProject({
			"owned.entity.ts": `
import { Entity, PrimaryKey, ManyToOne } from "@mikro-orm/core";
import { User } from "./user.entity";

@Entity({ abstract: true })
export class Owned {
  @PrimaryKey()
  id!: number;

  @ManyToOne(() => User, { deleteRule: "cascade" })
  owner!: User;
}`,
			"user.entity.ts": `
import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity()
export class User {
  @PrimaryKey()
  id!: number;

  @Property()
  email!: string;
}`,
			"post.entity.ts": `
import { Entity, Property } from "@mikro-orm/core";
import { Owned } from "./owned.entity";

@Entity()
export class Post extends Owned {
  @Property()
  title!: string;
}`,
		});
		const graph = extractSchema(project, paths, "mikro-orm", "/test");

		const post = graph.entities.get("Post");
		expect(post).toBeDefined();
		expect(post?.relations).toHaveLength(1);
		const ownerRel = post?.relations[0];
		expect(ownerRel?.fromEntity).toBe("Post");
		expect(ownerRel?.toEntity).toBe("User");
		expect(ownerRel?.onDelete).toBe("cascade");
	});

	it("should inherit class-level @Index({ properties }) from abstract base", () => {
		const { project, paths } = createProject({
			"base.entity.ts": `
import { Entity, PrimaryKey, Property, Index } from "@mikro-orm/core";

@Entity({ abstract: true })
@Index({ properties: ["id", "createdAt"] })
export class BaseEntity {
  @PrimaryKey()
  id!: number;

  @Property({ type: "Date", defaultRaw: "now()" })
  createdAt!: Date;
}`,
			"user.entity.ts": `
import { Entity, Property } from "@mikro-orm/core";
import { BaseEntity } from "./base.entity";

@Entity()
export class User extends BaseEntity {
  @Property()
  name!: string;
}`,
		});
		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		const user = graph.entities.get("User");
		const composite = user?.indexes?.find((i) => i.columns.length === 2);
		expect(composite).toBeDefined();
		expect(composite?.columns).toEqual(["id", "createdAt"]);
	});

	it("should NOT inherit from concrete (non-abstract) base classes", () => {
		// Single-table inheritance: parent IS a row in the graph; child should
		// only carry its own columns or we'd double-count the parent's columns
		// across parent + child rows.
		const { project, paths } = createProject({
			"animal.entity.ts": `
import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity()
export class Animal {
  @PrimaryKey()
  id!: number;

  @Property()
  species!: string;
}`,
			"dog.entity.ts": `
import { Entity, Property } from "@mikro-orm/core";
import { Animal } from "./animal.entity";

@Entity()
export class Dog extends Animal {
  @Property()
  breed!: string;
}`,
		});
		const graph = extractSchema(project, paths, "mikro-orm", "/test");

		const dog = graph.entities.get("Dog");
		expect(dog).toBeDefined();
		const colNames = dog?.columns.map((c) => c.name).sort();
		expect(colNames).toEqual(["breed"]);
	});

	it("should skip @Entity({ abstract: true }) base classes", () => {
		const { project, paths } = createProject({
			"base.entity.ts": `
import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ abstract: true })
export class BaseEntity {
  @PrimaryKey()
  id!: number;

  @Property({ defaultRaw: "now()" })
  createdAt!: Date;
}`,
			"user.entity.ts": `
import { Entity, Property } from "@mikro-orm/core";
import { BaseEntity } from "./base.entity";

@Entity()
export class User extends BaseEntity {
  @Property()
  name!: string;
}`,
		});
		const graph = extractSchema(project, paths, "mikro-orm", "/test");
		expect(graph.entities.has("BaseEntity")).toBe(false);
		expect(graph.entities.has("User")).toBe(true);
	});

	it("should return empty graph for null ORM", () => {
		const { project, paths } = createProject({
			"user.entity.ts": "export class User {}",
		});
		const graph = extractSchema(project, paths, null, "/test");
		expect(graph.entities.size).toBe(0);
	});
});
