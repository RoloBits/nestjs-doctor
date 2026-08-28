import { Module } from '@nestjs/common';
import { SharedModule } from './shared.module';

@Module({ imports: [SharedModule] })
export class AModule {}
