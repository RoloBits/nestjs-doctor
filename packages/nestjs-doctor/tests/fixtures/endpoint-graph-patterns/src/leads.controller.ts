import { Controller, Post, Body } from "@nestjs/common";
import type { LeadsService } from "./leads.service";

@Controller("leads")
export class LeadsController {
	constructor(private readonly leadsService: LeadsService) {}

	@Post()
	post(@Body() request: any) {
		return this.leadsService.upsert(request);
	}
}
