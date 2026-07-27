import { Controller, Get, Param } from "@nestjs/common";
import { DataSource } from "typeorm";

@Controller("refunds")
export class RefundsController {
  constructor(private ds: DataSource) {}

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return await this.ds.query("SELECT * FROM refunds WHERE id = $1", [id]);
  }
}
