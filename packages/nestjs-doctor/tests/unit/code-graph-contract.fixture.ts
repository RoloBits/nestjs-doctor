/** One app exercising every call and control shape the code graph must describe. */
export const CONTRACT_FILES: Record<string, string> = {
	"prisma.service.ts": `
import { Injectable } from '@nestjs/common';

@Injectable()
export class PrismaService {
	user = {
		findUnique: (where: unknown) => where,
		update: (data: unknown) => data,
	};
}
`,
	"audit.service.ts": `
import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditService {
	record(what: string) {
		return what;
	}
}
`,
	"notify.service.ts": `
import { Injectable } from '@nestjs/common';

@Injectable()
export class NotifyService {
	send(to: string) {
		return to;
	}
}
`,
	"orders.repo.ts": `
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class OrdersRepo {
	constructor(private readonly prisma: PrismaService) {}

	findOne(id: string) {
		return this.prisma.user.findUnique({ id });
	}

	save(order: unknown) {
		return this.prisma.user.update(order);
	}

	each(ids: string[]) {
		for (const id of ids) {
			this.prisma.user.findUnique({ id });
		}
	}

	all(ids: string[]) {
		return Promise.all(ids.map((id) => this.prisma.user.findUnique({ id })));
	}

	both() {
		return Promise.all([
			this.prisma.user.findUnique({ id: '1' }),
			this.prisma.user.update({ id: '1' }),
		]);
	}
}
`,
	"tokens.ts": `
export interface Clock {
	now(): number;
}
`,
	"other-tokens.ts": `
export interface Clock {
	now(): string;
}
`,
	"other.service.ts": `
import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from './other-tokens';

@Injectable()
export class OtherService {
	constructor(@Inject('OTHER_CLOCK') private readonly clock: Clock) {}

	stamp() {
		this.clock.now();
	}
}
`,
	"external.service.ts": `
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Clock } from './tokens';

@Injectable()
export class ExternalService {
	constructor(
		@Inject('CLOCK') private readonly clock: Clock,
		private readonly config: ConfigService
	) {}

	stamp() {
		this.clock.now();
		this.config.get('KEY');
	}
}
`,
	"orders.service.ts": `
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from './audit.service';
import { NotifyService } from './notify.service';
import { OrdersRepo } from './orders.repo';

export function helper(value: number) {
	return value + 1;
}

export class Mailer {
	static send(to: string) {
		return to;
	}
}

@Injectable()
export class OrdersService extends AuditService {
	constructor(
		private readonly repo: OrdersRepo,
		private readonly notify: NotifyService
	) {
		super();
	}

	async place(id: string, retry: boolean) {
		// look the order up before anything else
		const order = await this.repo.findOne(id);
		if (!order) {
			return null;
		}
		if (retry) {
			if (id === 'x') {
				this.repo.save(order);
			}
		} else if (id === 'y') {
			this.notify.send(id);
		} else {
			this.repo.findOne(id);
		}
		try {
			await this.repo.save(order);
		} catch (error) {
			throw new NotFoundException('order vanished');
		}
		Mailer.send(id);
		helper(1);
		this.notify.send(id);
		this.record('placed');
		super.record('audited');
		this.place(id, false);
		return order;
	}

	async find(id: string) {
		const order = await this.repo.findOne(id);
		if (!order) {
			throw new NotFoundException('no order');
		}
		this.notify.send(id);
		return order;
	}

	label(id: string): string;
	label(id: number): string;
	label(id: string | number): string {
		this.repo.save(this.repo.findOne(String(id)));
		return String(id);
	}
}
`,
	"orders.controller.ts": `
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { NotifyService } from './notify.service';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
	constructor(
		private readonly orders: OrdersService,
		private readonly notify: NotifyService
	) {}

	@Post()
	create(@Body() body: { id: string }) {
		this.notify.send(body.id);
		return this.orders.place(body.id, true);
	}

	@Get(':id')
	findOne(@Param('id') id: string) {
		return this.orders.find(id);
	}
}
`,
	"api-decorators.ts": `
import { applyDecorators, Controller } from '@nestjs/common';

export function ApiController(path: string) {
	return applyDecorators(Controller(path));
}
`,
	"wrapped.controller.ts": `
import { Post } from '@nestjs/common';
import { ApiController } from './api-decorators';
import { NotifyService } from './notify.service';

@ApiController('wrapped')
export class WrappedController {
	constructor(private readonly notify: NotifyService) {}

	@Post()
	create() {
		return this.notify.send('wrapped');
	}
}
`,
	"admin.controller.ts": `
import { Controller, Post } from '@nestjs/common';
import { NotifyService } from './notify.service';

@Controller('admin')
export class AdminController {
	constructor(private readonly notify: NotifyService) {}

	@Post('ping')
	ping() {
		return this.notify.send('admin');
	}
}
`,
};
