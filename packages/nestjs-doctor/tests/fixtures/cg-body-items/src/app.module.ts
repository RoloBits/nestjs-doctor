import { Module } from "@nestjs/common";
import { EdgeCasesService } from "./edge-cases.service";
import { GuardsService } from "./guards.service";
import { MetaService } from "./meta.service";
import { OrderingService } from "./ordering.service";
import { OtherRepository, UsersRepository } from "./repo";
import { ReturnsService } from "./returns.service";
import { StepsService } from "./steps.service";
import { ThrowsService } from "./throws.service";

@Module({
	providers: [
		EdgeCasesService,
		GuardsService,
		MetaService,
		OrderingService,
		OtherRepository,
		ReturnsService,
		StepsService,
		ThrowsService,
		UsersRepository,
	],
})
export class AppModule {}
