import { Injectable } from '@nestjs/common';

@Injectable()
export class LoggerService {
  log(message: string): void {
    console.log(message);
  }
}
