import { Controller, Get } from '@nestjs/common';
import { Auth } from '../lib/auth.decorators';

@Auth()
@Controller('apply-decorators')
export class ApplyDecoratorsController {
  @Get()
  findAll() {
    return [];
  }
}
