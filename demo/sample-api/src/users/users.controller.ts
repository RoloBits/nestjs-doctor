import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth.guard";
import { UsersService } from "./users.service";

@UseGuards(AuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }
}
