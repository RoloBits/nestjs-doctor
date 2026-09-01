import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller.js";
import {
  InMemoryUsersRepository,
  USERS_REPOSITORY,
} from "./users.repository.js";
import { UsersService } from "./users.service.js";

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    { provide: USERS_REPOSITORY, useClass: InMemoryUsersRepository },
  ],
  exports: [UsersService],
})
export class UsersModule {}
