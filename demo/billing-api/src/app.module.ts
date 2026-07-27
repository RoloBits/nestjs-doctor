import { Module } from "@nestjs/common";
import { CustomersController } from "./customers/customers.controller";
import { InvoicesController } from "./invoices/invoices.controller";
import { InvoicesService } from "./invoices/invoices.service";
import { RefundsController } from "./invoices/refunds.controller";

@Module({
  controllers: [InvoicesController, CustomersController, RefundsController],
  providers: [InvoicesService],
})
export class AppModule {}
