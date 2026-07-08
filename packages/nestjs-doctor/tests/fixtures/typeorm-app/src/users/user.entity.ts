import { Column, Entity, OneToMany } from "typeorm";
import { Order } from "../orders/order.entity";
import { BaseEntity } from "../base/base.entity";

// CLEAN: inherits id + createdAt + updatedAt from BaseEntity, so neither
// require-primary-key nor require-timestamps should fire here.
@Entity({ name: "users" })
export class User extends BaseEntity {
	@Column({ unique: true })
	email!: string;

	@Column({ nullable: true })
	displayName?: string;

	@OneToMany(() => Order, (order) => order.user)
	orders!: Order[];
}
