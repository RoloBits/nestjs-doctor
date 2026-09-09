import { Controller, Get } from '@nestjs/common';
import { SharedService } from './shared.service';

@Controller('alpha')
export class AlphaController {
	constructor(private readonly shared: SharedService) {}

	@Get('one')
	one(): string {
		return this.shared.audit('alpha-one');
	}

	@Get('two')
	two(): string {
		return this.shared.audit('alpha-two');
	}
}
