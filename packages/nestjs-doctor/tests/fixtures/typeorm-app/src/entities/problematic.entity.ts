import { Column, Entity, ManyToOne, PrimaryColumn } from "typeorm";
import { User } from "../users/user.entity";

// BAD: no primary key column at all       → fires schema/require-primary-key
// BAD: no timestamp columns               → fires schema/require-timestamps
// Does NOT extend BaseEntity, so the inheritance walk finds nothing to rescue
// it — proving the fix preserves genuine true-positives.
@Entity({ name: "audit_logs" })
export class AuditLog {
	@Column()
	action!: string;

	@Column()
	entityType!: string;

	@Column()
	entityId!: number;
}

// Has its own primary key (so require-primary-key stays quiet), but:
// BAD: no timestamp columns                        → fires schema/require-timestamps
// BAD: @ManyToOne without onDelete                 → fires schema/require-cascade-rule
@Entity({ name: "legacy_events" })
export class LegacyEvent {
	@PrimaryColumn()
	id!: number;

	@Column()
	name!: string;

	@ManyToOne(() => User)
	user!: User;
}
