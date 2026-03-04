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

describe("TypeORM Extractor", () => {
	it("should extract a basic entity with columns", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  email: string;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		expect(graph.entities.size).toBe(1);

		const user = graph.entities.get("User");
		expect(user).toBeDefined();
		expect(user!.name).toBe("User");
		expect(user!.tableName).toBe("User");
		expect(user!.columns).toHaveLength(3);

		const idCol = user!.columns.find((c) => c.name === "id");
		expect(idCol!.isPrimary).toBe(true);
		expect(idCol!.isGenerated).toBe(true);
		expect(idCol!.type).toBe("integer");

		const nameCol = user!.columns.find((c) => c.name === "name");
		expect(nameCol!.isPrimary).toBe(false);
		expect(nameCol!.isNullable).toBe(false);

		const emailCol = user!.columns.find((c) => c.name === "email");
		expect(emailCol!.isNullable).toBe(true);
	});

	it("should extract custom table name from @Entity('table_name')", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		const user = graph.entities.get("User");
		expect(user!.tableName).toBe("users");
	});

	it("should extract custom table name from @Entity({ name: 'table_name' })", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn()
  id: number;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		const user = graph.entities.get("User");
		expect(user!.tableName).toBe("users");
	});

	it("should extract column type from string argument", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar')
  name: string;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		const user = graph.entities.get("User");
		const nameCol = user!.columns.find((c) => c.name === "name");
		expect(nameCol!.type).toBe("varchar");
	});

	it("should extract column type from object argument", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true })
  name: string;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		const user = graph.entities.get("User");
		const nameCol = user!.columns.find((c) => c.name === "name");
		expect(nameCol!.type).toBe("varchar");
		expect(nameCol!.isUnique).toBe(true);
	});

	it("should extract relations", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn, OneToMany } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToMany(() => Post, post => post.user)
  posts: Post[];
}`,
			"post.entity.ts": `
import { Entity, PrimaryGeneratedColumn, ManyToOne, Column } from "typeorm";

