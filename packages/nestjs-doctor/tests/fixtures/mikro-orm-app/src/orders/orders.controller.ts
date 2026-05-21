import { Controller, Get, Param } from "@nestjs/common";
import { OrdersService } from "./orders.service";

@Controller("orders")
export class OrdersController {
	constructor(private readonly ordersService: OrdersService) {}

	@Get()
	findAll() {
		return this.ordersService.findAll();
	}

	@Get(":id")
	findOne(@Param("id") id: string) {
		return this.ordersService.findOne(Number(id));
	}
}
