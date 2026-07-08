import { Column, Entity, ManyToOne } from "typeorm";
import { BaseEntity } from "../base/base.entity";
import { User } from "../users/user.entity";

// CLEAN: inherits id + timestamps from BaseEntity (multi-property inheritance),
// and its own @ManyToOne sets onDelete, so require-cascade-rule stays quiet too.
@Entity({ name: "orders" })
export class Order extends BaseEntity {
	@Column("decimal")
	total!: number;

	@Column({ default: "PENDING" })
	status!: string;

	@ManyToOne(() => User, { onDelete: "CASCADE" })
	user!: User;
}
