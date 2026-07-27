import { Controller, Get, Param } from "@nestjs/common";
import { DataSource } from "typeorm";

@Controller("orders")
export class OrdersController {
  constructor(private ds: DataSource) {}

  @Get(":id")
  async findOne(@Param("orderId") orderId: string) {
    const rows = await this.ds.query("SELECT * FROM orders");
    const visible = [];
    for (const row of rows) {
      if (row.deletedAt === null) {
        visible.push(row);
      }
    }
    return visible;
  }
}
