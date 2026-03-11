import {
	boolean,
	date,
	index,
	integer,
	pgTable,
	serial,
	smallserial,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { bigserial } from "drizzle-orm/pg-core";
import { users } from "./users.schema";

export const categories = pgTable("categories", {
	id: serial("id").primaryKey(),
	name: varchar("name", { length: 100 }).notNull(),
	slug: varchar("slug", { length: 100 }).notNull().unique(),
	description: text("description"),
	parentId: integer("parent_id").references(() => categories.id, {
		onDelete: "set null",
	}),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const products = pgTable(
	"products",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		name: varchar("name", { length: 255 }).notNull(),
		description: text("description"),
		stockQuantity: integer("stock_quantity").default(0).notNull(),
		isPublished: boolean("is_published").default(false).notNull(),
		categoryId: integer("category_id").references(() => categories.id, {
			onDelete: "set null",
		}),
		sellerId: integer("seller_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		publishedAt: date("published_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("products_category_idx").on(table.categoryId),
		index("products_seller_idx").on(table.sellerId),
	]
);

export const productTags = pgTable("product_tags", {
	id: smallserial("id").primaryKey(),
	productId: integer("product_id")
		.notNull()
		.references(() => products.id, { onDelete: "cascade" }),
	tag: varchar("tag", { length: 50 }).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
