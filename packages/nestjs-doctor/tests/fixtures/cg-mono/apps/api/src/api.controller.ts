import { Controller, Get, Param } from '@nestjs/common';
import { ApiService } from './api.service';

@Controller('api')
export class ApiController {
	constructor(private readonly api: ApiService) {}

	@Get(':id')
	find(@Param('id') id: string) {
		return this.api.list(id);
	}
}
