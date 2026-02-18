import { Module } from "@nestjs/common";
import { ApiService } from "./api.service";

@Module({
	providers: [ApiService],
})
export class AppModule {}
