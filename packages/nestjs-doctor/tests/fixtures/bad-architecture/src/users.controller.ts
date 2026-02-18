import { Controller, Get, Param } from "@nestjs/common";
import type { PrismaService } from "./prisma.service";
import type { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
	// BAD: not readonly, injects ORM directly
	constructor(
		private usersService: UsersService,
		private prisma: PrismaService
	) {}

	// BAD: business logic in controller (multiple ifs, loops, data transforms)
	@Get()
	async findAll() {
		const users = await this.usersService.findAll();
		const result = [];
		for (const user of users) {
			if (user.active) {
				if (user.role === "admin") {
					result.push({ ...user, badge: "Admin" });
				} else {
					result.push(user);
				}
			}
		}
		return result
			.map((u) => ({ ...u, name: u.name.toUpperCase() }))
			.filter((u) => u.badge);
	}

	@Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
