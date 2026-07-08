import {
	CreateDateColumn,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from "typeorm";

// Shared abstract base — the canonical TypeORM "BaseEntity" pattern. It is an
// UNDECORATED abstract class (no @Entity), so it is never emitted as its own
// schema node; its columns are inherited by every concrete entity that extends
// it. Concrete children must NOT be flagged by require-primary-key /
// require-timestamps even though they declare no id/timestamps of their own.
export abstract class BaseEntity {
	@PrimaryGeneratedColumn("uuid")
	id!: string;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
