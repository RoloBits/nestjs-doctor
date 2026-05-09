import { forwardRef, Module } from '@nestjs/common';
import { AModule } from './a.module';

@Module({ imports: [forwardRef(() => AModule)] })
export class BModule {}
