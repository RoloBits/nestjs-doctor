import { Module } from '@nestjs/common';
import { SharedModule } from '../../../libs/shared/src/shared.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
	controllers: [AdminController],
	imports: [SharedModule],
	providers: [AdminService],
})
export class AppModule {}
