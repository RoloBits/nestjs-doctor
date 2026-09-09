import { Controller, Get, Param } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
	constructor(private readonly admin: AdminService) {}

	@Get(':id')
	find(@Param('id') id: string) {
		return this.admin.list(id);
	}
}
