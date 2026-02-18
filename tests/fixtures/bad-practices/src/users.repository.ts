import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersRepository {
  findAll() {
    return [{ id: '1', name: 'John' }];
  }

  findOne(id: string) {
    return { id, name: 'John' };
  }
}
