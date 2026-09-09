import { Controller, Get } from '@nestjs/common';
import { SharedService } from './shared.service';

@Controller('beta')
export class BetaController {
	constructor(private readonly shared: SharedService) {}

	@Get('one')
	one(): string {
		return this.shared.audit('beta-one');
	}

	@Get('two')
	two(): string {
		return this.shared.audit('beta-two');
	}
}
