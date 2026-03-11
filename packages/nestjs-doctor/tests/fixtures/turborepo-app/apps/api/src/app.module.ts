import { Module } from "@nestjs/common";
import { DatabaseModule } from "@acme/db";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";

@Module({
	imports: [AuthModule, UsersModule, DatabaseModule],
	controllers: [],
	providers: [],
})
export class AppModule {}
