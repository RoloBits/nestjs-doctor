import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Project } from "ts-morph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractSchema } from "../../../src/engine/schema/extract.js";

let testDir: string;
let counter = 0;

function createTestDir(): string {
	counter++;
	const dir = join(tmpdir(), `prisma-test-${Date.now()}-${counter}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function writePrismaSchema(dir: string, content: string): void {
	const prismaDir = join(dir, "prisma");
	mkdirSync(prismaDir, { recursive: true });
	writeFileSync(join(prismaDir, "schema.prisma"), content, "utf-8");
}

beforeEach(() => {
	testDir = createTestDir();
});

afterEach(() => {
	if (existsSync(testDir)) {
		rmSync(testDir, { recursive: true, force: true });
	}
});

describe("Prisma Extractor", () => {
	it("should extract a basic model with fields", () => {
		writePrismaSchema(
			testDir,
			`
model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
  posts Post[]
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  author   User   @relation(fields: [authorId], references: [id])
  authorId Int
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		expect(graph.entities.size).toBe(2);

		const user = graph.entities.get("User");
		expect(user).toBeDefined();
		expect(user!.name).toBe("User");
		expect(user!.tableName).toBe("User");

		// columns: id, email, name (posts is a relation, not a column)
		const colNames = user!.columns.map((c) => c.name);
		expect(colNames).toContain("id");
		expect(colNames).toContain("email");
		expect(colNames).toContain("name");

		const idCol = user!.columns.find((c) => c.name === "id");
		expect(idCol!.isPrimary).toBe(true);
		expect(idCol!.isGenerated).toBe(true);

		const emailCol = user!.columns.find((c) => c.name === "email");
		expect(emailCol!.isUnique).toBe(true);

		const nameCol = user!.columns.find((c) => c.name === "name");
		expect(nameCol!.isNullable).toBe(true);
	});

	it("should extract relations between models", () => {
		writePrismaSchema(
			testDir,
			`
model User {
  id    Int    @id @default(autoincrement())
  posts Post[]
}

model Post {
  id       Int  @id @default(autoincrement())
  author   User @relation(fields: [authorId], references: [id])
  authorId Int
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		const userRels = graph.entities.get("User")!.relations;
		expect(userRels).toHaveLength(1);
		expect(userRels[0].type).toBe("one-to-many");
		expect(userRels[0].toEntity).toBe("Post");

		const postRels = graph.entities.get("Post")!.relations;
		expect(postRels).toHaveLength(1);
		expect(postRels[0].type).toBe("many-to-one");
		expect(postRels[0].toEntity).toBe("User");
	});

	it("should handle enums without treating them as relations", () => {
		writePrismaSchema(
			testDir,
			`
enum Role {
  USER
  ADMIN
}

model User {
  id   Int    @id @default(autoincrement())
  role Role   @default(USER)
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		const user = graph.entities.get("User");
		expect(user).toBeDefined();
		expect(user!.relations).toHaveLength(0);

		// Role should be a column, not a relation
		const roleCol = user!.columns.find((c) => c.name === "role");
		expect(roleCol).toBeDefined();
		expect(roleCol!.type).toBe("Role");
	});

	it("should detect many-to-many relations", () => {
		writePrismaSchema(
			testDir,
			`
model User {
  id    Int    @id @default(autoincrement())
  roles Role[]
}

model Role {
  id    Int    @id @default(autoincrement())
  users User[]
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		const userRels = graph.entities.get("User")!.relations;
		expect(userRels).toHaveLength(1);
		expect(userRels[0].type).toBe("many-to-many");
		expect(userRels[0].toEntity).toBe("Role");
	});

	it("should extract default values", () => {
		writePrismaSchema(
			testDir,
			`
model User {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now())
  isActive  Boolean  @default(true)
  uuid      String   @default(uuid())
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		const user = graph.entities.get("User");
		const idCol = user!.columns.find((c) => c.name === "id");
		expect(idCol!.defaultValue).toBe("autoincrement()");
		expect(idCol!.isGenerated).toBe(true);

		const uuidCol = user!.columns.find((c) => c.name === "uuid");
		expect(uuidCol!.defaultValue).toBe("uuid()");
		expect(uuidCol!.isGenerated).toBe(true);

		const createdAt = user!.columns.find((c) => c.name === "createdAt");
		expect(createdAt!.defaultValue).toBe("now()");
	});

	it("should return empty graph when no prisma schema found", () => {
		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);
		expect(graph.entities.size).toBe(0);
	});

	it("should skip comment lines and @@ attributes", () => {
		writePrismaSchema(
			testDir,
			`
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  // This is a comment
  name  String

  @@unique([email, name])
  @@map("users")
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		const user = graph.entities.get("User");
		expect(user!.columns).toHaveLength(3);
	});

	it("should find schema.prisma in project root", () => {
		// Write schema.prisma directly in root instead of prisma/
		writeFileSync(
			join(testDir, "schema.prisma"),
			`
model Item {
  id   Int    @id @default(autoincrement())
  name String
}
`,
			"utf-8"
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		expect(graph.entities.size).toBe(1);
		expect(graph.entities.get("Item")).toBeDefined();
	});

	it("should extract @@map as tableName", () => {
		writePrismaSchema(
			testDir,
			`
model User {
  id    Int    @id @default(autoincrement())
  email String
  @@map("users")
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		const user = graph.entities.get("User");
		expect(user).toBeDefined();
		expect(user!.name).toBe("User");
		expect(user!.tableName).toBe("users");
	});

	it("should extract @@index with correct columns and hasIndex on columns", () => {
		writePrismaSchema(
			testDir,
			`
model OrderItem {
  id         Int @id @default(autoincrement())
  customerId Int
  productId  Int
  quantity   Int
  @@index([customerId, productId])
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		const entity = graph.entities.get("OrderItem");
		expect(entity).toBeDefined();
		expect(entity!.indexes).toHaveLength(1);
		expect(entity!.indexes![0].columns).toEqual(["customerId", "productId"]);
		expect(entity!.indexes![0].isUnique).toBe(false);

		const customerCol = entity!.columns.find((c) => c.name === "customerId");
		expect(customerCol!.hasIndex).toBe(true);
		const productCol = entity!.columns.find((c) => c.name === "productId");
		expect(productCol!.hasIndex).toBe(true);
		const quantityCol = entity!.columns.find((c) => c.name === "quantity");
		expect(quantityCol!.hasIndex).toBeUndefined();
	});

	it("should extract @@unique as index with isUnique true", () => {
		writePrismaSchema(
			testDir,
			`
model User {
  id    Int    @id @default(autoincrement())
  email String
  name  String
  @@unique([email, name])
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		const user = graph.entities.get("User");
		expect(user!.indexes).toHaveLength(1);
		expect(user!.indexes![0].isUnique).toBe(true);
		expect(user!.indexes![0].columns).toEqual(["email", "name"]);

		const emailCol = user!.columns.find((c) => c.name === "email");
		expect(emailCol!.hasIndex).toBe(true);
		const nameCol = user!.columns.find((c) => c.name === "name");
		expect(nameCol!.hasIndex).toBe(true);
	});

	it("should extract onDelete from @relation", () => {
		writePrismaSchema(
			testDir,
			`
model User {
  id    Int    @id @default(autoincrement())
  posts Post[]
}

model Post {
  id       Int  @id @default(autoincrement())
  author   User @relation(fields: [authorId], references: [id], onDelete: Cascade)
  authorId Int
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		const postRels = graph.entities.get("Post")!.relations;
		expect(postRels).toHaveLength(1);
		expect(postRels[0].onDelete).toBe("Cascade");

		const userRels = graph.entities.get("User")!.relations;
		expect(userRels).toHaveLength(1);
		expect(userRels[0].onDelete).toBeUndefined();
	});

	it("should detect self-relations", () => {
		writePrismaSchema(
			testDir,
			`
model Category {
  id       Int        @id @default(autoincrement())
  name     String
  parentId Int?
  parent   Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  children Category[] @relation("CategoryTree")
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		const cat = graph.entities.get("Category");
		expect(cat).toBeDefined();
		expect(cat!.relations).toHaveLength(2);

		const parentRel = cat!.relations.find((r) => r.propertyName === "parent");
		expect(parentRel!.fromEntity).toBe("Category");
		expect(parentRel!.toEntity).toBe("Category");
		expect(parentRel!.type).toBe("many-to-one");
		expect(parentRel!.isNullable).toBe(true);

		const childrenRel = cat!.relations.find(
			(r) => r.propertyName === "children"
		);
		expect(childrenRel!.fromEntity).toBe("Category");
		expect(childrenRel!.toEntity).toBe("Category");
		expect(childrenRel!.type).toBe("one-to-many");
		expect(childrenRel!.isNullable).toBe(false);
	});

	it("should detect @@id composite primary keys", () => {
		writePrismaSchema(
			testDir,
			`
model PostTag {
  postId Int
  tagId  Int
  @@id([postId, tagId])
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		const postTag = graph.entities.get("PostTag");
		expect(postTag).toBeDefined();
		const postIdCol = postTag!.columns.find((c) => c.name === "postId");
		const tagIdCol = postTag!.columns.find((c) => c.name === "tagId");
		expect(postIdCol!.isPrimary).toBe(true);
		expect(tagIdCol!.isPrimary).toBe(true);
	});

	it("should mark cuid() and dbgenerated() as isGenerated", () => {
		writePrismaSchema(
			testDir,
			`
model Token {
  id    String @id @default(cuid())
  hash  String @default(dbgenerated())
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		const token = graph.entities.get("Token");
		const idCol = token!.columns.find((c) => c.name === "id");
		expect(idCol!.isGenerated).toBe(true);
		expect(idCol!.defaultValue).toBe("cuid()");

		const hashCol = token!.columns.find((c) => c.name === "hash");
		expect(hashCol!.isGenerated).toBe(true);
		expect(hashCol!.defaultValue).toBe("dbgenerated()");
	});

	it("should NOT mark now() as isGenerated", () => {
		writePrismaSchema(
			testDir,
			`
model Event {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now())
  isActive  Boolean  @default(true)
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		const event = graph.entities.get("Event");
		const createdAt = event!.columns.find((c) => c.name === "createdAt");
		expect(createdAt!.isGenerated).toBe(false);
		expect(createdAt!.defaultValue).toBe("now()");

		const isActive = event!.columns.find((c) => c.name === "isActive");
		expect(isActive!.isGenerated).toBe(false);
		expect(isActive!.defaultValue).toBe("true");
	});

	it("should extract nullable relation fields", () => {
		writePrismaSchema(
			testDir,
			`
model User {
  id    Int    @id @default(autoincrement())
  posts Post[]
}

model Post {
  id       Int   @id @default(autoincrement())
  author   User? @relation(fields: [authorId], references: [id])
  authorId Int?
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		const postRels = graph.entities.get("Post")!.relations;
		expect(postRels[0].isNullable).toBe(true);

		const userRels = graph.entities.get("User")!.relations;
		expect(userRels[0].isNullable).toBe(false);
	});

	it("should find schema via package.json custom path", () => {
		// Write package.json with custom prisma schema path
		writeFileSync(
			join(testDir, "package.json"),
			JSON.stringify({ prisma: { schema: "db/my-schema.prisma" } }),
			"utf-8"
		);
		const dbDir = join(testDir, "db");
		mkdirSync(dbDir, { recursive: true });
		writeFileSync(
			join(dbDir, "my-schema.prisma"),
			`
model Widget {
  id   Int    @id @default(autoincrement())
  name String
}
`,
			"utf-8"
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		expect(graph.entities.size).toBe(1);
		expect(graph.entities.get("Widget")).toBeDefined();
	});

	it("should merge models from multiple .prisma files", () => {
		const prismaDir = join(testDir, "prisma");
		mkdirSync(prismaDir, { recursive: true });
		writeFileSync(
			join(prismaDir, "schema.prisma"),
			`
model User {
  id    Int    @id @default(autoincrement())
  name  String
  posts Post[]
}
`,
			"utf-8"
		);
		writeFileSync(
			join(prismaDir, "post.prisma"),
			`
model Post {
  id       Int    @id @default(autoincrement())
  title    String
  author   User   @relation(fields: [authorId], references: [id])
  authorId Int
}
`,
			"utf-8"
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		expect(graph.entities.size).toBe(2);
		expect(graph.entities.get("User")).toBeDefined();
		expect(graph.entities.get("Post")).toBeDefined();

		const userRels = graph.entities.get("User")!.relations;
		expect(userRels).toHaveLength(1);
		expect(userRels[0].toEntity).toBe("Post");

		const postRels = graph.entities.get("Post")!.relations;
		expect(postRels).toHaveLength(1);
		expect(postRels[0].toEntity).toBe("User");
	});

	it("should extract a complex e-commerce schema", () => {
		writePrismaSchema(
			testDir,
			`
enum OrderStatus {
  PENDING
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  orders    Order[]
  reviews   Review[]
  createdAt DateTime @default(now())
  @@map("users")
}

model Category {
  id       Int        @id @default(autoincrement())
  name     String
  parentId Int?
  parent   Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  children Category[] @relation("CategoryTree")
  products Product[]
}

model Product {
  id         Int        @id @default(autoincrement())
  name       String
  price      Float
  categoryId Int
  category   Category   @relation(fields: [categoryId], references: [id])
  items      OrderItem[]
  reviews    Review[]
  @@index([categoryId])
}

model Order {
  id        Int         @id @default(autoincrement())
  userId    String
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  items     OrderItem[]
  status    OrderStatus @default(PENDING)
  createdAt DateTime    @default(now())
  @@index([userId])
}

model OrderItem {
  id        Int     @id @default(autoincrement())
  orderId   Int
  order     Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId Int
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int
  price     Float
  @@unique([orderId, productId])
}

model Review {
  id        Int      @id @default(autoincrement())
  rating    Int
  comment   String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  productId Int
  product   Product  @relation(fields: [productId], references: [id])
  createdAt DateTime @default(now())
  @@index([userId])
  @@index([productId])
}
`
		);

		const project = new Project({ useInMemoryFileSystem: true });
		const graph = extractSchema(project, [], "prisma", testDir);

		// 6 models
		expect(graph.entities.size).toBe(6);

		// tableName overrides
		expect(graph.entities.get("User")!.tableName).toBe("users");
		expect(graph.entities.get("Product")!.tableName).toBe("Product");

		// Category self-relations
		const catRels = graph.entities.get("Category")!.relations;
		expect(catRels).toHaveLength(3); // parent, children, products-reverse is not here — products is on Product side
		const selfRels = catRels.filter((r) => r.toEntity === "Category");
		expect(selfRels).toHaveLength(2);

		// onDelete
		const orderRels = graph.entities.get("Order")!.relations;
		const orderUserRel = orderRels.find((r) => r.toEntity === "User");
		expect(orderUserRel!.onDelete).toBe("Cascade");

		// indexes
		const orderItem = graph.entities.get("OrderItem")!;
		expect(orderItem.indexes).toHaveLength(1);
		expect(orderItem.indexes![0].isUnique).toBe(true);
		expect(orderItem.indexes![0].columns).toEqual(["orderId", "productId"]);

		// isGenerated
		const userId = graph.entities
			.get("User")!
			.columns.find((c) => c.name === "id");
		expect(userId!.isGenerated).toBe(true);

		// isNullable
		const userName = graph.entities
			.get("User")!
			.columns.find((c) => c.name === "name");
		expect(userName!.isNullable).toBe(true);

		// enum as column
		const statusCol = graph.entities
			.get("Order")!
			.columns.find((c) => c.name === "status");
		expect(statusCol).toBeDefined();
		expect(statusCol!.type).toBe("OrderStatus");

		// Review indexes
		const review = graph.entities.get("Review")!;
		expect(review.indexes!.length).toBe(2);

		// Total relations across graph
		expect(graph.relations.length).toBeGreaterThanOrEqual(10);
	});
});
