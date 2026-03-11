import {
	boolean,
	integer,
	pgTable,
	serial,
	text,
	varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.schema";

export const auditLogs = pgTable("audit_logs", {
	action: varchar("action", { length: 100 }).notNull(),
	entityType: varchar("entity_type", { length: 100 }).notNull(),
	entityId: integer("entity_id").notNull(),
	payload: text("payload"),
});

export const notifications = pgTable("notifications", {
	id: serial("id").primaryKey(),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id),
	title: varchar("title", { length: 255 }).notNull(),
	body: text("body"),
	isRead: boolean("is_read").default(false).notNull(),
});
