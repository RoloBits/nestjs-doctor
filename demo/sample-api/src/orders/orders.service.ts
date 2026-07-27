import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

@Injectable()
export class OrdersService {
  constructor(private readonly ds: DataSource) {}

  async findVisible() {
    const rows = await this.ds.query("SELECT * FROM orders");
    return rows.filter((row: { deletedAt: Date | null }) => row.deletedAt === null);
  }
}
