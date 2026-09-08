import { Controller, Get } from '@nestjs/common';
import { IsAuthnAuthz } from '../lib/auth.decorators';

@Controller('handler-level')
export class HandlerLevelController {
  @IsAuthnAuthz()
  @Get()
  findAll() {
    return [];
  }
}
