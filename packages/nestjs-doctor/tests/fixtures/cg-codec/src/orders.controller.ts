import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { NotifyService } from './notify.service';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
	constructor(
		private readonly orders: OrdersService,
		private readonly notify: NotifyService
	) {}

	@ApiOperation({ summary: 'Place an order' })
	@ApiResponse({ status: 201, description: 'Placed' })
	@Post()
	create(@Body() body: { id: string }) {
		this.notify.send(body.id);
		return this.orders.place(body.id, true);
	}

	@Get(':id')
	findOne(@Param('id') id: string): string {
		return this.orders.label(id);
	}
}
