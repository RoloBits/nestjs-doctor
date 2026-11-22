import { HttpModule, Module } from "@nestjs/common";
import { MediaController } from "./media.controller";

// BAD: HttpModule lives in @nestjs/axios since Nest 5
@Module({
	imports: [HttpModule],
	controllers: [MediaController],
})
export class AppModule {}
