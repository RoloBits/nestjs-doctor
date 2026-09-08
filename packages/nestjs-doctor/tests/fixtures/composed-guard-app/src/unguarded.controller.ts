import { Controller, Get } from '@nestjs/common';

@Controller('unguarded')
export class UnguardedController {
  @Get()
  findAll() {
    return [];
  }
}
