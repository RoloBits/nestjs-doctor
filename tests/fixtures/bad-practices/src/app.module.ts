import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { ConfigService } from './config.service';

@Module({
  imports: [],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, ConfigService],
})
export class AppModule {}
