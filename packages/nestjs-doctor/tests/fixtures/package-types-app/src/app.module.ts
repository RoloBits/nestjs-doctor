import { Module } from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import { LocalController } from './local.controller';
import { LocalRepo } from './local.repo';
import { PlainController } from './plain.controller';
import { QueueService } from './queue.service';
import { ReportsController } from './reports.controller';
import { UsersController } from './users.controller';

@Module({
  controllers: [
    LocalController,
    PlainController,
    ReportsController,
    UsersController,
  ],
  providers: [DispatchService, LocalRepo, QueueService],
})
export class AppModule {}
