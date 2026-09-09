import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class OrdersRepo {
	constructor(private readonly prisma: PrismaService) {}

	findOne(id: string) {
		return this.prisma.order.findUnique({ id });
	}

	save(order: unknown) {
		return this.prisma.order.update(order);
	}

	each(ids: string[]) {
		for (const id of ids) {
			this.prisma.order.findUnique({ id });
		}
	}

	mapped(ids: string[]) {
		return ids.map((id) => this.prisma.order.findUnique({ id }));
	}

	all(ids: string[]) {
		return Promise.all([
			this.prisma.order.findUnique({ id: ids[0] }),
			this.prisma.order.update({ id: ids[1] }),
		]);
	}
}
