import { Column, Entity } from "typeorm";

@Entity({ name: "tag" })
export class Tag {
	@Column("varchar")
	label: string;
}