@Entity()
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @ManyToOne(() => User, user => user.posts)
  user: User;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		expect(graph.entities.size).toBe(2);
		expect(graph.relations).toHaveLength(2);

		const userRel = graph.relations.find(
			(r) => r.fromEntity === "User" && r.toEntity === "Post"
		);
		expect(userRel).toBeDefined();
		expect(userRel!.type).toBe("one-to-many");
		expect(userRel!.propertyName).toBe("posts");

		const postRel = graph.relations.find(
			(r) => r.fromEntity === "Post" && r.toEntity === "User"
		);
		expect(postRel).toBeDefined();
		expect(postRel!.type).toBe("many-to-one");
	});

	it("should extract date and version columns", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, VersionColumn } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @VersionColumn()
  version: number;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		const user = graph.entities.get("User");
		expect(user!.columns).toHaveLength(4);

		const createdAt = user!.columns.find((c) => c.name === "createdAt");
		expect(createdAt!.type).toBe("timestamp");
		expect(createdAt!.isGenerated).toBe(true);

		const version = user!.columns.find((c) => c.name === "version");
		expect(version!.type).toBe("integer");
		expect(version!.isGenerated).toBe(true);
	});

	it("should return empty graph for non-typeorm ORM", () => {
		const { project, paths } = createProject({
			"user.entity.ts": "export class User {}",
		});

		const graph = extractSchema(project, paths, "prisma", "/test");
		expect(graph.entities.size).toBe(0);
	});

	it("should return empty graph for null ORM", () => {
		const { project, paths } = createProject({
			"user.entity.ts": "export class User {}",
		});

		const graph = extractSchema(project, paths, null, "/test");
		expect(graph.entities.size).toBe(0);
	});

	it("should skip classes without @Entity decorator", () => {
		const { project, paths } = createProject({
			"user.service.ts": `
import { Injectable } from "@nestjs/common";

@Injectable()
export class UserService {
  name: string;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		expect(graph.entities.size).toBe(0);
	});

	it("should handle OneToOne and ManyToMany relations", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn, OneToOne, ManyToMany } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => Profile)
  profile: Profile;

  @ManyToMany(() => Role)
  roles: Role[];
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		const user = graph.entities.get("User");
		expect(user!.relations).toHaveLength(2);

		const profileRel = user!.relations.find((r) => r.toEntity === "Profile");
		expect(profileRel!.type).toBe("one-to-one");

		const roleRel = user!.relations.find((r) => r.toEntity === "Role");
		expect(roleRel!.type).toBe("many-to-many");
	});

	it("should extract PrimaryColumn as primary but not generated", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity()
export class User {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		const user = graph.entities.get("User");
		const idCol = user!.columns.find((c) => c.name === "id");
		expect(idCol!.isPrimary).toBe(true);
		expect(idCol!.isGenerated).toBe(false);
	});

	it("should extract DeleteDateColumn for soft delete", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn, DeleteDateColumn } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @DeleteDateColumn()
  deletedAt: Date;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		const user = graph.entities.get("User");
		const deletedAt = user!.columns.find((c) => c.name === "deletedAt");
		expect(deletedAt!.type).toBe("timestamp");
		expect(deletedAt!.isGenerated).toBe(true);
	});

	it("should extract Column with default value", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: 'active' })
  status: string;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		const user = graph.entities.get("User");
		const statusCol = user!.columns.find((c) => c.name === "status");
		expect(statusCol!.defaultValue).toBe("'active'");
	});

	it("should extract property-level @Index decorator", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  email: string;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		const user = graph.entities.get("User");
		const emailCol = user!.columns.find((c) => c.name === "email");
		expect(emailCol!.hasIndex).toBe(true);

		expect(user!.indexes).toBeDefined();
		const emailIdx = user!.indexes!.find((i) => i.columns.includes("email"));
		expect(emailIdx).toBeDefined();
		expect(emailIdx!.isUnique).toBe(false);
	});

	it("should extract class-level @Index decorator with composite columns", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

@Index(['email', 'name'])
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column()
  name: string;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		const user = graph.entities.get("User");

		expect(user!.indexes).toBeDefined();
		const compositeIdx = user!.indexes!.find((i) => i.columns.length === 2);
		expect(compositeIdx).toBeDefined();
		expect(compositeIdx!.columns).toEqual(["email", "name"]);

		const emailCol = user!.columns.find((c) => c.name === "email");
		expect(emailCol!.hasIndex).toBe(true);
		const nameCol = user!.columns.find((c) => c.name === "name");
		expect(nameCol!.hasIndex).toBe(true);
		const idCol = user!.columns.find((c) => c.name === "id");
		expect(idCol!.hasIndex).toBeUndefined();
	});

	it("should extract onDelete from relation decorator", () => {
		const { project, paths } = createProject({
			"post.entity.ts": `
import { Entity, PrimaryGeneratedColumn, ManyToOne } from "typeorm";

@Entity()
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		const post = graph.entities.get("Post");
		const rel = post!.relations.find((r) => r.toEntity === "User");
		expect(rel!.onDelete).toBe("CASCADE");
	});

	it("should extract nullable from relation decorator", () => {
		const { project, paths } = createProject({
			"post.entity.ts": `
import { Entity, PrimaryGeneratedColumn, ManyToOne } from "typeorm";

@Entity()
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { nullable: true })
  user: User;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		const post = graph.entities.get("Post");
		const rel = post!.relations.find((r) => r.toEntity === "User");
		expect(rel!.isNullable).toBe(true);
	});

	it("should extract multiple entities from the same file", () => {
		const { project, paths } = createProject({
			"entities.ts": `
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";

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

  @ManyToOne(() => User)
  author: User;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		expect(graph.entities.size).toBe(2);

		const user = graph.entities.get("User");
		const post = graph.entities.get("Post");
		expect(user!.filePath).toBe(post!.filePath);

		expect(post!.relations).toHaveLength(1);
		expect(post!.relations[0].toEntity).toBe("User");
	});

	it("should extract self-referencing relation", () => {
		const { project, paths } = createProject({
			"category.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from "typeorm";

@Entity()
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToOne(() => Category, cat => cat.children)
  parent: Category;

  @OneToMany(() => Category, cat => cat.parent)
  children: Category[];
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");
		expect(graph.entities.size).toBe(1);

		const cat = graph.entities.get("Category");
		expect(cat!.relations).toHaveLength(2);

		for (const rel of cat!.relations) {
			expect(rel.fromEntity).toBe("Category");
			expect(rel.toEntity).toBe("Category");
		}

		const parentRel = cat!.relations.find((r) => r.type === "many-to-one");
		expect(parentRel!.propertyName).toBe("parent");

		const childrenRel = cat!.relations.find((r) => r.type === "one-to-many");
		expect(childrenRel!.propertyName).toBe("children");
	});

	it("should extract a complex e-commerce schema", () => {
		const { project, paths } = createProject({
			"user.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, DeleteDateColumn } from "typeorm";

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name: string;

  @OneToMany(() => Order, o => o.user)
  orders: Order[];

  @OneToMany(() => Review, r => r.user)
  reviews: Review[];

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}`,
			"category.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, Index } from "typeorm";

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToOne(() => Category, c => c.children, { nullable: true })
  parent: Category;

  @OneToMany(() => Category, c => c.parent)
  children: Category[];

  @OneToMany(() => Product, p => p.category)
  products: Product[];
}`,
			"product.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, Index } from "typeorm";

@Index(['categoryId'])
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column('decimal')
  price: number;

  @Column()
  categoryId: number;

  @ManyToOne(() => Category, c => c.products)
  category: Category;

  @OneToMany(() => OrderItem, oi => oi.product)
  items: OrderItem[];

  @OneToMany(() => Review, r => r.product)
  reviews: Review[];
}`,
			"order.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, Index } from "typeorm";

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, u => u.orders, { onDelete: 'CASCADE' })
  user: User;

  @OneToMany(() => OrderItem, oi => oi.order)
  items: OrderItem[];

  @Column({ default: 'PENDING' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}`,
			"order-item.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index } from "typeorm";

@Index(['orderId', 'productId'])
@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  orderId: number;

  @ManyToOne(() => Order, o => o.items, { onDelete: 'CASCADE' })
  order: Order;

  @Column()
  productId: number;

  @ManyToOne(() => Product, p => p.items)
  product: Product;

  @Column()
  quantity: number;

  @Column('decimal')
  price: number;
}`,
			"review.entity.ts": `
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from "typeorm";

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  rating: number;

  @Column({ nullable: true })
  comment: string;

  @ManyToOne(() => User, u => u.reviews, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Product, p => p.reviews)
  product: Product;

  @CreateDateColumn()
  createdAt: Date;
}`,
		});

		const graph = extractSchema(project, paths, "typeorm", "/test");

		// 6 entities
		expect(graph.entities.size).toBe(6);

		// tableName overrides
		expect(graph.entities.get("User")!.tableName).toBe("users");
		expect(graph.entities.get("OrderItem")!.tableName).toBe("order_items");
		expect(graph.entities.get("Category")!.tableName).toBe("categories");

		// User columns
		const user = graph.entities.get("User")!;
		const userIdCol = user.columns.find((c) => c.name === "id");
		expect(userIdCol!.isPrimary).toBe(true);
		expect(userIdCol!.isGenerated).toBe(true);
		expect(userIdCol!.type).toBe("uuid");

		const deletedAt = user.columns.find((c) => c.name === "deletedAt");
		expect(deletedAt!.type).toBe("timestamp");
		expect(deletedAt!.isGenerated).toBe(true);

		// Category self-relation
		const cat = graph.entities.get("Category")!;
		const catSelfRels = cat.relations.filter((r) => r.toEntity === "Category");
		expect(catSelfRels).toHaveLength(2);
		const parentRel = catSelfRels.find((r) => r.type === "many-to-one");
		expect(parentRel!.isNullable).toBe(true);

		// Order onDelete
		const order = graph.entities.get("Order")!;
		const orderUserRel = order.relations.find((r) => r.toEntity === "User");
		expect(orderUserRel!.onDelete).toBe("CASCADE");

		// OrderItem composite index
		const orderItem = graph.entities.get("OrderItem")!;
		const compositeIdx = orderItem.indexes!.find((i) => i.columns.length === 2);
		expect(compositeIdx).toBeDefined();
		expect(compositeIdx!.columns).toEqual(["orderId", "productId"]);

		// Product decimal column
		const product = graph.entities.get("Product")!;
		const priceCol = product.columns.find((c) => c.name === "price");
		expect(priceCol!.type).toBe("decimal");

		// Order default value
		const statusCol = order.columns.find((c) => c.name === "status");
		expect(statusCol!.defaultValue).toBe("'PENDING'");

		// Review nullable column
		const review = graph.entities.get("Review")!;
		const commentCol = review.columns.find((c) => c.name === "comment");
		expect(commentCol!.isNullable).toBe(true);

		// Total relations
		expect(graph.relations.length).toBeGreaterThanOrEqual(10);
	});
});
