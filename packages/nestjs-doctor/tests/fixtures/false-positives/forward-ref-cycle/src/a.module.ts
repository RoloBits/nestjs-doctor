import { forwardRef, Module } from '@nestjs/common';
import { BModule } from './b.module';

@Module({ imports: [forwardRef(() => BModule)] })
export class AModule {}
