import { Module } from "@nestjs/common";
import { SecurityFileService } from "./security-file.service";
import { SecurityService } from "./security.service";
import {
	SuppressedController,
	UnsuppressedController,
} from "./violations.controller";

@Module({
	controllers: [SuppressedController, UnsuppressedController],
	providers: [SecurityService, SecurityFileService],
})
export class AppModule {}
