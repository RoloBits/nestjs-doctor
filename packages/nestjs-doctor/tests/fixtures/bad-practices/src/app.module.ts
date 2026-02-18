import { Module } from "@nestjs/common";
import { ConfigService } from "./config.service";
import { UsersController } from "./users.controller";
import { UsersRepository } from "./users.repository";
import { UsersService } from "./users.service";

@Module({
	imports: [],
	controllers: [UsersController],
	providers: [UsersService, UsersRepository, ConfigService],
})
export class AppModule {}
