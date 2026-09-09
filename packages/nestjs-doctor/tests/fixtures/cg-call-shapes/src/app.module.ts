import { Module } from "@nestjs/common";
import { CacheConsumer } from "./cache.consumer";
import { CacheService } from "./cache.service";
import { ChainService } from "./chain.service";
import { Mailer } from "./mailer";
import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";
import { OverloadedService } from "./overloaded.service";
import { PrismaService } from "./prisma.service";

@Module({
	controllers: [NotesController],
	providers: [
		CacheConsumer,
		CacheService,
		ChainService,
		Mailer,
		NotesService,
		OverloadedService,
		PrismaService,
	],
})
export class AppModule {}
