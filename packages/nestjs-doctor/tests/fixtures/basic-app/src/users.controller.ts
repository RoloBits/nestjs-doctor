import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { UsersService } from "./users.service";

@Controller("users")
@UseGuards()
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Get()
	findAll() {
		return this.usersService.findAll();
	}

	@Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
