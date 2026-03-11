import {
	integer,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.schema";
import { products } from "./products.schema";

export const orders = pgTable("orders", {
	id: serial("id").primaryKey(),
	publicId: uuid("public_id").notNull().unique(),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	status: varchar("status", { length: 50 }).default("pending").notNull(),
	shippingAddress: text("shipping_address"),
	notes: text("notes"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const orderItems = pgTable(
	"order_items",
	{
		id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
		orderId: integer("order_id")
			.notNull()
			.references(() => orders.id, { onDelete: "cascade" }),
		productId: integer("product_id")
			.notNull()
			.references(() => products.id, { onDelete: "cascade" }),
		quantity: integer("quantity").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("order_items_order_product_idx").on(
			table.orderId,
			table.productId
		),
	]
);
