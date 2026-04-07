import { Controller, Get, Inject } from "@nestjs/common";
import type { OrdersService } from "./orders.service";

@Controller("orders")
export class OrdersController {
	@Inject(OrdersService)
	private readonly injectedService: OrdersService;

	constructor(private readonly ordersService: OrdersService) {}

	// Pattern 1: same-class helper method call
	@Get("formatted")
	getFormatted() {
		return this.formatResponse();
	}

	private formatResponse() {
		return this.ordersService.findAll();
	}

	// Pattern 2: awaited call
	@Get("awaited")
	async getAwaited() {
		const result = await this.ordersService.findAll();
		return result;
	}

	// Pattern 3: callback-wrapped call
	@Get("mapped")
	getMapped() {
		const ids = ["1", "2", "3"];
		return ids.map((id) => this.ordersService.findById(id));
	}

	// Pattern 4: property injection via @Inject
	@Get("injected")
	getViaPropertyInjection() {
		return this.injectedService.findAll();
	}

	// Pattern 5: chained/fluent call
	@Get("chained")
	getChained() {
		return this.ordersService.findAll().then((r) => r);
	}

	// Pattern 6: aliased reference
	@Get("aliased")
	getAliased() {
		const svc = this.ordersService;
		return svc.findAll();
	}
}
