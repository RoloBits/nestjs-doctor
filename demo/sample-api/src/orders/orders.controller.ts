import { Controller, Get, Param } from "@nestjs/common";
import { OrdersService } from "./orders.service";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.orders.findVisible();
  }
}
