import { Controller, Get } from "@nestjs/common";
import { ApiUseTags } from "@nestjs/swagger";

// BAD: renamed to @ApiTags in @nestjs/swagger v4
@ApiUseTags("media")
@Controller("media")
export class MediaController {
	@Get()
	list() {
		return [];
	}
}
