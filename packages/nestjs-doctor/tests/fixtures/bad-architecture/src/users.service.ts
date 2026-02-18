import { Injectable } from "@nestjs/common";
import type { PrismaService } from "./prisma.service";

@Injectable()
export class UsersService {
	// BAD: service directly injects ORM
	constructor(private readonly prisma: PrismaService) {}

	findAll() {
		return this.prisma.user.findMany();
	}

	findOne(id: string) {
		return this.prisma.user.findUnique({ where: { id } });
	}
}
