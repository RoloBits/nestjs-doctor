import { Module } from '@nestjs/common';
import { SharedModule } from '../../../libs/shared/src/shared.module';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';

@Module({
	controllers: [ApiController],
	imports: [SharedModule],
	providers: [ApiService],
})
export class AppModule {}
