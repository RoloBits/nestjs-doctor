import { Controller, Get } from '@nestjs/common';
import { BaseController } from './base.controller';

@Controller('orders')
export class OrdersController extends BaseController {
  @Get()
  findAll() {
    return [];
  }
}
