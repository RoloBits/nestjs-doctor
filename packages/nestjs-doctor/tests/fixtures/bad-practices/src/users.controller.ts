import { Controller, Get, Param } from "@nestjs/common";
import type { UsersRepository } from "./users.repository";
import type { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
	// BAD: not readonly, injects repository directly
	constructor(
		private usersService: UsersService,
		private usersRepository: UsersRepository
	) {}

	@Get()
	findAll() {
		// BAD: using repository directly in controller
		return this.usersRepository.findAll();
	}

	@Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
