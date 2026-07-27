import { Controller, Get, Param } from "@nestjs/common";
import { Repository } from "typeorm";
import { Customer } from "./customer.entity";

@Controller("customers")
export class CustomersController {
  constructor(private customers: Repository<Customer>) {}

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<Customer> {
    return await this.customers.findOneByOrFail({ id });
  }
}
