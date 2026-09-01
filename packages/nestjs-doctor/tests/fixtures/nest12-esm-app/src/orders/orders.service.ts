import {
  BadRequestException,
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../core/config.js";
import { UsersService } from "../users/users.service.js";
import type { CreateOrder, ListOrdersQuery } from "./orders.schemas.js";

export interface OrderRecord {
  id: number;
  userId: number;
  currency: string;
  lines: CreateOrder["lines"];
}

@Injectable()
export class OrdersService implements OnModuleInit, OnApplicationShutdown {
  private readonly orders: OrderRecord[] = [];
  private accepting = false;

  constructor(
    private readonly usersService: UsersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  onModuleInit(): void {
    this.accepting = true;
  }

  onApplicationShutdown(): void {
    this.accepting = false;
  }

  async create(input: CreateOrder): Promise<OrderRecord> {
    if (!this.accepting) {
      throw new BadRequestException("Orders are not being accepted");
    }
    if (input.lines.length > this.config.maxOrderLines) {
      throw new BadRequestException("Too many order lines");
    }
    const user = await this.usersService.findOne(input.userId);
    const order: OrderRecord = {
      id: this.orders.length + 1,
      userId: user.id,
      currency: this.config.currency,
      lines: input.lines,
    };
    this.orders.push(order);
    return order;
  }

  list(query: ListOrdersQuery): OrderRecord[] {
    return this.orders
      .filter((order) => order.userId === query.userId)
      .slice(0, query.limit);
  }
}
