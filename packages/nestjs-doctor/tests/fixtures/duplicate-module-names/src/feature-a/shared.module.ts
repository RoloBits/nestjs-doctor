import { Module } from '@nestjs/common';
import { AModule } from './a.module';

@Module({ imports: [AModule] })
export class SharedModule {}
