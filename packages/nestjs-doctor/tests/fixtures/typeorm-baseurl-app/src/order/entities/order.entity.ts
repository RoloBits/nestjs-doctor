import { Column, Entity } from "typeorm";
import { CustomBaseEntity } from "src/common/entity/custom-base.entity";

@Entity({ name: "order" })
export class Order extends CustomBaseEntity {
	@Column("varchar")
	reference: string;
}
