import { Controller, Get } from '@nestjs/common';
import { LocalEntity } from './local.entity';
import { LocalRepo } from './local.repo';

@Controller('local')
export class LocalController {
  constructor(private readonly repo: LocalRepo) {}

  @Get()
  find() {
    return this.repo.findOne();
  }
}
