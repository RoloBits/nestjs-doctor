import { Module } from '@nestjs/common';
import { SharedService } from './shared.service';

@Module({
	exports: [SharedService],
	providers: [SharedService],
})
export class SharedModule {}
