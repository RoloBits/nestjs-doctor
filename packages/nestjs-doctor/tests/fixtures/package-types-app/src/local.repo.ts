import { Injectable } from '@nestjs/common';
import { LocalEntity } from './local.entity';

@Injectable()
export class LocalRepo {
  findOne(): Promise<LocalEntity> {
    return Promise.resolve(new LocalEntity());
  }
}
