import { Controller, Get } from '@nestjs/common';
import { IsAuthnAuthz } from '../lib/auth.decorators';

@IsAuthnAuthz()
@Controller('function-expression')
export class FunctionExpressionController {
  @Get()
  findAll() {
    return [];
  }
}
