import {
	Collection,
	Entity,
	OneToMany,
	PrimaryKey,
	Property,
	Unique,
} from "@mikro-orm/core";
import { Order } from "../orders/order.entity";

@Entity({ tableName: "users" })
export class User {
	@PrimaryKey()
	id!: number;

	@Unique()
	@Property()
	email!: string;

	@Property({ nullable: true })
	displayName?: string;

	@Property({ type: "Date", defaultRaw: "now()" })
	createdAt!: Date;

	@Property({ type: "Date", onUpdate: () => new Date() })
	updatedAt!: Date;

	@OneToMany(() => Order, (order) => order.user)
	orders: Collection<Order> = new Collection<Order>(this);
}
