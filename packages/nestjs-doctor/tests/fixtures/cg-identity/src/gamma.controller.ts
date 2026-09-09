import { Controller, Get } from '@nestjs/common';
import { SharedService } from './shared.service';

@Controller('gamma')
export class GammaController {
	constructor(private readonly shared: SharedService) {}

	@Get('one')
	one(): string {
		return this.shared.audit('gamma-one');
	}
}
