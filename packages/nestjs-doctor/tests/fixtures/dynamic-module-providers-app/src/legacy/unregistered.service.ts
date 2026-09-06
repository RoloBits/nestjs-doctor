import { Injectable } from '@nestjs/common';

@Injectable()
export class UnregisteredService {
  describe(): string {
    return 'never registered anywhere';
  }
}
