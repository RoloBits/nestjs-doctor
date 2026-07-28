import {
	BaseEntity,
	CreateDateColumn,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from "typeorm";

export abstract class CustomBaseEntity extends BaseEntity {
	@PrimaryGeneratedColumn()
	id: number;

	@CreateDateColumn()
	createdAt: Date;

	@UpdateDateColumn()
	updatedAt: Date;
}
