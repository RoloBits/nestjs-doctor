import {
	boolean,
	date,
	integer,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable(
	"users",
	{
		id: serial("id").primaryKey(),
		email: varchar("email", { length: 255 }).notNull().unique(),
		username: varchar("username", { length: 100 }).notNull(),
		passwordHash: text("password_hash").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		referredById: integer("referred_by_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [uniqueIndex("users_email_idx").on(table.email)]
);

export const userProfiles = pgTable("user_profiles", {
	id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	displayName: varchar("display_name", { length: 100 }),
	bio: text("bio"),
	avatarUrl: text("avatar_url"),
	dateOfBirth: date("date_of_birth"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
