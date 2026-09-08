import { Controller, Get } from '@nestjs/common';

@Controller('plain')
export class PlainController {
  @Get()
  list() {
    return [];
  }
}
