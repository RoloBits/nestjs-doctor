import {
	Entity,
	ManyToOne,
	PrimaryKey,
	Property,
} from "@mikro-orm/core";
import { User } from "../users/user.entity";

@Entity({ tableName: "orders" })
export class Order {
	@PrimaryKey()
	id!: number;

	@Property()
	total!: number;

	@Property({ default: "PENDING" })
	status!: string;

	// Non-conventional column name (not `createdAt`/`created_at`) so the rule
	// must fall through the name-based shortcut at require-timestamps.ts:10-12
	// and actually exercise the MikroORM branch (defaultRaw → defaultValue check).
	@Property({ type: "Date", defaultRaw: "now()" })
	placedAt!: Date;

	@ManyToOne(() => User, { deleteRule: "cascade" })
	user!: User;
}
