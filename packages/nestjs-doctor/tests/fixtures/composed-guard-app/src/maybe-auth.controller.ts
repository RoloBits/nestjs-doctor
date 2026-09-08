import { Controller, Get } from '@nestjs/common';
import { MaybeAuth } from '../lib/auth.decorators';

@MaybeAuth(false)
@Controller('maybe-auth')
export class MaybeAuthController {
  @Get()
  findAll() {
    return [];
  }
}
