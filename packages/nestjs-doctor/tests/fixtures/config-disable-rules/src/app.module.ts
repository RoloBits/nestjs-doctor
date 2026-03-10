import { Module } from "@nestjs/common";
import { ConfigService } from "./config.service";
import { UsersRepository } from "./users/users.repository";
import { UsersService } from "./users/users.service";

@Module({
	imports: [],
	providers: [UsersService, UsersRepository, ConfigService],
})
export class AppModule {}
