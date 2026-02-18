import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
  // BAD: not readonly
  constructor(private usersRepository: any) {}

  findAll() {
    return this.usersRepository.findAll();
  }

  findOne(id: string) {
    return this.usersRepository.findOne(id);
  }
}
