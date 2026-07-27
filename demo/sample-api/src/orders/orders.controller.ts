import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth.guard";
import { DataSource } from "typeorm";

@UseGuards(AuthGuard)
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
