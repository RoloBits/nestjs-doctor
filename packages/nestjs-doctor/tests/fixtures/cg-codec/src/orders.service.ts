import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from './audit.service';
import { Mailer, normalise } from './helpers';
import { NotifyService } from './notify.service';
import { OrdersRepo } from './orders.repo';

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
			throw new NotFoundException('order missing');
		}
		const parts = id.split('-');
		const key = parts.join(':');
		const label = normalise(key);
		const attempts = retry ? 2 : 1;
		if (retry) {
			if (id === 'x') {
				this.repo.save(order);
			} else {
				this.notify.send(label);
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
		Mailer.deliver(id);
		this.record('placed');
		super.record('audited');
		this.place(id, attempts > 1);
		return order;
	}

	reset(id: string) {
		this.repo.findOne(id);
		return;
	}

	label(id: string): string;
	label(id: number): string;
	label(id: string | number): string {
		this.repo.save(this.repo.findOne(String(id)));
		return String(id);
	}
}
