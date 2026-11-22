import { Controller, Get, Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ApiTags } from "@nestjs/swagger";

// GOOD: current packages and current names, nothing here should be flagged
@Injectable()
export class CleanService {
	constructor(private readonly httpService: HttpService) {}

	@Get()
	list() {
		return [];
	}
}

@ApiTags("clean")
@Controller("clean")
export class CleanController {}
