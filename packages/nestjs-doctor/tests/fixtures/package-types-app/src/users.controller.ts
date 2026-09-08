import { Controller, Get } from '@nestjs/common';
import { UserRepo } from '@fixture/rest';

@Controller('users')
export class UsersController {
  constructor(private readonly repo: UserRepo) {}

  @Get()
  find() {
    return this.repo.findOne();
  }
}
