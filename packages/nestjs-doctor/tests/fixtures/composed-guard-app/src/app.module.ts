import { Module } from '@nestjs/common';
import { ApplyDecoratorsController } from './apply-decorators.controller';
import { ConciseArrowController } from './concise-arrow.controller';
import { DocumentedController } from './documented.controller';
import { FunctionExpressionController } from './function-expression.controller';
import { HandlerLevelController } from './handler-level.controller';
import { MaybeAuthController } from './maybe-auth.controller';
import { UnguardedController } from './unguarded.controller';

@Module({
  controllers: [
    ApplyDecoratorsController,
    ConciseArrowController,
    DocumentedController,
    FunctionExpressionController,
    HandlerLevelController,
    MaybeAuthController,
    UnguardedController,
  ],
})
export class AppModule {}
