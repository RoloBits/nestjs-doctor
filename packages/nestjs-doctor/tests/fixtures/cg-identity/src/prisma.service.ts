import { Injectable } from '@nestjs/common';

@Injectable()
export class PrismaService {
	user = { find: () => [] };
	order = { find: () => [] };
}

@Injectable()
export class OrdersRepository {
	constructor(private readonly prisma: PrismaService) {}

	load(): { orders: unknown[]; users: unknown[] } {
		const users = this.prisma.user.find();
		const orders = this.prisma.order.find();
		return { orders, users };
	}
}
