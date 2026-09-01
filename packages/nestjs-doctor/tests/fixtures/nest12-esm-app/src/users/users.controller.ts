import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard.js";
import {
  type CreateUser,
  createUserSchema,
  userIdSchema,
} from "./users.schemas.js";
import { UsersService } from "./users.service.js";

@Controller("users")
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body({ schema: createUserSchema }) body: CreateUser) {
    return this.usersService.create(body);
  }

  @Get(":id")
  findOne(@Param("id", { schema: userIdSchema }) id: number) {
    return this.usersService.findOne(id);
  }
}
