import { Controller, Get, Param } from "@nestjs/common";
import { DataSource } from "typeorm";

@Controller("orders")
export class OrdersController {
  constructor(private readonly ds: DataSource) {}

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const rows = await this.ds.query("SELECT * FROM orders WHERE tenant_id = 1");
    const visible = [];
    for (const row of rows) {
      if (row.deletedAt === null) {
        visible.push(row);
      }
    }
    return visible;
  }
}
