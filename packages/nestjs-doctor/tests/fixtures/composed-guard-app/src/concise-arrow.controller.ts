import { Controller, Get } from '@nestjs/common';
import { StripeAuthorizer } from '../lib/auth.decorators';

@StripeAuthorizer()
@Controller('concise-arrow')
export class ConciseArrowController {
  @Get()
  findAll() {
    return [];
  }
}
