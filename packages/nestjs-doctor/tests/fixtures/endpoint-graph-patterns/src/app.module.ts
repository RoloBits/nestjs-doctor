import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { BaseService } from "./base.service";
import { RecipesResolver } from "./recipes.resolver";
import { RecipesService } from "./recipes.service";
import { UsersRepository } from "./users.repository";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { LeadRepository } from "./lead.repository";
import { FuseLogger } from "./fuse-logger";
import { LeadsHelper } from "./leads-helper";
import { EventEmitter2 } from "./event-emitter";

@Module({
	controllers: [OrdersController, ProductsController, LeadsController],
	providers: [
		OrdersService,
		ProductsService,
		BaseService,
		RecipesResolver,
		RecipesService,
		UsersRepository,
		LeadsService,
		LeadRepository,
		FuseLogger,
		LeadsHelper,
		EventEmitter2,
	],
})
export class AppModule {}
