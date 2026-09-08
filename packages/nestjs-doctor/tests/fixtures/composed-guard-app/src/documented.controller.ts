import { Controller, Get } from '@nestjs/common';
import { Documented } from '../lib/auth.decorators';

@Documented()
@Controller('documented')
export class DocumentedController {
  @Get()
  findAll() {
    return [];
  }
}
