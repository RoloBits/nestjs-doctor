import { Controller, Get } from '@nestjs/common';
import { PackageAuth } from '@fixture/auth';

@PackageAuth()
@Controller('orders')
export class OrdersController {
  @Get()
  findAll() {
    return [];
  }
}
