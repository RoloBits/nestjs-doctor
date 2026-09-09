import { Module } from "@nestjs/common";
import { DepService } from "./dep.service";
import { FlowController } from "./flow.controller";

@Module({
	controllers: [FlowController],
	providers: [DepService],
})
export class AppModule {}
