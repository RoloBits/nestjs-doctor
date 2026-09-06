import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module.js';

@Injectable()
export class FakeCache {
  get(key: string): string {
    return `fake-${key}`;
  }
}

export async function buildApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    providers: [FakeCache],
  }).compile();
  return moduleRef.createNestApplication();
}
