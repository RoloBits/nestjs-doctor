import { Module } from "@nestjs/common";
import { CustomersController } from "./customers/customers.controller";
import { InvoicesController } from "./invoices/invoices.controller";
import { InvoicesService } from "./invoices/invoices.service";

@Module({
  controllers: [InvoicesController, CustomersController],
  providers: [InvoicesService],
})
export class AppModule {}
