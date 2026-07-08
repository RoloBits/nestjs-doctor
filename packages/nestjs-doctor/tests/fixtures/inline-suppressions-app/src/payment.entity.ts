import { Entity, Property } from "@mikro-orm/core";

// A .ts entity with a file-scoped directive naming two schema rules. This
// covers the `.ts` schema-suppression path, which already resolved through the
// ts-morph AST project — it must remain unaffected by the Prisma disk-read fix.
// nestjs-doctor-ignore-file schema/require-primary-key schema/require-timestamps
@Entity({ tableName: "payments" })
export class Payment {
	// no @PrimaryKey  -> schema/require-primary-key (suppressed by -file)
	// no timestamps   -> schema/require-timestamps  (suppressed by -file)
	@Property()
	amount!: number;
}
