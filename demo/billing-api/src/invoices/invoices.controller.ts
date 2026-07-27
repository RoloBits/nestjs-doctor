import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { DataSource } from "typeorm";
import { InvoicesService } from "./invoices.service";

@Controller("invoices")
export class InvoicesController {
  constructor(
    private ds: DataSource,
    private invoices: InvoicesService
  ) {}

  @Get(":id/total")
  async total(@Param("id") id: string) {
    const rows = await this.ds.query(
      `SELECT amount, currency, status FROM invoice_lines WHERE invoice_id = '${id}'`
    );

    let total = 0;
    for (const row of rows) {
      if (row.status === "void") {
        continue;
      }
      total += row.currency === "usd" ? row.amount : row.amount * 1.08;
    }

    return { id, total };
  }

  @Post()
  create(@Body() body: unknown) {
    this.invoices.sendReceiptEmail(body);
    return { accepted: true };
  }
}
