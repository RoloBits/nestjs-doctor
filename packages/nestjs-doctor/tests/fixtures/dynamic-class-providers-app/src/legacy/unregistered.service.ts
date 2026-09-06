import { Injectable } from '@nestjs/common';

@Injectable()
export class UnregisteredService {
  static describe(): string {
    return 'never registered anywhere';
  }
}
