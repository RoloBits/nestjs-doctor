import {
	Entity,
	ManyToOne,
	OneToOne,
	PrimaryKey,
	Property,
	Rel,
	Ref,
} from "@mikro-orm/core";
import { User } from "../users/user.entity";
import { Order } from "../orders/order.entity";

// GOOD: composite primary key declared through relations (issue #294).
// Both halves are @ManyToOne with primary: true, no surrogate id.
@Entity({ tableName: "user_bases" })
export class UserBases {
	@ManyToOne(() => User, {
		ref: true,
		fieldName: "user_id",
		deleteRule: "cascade",
		primary: true,
	})
	user!: Ref<User>;

	@ManyToOne(() => Order, {
		ref: true,
		fieldName: "base_id",
		deleteRule: "cascade",
		primary: true,
	})
	base!: Ref<Order>;

	@Property({ type: "Date", defaultRaw: "now()" })
	createdAt!: Date;

	@Property({ type: "Date", onUpdate: () => new Date() })
	updatedAt!: Date;
}

// GOOD: single-column 1:1 shared primary key.
@Entity({ tableName: "user_profiles" })
export class UserProfile {
	@OneToOne(() => User, {
		ref: true,
		fieldName: "user_id",
		deleteRule: "cascade",
		primary: true,
	})
	user!: Ref<User>;

	@Property({ nullable: true })
	avatarUrl?: string;

	@Property({ type: "Date", defaultRaw: "now()" })
	createdAt!: Date;

	@Property({ type: "Date", onUpdate: () => new Date() })
	updatedAt!: Date;
}

// GOOD: options-first factory form from the docs. The bare `Rel<User>`
// property type alone would miss both target regexes, but the explicit
// `entity: () => User` resolves, so this also yields a relation.
@Entity({ tableName: "order_items" })
export class OrderItem {
	@ManyToOne({ entity: () => User, primary: true, deleteRule: "cascade" })
	order!: Rel<User>;

	@Property({ default: 1 })
	amount!: number;

	@Property({ type: "Date", defaultRaw: "now()" })
	createdAt!: Date;

	@Property({ type: "Date", onUpdate: () => new Date() })
	updatedAt!: Date;
}

// GOOD: mixed composite — one relation half plus one scalar half.
@Entity({ tableName: "event_details" })
export class EventDetail {
	@ManyToOne(() => User, { fieldName: "weekday_id", deleteRule: "cascade", primary: true })
	weekday!: Rel<User>;

	@PrimaryKey()
	slot!: string;

	@Property()
	what!: string;

	@Property({ type: "Date", defaultRaw: "now()" })
	createdAt!: Date;

	@Property({ type: "Date", onUpdate: () => new Date() })
	updatedAt!: Date;
}

// CONTROL: a plain relation without primary: true contributes no column.
// Everything else is exemplary, so this entity fires exactly one diagnostic:
// schema/require-primary-key.
@Entity({ tableName: "keyless_things" })
export class KeylessThing {
	@ManyToOne(() => User, { deleteRule: "cascade" })
	user!: Rel<User>;

	@Property()
	label!: string;

	@Property({ type: "Date", defaultRaw: "now()" })
	createdAt!: Date;

	@Property({ type: "Date", onUpdate: () => new Date() })
	updatedAt!: Date;
}
