import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard.js";
import {
  type CreateOrder,
  createOrderSchema,
  type ListOrdersQuery,
  listOrdersQuerySchema,
} from "./orders.schemas.js";
import { OrdersService } from "./orders.service.js";

@Controller("orders")
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@Query({ schema: listOrdersQuerySchema }) query: ListOrdersQuery) {
    return this.ordersService.list(query);
  }

  @Post()
  create(@Body({ schema: createOrderSchema }) body: CreateOrder) {
    return this.ordersService.create(body);
  }
}
