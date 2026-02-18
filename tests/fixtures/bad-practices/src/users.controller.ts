import { Controller, Get, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

@Controller('users')
export class UsersController {
  // BAD: not readonly, injects repository directly
  constructor(
    private usersService: UsersService,
    private usersRepository: UsersRepository,
  ) {}

  @Get()
  findAll() {
    // BAD: using repository directly in controller
    return this.usersRepository.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
