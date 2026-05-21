import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { User } from "../users/user.entity";

// BAD: no @PrimaryKey decorator at all → fires schema/require-primary-key
// BAD: no timestamp columns → fires schema/require-timestamps
@Entity({ tableName: "audit_logs" })
export class AuditLog {
	@Property()
	action!: string;

	@Property()
	entityType!: string;

	@Property()
	entityId!: number;

	@Property({ nullable: true })
	payload?: string;
}

// BAD: no timestamp columns → fires schema/require-timestamps
// BAD: @ManyToOne without `deleteRule`/`onDelete` → fires schema/require-cascade-rule
@Entity({ tableName: "notifications" })
export class Notification {
	@PrimaryKey()
	id!: number;

	@ManyToOne(() => User)
	user!: User;

	@Property()
	title!: string;

	@Property({ nullable: true })
	body?: string;

	@Property({ default: false })
	isRead!: boolean;
}
