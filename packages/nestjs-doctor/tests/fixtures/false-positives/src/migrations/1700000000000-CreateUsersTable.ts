import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateUsersTable1700000000000abcdef1234567890ab
	implements MigrationInterface
{
	name = "CreateUsersTable1700000000000abcdef1234567890ab";

	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(
			new Table({
				name: "users",
				columns: [
					{
						name: "id",
						type: "uuid",
						isPrimary: true,
						generationStrategy: "uuid",
						default: "uuid_generate_v4()",
					},
					{
						name: "email",
						type: "varchar",
						isUnique: true,
					},
					{
						name: "password",
						type: "varchar",
					},
				],
			})
		);
	}

	async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropTable("users");
	}
}
